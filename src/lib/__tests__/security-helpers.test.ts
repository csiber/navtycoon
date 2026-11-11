import { describe, it, expect } from 'vitest';
import { jsonForScript } from '../safe-json';
import { isAdminUser, parseAdminIds } from '../admin';
import { safeNextPath } from '../auth';

describe('jsonForScript', () => {
  it('cannot break out of a <script type="application/json"> block', () => {
    const out = jsonForScript({ company: '</script><script>alert(1)</script>', x: 'a&b>c' });
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).not.toContain('&');
    expect(JSON.parse(out)).toEqual({ company: '</script><script>alert(1)</script>', x: 'a&b>c' });
  });

  it('escapes U+2028/U+2029 and round-trips', () => {
    const v = { t: 'a\u2028b\u2029c' };
    const out = jsonForScript(v);
    expect(out).not.toMatch(/[\u2028\u2029]/);
    expect(JSON.parse(out)).toEqual(v);
  });
});

describe('isAdminUser', () => {
  it('nobody is admin when ADMIN_USER_IDS is unset', () => {
    expect(isAdminUser({ id: 'u_1' }, {})).toBe(false);
    expect(isAdminUser({ id: 'u_1' }, undefined)).toBe(false);
  });

  it('matches only listed user ids, never e-mail tricks', () => {
    const env = { ADMIN_USER_IDS: ' u_a , u_b,' };
    expect(parseAdminIds(env.ADMIN_USER_IDS)).toEqual(new Set(['u_a', 'u_b']));
    expect(isAdminUser({ id: 'u_b' }, env)).toBe(true);
    expect(isAdminUser({ id: 'u_c', email: 'x+admin@y.hu' } as { id: string }, env)).toBe(false);
    expect(isAdminUser(null, env)).toBe(false);
  });
});

describe('safeNextPath', () => {
  it('keeps same-site relative paths', () => {
    expect(safeNextPath('/play/shift')).toBe('/play/shift');
    expect(safeNextPath('/play?x=1#y')).toBe('/play?x=1#y');
  });

  it('rejects open redirects and script URLs', () => {
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', ' /play', '/pl\nay', '']) {
      expect(safeNextPath(bad)).toBe('/play');
    }
    expect(safeNextPath(null)).toBe('/play');
  });
});
