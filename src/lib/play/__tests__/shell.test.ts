// Hyperscales — a közös /play keret (oldalsáv + felső sáv) valós adatból renderel.
import { describe, it, expect } from 'vitest';
import { renderSidebar, renderTopbar, applyShell, type ShellData } from '../shell';
import { eventLine } from '../events';
import { netMood, moodColor } from '../dashboard';
import { dailyCashFlow } from '../../game/runway';
import { NO_EFFECTS } from '../../game/upgrade-effects';
import { eraProgress } from '../../game/era-progress';

function shell(over: Partial<ShellData> = {}): ShellData {
  const flow = dailyCashFlow({ cash_usd_cents: 100000, mrr_usd_cents: 1500, marketing_ppc_pct: 0 });
  return {
    locale: 'hu', company: 'Csiber <Teszt> Kft', initials: 'CT', displayName: 'Csiber <Teszt> Kft',
    founded: 2026, era: 1, day: 1, nextDayAt: 1_800_000_000, cashCents: 100000, mrrCents: 1500, rep: 50,
    flow,
    counts: { servers: 1, customers: 3, newCustomers24h: 0, openTickets: 0, upgradesOwned: 0, upgradesTotal: 20 },
    fleet: { capacity: 15, utilPct: 20, lost24h: 0, monthlyListedCents: 0 }, effects: { ...NO_EFFECTS },
    era2: eraProgress({ current_era: 1, mrr_usd_cents: 1500, server_count: 1, days_alive: 0, reputation: 50 }),
    ...over,
  };
}

describe('shared play shell', () => {
  it('escapes the company name and shows it in the footer instead of "promnet"', () => {
    const html = renderSidebar(shell(), 'dashboard');
    expect(html).not.toContain('<Teszt>');
    expect(html).toContain('Csiber &lt;Teszt&gt; Kft');
    expect(html).not.toContain('promnet');
  });
  it('no red "0" tickets badge and no permanent "+N" customers badge', () => {
    const html = renderSidebar(shell(), 'dashboard');
    expect(html).not.toMatch(/class="badge"[^>]*>0</);
    expect(html).not.toContain('badge new');
    const busy = renderSidebar(shell({ counts: { servers: 1, customers: 4, newCustomers24h: 1, openTickets: 2, upgradesOwned: 3, upgradesTotal: 20 } }), 'dashboard');
    expect(busy).toMatch(/class="badge"[^>]*>2</);
    expect(busy).toContain('>+1<');
    expect(busy).toContain('>3/20<');
  });
  it('runway: "not burning" when there is no spend, days otherwise', () => {
    expect(renderSidebar(shell(), 'dashboard')).toContain('nem fogy');
    const burning = shell({ flow: dailyCashFlow({ cash_usd_cents: 100000, mrr_usd_cents: 1500, marketing_ppc_pct: 33 }) });
    expect(renderSidebar(burning, 'dashboard')).toMatch(/\d+ nap/);
  });
  it('low cash: an explained warning instead of a silent drain; capped ads get a short note', () => {
    expect(renderSidebar(shell(), 'dashboard')).not.toContain('cash-warn');
    const low = shell({ cashCents: 4000, flow: dailyCashFlow({ cash_usd_cents: 4000, mrr_usd_cents: 1500, marketing_ppc_pct: 33 }) });
    const html = renderSidebar(low, 'dashboard');
    expect(html).toContain('cash-warn');
    expect(html).toContain('A hirdetés magától leáll');
    const capped = shell({ cashCents: 30000, flow: dailyCashFlow({ cash_usd_cents: 30000, mrr_usd_cents: 0, marketing_ppc_pct: 100 }) });
    expect(renderSidebar(capped, 'dashboard')).toContain('megfizethetőhöz igazodik');
  });
  it('era box shows the real 1/4 and the same requirements', () => {
    const html = renderSidebar(shell(), 'dashboard');
    expect(html).toContain('1/4');
    expect((html.match(/era-req done/g) ?? []).length).toBe(1);
  });
  it('topbar: real day, next-day countdown, no fake clock', () => {
    const html = renderTopbar(shell({ day: 3 }), ['Szerverek']);
    expect(html).toContain('3. nap');
    expect(html).toContain('data-next-day-at="1800000000"');
    expect(html).not.toContain('03:42');
    expect(html).not.toContain('/ 365');
  });
  it('applyShell replaces the template aside and topbar', () => {
    const tpl = '<div class="app"><aside>\n<div>SyncNode</div></aside><main><header class="topbar">Day 12</header><div class="content">x</div></main></div>';
    const out = applyShell(tpl, shell(), 'servers', ['Szerverek']);
    expect(out).not.toContain('SyncNode');
    expect(out).not.toContain('Day 12');
    expect(out).toContain('aria-current="page"');
    expect(out).toContain('<div class="content">x</div>');
  });
});

describe('event feed is translated on render', () => {
  it('ticket_resolved in Hungarian (old English rows too — they are key+params)', () => {
    const l = eventLine('hu', { id: 1, type: 'ticket_resolved', spawned_at: 0, resolved: true, data: { customer_name: 'Casey', satisfaction_delta: 25, refund_cents: 150 } });
    expect(l.text).toContain('Casey ticketje lezárva');
    expect(l.text).toContain('$1.50');
    expect(l.text).not.toMatch(/resolved|Ticket for/);
  });
  it('random events get a localized title, unknown types never leak raw English sentences', () => {
    expect(eventLine('de', { id: 2, type: 'ddos_attempt', spawned_at: 0, resolved: false, data: {} }).text).toContain('DDoS-Angriff');
    expect(eventLine('hu', { id: 3, type: 'weird_thing', spawned_at: 0, resolved: false, data: {} }).text).toBe('Esemény: weird thing');
  });
});

describe('mood ring', () => {
  it('−10 is not green', () => {
    expect(moodColor(-10)).toBe('#f43f5e');
    expect(moodColor(5)).toBe('#f59e0b');
    expect(moodColor(20)).toBe('#34d399');
    expect(netMood([{ satisfaction: 40 }])).toBe(-10);
  });
});
