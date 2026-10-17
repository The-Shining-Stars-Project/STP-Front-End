"use client";

import { useState } from "react";
import { staffOptionLabel } from "@/lib/staffOptionLabel";
import {
  UserPlus,
  ShieldCheck,
  User as UserIcon,
  X,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Check,
  KeyRound,
  Trash2,
  ShieldOff,
  AlertTriangle,
} from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { describeApiError } from "@/lib/api/client";
import { useEscapeKey } from "@/lib/useEscapeKey";
import type {
  UserDto,
  StaffSummaryDto,
  RegisterUserDto,
  UpdateUserDto,
  ResetPasswordDto,
  UserRole,
} from "@/lib/types/api";

import { useDialogFocus } from "@/lib/useDialogFocus";

// ── Shared modal primitives ─────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(43,42,38,.45)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 200, padding: "var(--space-4)",
};
const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)",
  padding: "8px 12px", fontSize: 13, color: "var(--fg)",
  background: "var(--surface)", outline: "none",
};
const errorBoxStyle: React.CSSProperties = {
  margin: "0 var(--space-4)", padding: "8px 12px", borderRadius: "var(--r-md)",
  background: "var(--danger-fill, #fce8e8)", color: "var(--danger)", fontSize: 12,
  display: "flex", alignItems: "flex-start", gap: 6,
};
export const iconBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 28, height: 28, borderRadius: "var(--r-sm)", border: "0.5px solid transparent",
  background: "none", cursor: "pointer", color: "var(--fg-secondary)",
};

function apiErrorMessage(e: unknown, fallback: string): string {
  const err = e as { status?: number; detail?: string };
  // The backend already sends a specific, human-readable reason — "Password must contain at
  // least one letter and one number", "Cannot remove the last active admin". Showing a
  // generic line instead used to send admins hunting for the wrong problem entirely.
  if (err?.detail) return err.detail;
  if (err?.status === 409 || err?.status === 400) {
    return "That change isn't allowed — you can't remove the last admin or lock yourself out.";
  }
  return fallback;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Login ↔ staff record link health ──────────────────────────────────────────
// Oct 2026 (Scott Davis): a login linked to a former record, to a record with no programs, or
// to a record another login also uses sees nothing, and nothing on screen said so. These feed
// the Users table badges and the hints under both modals' "Link to staff record" select.

/** Sep 17: duplicate records were renamed "Do not use duplicate …" rather than deleted. */
const DUPLICATE_NAME = /do not use|duplicate/i;

/** staffMemberId → the logins linked to that record. */
export function loginsByStaffId(users: UserDto[]): Map<string, UserDto[]> {
  const map = new Map<string, UserDto[]>();
  for (const u of users) {
    if (!u.staffMemberId) continue;
    map.set(u.staffMemberId, [...(map.get(u.staffMemberId) ?? []), u]);
  }
  return map;
}

export type StaffLinkIssue = {
  key: string;
  label: string;
  /** Longer explanation, for the badge tooltip and the modal hint. */
  detail: string;
  tone: "danger" | "warning";
  /** True when this alone leaves the login with no stars, classes or rosters. */
  seesNothing: boolean;
};

/**
 * What is wrong with a login's staff link. `record` null = linked to an id the staff list
 * doesn't have; pass it only once that list has loaded. Admin-role logins see every program
 * whatever the link says, so nothing here makes them "see nothing".
 */
export function staffLinkIssues(
  role: UserRole,
  record: StaffSummaryDto | null,
  otherLogins: UserDto[],
): StaffLinkIssue[] {
  const isAdmin = role === "Admin";
  if (!record) {
    return [{
      key: "missing",
      label: isAdmin ? "Record not found" : "Record not found — sees nothing",
      detail: "The linked staff record no longer exists. Link this login to the person's current staff record.",
      tone: "danger",
      seesNothing: !isAdmin,
    }];
  }
  const issues: StaffLinkIssue[] = [];
  if (record.isFormer) {
    issues.push({
      key: "former",
      label: isAdmin ? "Former record" : "Former — sees nothing",
      detail: isAdmin
        ? "The linked staff record is marked former. Admin access is unaffected, but the link is out of date."
        : "The linked staff record is marked former, so this login sees no stars, classes or rosters. Link it to the active record, or restore this one under Onboarding → Former.",
      tone: isAdmin ? "warning" : "danger",
      seesNothing: !isAdmin,
    });
  } else if (record.programIds.length === 0 && !isAdmin) {
    issues.push({
      key: "noprograms",
      label: "No programs — sees nothing",
      detail: "The linked staff record isn't assigned to any program, so this login sees no stars, classes or rosters. Assign programs under Onboarding → Edit details, or Programs → Manage staff.",
      tone: "danger",
      seesNothing: true,
    });
  }
  if (otherLogins.length > 0) {
    const emails = otherLogins.map((u) => u.email).join(", ");
    issues.push({
      key: "shared",
      label: `Also linked to ${emails}`,
      detail: `${emails} uses the same staff record. One staff record should back one login, and new shared links are refused.`,
      tone: "warning",
      seesNothing: false,
    });
  }
  if (DUPLICATE_NAME.test(record.fullName)) {
    issues.push({
      key: "duplicate",
      label: "Possible duplicate",
      detail: `"${record.fullName}" looks like a leftover duplicate. Link this login to the record that holds the person's programs.`,
      tone: "warning",
      seesNothing: false,
    });
  }
  return issues;
}

/** Badge for one issue; the text carries the meaning, the colour only reinforces it. */
export function StaffLinkBadge({ issue }: { issue: StaffLinkIssue }) {
  return (
    <span
      className={`ss-badge ${issue.tone === "danger" ? "is-attention" : "is-prospective"}`}
      title={issue.detail}
      style={{ whiteSpace: "normal" }}
    >
      <AlertTriangle style={{ flexShrink: 0 }} />{issue.label}
    </span>
  );
}

/** Dropdown text: tells records apart and says which ones another login already uses. */
function staffLinkOptionLabel(m: StaffSummaryDto, otherLogins: UserDto[], isCurrent: boolean): string {
  // staffOptionLabel already ends in "Former since <month>" for a former record.
  let label = staffOptionLabel(m);
  if (otherLogins.length > 0) label += ` — linked to ${otherLogins.map((u) => u.email).join(", ")}`;
  if (isCurrent) label += " (current link)";
  return label;
}

const hintLineStyle: React.CSSProperties = { fontSize: 12, marginTop: 6, display: "flex", alignItems: "flex-start", gap: 6, lineHeight: 1.45 };

/**
 * Where the staff list stands. Only `loaded` (the query succeeded) lets us call a linked id
 * "not found": while it is pending, or after it failed, an id the list lacks is unknown — the
 * same rule as the Users table badges. Saying "missing" then could get a valid link cleared.
 */
export type StaffListState = { loaded: boolean; error: unknown; onRetry: () => void };

/** Shown in place of any link verdict until the staff list has loaded. */
function StaffListStatusLine({ state }: { state: StaffListState }) {
  if (!state.error) {
    return (
      <div style={{ ...hintLineStyle, color: "var(--fg-tertiary)" }}>
        <Loader2 style={{ width: 13, height: 13, flexShrink: 0, marginTop: 2, animation: "spin 1s linear infinite" }} />
        <span>Loading staff records…</span>
      </div>
    );
  }
  return (
    <div role="alert" style={{ ...hintLineStyle, color: "var(--danger)", alignItems: "center", flexWrap: "wrap" }}>
      <AlertCircle style={{ width: 13, height: 13, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        Couldn&apos;t load staff records. {describeApiError(state.error, "Check your connection and try again.")}
      </span>
      <button type="button" className="ss-btn" onClick={state.onRetry}>Retry</button>
    </div>
  );
}

/**
 * Under the select: the chosen record's programs, then anything that will stop the login seeing
 * its stars. `isChange` = the admin picked a different record than the saved one, which is when
 * the server refuses a record another login already uses.
 */
function StaffLinkPreview({
  staffMemberId,
  record,
  role,
  otherLogins,
  isChange,
  staffList,
}: {
  staffMemberId: string;
  record: StaffSummaryDto | null;
  role: UserRole;
  otherLogins: UserDto[];
  isChange: boolean;
  staffList: StaffListState;
}) {
  const listStatus = !staffList.loaded && !record ? <StaffListStatusLine state={staffList} /> : null;
  if (!staffMemberId) {
    if (role === "Admin") return listStatus;
    return (
      <>
        {listStatus}
        <div style={{ ...hintLineStyle, color: "var(--warning-text, var(--warning))" }}>
          <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 2 }} />
          <span>Not linked: this login will see no stars, classes or rosters.</span>
        </div>
      </>
    );
  }
  // An id the list lacks is only "not found" once the list has loaded.
  if (listStatus) return listStatus;
  const issues = staffLinkIssues(role, record, otherLogins).map((i) =>
    i.key === "shared" && isChange
      ? { ...i, detail: `Already linked to ${otherLogins.map((u) => u.email).join(", ")}. One staff record backs one login, so saving will be refused until that login is unlinked.`, tone: "danger" as const }
      : i
  );
  return (
    <div aria-live="polite">
      {record && (
        <div style={{ ...hintLineStyle, color: "var(--fg-secondary)" }}>
          <span>
            <span style={{ fontWeight: 500 }}>Programs:</span>{" "}
            {record.programNames.length > 0 ? record.programNames.join(", ") : "none"}
          </span>
        </div>
      )}
      {issues.map((i) => (
        <div key={i.key}
          style={{ ...hintLineStyle, color: i.tone === "danger" ? "var(--danger)" : "var(--warning-text, var(--warning))" }}>
          <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 2 }} />
          <span>{i.detail}</span>
        </div>
      ))}
      {issues.length === 0 && role !== "Admin" && (
        <div style={{ ...hintLineStyle, color: "var(--fg-tertiary)" }}>
          Stars, classes and rosters this login sees come from the programs this staff record is assigned to (Onboarding → open the person → Edit details, or Programs page → Manage staff).
        </div>
      )}
    </div>
  );
}

// ── Create User Modal ───────────────────────────────────────────────────────────

type CreateForm = {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  staffMemberId: string;
};
const EMPTY_FORM: CreateForm = { fullName: "", email: "", password: "", role: "Staff", staffMemberId: "" };

const MIN_PASSWORD = 8;

export function CreateUserModal({
  staff,
  staffList,
  users,
  onClose,
  onCreated,
}: {
  staff: StaffSummaryDto[];
  staffList: StaffListState;
  /** Existing logins, to mark staff records another login already uses. */
  users: UserDto[];
  onClose: () => void;
  onCreated: (u: UserDto) => void;
}) {
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [showPw, setShowPw] = useState(false);
  useEscapeKey(onClose);
  const panelRef = useDialogFocus<HTMLDivElement>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const pwValid = form.password.length >= MIN_PASSWORD;
  const canSubmit = form.fullName.trim().length > 0 && emailValid && pwValid;

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)",
    padding: "8px 12px", fontSize: 13, color: "var(--fg)",
    background: "var(--surface)", outline: "none",
  };

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    const dto: RegisterUserDto = {
      fullName: form.fullName.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      role: form.role,
      staffMemberId: form.staffMemberId || undefined,
    };
    try {
      const created = await authApi.register(dto);
      onCreated(created);
    } catch (e) {
      // Do NOT infer the cause from the status code. RegisterAsync rejects a bad password,
      // a taken address and (Oct 2026) a former / missing / already-linked staff record, each
      // with its own detail — a password one character short once told the admin to change
      // the email, which was never the problem.
      setError(describeApiError(e, "Could not create the account — try again."));
      setSaving(false);
    }
  }

  const linkedLogins = loginsByStaffId(users);
  const selectedRecord = staff.find((s) => s.id === form.staffMemberId) ?? null;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(43,42,38,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "var(--space-4)" }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Create user" style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(460px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "90vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>Create user</h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>They can sign in with this email and password</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4, borderRadius: "var(--r-sm)" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)", overflowY: "auto" }}>
          <div>
            <label className="ss-label" htmlFor="cu-name" style={{ display: "block", marginBottom: 6 }}>Full name <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></label>
            <input id="cu-name" type="text" placeholder="e.g. Jamie Diaz" value={form.fullName}
              onChange={(e) => setForm(f => ({ ...f, fullName: e.target.value }))}
              style={inputStyle} autoFocus />
          </div>

          <div>
            <label className="ss-label" htmlFor="cu-email" style={{ display: "block", marginBottom: 6 }}>Email <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></label>
            <input id="cu-email" type="email" placeholder="you@shiningstarsprogram.org" value={form.email}
              onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
              style={inputStyle} />
            {form.email.length > 0 && !emailValid && (
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--danger)" }}>Enter a valid email address.</div>
            )}
          </div>

          <div>
            <label className="ss-label" htmlFor="cu-password" style={{ display: "block", marginBottom: 6 }}>Temporary password <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></label>
            <div style={{ position: "relative" }}>
              <input id="cu-password" type={showPw ? "text" : "password"} placeholder="At least 8 characters" value={form.password}
                onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                style={{ ...inputStyle, paddingRight: 38 }} />
              <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1} aria-label={showPw ? "Hide password" : "Show password"}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4, display: "inline-flex" }}>
                {showPw ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
              </button>
            </div>
            {form.password.length > 0 && !pwValid && (
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--danger)" }}>Must be at least {MIN_PASSWORD} characters.</div>
            )}
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Role</div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["Staff", "Admin"] as const).map((r) => {
                const sel = form.role === r;
                const Icon = r === "Admin" ? ShieldCheck : UserIcon;
                return (
                  <button key={r} type="button" onClick={() => setForm(f => ({ ...f, role: r }))}
                    style={{
                      flex: 1, display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 12px",
                      borderRadius: "var(--r-md)", cursor: "pointer", fontSize: 13, textAlign: "left",
                      border: `0.5px solid ${sel ? "var(--primary, #378add)" : "var(--border)"}`,
                      background: sel ? "var(--bg)" : "var(--surface)",
                      color: sel ? "var(--fg)" : "var(--fg-secondary)",
                    }}>
                    <Icon style={{ width: 16, height: 16, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 500 }}>{r}</div>
                      <div style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>
                        {r === "Admin" ? "Full access + user mgmt" : "Standard access"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Shown while the staff list loads or after it failed too, so a missing list reads as
              "loading" / "couldn't load" rather than the field silently not being there. */}
          {(staff.length > 0 || !staffList.loaded) && (
            <div>
              <label className="ss-label" htmlFor="cu-staff" style={{ display: "block", marginBottom: 6 }}>
                Link to staff record <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span>
              </label>
              <select id="cu-staff" value={form.staffMemberId}
                onChange={(e) => setForm(f => ({ ...f, staffMemberId: e.target.value }))}
                disabled={staff.length === 0}
                style={{ ...inputStyle, appearance: "auto" }}>
                <option value="">Not linked</option>
                {staff.filter((s) => !s.isFormer || s.id === form.staffMemberId).map((s) => (
                  <option key={s.id} value={s.id}>{staffLinkOptionLabel(s, linkedLogins.get(s.id) ?? [], false)}</option>
                ))}
              </select>
              <StaffLinkPreview
                staffMemberId={form.staffMemberId}
                record={selectedRecord}
                role={form.role}
                otherLogins={form.staffMemberId ? linkedLogins.get(form.staffMemberId) ?? [] : []}
                isChange
                staffList={staffList}
              />
            </div>
          )}
        </div>

        {error && (
          <div style={{ margin: "0 var(--space-4)", padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--danger-fill, #fce8e8)", color: "var(--danger)", fontSize: 12, display: "flex", alignItems: "flex-start", gap: 6 }}>
            <AlertCircle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
            {error}
          </div>
        )}

        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button className="ss-btn" type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" disabled={!canSubmit || saving} onClick={handleSubmit}>
            {saving ? <Loader2 className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} /> : <UserPlus className="ss-btn-icon" />}
            {saving ? "Creating…" : "Create user"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit User Modal ─────────────────────────────────────────────────────────────

export function EditUserModal({
  target,
  staff,
  staffList,
  users,
  isSelf,
  onClose,
  onSaved,
}: {
  target: UserDto;
  staff: StaffSummaryDto[];
  staffList: StaffListState;
  /** Every login, to mark staff records another login already uses. */
  users: UserDto[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: (u: UserDto) => void;
}) {
  const [fullName, setFullName] = useState(target.fullName);
  const [email, setEmail] = useState(target.email);
  const [role, setRole] = useState<UserRole>(target.role);
  useEscapeKey(onClose);
  const panelRef = useDialogFocus<HTMLDivElement>();
  const [isActive, setIsActive] = useState(target.isActive);
  // The staff link can now be set after creation — an unlinked Staff login sees nothing.
  const [staffMemberId, setStaffMemberId] = useState(target.staffMemberId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const staffDirty = staffMemberId !== (target.staffMemberId ?? "");
  const normalisedEmail = email.trim().toLowerCase();
  const emailDirty = normalisedEmail !== target.email;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalisedEmail);
  const dirty = fullName.trim() !== target.fullName || emailDirty || role !== target.role || isActive !== target.isActive || staffDirty;
  const canSubmit = fullName.trim().length > 0 && emailValid && dirty;

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    const dto: UpdateUserDto = {
      fullName: fullName.trim(), role, isActive,
      ...(emailDirty ? { email: normalisedEmail } : {}),
      ...(staffDirty ? (staffMemberId ? { staffMemberId } : { clearStaffMember: true }) : {}),
    };
    try {
      const updated = await authApi.update(target.id, dto);
      onSaved(updated);
    } catch (e) {
      // The server's own reason: last admin, taken email, or (Oct 2026) a staff record that is
      // former, missing or already linked to another login.
      setError(describeApiError(e, "Could not save changes — try again."));
      setSaving(false);
    }
  }

  // Other logins only: this login's own current link isn't a conflict.
  const linkedLogins = loginsByStaffId(users.filter((u) => u.id !== target.id));
  const currentLinkId = target.staffMemberId ?? "";
  const selectedRecord = staff.find((m) => m.id === staffMemberId) ?? null;
  // The saved link is always offered, even when that record is former, so the select never
  // reads "Not linked" while a link exists (it did — the cause of the Scott Davis confusion).
  const staffOptions = staff.filter((m) => !m.isFormer || m.id === currentLinkId || m.id === staffMemberId);

  return (
    <div style={overlayStyle}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Edit user" style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(440px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "90vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>Edit user</h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>{target.email}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4, borderRadius: "var(--r-sm)" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)", overflowY: "auto" }}>
          {role === "Staff" && (
            <div>
              <label className="ss-label" htmlFor="eu-staff" style={{ display: "block", marginBottom: 6 }}>Link to staff record</label>
              {/* With no list to pick from (still loading, or it failed) the only other choice is
                  "Not linked", which would clear a link that may be fine: wait for the list. */}
              <select id="eu-staff" value={staffMemberId} onChange={(e) => setStaffMemberId(e.target.value)}
                disabled={staff.length === 0 && !staffList.loaded}
                style={{ width: "100%", boxSizing: "border-box", border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)", padding: "8px 12px", fontSize: 13, color: "var(--fg)", background: "var(--surface)", outline: "none", appearance: "auto" }}>
                <option value="">Not linked</option>
                {staffOptions.map((m) => (
                  <option key={m.id} value={m.id}>{staffLinkOptionLabel(m, linkedLogins.get(m.id) ?? [], m.id === currentLinkId)}</option>
                ))}
                {/* Linked to an id the list doesn't have: say so rather than show "Not linked" — but
                    only call it "not found" once the list has loaded. */}
                {staffMemberId && !selectedRecord && (
                  <option value={staffMemberId}>
                    {staffList.loaded
                      ? "Linked record not found in the staff list"
                      : staffList.error
                        ? "Linked (couldn't load the staff list)"
                        : "Loading staff records…"}
                  </option>
                )}
              </select>
              <StaffLinkPreview
                staffMemberId={staffMemberId}
                record={selectedRecord}
                role={role}
                otherLogins={staffMemberId ? linkedLogins.get(staffMemberId) ?? [] : []}
                isChange={staffDirty}
                staffList={staffList}
              />
            </div>
          )}
          <div>
            <label className="ss-label" htmlFor="eu-name" style={{ display: "block", marginBottom: 6 }}>Full name</label>
            <input id="eu-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} />
          </div>

          <div>
            <label className="ss-label" htmlFor="eu-email" style={{ display: "block", marginBottom: 6 }}>Email</label>
            <input id="eu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} autoComplete="off" />
            {email.length > 0 && !emailValid && (
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--danger)" }}>Enter a valid email address.</div>
            )}
            {emailDirty && emailValid && (
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--fg-tertiary)" }}>They will sign in with the new address from now on; the password is unchanged.</div>
            )}
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Role</div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["Staff", "Admin"] as const).map((r) => {
                const sel = role === r;
                const Icon = r === "Admin" ? ShieldCheck : UserIcon;
                return (
                  <button key={r} type="button" onClick={() => setRole(r)}
                    style={{
                      flex: 1, display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 12px",
                      borderRadius: "var(--r-md)", cursor: "pointer", fontSize: 13,
                      border: `0.5px solid ${sel ? "var(--primary, #378add)" : "var(--border)"}`,
                      background: sel ? "var(--bg)" : "var(--surface)",
                      color: sel ? "var(--fg)" : "var(--fg-secondary)",
                    }}>
                    <Icon style={{ width: 16, height: 16 }} />
                    {r}
                  </button>
                );
              })}
            </div>
            {isSelf && role !== "Admin" && target.role === "Admin" && (
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--danger)" }}>You can&apos;t remove your own admin access.</div>
            )}
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Account status</div>
            <button type="button" onClick={() => setIsActive((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px",
                borderRadius: "var(--r-md)", cursor: "pointer", fontSize: 13, textAlign: "left",
                border: "0.5px solid var(--border)", background: "var(--surface)", color: "var(--fg)",
              }}>
              <span style={{
                width: 36, height: 20, borderRadius: 999, flexShrink: 0, position: "relative",
                background: isActive ? "var(--success, #1d9e75)" : "var(--border-strong, #ccc)", transition: "background 120ms",
              }}>
                <span style={{ position: "absolute", top: 2, left: isActive ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 120ms" }} />
              </span>
              <span>
                <div style={{ fontWeight: 500 }}>{isActive ? "Active" : "Disabled"}</div>
                <div style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>
                  {isActive ? "Can sign in" : "Blocked from signing in"}
                </div>
              </span>
            </button>
          </div>
        </div>

        {error && (
          <div style={errorBoxStyle}>
            <AlertCircle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
            {error}
          </div>
        )}

        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button className="ss-btn" type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" disabled={!canSubmit || saving} onClick={handleSubmit}>
            {saving ? <Loader2 className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} /> : <Check className="ss-btn-icon" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reset Password Modal ─────────────────────────────────────────────────────────

export function ResetPasswordModal({
  target,
  onClose,
  onDone,
}: {
  target: UserDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const valid = password.length >= MIN_PASSWORD;
  useEscapeKey(onClose);
  const panelRef = useDialogFocus<HTMLDivElement>();

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    const dto: ResetPasswordDto = { newPassword: password };
    try {
      await authApi.resetPassword(target.id, dto);
      onDone();
    } catch (e) {
      setError(apiErrorMessage(e, "Could not reset the password — try again."));
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Reset password" style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(420px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)" }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 2px" }}>Reset password</h3>
            <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>{target.fullName} · {target.email}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4 }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ padding: "var(--space-4)" }}>
          <label className="ss-label" htmlFor="rp-password" style={{ display: "block", marginBottom: 6 }}>New password</label>
          <div style={{ position: "relative" }}>
            <input id="rp-password" type={showPw ? "text" : "password"} placeholder="At least 8 characters" value={password}
              onChange={(e) => setPassword(e.target.value)} style={{ ...inputStyle, paddingRight: 38 }} autoFocus />
            <button type="button" onClick={() => setShowPw((v) => !v)} tabIndex={-1} aria-label={showPw ? "Hide password" : "Show password"}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4, display: "inline-flex" }}>
              {showPw ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
            </button>
          </div>
          {password.length > 0 && !valid && (
            <div style={{ marginTop: 4, fontSize: 11, color: "var(--danger)" }}>Must be at least {MIN_PASSWORD} characters.</div>
          )}
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--fg-tertiary)" }}>
            The user should change this after their next sign-in.
          </div>
        </div>

        {error && <div style={{ ...errorBoxStyle, marginBottom: 0 }}><AlertCircle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />{error}</div>}

        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="ss-btn" type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" disabled={!valid || saving} onClick={handleSubmit}>
            {saving ? <Loader2 className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} /> : <KeyRound className="ss-btn-icon" />}
            {saving ? "Resetting…" : "Set password"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reset MFA Confirm Modal ──────────────────────────────────────────────────────

/**
 * The lost-phone escape hatch. There is no way to recover a user's second factor — the
 * backend never exposes the secret, deliberately — so the only remedy is to clear it and make
 * them enroll again. That is a real reduction in the account's protection until they do, so
 * it gets a confirmation that states the consequence rather than a bare "Are you sure?".
 */
export function ResetMfaModal({
  target,
  isSelf,
  onClose,
  onReset,
}: {
  target: UserDto;
  isSelf: boolean;
  onClose: () => void;
  onReset: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEscapeKey(onClose);
  const panelRef = useDialogFocus<HTMLDivElement>();

  async function handleReset() {
    setSaving(true);
    setError(null);
    try {
      await authApi.adminResetMfa(target.id);
      onReset();
    } catch (e) {
      const status = (e as { status?: number })?.status;
      setError(
        status === 404
          ? "That account no longer exists — refresh the list."
          : "Could not reset two-factor authentication — try again."
      );
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Reset two-factor authentication" style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(440px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)" }}>
        <div style={{ padding: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ display: "inline-flex", width: 32, height: 32, borderRadius: "50%", background: "var(--warning-fill)", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <ShieldOff style={{ width: 16, height: 16, color: "#9a6a12" }} />
            </span>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Reset two-factor authentication?</h3>
          </div>

          <p style={{ fontSize: 13, color: "var(--fg-secondary)", lineHeight: 1.6, margin: "0 0 10px" }}>
            <strong>{target.fullName}</strong> ({target.email}) will lose their authenticator
            app and all of their recovery codes, and will be signed out everywhere.
          </p>
          <p style={{ fontSize: 13, color: "var(--fg-secondary)", lineHeight: 1.6, margin: "0 0 10px" }}>
            Until they set up a new authenticator, their password is the only thing standing
            between anyone who has it and this system&apos;s participant records. Do this only
            when you are confident you are talking to them — a phone call, not an email.
          </p>

          {isSelf && (
            <p style={{ fontSize: 13, color: "var(--danger)", lineHeight: 1.6, margin: 0 }}>
              This is your own account. You will be signed out and will have to enroll again
              before you can do anything else.
            </p>
          )}
        </div>

        {error && <div style={{ ...errorBoxStyle, marginBottom: 0 }}><AlertCircle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />{error}</div>}

        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="ss-btn" type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="ss-btn" type="button" disabled={saving} onClick={handleReset}
            style={{ background: "var(--danger)", color: "#fff", borderColor: "var(--danger)" }}>
            {saving ? <Loader2 className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} /> : <ShieldOff className="ss-btn-icon" />}
            {saving ? "Resetting…" : "Reset two-factor"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ─────────────────────────────────────────────────────────

export function DeleteUserModal({
  target,
  onClose,
  onDeleted,
}: {
  target: UserDto;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  useEscapeKey(onClose);
  const panelRef = useDialogFocus<HTMLDivElement>();

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await authApi.remove(target.id);
      onDeleted();
    } catch (e) {
      setError(apiErrorMessage(e, "Could not delete this user — try again."));
      setDeleting(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Delete user" style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(400px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)" }}>
        <div style={{ padding: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ display: "inline-flex", width: 32, height: 32, borderRadius: "50%", background: "var(--danger-fill, #fce8e8)", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Trash2 style={{ width: 16, height: 16, color: "var(--danger)" }} />
            </span>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Delete user?</h3>
          </div>
          <p style={{ fontSize: 13, color: "var(--fg-secondary)", lineHeight: 1.5, margin: 0 }}>
            <strong>{target.fullName}</strong> ({target.email}) will permanently lose access. This can&apos;t be undone.
          </p>
        </div>

        {error && <div style={{ ...errorBoxStyle, marginBottom: 0 }}><AlertCircle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />{error}</div>}

        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="ss-btn" type="button" onClick={onClose} disabled={deleting}>Cancel</button>
          <button className="ss-btn" type="button" disabled={deleting} onClick={handleDelete}
            style={{ background: "var(--danger)", color: "#fff", borderColor: "var(--danger)" }}>
            {deleting ? <Loader2 className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 className="ss-btn-icon" />}
            {deleting ? "Deleting…" : "Delete user"}
          </button>
        </div>
      </div>
    </div>
  );
}

