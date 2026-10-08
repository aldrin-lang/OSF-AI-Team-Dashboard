/**
 * Turns a user-supplied "next" value into a safe in-app path.
 * Only same-site paths are allowed ("/leads?x=1"); absolute URLs,
 * protocol-relative "//host" and backslash tricks fall back to "/".
 */
export function safeNext(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const base = "http://local.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
