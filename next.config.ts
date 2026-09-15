import type { NextConfig } from "next";

// All browser API calls go to /backend/* on THIS origin and are proxied to the real
// API (#15). That makes the backend's httpOnly auth cookies first-party — SameSite=Lax
// works and Safari's third-party-cookie blocking never applies.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5208";

const isDev = process.env.NODE_ENV === "development";

// Content Security Policy (#7).
//
// Scope note, so nobody reads more protection into this than it gives: script-src and
// style-src allow 'unsafe-inline', so this does NOT stop injected inline script. What it
// does stop is loading script from another origin, exfiltrating to another origin,
// plugin/object embedding, base-tag hijacking, form retargeting, and framing.
//
// Both relaxations are load-bearing:
//   - style-src: pages style elements with React's `style` prop, which renders style
//     attributes. Nonces do not apply to attributes, so 'unsafe-inline' is the only way
//     to keep them working.
//   - script-src: Next.js emits inline bootstrap scripts. Tightening this to
//     'nonce-<n>' 'strict-dynamic' means generating a per-request nonce in proxy.ts and
//     opting every page into dynamic rendering — see the Next.js CSP guide. Worth doing,
//     but it needs verification in a browser rather than a blind config change.
//
// connect-src is 'self' only because the browser never talks to the API directly; it goes
// through the same-origin /backend rewrite above.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  // Dev needs the HMR websocket.
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  // The Scripts page shows a PDF in an <iframe> whose src is a blob: URL built from the
  // authenticated download. Without this the iframe falls back to default-src 'self' and
  // the browser blocks it — "Open in new tab" worked while the preview stayed blank.
  "frame-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // frame-ancestors above is the modern form; this covers older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // Vercel terminates TLS and serves this over HTTPS; make browsers remember that.
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]),
];

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: `${API_URL}/:path*`,
      },
    ];
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
