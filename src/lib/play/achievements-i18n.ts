// src/lib/play/achievements-i18n.ts
// Hyperscales — a jelvények (achievements) olvasható neve és leírása HU/DE nyelven. Az EN forrás és a
// feltételek a src/lib/game/achievements.ts-ben élnek; ismeretlen id → EN cím, végső esetben az id
// „szépítve" (soha nem nyers „first_shift").

import { pt, type PlayLocale } from './strings';
import { ACHIEVEMENTS } from '../game/achievements';

const TR: Record<'hu' | 'de', Record<string, [string, string]>> = {
  hu: {
    first_shift: ['Az első műszak', 'Lezártad az első ügyfélszolgálati műszakodat.'],
    first_blood: ['Az első ügyfél', 'Megérkezett az első fizető ügyfeled.'],
    three_star_shift: ['Háromcsillagos', 'Egy műszakot három csillaggal zártál.'],
    ten_customers: ['A hosszú farok', '10 aktív ügyfél.'],
    shift_marathon: ['Műszakmaraton', '10 lezárt műszak.'],
    ticket_whisperer: ['Ticketsuttogó', '50 megoldott ticket.'],
    era_colo: ['Saját ketrec', 'Beléptél a Colo-korszakba.'],
    first_k_mrr: ['Az első ezres', 'Havi 1 000 $ ismétlődő bevétel.'],
    perfect_week: ['Tökéletes hét', 'Hét egymást követő napon dolgoztál műszakban.'],
    high_rep: ['Megbízható üzemeltető', 'A hírneved elérte a 90-et.'],
    era_vps: ['Felhőbe ment', 'Beléptél a VPS-korszakba.'],
    hundred_customers: ['Százados', '100 aktív ügyfél.'],
    survived_first_ddos: ['Túlélted', 'Az első DDoS-támadás után is állsz.'],
    first_10k_mrr: ['Tízezres klub', 'Havi 10 000 $ ismétlődő bevétel.'],
    era_dedicated: ['Saját vas', 'Beléptél a Dedikált-korszakba.'],
    one_million_lifetime: ['Polyák-díj', 'Évesítve 1 millió $ bevétel.'],
    first_cloud_region: ['Több zónában', 'Megnyitottad az első felhőrégiódat.'],
    first_edge_pop: ['Közelebb a peremhez', 'Bekapcsoltad az első edge POP-odat.'],
    enterprise_contract: ['Nagyvállalati szint', 'Aláírtad az első nagyvállalati szerződést.'],
    hyperscaled: ['Hiperskálázva', 'Elérted a végcélt: hyperscaler lettél.'],
    speedrun_hyperscaler: ['Villámskálázás', 'A végcélt 140 napon belül érted el.'],
    refund_king: ['Visszatérítés királya', '1 000 $-t adtál vissza. Tiszteletbeli gonosz.'],
    comeback_kid: ['Feltámadás', 'A csőd széléről duplázni tudtál.'],
  },
  de: {
    first_shift: ['Erste Schicht', 'Deine erste Support-Schicht abgeschlossen.'],
    first_blood: ['Erster Kunde', 'Dein erster zahlender Kunde ist da.'],
    three_star_shift: ['Drei Sterne', 'Eine Schicht mit drei Sternen beendet.'],
    ten_customers: ['Der lange Schwanz', '10 aktive Kunden.'],
    shift_marathon: ['Schichtmarathon', '10 Schichten abgeschlossen.'],
    ticket_whisperer: ['Ticketflüsterer', '50 Tickets gelöst.'],
    era_colo: ['Eigener Käfig', 'Die Colo-Ära erreicht.'],
    first_k_mrr: ['Die ersten 1.000 $', '1.000 $ MRR erreicht.'],
    perfect_week: ['Perfekte Woche', 'Sieben Tage in Folge eine Schicht gearbeitet.'],
    high_rep: ['Vertrauenswürdiger Betreiber', 'Ruf von 90+ erreicht.'],
    era_vps: ['Ab in die Wolke', 'Die VPS-Ära erreicht.'],
    hundred_customers: ['Zenturio', '100 aktive Kunden.'],
    survived_first_ddos: ['Überlebt', 'Den ersten DDoS-Angriff überstanden.'],
    first_10k_mrr: ['10.000-$-Club', '10.000 $ MRR erreicht.'],
    era_dedicated: ['Eigenes Eisen', 'Die Dedicated-Ära erreicht.'],
    one_million_lifetime: ['Polyák-Preis', '1 Mio. $ Umsatz aufs Jahr gerechnet.'],
    first_cloud_region: ['Multi-AZ', 'Deine erste Cloud-Region eröffnet.'],
    first_edge_pop: ['Näher am Rand', 'Deinen ersten Edge-POP eingeschaltet.'],
    enterprise_contract: ['Konzernreif', 'Deinen ersten Konzernvertrag unterschrieben.'],
    hyperscaled: ['Hyperskaliert', 'Das Endziel erreicht: Du bist ein Hyperscaler.'],
    speedrun_hyperscaler: ['Blitzscaling', 'Das Endziel innerhalb von 140 Tagen erreicht.'],
    refund_king: ['Erstattungskönig', '1.000 $ erstattet. Ehrenschurke.'],
    comeback_kid: ['Comeback', 'Vom Abgrund zur doppelten Einnahme.'],
  },
};

/** A rejtett, még meg nem szerzett achievement helyén ez látszik (nyelvfüggetlen). */
export const HIDDEN_TITLE = '???';
export const HIDDEN_EMOJI = '❔';

export function isHiddenAchievement(id: string): boolean {
  return !!ACHIEVEMENTS.find((a) => a.id === id)?.hidden;
}

/** Listához: a rejtett és még meg nem szerzett achievement neve „???”, leírása a „rejtett” felirat, ikonja ❔. */
export function achievementCell(locale: PlayLocale, id: string, unlocked: boolean): { title: string; desc: string; emoji: string } {
  if (!unlocked && isHiddenAchievement(id)) {
    return { title: HIDDEN_TITLE, desc: pt(locale, 'ach.hidden'), emoji: HIDDEN_EMOJI };
  }
  return { title: achievementTitle(locale, id), desc: achievementDesc(locale, id), emoji: achievementEmoji(id) };
}

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
