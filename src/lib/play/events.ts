// src/lib/play/events.ts
// Hyperscales — az eseményfolyam (vezérlő + fejlesztői napló) szövegei a MEGJELENÍTÉSKOR, a néző nyelvén.
//
// Az `events` sorok már kulcs + paraméter formában tárolódnak (event_type + data_json), ezért nem kell
// írás-idejű fordítás, és a régi (angol UI-ban keletkezett) sorok is magyarul/németül jelennek meg.
// Szabad szöveg a data_json-ban (ügyfélnév, ticket-összegzés, reason) nem fordítódik — az az ügyfél
// saját szava. Ismeretlen típus → semleges „Esemény: <típus>" sor, sosem nyers angol mondat.

import type { PlayLocale } from './strings';

export interface FeedEvent {
  id: number;
  type: string;
  spawned_at: number;
  resolved: boolean;
  outcome?: string | null;
  data: Record<string, unknown>;
}

export interface FeedLine {
  text: string;
  /** CSS-osztály a .event-hez: good | warn | alert | info */
  tone: 'good' | 'warn' | 'alert' | 'info';
  ico: string;
  /** Rövid jobb oldali címke (pl. „megoldva"), vagy üres. */
  tag: string;
}

const RANDOM_TITLES: Record<string, Record<PlayLocale, string>> = {
  ddos_attempt: { en: 'DDoS attack', hu: 'DDoS-támadás', de: 'DDoS-Angriff' },
  viral_blog: { en: 'A customer hit the HN front page', hu: 'Egy ügyfél a HN címlapjára került', de: 'Ein Kunde landete auf der HN-Titelseite' },
  electricity_spike: { en: 'Electricity bill spike', hu: 'Megugrott az áramszámla', de: 'Stromrechnung explodiert' },
  recruit_ad: { en: 'Recruitment opportunity', hu: 'Toborzási lehetőség', de: 'Recruiting-Chance' },
  intern_incident: { en: 'Intern incident', hu: 'Gyakornoki baki', de: 'Praktikanten-Vorfall' },
  dmca: { en: 'DMCA takedown notice', hu: 'DMCA-eltávolítási felszólítás', de: 'DMCA-Löschaufforderung' },
  cooling_failure: { en: 'Datacenter cooling failure', hu: 'Leállt a hűtés', de: 'Kühlung ausgefallen' },
  security_breach: { en: 'Suspected security breach', hu: 'Gyanús betörés', de: 'Verdacht auf Sicherheitslücke' },
  compliance_audit: { en: 'SOC 2 audit request', hu: 'SOC 2 audit-kérés', de: 'SOC-2-Audit-Anfrage' },
  competitor_buyout: { en: 'Acquisition offer', hu: 'Felvásárlási ajánlat', de: 'Übernahmeangebot' },
  staff_drama: { en: 'Staff drama', hu: 'Csapatdráma', de: 'Team-Drama' },
};

// A gépnevek itt rövid formában (a catalog.ts-t nem húzzuk be: az a teljes katalógust hozná a kliens-kötegbe).
const SERVER_NAMES: Record<string, Record<PlayLocale, string>> = {
  lamp_box: { en: 'Beige Tower (LAMP)', hu: 'Bézs torony (LAMP)', de: 'Beiger Tower (LAMP)' },
  rack_unit: { en: '1U Rack Server', hu: '1U rack-szerver', de: '1U-Rackserver' },
  vps_node: { en: 'VPS Node', hu: 'VPS-csomópont', de: 'VPS-Knoten' },
  dedicated_box: { en: 'Dedicated Box', hu: 'Dedikált gép', de: 'Dedizierter Server' },
};

const L = {
  en: {
    someone: 'a customer',
    sat: '{d} satisfaction',
    refunded: '{v} refunded',
    ticket_resolved: 'Ticket for {who} closed ({sat}).',
    ticket_resolved_refund: 'Ticket for {who} closed ({sat}) · {refund}.',
    ticket_spawned: 'New ticket from {who}.',
    ticket_spawned_sum: 'New ticket from {who}: “{sum}”',
    customer_acquired: 'New customer: {who} ({plan} plan).',
    customer_churned: '{who} left.',
    era_unlock: '🎉 Era {n} unlocked{name}.',
    dedicated_signed: '🏢 A big client signed for your dedicated box: {who}, {v}/mo. They expect fast, real answers.',
    dedicated_lost: '🏢 {who} cancelled the dedicated contract ({why}). Reputation −{rep}; no new big client for {days} days.',
    ded_why_unhappy: 'unhappy with the support',
    ded_why_sla: 'unanswered tickets',
    ded_why_sold: 'the box was sold',
    server_auto_sold: 'Debt limit reached: your {name} was sold for {v} to cover the server fees.',
    staff_hired: '👤 {name} joined as {role} (hiring fee {v}).',
    staff_fired: '{name} ({role}) was let go.',
    staff_quit: '{name} ({role}) quit: {why}.',
    staff_why_money: 'the company could not pay reliably',
    staff_why_overwork: 'too much work for too long',
    staff_why_mood: 'their mood hit rock bottom',
    staff_cut_debt: 'Debt limit reached: {name} ({role}) had to go — the least useful person right now. Servers are only sold after that.',
    staff_work: 'Support answered {n} ticket(s) today.',
    network_changed: 'Network updated.',
    network_ddos_cancelled: 'Debt limit reached: DDoS protection was cancelled to save money.',
    role_support: 'support agent',
    role_sre: 'SRE',
    role_sales: 'salesperson',
    capacity_lost: '{n} new customer(s) went elsewhere today: no free slot on your servers.',
    event_avoided: '🛡 Your upgrades prevented it: {title}.',
    bridge_investor: 'A bridge investor believed in you: {v} to get back on your feet (once per company).',
    shift_end: 'Shift ended: {r} of {t} tickets handled.',
    cash_change: 'Cash {v}.',
    incident: 'Incident: {title}',
    random_open: '{title} — waiting for your decision.',
    random_done: '{title} — handled.',
    unknown: 'Event: {type}',
    tag_resolved: 'done',
    tag_open: 'open',
  },
  hu: {
    someone: 'egy ügyfél',
    sat: 'elégedettség {d}',
    refunded: '{v} visszatérítve',
    ticket_resolved: '{who} ticketje lezárva ({sat}).',
    ticket_resolved_refund: '{who} ticketje lezárva ({sat}) · {refund}.',
    ticket_spawned: 'Új ticket tőle: {who}.',
    ticket_spawned_sum: 'Új ticket tőle: {who}: „{sum}”',
    customer_acquired: 'Új ügyfél: {who} ({plan} csomag).',
    customer_churned: '{who} elpártolt.',
    era_unlock: '🎉 Megnyílt a(z) {n}. korszak{name}.',
    dedicated_signed: '🏢 Nagy ügyfél bérli a dedikált gépedet: {who}, {v}/hó. Gyors, érdemi választ vár.',
    dedicated_lost: '🏢 {who} felmondta a dedikált szerződést ({why}). Hírnév −{rep}; {days} napig nem jön új nagy ügyfél.',
    ded_why_unhappy: 'elégedetlen a támogatással',
    ded_why_sla: 'megválaszolatlan ticketek',
    ded_why_sold: 'eladtuk a gépét',
    server_auto_sold: 'Elérted a tartozás-határt: a(z) {name} gépedet eladtuk {v}-ért, hogy kifizesse a havidíjakat.',
    staff_hired: '👤 {name} csatlakozott: {role} (felvételi díj {v}).',
    staff_fired: '{name} ({role}) elbocsátva.',
    staff_quit: '{name} ({role}) felmondott: {why}.',
    staff_why_money: 'a cég nem tudott biztosan fizetni',
    staff_why_overwork: 'túl sok munka, túl sokáig',
    staff_why_mood: 'a hangulata a mélypontra ért',
    staff_cut_debt: 'Elérted a tartozás-határt: {name} ({role}) mennie kellett — most őt nélkülözöd a legkönnyebben. Gépet csak utána adunk el.',
    staff_work: 'Az ügyfélszolgálat ma {n} ticketet válaszolt meg.',
    network_changed: 'A hálózat frissült.',
    network_ddos_cancelled: 'Elérted a tartozás-határt: a DDoS-védelmet lemondtuk, hogy spóroljunk.',
    role_support: 'ügyfélszolgálatos',
    role_sre: 'SRE',
    role_sales: 'értékesítő',
    capacity_lost: 'Ma {n} új ügyfél ment el máshoz: nem volt szabad hely a szervereiden.',
    event_avoided: '🛡 A fejlesztéseid kivédték: {title}.',
    bridge_investor: 'Egy áthidaló befektető hitt benned: {v} a talpra álláshoz (cégenként egyszer).',
    shift_end: 'Műszak vége: {t} ticketből {r} elintézve.',
    cash_change: 'Pénz {v}.',
    incident: 'Incidens: {title}',
    random_open: '{title} — a döntésedre vár.',
    random_done: '{title} — elintézve.',
    unknown: 'Esemény: {type}',
    tag_resolved: 'kész',
    tag_open: 'nyitott',
  },
  de: {
    someone: 'ein Kunde',
    sat: 'Zufriedenheit {d}',
    refunded: '{v} erstattet',
    ticket_resolved: 'Ticket von {who} geschlossen ({sat}).',
    ticket_resolved_refund: 'Ticket von {who} geschlossen ({sat}) · {refund}.',
    ticket_spawned: 'Neues Ticket von {who}.',
    ticket_spawned_sum: 'Neues Ticket von {who}: „{sum}“',
    customer_acquired: 'Neuer Kunde: {who} (Tarif {plan}).',
    customer_churned: '{who} hat gekündigt.',
    era_unlock: '🎉 Ära {n} freigeschaltet{name}.',
    dedicated_signed: '🏢 Ein Großkunde mietet deinen dedizierten Server: {who}, {v}/Monat. Er erwartet schnelle, echte Antworten.',
    dedicated_lost: '🏢 {who} hat den dedizierten Vertrag gekündigt ({why}). Ruf −{rep}; {days} Tage lang kein neuer Großkunde.',
    ded_why_unhappy: 'unzufrieden mit dem Support',
    ded_why_sla: 'unbeantwortete Tickets',
    ded_why_sold: 'der Server wurde verkauft',
    server_auto_sold: 'Schuldengrenze erreicht: dein {name} wurde für {v} verkauft, um die Servergebühren zu decken.',
    staff_hired: '👤 {name} ist dabei: {role} (Einstellungsgebühr {v}).',
    staff_fired: '{name} ({role}) wurde entlassen.',
    staff_quit: '{name} ({role}) hat gekündigt: {why}.',
    staff_why_money: 'die Firma konnte nicht zuverlässig zahlen',
    staff_why_overwork: 'zu viel Arbeit, zu lange',
    staff_why_mood: 'die Stimmung war am Tiefpunkt',
    staff_cut_debt: 'Schuldengrenze erreicht: {name} ({role}) musste gehen — gerade am ehesten verzichtbar. Server werden erst danach verkauft.',
    staff_work: 'Der Support hat heute {n} Ticket(s) beantwortet.',
    network_changed: 'Netzwerk aktualisiert.',
    network_ddos_cancelled: 'Schuldengrenze erreicht: Der DDoS-Schutz wurde gekündigt, um Geld zu sparen.',
    role_support: 'Support-Mitarbeiter',
    role_sre: 'SRE',
    role_sales: 'Vertrieb',
    capacity_lost: 'Heute sind {n} neue Kunden woanders hingegangen: kein freier Platz auf deinen Servern.',
    event_avoided: '🛡 Deine Upgrades haben es verhindert: {title}.',
    bridge_investor: 'Ein Überbrückungsinvestor glaubt an dich: {v}, um wieder auf die Beine zu kommen (einmal pro Firma).',
    shift_end: 'Schicht beendet: {r} von {t} Tickets erledigt.',
    cash_change: 'Kasse {v}.',
    incident: 'Vorfall: {title}',
    random_open: '{title} — wartet auf deine Entscheidung.',
    random_done: '{title} — erledigt.',
    unknown: 'Ereignis: {type}',
    tag_resolved: 'erledigt',
    tag_open: 'offen',
  },
} satisfies Record<PlayLocale, Record<string, string>>;

export const EVENT_STRINGS = L;

function fill(tpl: string, p: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m));
}

function money(cents: number): string {
  const v = Math.abs(cents) / 100;
  return (cents < 0 ? '−' : '+') + '$' + (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(2));
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function eventLine(locale: PlayLocale, ev: FeedEvent): FeedLine {
  const t = L[locale] ?? L.en;
  const d = ev.data ?? {};
  const who = str(d.customer_name).trim() || t.someone;
  switch (ev.type) {
    case 'ticket_resolved': {
      const delta = typeof d.satisfaction_delta === 'number' ? d.satisfaction_delta : 0;
      const sat = fill(t.sat, { d: (delta >= 0 ? '+' : '') + delta });
      const refundCents = typeof d.refund_cents === 'number' ? d.refund_cents : 0;
      const text = refundCents > 0
        ? fill(t.ticket_resolved_refund, { who, sat, refund: fill(t.refunded, { v: '$' + (refundCents / 100).toFixed(2) }) })
        : fill(t.ticket_resolved, { who, sat });
      return { text, tone: delta >= 0 ? 'good' : 'warn', ico: '✓', tag: t.tag_resolved };
    }
    case 'ticket_spawned': {
      const sum = str(d.summary).slice(0, 90);
      return { text: sum ? fill(t.ticket_spawned_sum, { who, sum }) : fill(t.ticket_spawned, { who }), tone: 'warn', ico: '✉', tag: '' };
    }
    case 'customer_acquired':
      return { text: fill(t.customer_acquired, { who, plan: str(d.plan_tier) || 'hobby' }), tone: 'good', ico: '◉', tag: '' };
    case 'customer_churned':
      return { text: fill(t.customer_churned, { who: str(d.customer_name).trim() || t.someone }), tone: 'alert', ico: '!', tag: '' };
    case 'era_unlock': {
      const n = typeof d.to_era === 'number' ? d.to_era : '?';
      const name = str(d.to_era_display) || str(d.display);
      return { text: fill(t.era_unlock, { n, name: name ? ` (${name})` : '' }), tone: 'good', ico: '⌖', tag: '' };
    }
    case 'bridge_investor': {
      const c = typeof d.cash_delta_cents === 'number' ? d.cash_delta_cents : 0;
      return { text: fill(t.bridge_investor, { v: money(c) }), tone: 'good', ico: '$', tag: '' };
    }
    case 'server_auto_sold': {
      const c = typeof d.cash_delta_cents === 'number' ? d.cash_delta_cents : 0;
      const name = (SERVER_NAMES[str(d.server_type)]?.[locale]) ?? str(d.server_type) ?? '—';
      return { text: fill(t.server_auto_sold, { name, v: money(c).replace('+', '') }), tone: 'alert', ico: '!', tag: '' };
    }
    case 'dedicated_signed': {
      const c = typeof d.fee_cents === 'number' ? d.fee_cents : 0;
      return { text: fill(t.dedicated_signed, { who, v: '$' + Math.round(c / 100) }), tone: 'good', ico: '🏢', tag: '' };
    }
    case 'dedicated_lost': {
      const why = d.reason === 'sla' ? t.ded_why_sla : d.reason === 'sold' ? t.ded_why_sold : t.ded_why_unhappy;
      return {
        text: fill(t.dedicated_lost, { who, why, rep: Number(d.rep_delta) || 0, days: Number(d.cooldown_days) || 0 }),
        tone: 'alert', ico: '!', tag: '',
      };
    }
    case 'staff_hired':
    case 'staff_fired':
    case 'staff_quit':
    case 'staff_cut_debt': {
      const r = str(d.role);
      const role = r === 'sre' ? t.role_sre : r === 'sales' ? t.role_sales : t.role_support;
      const name = str(d.name) || '—';
      if (ev.type === 'staff_hired') {
        const c = typeof d.cash_delta_cents === 'number' ? d.cash_delta_cents : 0;
        return { text: fill(t.staff_hired, { name, role, v: money(c).replace(/^[+−]/, '') }), tone: 'good', ico: '👤', tag: '' };
      }
      if (ev.type === 'staff_fired') return { text: fill(t.staff_fired, { name, role }), tone: 'info', ico: '👤', tag: '' };
      if (ev.type === 'staff_quit') {
        const why = d.why === 'money' ? t.staff_why_money : d.why === 'overwork' ? t.staff_why_overwork : t.staff_why_mood;
        return { text: fill(t.staff_quit, { name, role, why }), tone: 'alert', ico: '!', tag: '' };
      }
      return { text: fill(t.staff_cut_debt, { name, role }), tone: 'alert', ico: '!', tag: '' };
    }
    case 'staff_work':
      return { text: fill(t.staff_work, { n: Number(d.count) || 0 }), tone: 'good', ico: '✓', tag: '' };
    case 'network_changed':
      return { text: t.network_changed, tone: 'info', ico: '◴', tag: '' };
    case 'network_ddos_cancelled':
      return { text: t.network_ddos_cancelled, tone: 'alert', ico: '!', tag: '' };
    case 'capacity_lost':
      return { text: fill(t.capacity_lost, { n: Number(d.count) || 1 }), tone: 'warn', ico: '▤', tag: '' };
    case 'event_avoided': {
      const at = str(d.avoided_type);
      const title = RANDOM_TITLES[at]?.[locale] ?? RANDOM_TITLES[at]?.en ?? at.replace(/_/g, ' ');
      return { text: fill(t.event_avoided, { title }), tone: 'good', ico: '◈', tag: '' };
    }
    case 'shift_end':
      return {
        text: fill(t.shift_end, { r: Number(d.resolved) || 0, t: Number(d.total) || 0 }),
        tone: 'info', ico: '⏱', tag: '',
      };
    case 'cash_change': {
      const c = typeof d.delta_cents === 'number' ? d.delta_cents : 0;
      return { text: fill(t.cash_change, { v: money(c) }), tone: c >= 0 ? 'good' : 'warn', ico: '$', tag: '' };
    }
    case 'incident':
      return { text: fill(t.incident, { title: str(d.title) || '—' }), tone: 'alert', ico: '!', tag: '' };
    default: {
      const title = RANDOM_TITLES[ev.type]?.[locale] ?? RANDOM_TITLES[ev.type]?.en;
      if (title) {
        const neg = ev.outcome === 'negative';
        return {
          text: fill(ev.resolved ? t.random_done : t.random_open, { title }),
          tone: ev.resolved ? (neg ? 'warn' : 'info') : 'alert',
          ico: ev.resolved ? '◉' : '!',
          tag: ev.resolved ? t.tag_resolved : t.tag_open,
        };
      }
      return { text: fill(t.unknown, { type: ev.type.replace(/_/g, ' ') }), tone: 'info', ico: '◉', tag: '' };
    }
  }
}

/** „5 perce" / „3 órája" / „2 napja" — rövid relatív idő. */
export function ago(locale: PlayLocale, sec: number): string {
  const m = Math.max(0, Math.floor(sec / 60));
  if (locale === 'hu') {
    if (m < 1) return 'most';
    if (m < 60) return `${m} perce`;
    if (m < 1440) return `${Math.floor(m / 60)} órája`;
    return `${Math.floor(m / 1440)} napja`;
  }
  if (locale === 'de') {
    if (m < 1) return 'jetzt';
    if (m < 60) return `vor ${m} Min.`;
    if (m < 1440) return `vor ${Math.floor(m / 60)} Std.`;
    return `vor ${Math.floor(m / 1440)} T.`;
  }
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}
