import {normalizeHost, isIPv4, isIPv6, isIp} from '../src/utils/host';

describe('normalizeHost', () => {
  it('strips https scheme + path + query + fragment', () => {
    expect(normalizeHost('https://www.google.com/doifhdfd0?x=1#y')).toBe(
      'www.google.com',
    );
  });

  it('strips http with port and path', () => {
    expect(normalizeHost('http://example.com:8080/api/v1')).toBe('example.com');
  });

  it('strips userinfo', () => {
    expect(normalizeHost('https://user:pass@example.com/x')).toBe('example.com');
  });

  it('handles bare domain', () => {
    expect(normalizeHost('example.com')).toBe('example.com');
  });

  it('lowercases and trims', () => {
    expect(normalizeHost('  Example.COM  ')).toBe('example.com');
  });

  it('strips trailing dot', () => {
    expect(normalizeHost('example.com.')).toBe('example.com');
  });

  it('keeps bare IPv4 untouched', () => {
    expect(normalizeHost('1.2.3.4')).toBe('1.2.3.4');
  });

  it('strips port from IPv4', () => {
    expect(normalizeHost('1.2.3.4:443')).toBe('1.2.3.4');
  });

  it('extracts IPv6 from brackets', () => {
    expect(normalizeHost('[2001:db8::1]:443')).toBe('2001:db8::1');
  });

  it('keeps bare IPv6', () => {
    expect(normalizeHost('2001:db8::1')).toBe('2001:db8::1');
  });

  it('handles ws:// scheme', () => {
    expect(normalizeHost('ws://socket.example.com:9000/chat')).toBe(
      'socket.example.com',
    );
  });

  it('returns empty for empty input', () => {
    expect(normalizeHost('')).toBe('');
    expect(normalizeHost('   ')).toBe('');
  });

  it('handles path-only with no scheme', () => {
    expect(normalizeHost('example.com/path?q=1')).toBe('example.com');
  });

  it('handles ?-first input', () => {
    expect(normalizeHost('example.com?q=1')).toBe('example.com');
  });
});

describe('isIPv4 / isIPv6 / isIp', () => {
  it('detects IPv4', () => {
    expect(isIPv4('1.2.3.4')).toBe(true);
    expect(isIPv4('255.255.255.255')).toBe(true);
    expect(isIPv4('256.0.0.0')).toBe(false);
    expect(isIPv4('1.2.3')).toBe(false);
  });

  it('detects IPv6', () => {
    expect(isIPv6('2001:db8::1')).toBe(true);
    expect(isIPv6('::1')).toBe(true);
    expect(isIPv6('1.2.3.4')).toBe(false);
  });

  it('isIp matches both', () => {
    expect(isIp('1.2.3.4')).toBe(true);
    expect(isIp('2001:db8::1')).toBe(true);
    expect(isIp('example.com')).toBe(false);
  });
});
