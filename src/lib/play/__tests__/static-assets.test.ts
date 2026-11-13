// Hyperscales — statikus kiszolgálás (2026-11-13): a landing nem tölt külső (CDN) szkriptet, a /play keret-szkriptje
// tartalom-hash-es URL-en megy ki (nem a 4 órás CF-cache-sel kiszolgált /js/play-shell.js-ről).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const read = (p: string) => readFileSync(root + p, 'utf8');

describe('static assets', () => {
  it('the landing loads no third-party CDN script (gsap / lenis / canvas-confetti are bundled)', () => {
    const src = read('src/pages/index.astro');
    expect(src).not.toMatch(/<script[^>]+src="https?:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)/);
    expect(src).toContain("from 'gsap'");
    expect(src).toContain("from 'lenis'");
    expect(src).toContain("from 'canvas-confetti'");
  });

  it('every /play page loads play-shell.js through a hashed ?url import', () => {
    expect(existsSync(root + 'public/js/play-shell.js')).toBe(false);
    const files = ['src/layouts/PlayLayout.astro', ...readdirSync(root + 'src/pages/play').filter((f) => f.endsWith('.astro')).map((f) => 'src/pages/play/' + f)];
    let n = 0;
    for (const f of files) {
      const s = read(f);
      expect(s, f).not.toContain('/js/play-shell.js');
      if (s.includes('src={playShellJsUrl}')) { n++; expect(s, f).toMatch(/import playShellJsUrl from '[./]+scripts\/play-shell\.js\?url'/); }
    }
    expect(n).toBeGreaterThanOrEqual(10);
  });

  it('_headers keeps /_astro/* immutable', () => {
    expect(read('public/_headers')).toMatch(/\/_astro\/\*\s+Cache-Control: public, max-age=31536000, immutable/);
  });
});
