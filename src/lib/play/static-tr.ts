// src/lib/play/static-tr.ts
// Hyperscales — a még sablon-HTML-ből renderelt /play oldalak (marketing, árazás) fix szövegeinek
// szerveroldali fordítása (2026-11-11). Pontos EN részszöveg → HU/DE; a táblák teljességét teszt ellenőrzi.

import type { PlayLocale } from './strings';

export type StaticTable = Record<string, { hu: string; de: string }>;

export function localizeHtml(html: string, locale: PlayLocale, table: StaticTable): string {
  if (locale === 'en') return html;
  let out = html;
  // Hosszabb kulcs előbb, hogy a rövidebb ne vágjon bele egy hosszabb mondatba.
  for (const en of Object.keys(table).sort((a, b) => b.length - a.length)) {
    out = out.split(en).join(table[en][locale]);
  }
  return out;
}

export const MARKETING_TR: StaticTable = {
  'Marketing mix <span class="count">3 channels</span>': { hu: 'Marketing-mix <span class="count">3 csatorna</span>', de: 'Marketing-Mix <span class="count">3 Kanäle</span>' },
  'Distribute attention across channels. Server normalizes to 100% on save.': { hu: 'Oszd el a figyelmet a csatornák között. Mentéskor 100%-ra igazítjuk.', de: 'Verteile die Aufmerksamkeit auf die Kanäle. Beim Speichern wird auf 100 % normiert.' },
  'View customer-funnel →': { hu: 'Ügyfelek →', de: 'Kunden →' },
  '</span> Channels</h2>': { hu: '</span> Csatornák</h2>', de: '</span> Kanäle</h2>' },
  'Each channel attracts different persona-mix at different speeds.': { hu: 'Minden csatorna más típusú ügyfeleket hoz, más tempóban.', de: 'Jeder Kanal bringt andere Kundentypen, unterschiedlich schnell.' },
  'Slow · Sticky': { hu: 'Lassú · Maradós', de: 'Langsam · Treu' },
  'Organic search. Slow ramp-up but the customers you win stay longer and complain less.': { hu: 'Organikus keresés. Lassan indul, de az így szerzett ügyfelek tovább maradnak és kevesebbet panaszkodnak.', de: 'Organische Suche. Läuft langsam an, aber diese Kunden bleiben länger und beschweren sich weniger.' },
  'Fast · Churny': { hu: 'Gyors · Lemorzsolódó', de: 'Schnell · Wechselhaft' },
  'Paid ads. Fastest signup velocity, but these customers churn quicker — and the bill keeps coming.': { hu: 'Fizetett hirdetés. Ez hozza leggyorsabban az ügyfeleket, de hamarabb távoznak — és a számla folyamatosan jön.', de: 'Bezahlte Werbung. Bringt am schnellsten Kunden, die aber schneller kündigen — und die Rechnung läuft weiter.' },
  'Slow burn · Loyal': { hu: 'Lassan éled · Hűséges', de: 'Braucht Zeit · Loyal' },
  'Word of mouth. Takes time to start flywheeling, but referred customers are your highest-LTV cohort.': { hu: 'Szájreklám. Idő kell, mire beindul, de az ajánlással jött ügyfelek fizetnek a legtöbbet hosszú távon.', de: 'Mundpropaganda. Braucht Zeit, aber empfohlene Kunden bringen langfristig am meisten.' },
  'Live sum:': { hu: 'Összeg most:', de: 'Summe jetzt:' },
  '// server normalizes to 100% on save — any sum is OK': { hu: '// mentéskor 100%-ra igazítjuk — bármilyen összeg jó', de: '// beim Speichern auf 100 % normiert — jede Summe ist ok' },
  'Predicted acquisition:': { hu: 'Várható új ügyfél:', de: 'Erwartete Neukunden:' },
  '>Ready<': { hu: '>Kész<', de: '>Bereit<' },
  'Save mix': { hu: 'Mix mentése', de: 'Mix speichern' },
};

export const PRICING_TR: StaticTable = {
  'Pricing <span class="count">2 plan-tiers</span>': { hu: 'Árazás <span class="count">2 csomag</span>', de: 'Preise <span class="count">2 Tarife</span>' },
  'Higher price → fewer signups, but each one is worth more. Server clamps the bounds.': { hu: 'Magasabb ár → kevesebb új ügyfél, de mindegyik többet ér. A határokat a szerver betartatja.', de: 'Höherer Preis → weniger Anmeldungen, aber jede ist mehr wert. Der Server hält die Grenzen ein.' },
  'View MRR breakdown →': { hu: 'Pénzügy →', de: 'Finanzen →' },
  '</span> Plan tiers</h2>': { hu: '</span> Csomagok</h2>', de: '</span> Tarife</h2>' },
  'Drag to adjust monthly price. Saved values are server-clamped.': { hu: 'Húzd a csúszkát a havidíjhoz. A mentett értéket a szerver a határok közé igazítja.', de: 'Zieh den Regler für den Monatspreis. Gespeicherte Werte hält der Server in den Grenzen.' },
  'Hobby tier': { hu: 'Hobbi csomag', de: 'Hobby-Tarif' },
  'Single-site shared hosting. Forgiving SLA. Tolerates noisy neighbors. Volume play.': { hu: 'Egyoldalas osztott tárhely. Engedékeny SLA, elviseli a zajos szomszédokat. Mennyiségre megy.', de: 'Shared Hosting für eine Seite. Nachsichtiges SLA, verträgt laute Nachbarn. Masse statt Klasse.' },
  'Business tier': { hu: 'Üzleti csomag', de: 'Business-Tarif' },
  'Dedicated resources, prioritized support, SLA-bound. Higher LTV, pickier customers.': { hu: 'Dedikált erőforrás, elsőbbségi támogatás, SLA-val. Többet hoz, de válogatósabb ügyfelek.', de: 'Dedizierte Ressourcen, bevorzugter Support, mit SLA. Mehr Umsatz, wählerischere Kunden.' },
  '// bounds:': { hu: '// határok:', de: '// Grenzen:' },
  ' / month</div>': { hu: ' / hó</div>', de: ' / Monat</div>' },
  '<small>per month</small>': { hu: '<small>havonta</small>', de: '<small>pro Monat</small>' },
  '>Ready<': { hu: '>Kész<', de: '>Bereit<' },
  'Save pricing': { hu: 'Árak mentése', de: 'Preise speichern' },
};
