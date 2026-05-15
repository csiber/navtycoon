// src/lib/marketplace/translations.ts
// EN → HU/DE map for the 13 NPC marketplace seed listings. The seed
// strings are stored in EN in the DB (cheaper than re-seeding the table
// with i18n columns); we resolve them at render time based on the
// player's preferred_lang. Player-posted listings stay in whichever
// language the player wrote them.

export type ListingLang = 'en' | 'hu' | 'de';

interface Translation {
  title: string;
  body: string;
}

// Keyed by the EN source title so render-side lookup is O(1).
const HU: Record<string, Translation> = {
  'APAC peering — SIN ↔ FRA, $0.0094/GB': {
    title: 'APAC peering — SIN ↔ FRA, $0.0094/GB',
    body: '50TB/hónapra szerződtünk a singapore-i tier-1 partnerrel. Maradt kapacitás viszonteladásra. 95-percentilis számlázás, 24h turn-up, BGP ha van saját AS-számod. DM, ne fizesd a $0.012-t mint mindenki más.',
  },
  'Need 1U+GPU in TYO by Monday': {
    title: 'Kell 1U+GPU Tokióban hétfőre',
    body: 'Van egy Mira Sato-szerű ügyfelünk aki Tokiót kér. Mi még nem vagyunk ott. Ha valakinek van szabad GPU-kapacitása TYO-ban <$1.2k/hó-ért, közvetítői díj az első 6 hó 10%-a.',
  },
  'SOC 2 Type 2 evidence pack — ready-to-audit': {
    title: 'SOC 2 Type 2 evidence-csomag — audit-ready',
    body: 'Aurora Bill itt. Van egy friss, tiszta Type 2 evidence-csomagunk amit az auditorunk múlt negyedévben hagyott jóvá. Megkapod a runbook-ot + 4h konzultációt. Igen, az auditor valódi. Igen, használhatod. Nem, tokent nem fogadunk el.',
  },
  'Managed PostgreSQL — enterprise tier': {
    title: 'Managed PostgreSQL — enterprise szint',
    body: 'White-glove pg14 cluster-menedzsment $5k+ MRR-es accountoknak. Negyedéves backup-ok, point-in-time recovery, on-call rotáció. Lassúak vagyunk de stabilak. Min. 2 év szerződés.',
  },
  '1U bay in our garage (Burlington VT)': {
    title: '1U bay a garázsunkban (Burlington VT)',
    body: 'Pontosan egy szabad 1U bay van a rackünk mellett. Olcsó áram, működő klíma, a feleségem minden hónap 3. szerdáján süteményt hoz. 1 kliens. Megítélünk mielőtt igent mondunk.',
  },
  '🚀 $TYCOON-native hosting (10% off first 3mo if u pay in token)': {
    title: '🚀 $TYCOON-native hosting (10% off első 3 hónap ha tokenben fizetsz)',
    body: 'web4 ready, edge-deployed, no kyc. elfogadunk TYCOON / HYPER / RACK tokent. figyelj, mindketten tudjuk hogy melyikünk csinálja jól. DM a kupon-kódért. nfa.',
  },
  'WTB: yield-bearing hardware (e.g. GPUs for mining/inference)': {
    title: 'WTB: yield-bearing hardver (pl. GPU-k mining/inference-re)',
    body: 'NFT-ventúrát lakvidálok. 47K USDC készen áll olyan hardverre amely <9 hónap alatt megtérül. Régebbi A100-ak is OK. Tárgyalok, pivotálok ha kell.',
  },
  'Two used Dell R610s, recently retired': {
    title: 'Két használt Dell R610, frissen kivonva',
    body: 'Konzervatív számok: 17,000 üzemóra mindkettőn. SMART-naplók tiszták. PSU-matricák épek. Eladás mert upgradelünk a stabil pénzügyi pozíciónk hátán. Ár fix, párt nem bontunk fel.',
  },
  'Runbook authoring — your incident response, written down': {
    title: 'Runbook-írás — az incident-response-od papírra téve',
    body: 'Van egy 47-oldalas SOP-em saját shopomhoz. Megírom a tiédet. 3-hetes engagement, plain Markdown deliverable, német-mérnöki precizitás. Emoji nincs. "Vibe" nincs. A runbook a termék.',
  },
  'APAC transit — undercutting the tier-1s': {
    title: 'APAC transit — alulvágjuk a tier-1-eket',
    body: 'Felesleges kapacitásunk van a SIN ↔ JKT ↔ TYO háromszögön. Pixel Forge 94-en, mi 89-en. 100TB/hó commit-tal lemegyünk 81-re. Valódi SLA-k, nem vibe. Egy centtel nem fogjuk örökké aláígérni; ezen a negyedévben lock in.',
  },
  'Magyar/CEE SMB support — saját anyanyelvi szinten': {
    title: 'Magyar/CEE SMB support — saját anyanyelvi szinten',
    body: 'Két magyar-amerikai testvér. Magyar nyelvű ügyfélkommunikáció, NAV-kompatibilis számlázás, GDPR-compliant, mindenkivel jól kijövünk. Ár havidíjas, 3 hónap minimum, lemondás bármikor.',
  },
  'Edge agentic infra (formerly: gaming hosting / retail AI)': {
    title: 'Edge agentic infra (korábban: gaming hosting / retail AI)',
    body: 'Megint pivotáltunk. Ez most már marad. Agent runtime + merchant katalógus + rendelés-pipeline, mind kolokálva. Korai signupok: bárpultosok, food truck-ok, etsy-emberek. 3 héten belül hard-launch. Iterálunk azon ami eltörik.',
  },
  'Acquiring failed/quitting hosts — we will assume your customers': {
    title: 'Csődbe ment / kilépő hostok felvásárlása — átvesszük az ügyfeleket',
    body: 'Ha kiégtél és puha landolást akarsz, átvesszük az account-listádat 0.6× ARR-ért. Drámamentes, gyors close, az ügyfeleid migrációs supportot kapnak. Csináltuk ezt 3-szor. Igen, megint pivotálni fogunk. De az ügyfeleid jól lesznek.',
  },
};

const DE: Record<string, Translation> = {
  'APAC peering — SIN ↔ FRA, $0.0094/GB': {
    title: 'APAC-Peering — SIN ↔ FRA, $0.0094/GB',
    body: '50TB/Monat mit unserem SIN-Tier-1-Partner verpflichtet. Überkapazität verfügbar auf Reseller-Basis. 95.-Perzentil-Abrechnung, 24h Turn-Up, BGP wenn du ein AS hast. DM, zahle nicht $0.012 wie alle anderen.',
  },
  'Need 1U+GPU in TYO by Monday': {
    title: 'Brauche 1U+GPU in TYO bis Montag',
    body: 'Habe einen Mira-Sato-Kunden der Tokio fragt. Wir sind noch nicht dort. Wer GPU-Kapazität in TYO unter $1.2k/Monat hat: Vermittlungsgebühr 10% der ersten 6 Monate.',
  },
  'SOC 2 Type 2 evidence pack — ready-to-audit': {
    title: 'SOC 2 Type 2 Evidence-Pack — audit-ready',
    body: 'Bill von Aurora. Wir haben ein sauberes, aktuelles Type-2-Evidence-Pack das unser Auditor letztes Quartal abgesegnet hat. Inkl. Playbook + 4h Beratung. Ja, der Auditor ist echt. Ja, du kannst es nutzen. Nein, wir nehmen keine Token.',
  },
  'Managed PostgreSQL — enterprise tier': {
    title: 'Managed PostgreSQL — Enterprise-Stufe',
    body: 'White-Glove pg14-Cluster-Mgmt für Accounts ab $5k MRR. Quartals-Backups, Point-in-Time Recovery, On-Call-Rotation. Wir sind langsam aber stabil. Mindestens 2 Jahre Vertrag.',
  },
  '1U bay in our garage (Burlington VT)': {
    title: '1U-Bay in unserer Garage (Burlington VT)',
    body: 'Genau ein freier 1U-Bay neben unserem Rack. Strom günstig, AC funktioniert, meine Frau bringt jeden 3. Mittwoch im Monat Kekse. Limit 1 Kunde. Wir beurteilen dich bevor wir Ja sagen.',
  },
  '🚀 $TYCOON-native hosting (10% off first 3mo if u pay in token)': {
    title: '🚀 $TYCOON-natives Hosting (10% Rabatt erste 3 Monate bei Token-Zahlung)',
    body: 'web4-ready, edge-deployed, no kyc. akzeptieren TYCOON / HYPER / RACK. hör zu, wir wissen beide wer von uns das Richtige macht. DM für den Discount-Code. nfa.',
  },
  'WTB: yield-bearing hardware (e.g. GPUs for mining/inference)': {
    title: 'WTB: yield-bearing Hardware (z.B. GPUs für Mining/Inference)',
    body: 'Liquidiere ein NFT-Venture. 47K USDC bereit für Hardware die sich in <9mo amortisiert. Ältere A100s ok. Verhandelbar, pivotbar.',
  },
  'Two used Dell R610s, recently retired': {
    title: 'Zwei gebrauchte Dell R610, kürzlich ausgemustert',
    body: 'Konservative Zahlen: 17.000 Stunden je Server. SMART-Logs sauber. PSU-Aufkleber intakt. Verkauf weil wir upgraden, gestützt auf eine kleine aber stabile Cash-Position. Preis fest, kein Splitten des Paars.',
  },
  'Runbook authoring — your incident response, written down': {
    title: 'Runbook-Erstellung — dein Incident-Response, niedergeschrieben',
    body: 'Habe eine 47-seitige SOP für meinen eigenen Shop. Ich schreibe deine. 3-Wochen-Engagement, Plain-Markdown-Deliverable, deutsch-engineered. Keine Emojis. Keine "Vibes". Das Runbook ist das Produkt.',
  },
  'APAC transit — undercutting the tier-1s': {
    title: 'APAC-Transit — wir unterbieten die Tier-1s',
    body: 'Wir haben Überkapazität auf dem SIN ↔ JKT ↔ TYO Dreieck. Pixel Forge bei 94, wir bei 89. Mit 100TB/Monat Commit gehen wir auf 81. Echte SLAs, keine Vibes. Wir unterbieten nicht ewig um einen Cent; lock in dieses Quartal.',
  },
  'Magyar/CEE SMB support — saját anyanyelvi szinten': {
    title: 'Ungarn/CEE SMB-Support — Muttersprachen-Niveau',
    body: 'Zwei ungarisch-amerikanische Brüder. Ungarische Kundenkommunikation, NAV-konforme Rechnungen, DSGVO-konform, freundlich. Monatlicher Preis, 3 Monate Minimum, jederzeit kündbar.',
  },
  'Edge agentic infra (formerly: gaming hosting / retail AI)': {
    title: 'Edge Agentic Infra (ehem.: Gaming-Hosting / Retail-AI)',
    body: 'Wir haben wieder gepivotet. Diesmal bleibt es. Agent-Runtime + Händler-Katalog + Order-Pipeline, alles kolokiert. Frühe Signups: Barkeeper, Food-Trucks, Etsy-Leute. Hard-Launch in 3 Wochen. Iterieren auf dem was bricht.',
  },
  'Acquiring failed/quitting hosts — we will assume your customers': {
    title: 'Übernahme gescheiterter/aussteigender Hoster — wir übernehmen die Kunden',
    body: 'Wenn du ausgebrannt bist und eine sanfte Landung willst, übernehmen wir deine Account-Liste für 0,6× ARR. Drama-frei, schneller Abschluss, Migrations-Support für deine Kunden. Wir haben das 3-mal gemacht. Ja, wir werden wieder pivoten. Aber deine Kunden werden okay sein.',
  },
};

const MAPS: Record<ListingLang, Record<string, Translation>> = {
  en: {}, hu: HU, de: DE,
};

export function translateListing(
  lang: ListingLang,
  source: { title: string; body: string },
): { title: string; body: string } {
  if (lang === 'en') return source;
  const map = MAPS[lang];
  const hit = map[source.title];
  if (hit) return hit;
  return source;
}
