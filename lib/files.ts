// Shared rules and helpers for attachments (star paperwork, staff onboarding files).
// The backend is the authority — it checks the file header too — these mirror its cheap
// rules so the two common mistakes, wrong file and huge file, get an answer before any
// bytes move.

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** What the file input offers: PDF plus the two image formats scanners and phones produce. */
export const DOCUMENT_ACCEPT = "application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg";

/** 1234567 → "1.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Why a chosen file cannot be attached, or null when it can. */
export function documentProblem(file: File): string | null {
  if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) return "Only PDF, PNG or JPG files can be attached.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_DOCUMENT_BYTES) return `That file is ${formatBytes(file.size)}; the limit is 25 MB.`;
  return null;
}

/**
 * Hands a fetched file to the browser as a download. Going through fetch (rather than
 * pointing a link at the URL) keeps the silent session refresh — a plain navigation to an
 * expired-cookie endpoint would land on a raw 401.
 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
