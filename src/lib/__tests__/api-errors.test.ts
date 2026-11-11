import { describe, it, expect } from 'vitest';
import {
  API_MESSAGES, API_LOCALES, apiMsg, localeFromRequest, localeFromAcceptLanguage, jsonError,
} from '../i18n/api-errors';
import { passwordIssue, companyNameIssue } from '../auth';
import { checkHostingNameBlacklist } from '../auth/hosting-blacklist';

describe('api-errors dictionary', () => {
  it('every key exists, non-empty, in en/hu/de', () => {
    const keys = Object.keys(API_MESSAGES.en);
    for (const loc of API_LOCALES) {
      expect(Object.keys(API_MESSAGES[loc]).sort()).toEqual([...keys].sort());
      for (const k of keys) expect((API_MESSAGES[loc] as Record<string, string>)[k].trim().length).toBeGreaterThan(0);
    }
  });
  it('placeholders match across languages', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const k of Object.keys(API_MESSAGES.en) as Array<keyof typeof API_MESSAGES.en>) {
      for (const loc of API_LOCALES) expect(ph(API_MESSAGES[loc][k])).toBe(ph(API_MESSAGES.en[k]));
    }
  });
  it('interpolates params', () => {
    expect(apiMsg('hu', 'company_real_brand_sub', { name: 'aws' })).toContain('„aws”');
    expect(apiMsg('en', 'company_real_brand_sub', { name: 'aws' })).toContain('"aws"');
  });
  it('auth helpers return keys that exist in the dictionary', () => {
    for (const k of [passwordIssue('short'), passwordIssue('x'.repeat(200)), companyNameIssue('A'), companyNameIssue('x'.repeat(90))]) {
      expect(k).not.toBeNull();
      expect(API_MESSAGES.de[k!]).toBeTruthy();
    }
    expect(passwordIssue('elegendo-jelszo')).toBeNull();
    const b = checkHostingNameBlacklist('Hetzner');
    expect(b.blocked).toBe(true);
    expect(b.code && API_MESSAGES.en[b.code]).toBeTruthy();
  });
});

describe('localeFromRequest', () => {
  const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });
  it('body.lang wins', () => {
    expect(localeFromRequest(req('https://x/a?lang=de', { cookie: 'hs_lang=hu' }), 'en')).toBe('en');
  });
  it('then ?lang, then cookie, then Accept-Language, then en', () => {
    expect(localeFromRequest(req('https://x/a?lang=de', { cookie: 'hs_lang=hu' }))).toBe('de');
    expect(localeFromRequest(req('https://x/a', { cookie: 'a=1; hs_lang=hu', 'accept-language': 'de' }))).toBe('hu');
    expect(localeFromRequest(req('https://x/a', { 'accept-language': 'fr-FR,de;q=0.8,hu;q=0.9' }))).toBe('hu');
    expect(localeFromRequest(req('https://x/a', { 'accept-language': 'fr-FR' }))).toBe('en');
    expect(localeFromRequest(req('https://x/a'), 'xx')).toBe('en');
  });
  it('Accept-Language parsing', () => {
    expect(localeFromAcceptLanguage('hu-HU,hu;q=0.9,en-US;q=0.8')).toBe('hu');
    expect(localeFromAcceptLanguage('de;q=0')).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
  });
  it('jsonError returns translated body + code', async () => {
    const r = jsonError(401, 'de', 'bad_credentials');
    expect(r.status).toBe(401);
    const j = await r.json() as { ok: boolean; error: string; code: string };
    expect(j).toEqual({ ok: false, error: API_MESSAGES.de.bad_credentials, code: 'bad_credentials' });
  });
});
