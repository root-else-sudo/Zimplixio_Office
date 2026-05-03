import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const cspDirectives = [
  "default-src 'self'",
  // 'unsafe-inline' / 'unsafe-eval' are required by Next.js's runtime + Tailwind
  // injected styles. A nonce-based CSP via middleware is the next step (deferred
  // to a later phase) so we can drop these.
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""}`.trim(),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  // Ship CSP in report-only mode first so we can spot breakages before enforcing.
  // Switch to `Content-Security-Policy` once telemetry is clean.
  { key: "Content-Security-Policy-Report-Only", value: cspDirectives },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
