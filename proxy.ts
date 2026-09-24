import { NextResponse, type NextRequest } from "next/server";

// Server-side route protection (#16) + role gating (#38). Because auth lives in
// first-party httpOnly cookies (see next.config.ts), this runs before any admin page
// HTML/JS is served — unauthenticated visitors are redirected at the edge instead of
// after client hydration. This is a UX gate; the backend independently enforces
// authentication and roles on every API call.

const ACCESS_COOKIE = "ss_access";
const REFRESH_COOKIE = "ss_refresh";

/**
 * Reads the role claim from the JWT payload WITHOUT verifying the signature — fine
 * here because this only decides which page shell to serve; the API verifies the
 * signature on every real request.
 */
function roleFromJwt(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return (JSON.parse(json) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

// Pages only Admin accounts may open; teacher (Staff) accounts are bounced to the
// dashboard. The backend enforces the same split on the corresponding API endpoints.
const ADMIN_ONLY_PREFIXES = [
  "/users",
  "/staff",
  "/reports",
  "/settings",
  "/audit",
];

// WHY MFA ENROLLMENT IS NOT GATED HERE, even though role gating is.
//
// The obvious move is to read the JWT's `mfa` claim below and bounce unenrolled users to
// /account. It is wrong twice over. First, the claim is fixed when the token is minted and
// stays true for up to an hour after an admin resets someone's second factor — which is the
// exact scenario the reset exists for, and the reason MfaEnforcementFilter reads the database
// instead of the claim. Second, and worse: nothing at the edge can see Mfa:Required. If that
// setting is off, an unenrolled user is perfectly entitled to use the app, and a redirect
// here would strand them on the account page with no way out and no error to explain it —
// a redirect cannot be dismissed the way a failed request can be recovered from.
//
// So enrollment routing lives in AuthGuard, which reacts to the backend actually refusing a
// request (403 + code "mfa_enrollment_required"). That is ground truth rather than a guess,
// and the server is refusing the data either way.

export function proxy(request: NextRequest) {
  const hasSession =
    request.cookies.has(ACCESS_COOKIE) || request.cookies.has(REFRESH_COOKIE);

  // A browser part-way through the two-step sign-in holds only the ss_mfa challenge cookie,
  // which is not a session and grants nothing. It lands here and is sent back to "/", where
  // the code step is waiting — correct, and the reason this check names the two auth cookies
  // explicitly rather than asking whether any auth-ish cookie is present.
  if (!hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Admin-only pages: staff users get bounced to the dashboard.
  const { pathname } = request.nextUrl;
  if (ADMIN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const token = request.cookies.get(ACCESS_COOKIE)?.value;
    if (!token || roleFromJwt(token) !== "Admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

// Every route in the (admin) group. Route groups don't appear in URLs, so list the
// segments explicitly — a new admin page must be added here to be protected.
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/students/:path*",
    "/volunteers/:path*",
    "/attendance/:path*",
    "/calendar/:path*",
    "/roster/:path*",
    "/tracker/:path*",
    "/planning/:path*",
    "/year-calendar/:path*",
    "/cohort-rollup/:path*",
    "/games/:path*",
    "/skills/:path*",
    "/staff/:path*",
    "/tasks/:path*",
    "/documents/:path*",
    "/reports/:path*",
    "/audit/:path*",
    "/settings/:path*",
    "/users/:path*",
    "/account/:path*",
    "/programs/:path*",
  ],
};
