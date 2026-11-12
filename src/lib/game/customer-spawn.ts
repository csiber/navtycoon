// src/lib/game/customer-spawn.ts
// Plan 1 placeholder: spawn customers with simple seeded ticket-text.
// Plan 2 replaces this with Workers AI prompt-driven generation.
import type { PlanTier, PersonaArchetype } from './types';
import { pickPersona, generateCustomerName, PERSONAS } from './persona-pool';

const PLACEHOLDER_TICKETS: Record<PersonaArchetype, string[]> = {
  newbie: [
    'Where is the FTP? I need it for my homepage thing.',
    'My WordPress is showing PHP errors. Is that bad?',
    'I cannot find the login button.',
  ],
  pro: [
    '504 timeout under load. fastcgi_buffer_size at 16k, expected.',
    'Slow query log shows 2.3s on a JOIN. I need a covering index.',
    'TLS handshake failing on Android 11 — old cipher suites?',
  ],
  cheapskate: [
    'The site was down for 4 minutes yesterday. I want a refund.',
    'My neighbor pays half what I pay. Match the price?',
    'Disk usage is 51%. You said unlimited.',
  ],
  karen: [
    'THIS IS UNACCEPTABLE. My customers cannot reach the site.',
    'I have been ON HOLD for 8 minutes. WHO IS YOUR MANAGER.',
    'You will hear from my lawyer if this is not fixed in 1 hour.',
  ],
  loyalist: [
    'Hi! Just letting you know the new dashboard is great. ❤️',
    'Renewed for 2 years today. Keep up the good work.',
    'Quick question: can you recommend a good backup strategy?',
  ],
  ghost: [
    'Hi.',
    'still there?',
    '...',
  ],
  drama: [
    'I just posted on Twitter about your service. Reply count is climbing.',
    'My therapist says I need to switch hosts. This is taking years off me.',
    'A blog post is being drafted. You have one chance.',
  ],
  crypto: [
    'gm. Need 10x the bandwidth, big drop coming. WAGMI.',
    'Server keeps getting flagged. It is just a hashing experiment ser.',
    'Would you accept payment in $TYCOON? I can get you a discount.',
  ],
};


// 2026-11-11: a kezdő/tartalék ticketek a játékos nyelvén íródnak (HU/DE fordítás ugyanabban a sorrendben).
// A már angolul eltárolt sablon-ticketeket a megjelenítéskor a localizePlaceholderTicket() fordítja.
export type TicketLang = 'en' | 'hu' | 'de';

const PLACEHOLDER_TICKETS_I18N: Record<'hu' | 'de', Record<PersonaArchetype, string[]>> = {
  hu: {
    newbie: [
      'Hol van az FTP? Kell a honlapos izémhez.',
      'A WordPressem PHP-hibákat ír ki. Ez rossz?',
      'Nem találom a belépés gombot.',
    ],
    pro: [
      '504-es időtúllépés terhelés alatt. fastcgi_buffer_size 16k, ahogy vártam.',
      'A slow query log 2,3 mp-et mutat egy JOIN-on. Lefedő index kell.',
      'Elhasal a TLS-kézfogás Android 11-en — régi titkosítócsomagok?',
    ],
    cheapskate: [
      'Tegnap 4 percig nem ment az oldal. Kérem vissza a pénzem.',
      'A szomszédom feleannyit fizet. Lejjebb mennek az árral?',
      'A tárhely 51%-on áll. Azt mondták, korlátlan.',
    ],
    karen: [
      'EZ ELFOGADHATATLAN. Az ügyfeleim nem érik el az oldalt.',
      '8 PERCE várakozom. KI A FELETTESE?',
      'Az ügyvédem keresni fogja, ha ez 1 órán belül nincs megjavítva.',
    ],
    loyalist: [
      'Szia! Csak szólok, hogy az új vezérlőpult szuper. ❤️',
      'Ma két évre meghosszabbítottam. Csak így tovább!',
      'Gyors kérdés: tudtok ajánlani jó mentési stratégiát?',
    ],
    ghost: [
      'Szia.',
      'ott vagy még?',
      '...',
    ],
    drama: [
      'Most írtam a szolgáltatásotokról Twitteren. Gyűlnek a válaszok.',
      'A terapeutám szerint szolgáltatót kell váltanom. Éveket vesz el az életemből.',
      'Készül egy blogposzt. Egy esélyetek van.',
    ],
    crypto: [
      'gm. 10× sávszél kell, nagy drop jön. WAGMI.',
      'A szervert folyton megjelölik. Csak egy hash-kísérlet, főnök.',
      'Elfogadtok $TYCOON-ban fizetést? Kaptok kedvezményt.',
    ],
  },
  de: {
    newbie: [
      'Wo ist das FTP? Ich brauche es für mein Homepage-Ding.',
      'Mein WordPress zeigt PHP-Fehler. Ist das schlimm?',
      'Ich finde den Login-Button nicht.',
    ],
    pro: [
      '504-Timeout unter Last. fastcgi_buffer_size bei 16k, wie erwartet.',
      'Das Slow-Query-Log zeigt 2,3 s bei einem JOIN. Ich brauche einen Covering-Index.',
      'TLS-Handshake scheitert auf Android 11 — alte Cipher-Suites?',
    ],
    cheapskate: [
      'Die Seite war gestern 4 Minuten down. Ich will mein Geld zurück.',
      'Mein Nachbar zahlt die Hälfte. Gehen Sie mit dem Preis runter?',
      'Der Speicher ist bei 51 %. Sie sagten unbegrenzt.',
    ],
    karen: [
      'DAS IST INAKZEPTABEL. Meine Kunden erreichen die Seite nicht.',
      'Ich hänge seit 8 Minuten in der WARTESCHLEIFE. WER IST IHR VORGESETZTER.',
      'Mein Anwalt meldet sich, wenn das nicht in 1 Stunde behoben ist.',
    ],
    loyalist: [
      'Hi! Wollte nur sagen: das neue Dashboard ist super. ❤️',
      'Heute für 2 Jahre verlängert. Weiter so!',
      'Kurze Frage: Könnt ihr eine gute Backup-Strategie empfehlen?',
    ],
    ghost: [
      'Hi.',
      'noch da?',
      '...',
    ],
    drama: [
      'Ich habe gerade auf Twitter über euren Service gepostet. Die Antworten häufen sich.',
      'Meine Therapeutin sagt, ich soll den Hoster wechseln. Das kostet mich Jahre.',
      'Ein Blogpost ist in Arbeit. Ihr habt eine Chance.',
    ],
    crypto: [
      'gm. Brauche 10x Bandbreite, großer Drop kommt. WAGMI.',
      'Der Server wird ständig geflaggt. Ist nur ein Hashing-Experiment, Chef.',
      'Nehmt ihr Zahlung in $TYCOON? Ich kann euch Rabatt geben.',
    ],
  },
};

// 2026-11-12 (dedikált-kör): a dedikált (nagyvállalati) ügyfél ticketjei — nehezebbek, SLA-ra hivatkoznak.
const ENTERPRISE_TICKETS: Record<TicketLang, string[]> = {
  en: [
    'Our checkout API p99 latency doubled since 09:00. We have a 99.9% SLA with you. Root cause and ETA, please.',
    'Auditors need the access logs of the last 90 days and proof of encrypted backups by Friday.',
    'We are launching a campaign tomorrow at 08:00, expecting 5x traffic. What is your capacity plan?',
    'Nightly replication to the DR site failed twice this week. This is a board-level risk for us.',
    'Our security team found TLS 1.0 still enabled on the box. Please disable it today and confirm in writing.',
  ],
  hu: [
    'A pénztár-API p99 késleltetése 9 óra óta a duplája. 99,9%-os SLA-nk van veletek. Kérem a kiváltó okot és a határidőt.',
    'Az auditoroknak péntekig kell az utolsó 90 nap hozzáférési naplója és a titkosított mentések igazolása.',
    'Holnap 8-kor indul a kampányunk, ötszörös forgalmat várunk. Mi a kapacitástervetek?',
    'A katasztrófa-telephelyre menő éjszakai replikáció a héten kétszer elhasalt. Ez nálunk igazgatósági szintű kockázat.',
    'A biztonsági csapatunk szerint a gépen még be van kapcsolva a TLS 1.0. Kérjük, ma kapcsoljátok ki, és írásban erősítsétek meg.',
  ],
  de: [
    'Die p99-Latenz unserer Checkout-API hat sich seit 09:00 verdoppelt. Wir haben ein SLA von 99,9 %. Ursache und ETA bitte.',
    'Die Prüfer brauchen bis Freitag die Zugriffslogs der letzten 90 Tage und einen Nachweis verschlüsselter Backups.',
    'Morgen um 08:00 startet unsere Kampagne, wir erwarten 5x Traffic. Wie sieht euer Kapazitätsplan aus?',
    'Die nächtliche Replikation zum DR-Standort ist diese Woche zweimal fehlgeschlagen. Für uns ein Risiko auf Vorstandsebene.',
    'Unser Security-Team hat festgestellt, dass auf dem Server noch TLS 1.0 aktiv ist. Bitte heute abschalten und schriftlich bestätigen.',
  ],
};

/** Sablon-ticket a dedikált (nagyvállalati) ügyfélnek, a játékos nyelvén. */
export function getEnterpriseTicket(lang: TicketLang = 'en', r: () => number = Math.random): string {
  const list = ENTERPRISE_TICKETS[lang] ?? ENTERPRISE_TICKETS.en;
  return list[Math.floor(r() * list.length)];
}

function ticketsFor(archetype: PersonaArchetype, lang: TicketLang = 'en'): string[] {
  if (lang === 'hu' || lang === 'de') return PLACEHOLDER_TICKETS_I18N[lang][archetype];
  return PLACEHOLDER_TICKETS[archetype];
}

/** Egy már eltárolt ANGOL sablon-ticket szövegét a néző nyelvére fordítja; minden más szöveg változatlan. */
export function localizePlaceholderTicket(text: string, lang: TicketLang): string {
  if (lang === 'en' || !text) return text;
  const ent = ENTERPRISE_TICKETS.en;
  for (let i = 0; i < ent.length; i++) {
    if (ent[i] === text) return ENTERPRISE_TICKETS[lang][i];
    if (ent[i].slice(0, 80) === text) return ENTERPRISE_TICKETS[lang][i].slice(0, 80);
  }
  for (const arch of Object.keys(PLACEHOLDER_TICKETS) as PersonaArchetype[]) {
    const en = PLACEHOLDER_TICKETS[arch];
    for (let i = 0; i < en.length; i++) {
      if (en[i] === text || en[i].slice(0, 80) === text) {
        const t = PLACEHOLDER_TICKETS_I18N[lang][arch][i];
        return en[i] === text ? t : t.slice(0, 80);
      }
    }
  }
  return text;
}

/** Tesztekhez. */
export const PLACEHOLDER_TICKET_TABLES = { en: PLACEHOLDER_TICKETS, ...PLACEHOLDER_TICKETS_I18N };
export const ENTERPRISE_TICKET_TABLES = ENTERPRISE_TICKETS;

export interface SpawnedCustomer {
  name: string;
  persona_archetype: PersonaArchetype;
  plan_tier: PlanTier;
  starting_satisfaction: number;
  initial_ticket_text: string;
}

export function spawnCustomer(plan_tier: PlanTier = 'hobby', lang: TicketLang = 'en'): SpawnedCustomer {
  const persona = pickPersona();
  const tickets = ticketsFor(persona.archetype, lang);
  const initial = tickets[Math.floor(Math.random() * tickets.length)];
  return {
    name: generateCustomerName(),
    persona_archetype: persona.archetype,
    plan_tier,
    starting_satisfaction: persona.starting_satisfaction,
    initial_ticket_text: initial,
  };
}

export function getPlaceholderTicketForPersona(archetype: PersonaArchetype, lang: TicketLang = 'en'): string {
  const tickets = ticketsFor(archetype, lang);
  return tickets[Math.floor(Math.random() * tickets.length)];
}
