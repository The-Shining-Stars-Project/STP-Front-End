import { notifyUnauthorized, notifyMfaEnrollmentRequired } from "../auth/token";

// All requests go through the same-origin /backend proxy (see next.config.ts rewrites),
// so the httpOnly auth cookies are first-party and sent automatically (#15). The real
// API URL only matters to the proxy; the browser never talks to it directly.
const BASE_URL = "/backend";

/** Default per-request timeout (#36) — a hung backend must not leave pages loading forever. */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Timeout for requests that carry a file in either direction. A 25 MB script PDF on a
 * classroom connection can take well over the 15 seconds a JSON call gets.
 */
const FILE_TIMEOUT_MS = 120_000;

/**
 * The backend's machine-readable error code, sent alongside the human message on the
 * errors the frontend has to branch on rather than merely display. Matching on the
 * message string is not a contract; this is.
 */
export const MFA_ENROLLMENT_REQUIRED = "mfa_enrollment_required";

export class ApiError extends Error {
  /** Human-readable message from the backend (ProblemDetails detail/title or {message}), when present. */
  public detail?: string;

  /** Backend error code, e.g. "mfa_enrollment_required". Absent on most responses. */
  public code?: string;

  constructor(public status: number, message: string, detail?: string, code?: string) {
    super(detail ?? message);
    this.name = "ApiError";
    this.detail = detail;
    this.code = code;
  }
}

type BackendError = { detail?: string; code?: string };

/** Pulls the backend's human-readable error and error code out of a ProblemDetails or {message} body (#37). */
async function readError(res: Response): Promise<BackendError> {
  try {
    const body = (await res.json()) as {
      detail?: string;
      title?: string;
      message?: string;
      code?: string;
      errors?: Record<string, string[]>;
    };
    // Validation ProblemDetails: flatten the field errors into one line.
    if (body.errors && typeof body.errors === "object") {
      const lines = Object.values(body.errors).flat();
      if (lines.length > 0) return { detail: lines.join(" "), code: body.code };
    }
    return { detail: body.detail ?? body.message ?? body.title, code: body.code };
  } catch {
    return {};
  }
}

// ── Silent session refresh (#17) ────────────────────────────────────────────────
// When the 1-hour JWT expires mid-session, the next call 401s; we exchange the
// refresh cookie for a new JWT and retry once, so a half-marked attendance roster
// survives. Concurrent 401s share one refresh call.

let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch(`${BASE_URL}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/** Auth endpoints where a 401 is an answer, not an expired session — never retried. */
function isAuthPath(path: string): boolean {
  return path.startsWith("/api/auth/login")
    || path.startsWith("/api/auth/refresh")
    || path.startsWith("/api/auth/logout");
}

/**
 * Runs one request through the shared pipeline — silent refresh, timeout, error shaping —
 * and hands back the successful Response untouched. The typed helpers below decide what to
 * do with the body: JSON for almost everything, bytes for a file download.
 */
async function apiRequest(path: string, init?: RequestInit): Promise<Response> {
  // A multipart body must NOT be given a Content-Type here: the browser sets it, and it is
  // the only party that knows the boundary string it is about to write.
  const isMultipart = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isMultipart ? {} : { "Content-Type": "application/json" }),
    ...(init?.headers as Record<string, string> | undefined),
  };

  const doFetch = async (): Promise<Response> => {
    // Respect a caller-provided signal, otherwise apply the default timeout (#36).
    const signal = init?.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
    try {
      return await fetch(`${BASE_URL}${path}`, { ...init, headers, credentials: "include", signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError")
        throw new ApiError(0, `API timeout: ${path}`, "The server took too long to respond.");
      throw err;
    }
  };

  let res = await doFetch();

  if (res.status === 401 && !isAuthPath(path)) {
    // Expired JWT? Refresh once and retry before giving up the session (#17).
    if (await refreshSession()) {
      res = await doFetch();
    }
    if (res.status === 401) {
      notifyUnauthorized();
      throw new ApiError(401, `API 401: ${path}`);
    }
  }

  if (!res.ok) {
    const { detail, code } = await readError(res);

    // The mandatory-MFA gate refuses nearly every endpoint until the user enrolls. Relay it
    // once, here, so a signed-in-but-unenrolled user is routed to enrollment instead of
    // every page independently rendering its own "couldn't load" state. The server-side
    // filter is the real control; this only decides what the user is looking at.
    if (res.status === 403 && code === MFA_ENROLLMENT_REQUIRED) {
      notifyMfaEnrollmentRequired();
    }

    throw new ApiError(res.status, `API ${res.status}: ${path}`, detail, code);
  }

  return res;
}

/** A parsed response body plus the headers it came with. */
export interface ApiResult<T> {
  data: T;
  headers: Headers;
}

/**
 * Same request pipeline as `apiFetch` — silent refresh, timeout, error shaping — but hands
 * back the response headers as well. Paged endpoints put their pre-paging total in
 * X-Total-Count, and a body-only helper cannot see it. Reading that header works because
 * every call goes through the same-origin /backend rewrite, so CORS (and its
 * exposed-headers allowlist) never enters into it.
 */
export async function apiFetchWithHeaders<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await apiRequest(path, init);

  // 204 No Content (and empty bodies) have nothing to parse.
  if (res.status === 204) return { data: undefined as T, headers: res.headers };
  const text = await res.text();
  return { data: (text ? JSON.parse(text) : undefined) as T, headers: res.headers };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return (await apiFetchWithHeaders<T>(path, init)).data;
}

/** A downloaded file: the bytes, plus the name the server suggested in Content-Disposition. */
export interface ApiFile {
  blob: Blob;
  fileName: string | null;
}

/**
 * Fetches a binary response through the same pipeline as JSON calls. Going through fetch
 * rather than pointing a link at the URL is what keeps the silent session refresh: a plain
 * navigation to an expired-cookie endpoint would land the user on a raw 401 in a new tab.
 */
export async function apiFetchFile(path: string, init?: RequestInit): Promise<ApiFile> {
  const res = await apiRequest(path, { signal: AbortSignal.timeout(FILE_TIMEOUT_MS), ...init });
  return {
    blob: await res.blob(),
    fileName: fileNameFromDisposition(res.headers.get("Content-Disposition")),
  };
}

/**
 * Reads the file name out of a Content-Disposition header. ASP.NET's File() writes both the
 * RFC 5987 form (filename*=UTF-8''..., which survives any character) and the plain quoted
 * form; prefer the first and fall back to the second.
 */
export function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*\s*=\s*utf-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // Malformed percent-encoding — fall through to the plain form.
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}

export const api = {
  get:    <T>(path: string)               => apiFetch<T>(path),
  post:   <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST",   body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "PUT",    body: JSON.stringify(body) }),
  delete: <T>(path: string)               => apiFetch<T>(path, { method: "DELETE" }),

  /** multipart/form-data POST. The browser sets the Content-Type (with its boundary) itself. */
  upload: <T>(path: string, form: FormData) =>
    apiFetch<T>(path, { method: "POST", body: form, signal: AbortSignal.timeout(FILE_TIMEOUT_MS) }),

  /** GET a file as a Blob, with the server's suggested file name. */
  file: (path: string) => apiFetchFile(path),
};
