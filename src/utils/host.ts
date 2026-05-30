/**
 * Reduce arbitrary user input to a bare hostname or IP literal.
 *
 * Examples:
 *   "https://www.google.com/foo?x=1#bar"  → "www.google.com"
 *   "http://user:pass@example.com:8080/p" → "example.com"
 *   "[2001:db8::1]:443"                   → "2001:db8::1"
 *   "  Example.COM. "                     → "example.com"
 *   "1.2.3.4"                             → "1.2.3.4"
 *
 * Done by hand rather than via URL because Hermes' URL implementation is
 * partial and React Native's polyfill chokes on schemeless input.
 */
export function normalizeHost(input: string): string {
  if (!input) return '';
  let s = input.trim();
  if (!s) return '';

  // 1. Strip scheme (http://, https://, ftp://, ssh://, etc.)
  const schemeMatch = s.match(/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//);
  if (schemeMatch) {
    s = s.slice(schemeMatch[0].length);
  }

  // 2. Cut off path / query / fragment — first '/', '?', or '#' wins,
  //    but only AFTER we've handled the optional [...] for IPv6.
  if (s.startsWith('[')) {
    const end = s.indexOf(']');
    if (end > 0) {
      // Keep "[v6]" + the optional ":port" (we'll strip port below)
      const head = s.slice(0, end + 1);
      let tail = s.slice(end + 1);
      // Cut tail at first delimiter
      const cut = tail.search(/[/?#]/);
      if (cut >= 0) tail = tail.slice(0, cut);
      s = head + tail;
    }
  } else {
    const cut = s.search(/[/?#]/);
    if (cut >= 0) s = s.slice(0, cut);
  }

  // 3. Strip userinfo (user:pass@)
  const at = s.lastIndexOf('@');
  if (at >= 0) s = s.slice(at + 1);

  // 4. Handle IPv6 in brackets: keep the inner address, drop port
  if (s.startsWith('[')) {
    const end = s.indexOf(']');
    if (end > 0) return s.slice(1, end).toLowerCase();
    // unmatched bracket — fall through and treat as plain
    s = s.slice(1);
  }

  // 5. If it looks like a bare IPv6 (has ≥ 2 colons), don't strip the colons
  const colonCount = (s.match(/:/g) || []).length;
  if (colonCount >= 2) {
    return s.toLowerCase();
  }

  // 6. Strip a single ":port" suffix
  const colonIdx = s.indexOf(':');
  if (colonIdx >= 0) s = s.slice(0, colonIdx);

  // 7. Strip a single trailing dot (FQDN canonical form)
  if (s.endsWith('.')) s = s.slice(0, -1);

  return s.toLowerCase();
}

/** True if the string is a literal IPv4 address. */
export function isIPv4(s: string): boolean {
  const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  for (let i = 1; i <= 4; i++) {
    const n = Number(m[i]);
    if (n < 0 || n > 255) return false;
  }
  return true;
}

/** Cheap heuristic — anything with ":" that isn't an IPv4. */
export function isIPv6(s: string): boolean {
  return s.includes(':') && !isIPv4(s);
}

export function isIp(s: string): boolean {
  return isIPv4(s) || isIPv6(s);
}
