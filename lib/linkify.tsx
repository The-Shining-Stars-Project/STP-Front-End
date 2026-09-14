import type { ReactNode } from "react";

const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

/**
 * Renders plain text with any http(s):// or www. address turned into a link that opens in a
 * new tab. Trailing punctuation stays outside the link so "see https://x.y/z." works.
 */
export function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    let raw = m[0];
    let trail = "";
    while (raw.length > 0 && /[.,;:!?)\]]$/.test(raw)) { trail = raw.slice(-1) + trail; raw = raw.slice(0, -1); }
    if (start > last) out.push(text.slice(last, start));
    const href = raw.startsWith("http") ? raw : `https://${raw}`;
    out.push(
      <a key={`${start}-${raw}`} href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", wordBreak: "break-all" }}>
        {raw}
      </a>
    );
    if (trail) out.push(trail);
    last = start + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
