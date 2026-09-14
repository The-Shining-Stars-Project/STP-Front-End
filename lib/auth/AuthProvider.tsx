"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authApi } from "@/lib/api/auth";
import { api, ApiError, MFA_ENROLLMENT_REQUIRED } from "@/lib/api/client";
import { onUnauthorized, onMfaEnrollmentRequired, purgeLegacyToken } from "./token";
import type { UserDto, LoginDto } from "@/lib/types/api";

/** What the password step produced. `mfaRequired` means a code is still owed. */
export type LoginOutcome = { mfaRequired: boolean };

type AuthState = {
  user: UserDto | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  /**
   * May edit management data (star profiles, rosters, focus skills): an Admin account, or a
   * staff account whose linked staff record is a Coordinator or Admin. Mirrors the API's
   * ManagementWrite policy so teachers don't get buttons that 403.
   */
  canManage: boolean;
  /**
   * The backend is refusing everything except enrollment because this account has no second
   * factor. UX only — MfaEnforcementFilter is what actually protects the data.
   */
  mfaEnrollmentRequired: boolean;
  login: (dto: LoginDto) => Promise<LoginOutcome>;
  /** The code step. Throws on a rejected code, exactly like `login` throws on a bad password. */
  verifyMfa: (code: string) => Promise<void>;
  /** Re-reads /me. Call after anything that changes enrollment, so the gate state follows. */
  refreshUser: () => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * A cheap authenticated GET used to find out whether mandatory MFA is switched on.
 *
 * The frontend cannot read the backend's Mfa:Required setting, and getting it wrong in the
 * optimistic direction is expensive: forcing enrollment on a deployment that does not require
 * it would trap users on the account page with no way out. So we ask, by making one request
 * the gate would refuse. Requirements for the endpoint: authenticated, no role restriction
 * (staff and admins must both be able to run it), read-only, small, and NOT [MfaExempt].
 *
 * If it ever stops meeting those, this probe reports "gate off" and we fall back to reacting
 * to the first real 403 — a flash of an error state, not a hole: the server refuses the data
 * either way.
 */
const GATE_PROBE_PATH = "/api/taxonomy/objective-areas";

async function isMfaGateOn(): Promise<boolean> {
  try {
    await api.get<unknown>(GATE_PROBE_PATH);
    return false;
  } catch (err) {
    return err instanceof ApiError
      && err.status === 403
      && err.code === MFA_ENROLLMENT_REQUIRED;
  }
}

/**
 * Resolves the session and, only when the account has no second factor, whether the gate is
 * shut on it. Enrolled users — everybody, once the team has finished setting up — never make
 * the extra request.
 */
async function readSession(): Promise<{ user: UserDto | null; enrollmentRequired: boolean }> {
  try {
    // /me is deliberately exempt from the MFA gate, so this still answers for a user who has
    // not enrolled, and it reads MfaEnabled from the database rather than the JWT claim —
    // which matters after an admin reset lands while this tab is open.
    const user = await authApi.me();
    if (user.mfaEnabled) return { user, enrollmentRequired: false };
    return { user, enrollmentRequired: await isMfaGateOn() };
  } catch {
    return { user: null, enrollmentRequired: false };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaEnrollmentRequired, setMfaEnrollmentRequired] = useState(false);

  // On mount, resolve the current user from the auth cookie (#15). If the JWT has
  // expired, the API client transparently refreshes and retries; a hard 401 means
  // "not signed in" and we land on the login page.
  useEffect(() => {
    purgeLegacyToken();
    let active = true;
    readSession()
      .then((s) => {
        if (!active) return;
        setUser(s.user);
        setMfaEnrollmentRequired(s.enrollmentRequired);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // If any API call hits an unrecoverable 401, clear the user.
  useEffect(() => onUnauthorized(() => setUser(null)), []);

  // Backstop for the probe above: if any request anywhere is refused by the gate, believe it.
  useEffect(() => onMfaEnrollmentRequired(() => setMfaEnrollmentRequired(true)), []);

  const adoptSession = useCallback(async (u: UserDto) => {
    setUser(u);
    setMfaEnrollmentRequired(u.mfaEnabled ? false : await isMfaGateOn());
  }, []);

  const login = useCallback(async (dto: LoginDto): Promise<LoginOutcome> => {
    const result = await authApi.login(dto);
    // `auth` is null exactly when a second factor is owed: the backend has set a challenge
    // cookie and nothing else, so there is no session to adopt yet.
    if (result.mfaRequired || !result.auth) return { mfaRequired: true };
    await adoptSession(result.auth.user);
    return { mfaRequired: false };
  }, [adoptSession]);

  const verifyMfa = useCallback(async (code: string) => {
    const result = await authApi.verifyMfa({ code });
    // A 200 without a session cannot happen; treat it as a rejected code rather than
    // letting a malformed response read as a successful sign-in.
    if (!result.auth) throw new ApiError(401, "MFA verification returned no session");
    await adoptSession(result.auth.user);
  }, [adoptSession]);

  const refreshUser = useCallback(async () => {
    const s = await readSession();
    setUser(s.user);
    setMfaEnrollmentRequired(s.enrollmentRequired);
  }, []);

  const logout = useCallback(() => {
    // Revoke the refresh token and clear cookies server-side. keepalive lets the
    // request survive the hard reload that follows; best-effort otherwise.
    fetch("/backend/api/auth/logout", {
      method: "POST",
      credentials: "include",
      keepalive: true,
    }).catch(() => {});
    setUser(null);
    setMfaEnrollmentRequired(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: user !== null,
        isAdmin: user?.role === "Admin",
        canManage: user?.role === "Admin" || user?.staffRole === "Coordinator" || user?.staffRole === "Admin",
        mfaEnrollmentRequired,
        login,
        verifyMfa,
        refreshUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
