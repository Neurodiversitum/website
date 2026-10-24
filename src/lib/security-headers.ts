// The security headers of public/_headers, for pages the Worker renders (events, member area,
// join). public/_headers only reaches static files. A unit test keeps both lists equal.
export const securityHeaders: Record<string, string> = {
  'Content-Security-Policy':
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/** A copy of the response with the security headers set (rendered responses can be immutable). */
export function withSecurityHeaders(response: Response): Response {
  const copy = new Response(response.body, response);
  for (const [name, value] of Object.entries(securityHeaders)) {
    // A page's own policy stays; a second policy is enforced in addition to it.
    if (name === 'Content-Security-Policy' && copy.headers.has(name)) {
      copy.headers.append(name, value);
    } else {
      copy.headers.set(name, value);
    }
  }
  return copy;
}
