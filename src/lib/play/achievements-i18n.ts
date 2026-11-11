// src/lib/play/achievements-i18n.ts
// Hyperscales — a jelvények (achievements) olvasható neve és leírása HU/DE nyelven. Az EN forrás és a
// feltételek a src/lib/game/achievements.ts-ben élnek; ismeretlen id → EN cím, végső esetben az id
// „szépítve" (soha nem nyers „first_shift").

import type { PlayLocale } from './strings';
import { ACHIEVEMENTS } from '../game/achievements';

const TR: Record<'hu' | 'de', Record<string, [string, string]>> = {
  hu: {
    first_blood: ['Az első ügyfél', 'Megszerezted az első ügyfeledet.'],
    ten_customers: ['Hosszú farok', '10 aktív ügyfél.'],
    hundred_customers: ['Százados', '100 aktív ügyfél.'],
    first_k_mrr: ['Az első ezres', 'Elérted az 1 000 $ MRR-t.'],
    first_10k_mrr: ['Az első tízezres', 'Elérted a 10 000 $ MRR-t.'],
    one_million_lifetime: ['Polyák-díj', 'Évesítve 1 millió $ bevétel.'],
    ticket_whisperer: ['Ticketsuttogó', '50 megoldott ticket.'],
    refund_king: ['Visszatérítés-király', '1 000 $ visszatérítés összesen. (Tiszteletbeli gonosz.)'],
    first_shift: ['Az első műszak', 'Végigvittél egy ügyfélszolgálati műszakot.'],
    shift_marathon: ['Műszakmaraton', '10 lezárt műszak.'],
    survived_first_ddos: ['Túlélted az első DDoS-t', 'Kezelted az első DDoS-támadást.'],
    high_rep: ['Megbízható üzemeltető', 'A hírneved elérte a 90-et.'],
  },
  de: {
    first_blood: ['Der erste Kunde', 'Deinen ersten Kunden gewonnen.'],
    ten_customers: ['Der lange Schwanz', '10 aktive Kunden.'],
    hundred_customers: ['Zenturio', '100 aktive Kunden.'],
    first_k_mrr: ['Die ersten 1.000 $', '1.000 $ MRR erreicht.'],
    first_10k_mrr: ['Die ersten 10.000 $', '10.000 $ MRR erreicht.'],
    one_million_lifetime: ['Polyák-Preis', '1 Mio. $ Umsatz aufs Jahr gerechnet.'],
    ticket_whisperer: ['Ticket-Flüsterer', '50 Tickets gelöst.'],
    refund_king: ['Erstattungskönig', '1.000 $ an Erstattungen. (Ehrenschurke.)'],
    first_shift: ['Die erste Schicht', 'Deine erste Support-Schicht abgeschlossen.'],
    shift_marathon: ['Schicht-Marathon', '10 Schichten abgeschlossen.'],
    survived_first_ddos: ['Den ersten DDoS überlebt', 'Deinen ersten DDoS-Angriff gemeistert.'],
    high_rep: ['Vertrauenswürdiger Betreiber', 'Dein Ruf hat 90 erreicht.'],
  },
};

function pretty(id: string): string {
  const s = id.replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function achievementTitle(locale: PlayLocale, id: string): string {
  if (locale !== 'en' && TR[locale]?.[id]) return TR[locale][id][0];
  return ACHIEVEMENTS.find((a) => a.id === id)?.title ?? pretty(id);
}
export function achievementDesc(locale: PlayLocale, id: string): string {
  if (locale !== 'en' && TR[locale]?.[id]) return TR[locale][id][1];
  return ACHIEVEMENTS.find((a) => a.id === id)?.description ?? '';
}
export function achievementEmoji(id: string): string {
  return ACHIEVEMENTS.find((a) => a.id === id)?.emoji ?? '★';
}
/** id → {title, desc, emoji} a kliensnek (műszak-lap, toastok). */
export function achievementMap(locale: PlayLocale): Record<string, { title: string; desc: string; emoji: string }> {
  const out: Record<string, { title: string; desc: string; emoji: string }> = {};
  for (const a of ACHIEVEMENTS) out[a.id] = { title: achievementTitle(locale, a.id), desc: achievementDesc(locale, a.id), emoji: a.emoji };
  return out;
}
export const ACHIEVEMENT_TRANSLATIONS = TR;
