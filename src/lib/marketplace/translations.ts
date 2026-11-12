// src/lib/marketplace/translations.ts
// EN → HU/DE map for the 13 NPC marketplace seed listings. The seed
// strings are stored in EN in the DB (cheaper than re-seeding the table
// with i18n columns); we resolve them at render time based on the
// player's preferred_lang. A HU szöveg köznyelvi magyar (2026-11-12, ux-3): a szakmai rövidítések
// (SLA, BGP, P1, CNAME, VPS…) maradnak, a többi angol szó nem. Player-posted listings stay in whichever
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
    body: '50 TB/hónapra szerződtünk a szingapúri tier-1 partnerrel. Maradt kapacitás viszonteladásra. 95-percentilis számlázás, 24 órás élesítés, BGP, ha van saját AS-számod. Írj privátban, ne fizesd a $0.012-t, mint mindenki más.',
  },
  'Need 1U+GPU in TYO by Monday': {
    title: 'Kell 1U+GPU Tokióban hétfőre',
    body: 'Van egy Mira Sato-féle ügyfelünk, aki Tokiót kér. Mi még nem vagyunk ott. Ha valakinek van szabad GPU-kapacitása Tokióban $1.2k/hó alatt, közvetítői díjként az első 6 hónap 10%-át adjuk.',
  },
  'SOC 2 Type 2 evidence pack — ready-to-audit': {
    title: 'SOC 2 Type 2 bizonyítékcsomag — auditra készen',
    body: 'Bill az Aurorától. Van egy friss, tiszta Type 2 bizonyítékcsomagunk, amit az auditorunk a múlt negyedévben jóváhagyott. Megkapod az üzemeltetési kézikönyvet és 4 óra konzultációt. Igen, az auditor valódi. Igen, használhatod. Nem, tokent nem fogadunk el.',
  },
  'Managed PostgreSQL — enterprise tier': {
    title: 'Menedzselt PostgreSQL — nagyvállalati szint',
    body: 'Kesztyűs kezű pg14-klaszterkezelés $5k+ MRR-es ügyfeleknek. Negyedéves mentések, időpontra visszaállítás, ügyeleti rotáció. Lassúak vagyunk, de stabilak. Minimum 2 év szerződés.',
  },
  '1U bay in our garage (Burlington VT)': {
    title: '1U-s hely a garázsunkban (Burlington, VT)',
    body: 'Pontosan egy szabad 1U-s hely van a rackünk mellett. Olcsó áram, működő klíma, a feleségem minden hónap 3. szerdáján süteményt hoz. Csak 1 ügyfél. Előbb megnézünk, aztán mondunk igent.',
  },
  '🚀 $TYCOON-native hosting (10% off first 3mo if u pay in token)': {
    title: '🚀 $TYCOON-natív hosting (10% kedvezmény az első 3 hónapra, ha tokenben fizetsz)',
    body: 'web4-kész, a peremen fut, nincs kyc. elfogadunk TYCOON / HYPER / RACK tokent. figyelj, mindketten tudjuk, melyikünk csinálja jól. írj privátban a kuponkódért. nem pénzügyi tanács.',
  },
  'WTB: yield-bearing hardware (e.g. GPUs for mining/inference)': {
    title: 'Vennék: hozamtermelő hardvert (pl. GPU-kat bányászatra/inferenciára)',
    body: 'NFT-vállalkozást számolok fel. 47K USDC vár olyan hardverre, ami 9 hónapon belül megtérül. Régebbi A100-asok is jók. Alkuképes vagyok, és ha kell, irányt is váltok.',
  },
  'Two used Dell R610s, recently retired': {
    title: 'Két használt Dell R610, frissen kivonva',
    body: 'Konzervatív számok: 17 000 üzemóra mindkettőn. A SMART-naplók tiszták. A tápegység-matricák épek. Azért adjuk el, mert bővítünk, kicsi, de stabil pénzügyi helyzetünkre támaszkodva. Fix ár, a párt nem bontjuk.',
  },
  'Runbook authoring — your incident response, written down': {
    title: 'Üzemeltetési kézikönyv írása — az incidenskezelésed papírra vetve',
    body: 'Van egy 47 oldalas működési szabályzatom a saját cégemhez. Megírom a tiédet is. 3 hetes megbízás, sima Markdown-dokumentum, német mérnöki precizitás. Emoji nincs. „Hangulat” nincs. A kézikönyv maga a termék.',
  },
  'APAC transit — undercutting the tier-1s': {
    title: 'APAC tranzit — aláígérünk a tier-1-eknek',
    body: 'Felesleges kapacitásunk van a SIN ↔ JKT ↔ TYO háromszögön. A Pixel Forge 94-en, mi 89-en. 100 TB/hó vállalással lemegyünk 81-re. Valódi SLA-k, nem hangulat. Nem ígérünk alá örökké egy centtel; ebben a negyedévben rögzítsd az árat.',
  },
  'Magyar/CEE SMB support — saját anyanyelvi szinten': {
    title: 'Magyar/CEE kkv-támogatás — anyanyelvi szinten',
    body: 'Két magyar-amerikai testvér. Magyar nyelvű ügyfélkommunikáció, NAV-kompatibilis számlázás, GDPR-megfelelés, mindenkivel jól kijövünk. Havidíjas, 3 hónap minimum, bármikor lemondható.',
  },
  'Edge agentic infra (formerly: gaming hosting / retail AI)': {
    title: 'MI-ügynök-infrastruktúra a peremen (korábban: játékhosting / kiskereskedelmi MI)',
    body: 'Megint irányt váltottunk. Ez most már marad. Ügynök-futtatókörnyezet + kereskedői katalógus + rendelési folyamat, mind egy helyen. Korai regisztrálók: pultosok, büfékocsik, Etsy-árusok. 3 héten belül éles indulás. Azon dolgozunk, ami eltörik.',
  },
  'Acquiring failed/quitting hosts — we will assume your customers': {
    title: 'Csődbe ment / kilépő hostok felvásárlása — átvesszük az ügyfeleket',
    body: 'Ha kiégtél és puha landolást szeretnél, átvesszük az ügyfélkörödet az éves bevétel 0,6-szereséért. Dráma nélkül, gyors lezárás, az ügyfeleid költöztetési segítséget kapnak. Háromszor csináltuk már. Igen, megint irányt fogunk váltani. De az ügyfeleiddel minden rendben lesz.',
  },
  'Sarah Chen wants stable hobby hosting — referral $200': {
    title: 'Sarah Chen stabil Hobbi csomagot keres — közvetítés $200',
    body: 'Sarah egy kis kozmetikai webshopot visz Squarespace-en. Igazi, $5–15/hó-s VPS-t akar tesztkörnyezetnek. Hűséges típus — időben fizet, negyedévente megkérdezi, minden rendben van-e. Mi tele vagyunk, $200-ért átküldjük hozzád. Ő választ szolgáltatót.',
  },
  'Tomás López — first-time founder needs hand-holding': {
    title: 'Tomás López — első vállalkozó, fogni kell a kezét',
    body: 'Tomás most hagyta ott a rendszergazdai állását, és helyi vállalkozói katalógust indít. Még nem tudja, mi az a CNAME, de türelmes, és előre fizet. Olcsó Hobbi csomag, sok ticket, de kedves. $150 a közvetítés.',
  },
  'Avery Tran — business-tier, RFC-quoting senior engineer': {
    title: 'Avery Tran — Üzleti csomag, RFC-ket idéző tapasztalt fejlesztő',
    body: 'Avery vezető mérnök egy pénzügyi-technológiai cégnél. Üzleti csomagot akar a hobbiprojektjéhez. Elolvassa a státuszoldaladat, írni fog az IPv6-ról, időben fizet, és a $30/hó meg sem kottyan neki. $400-ért megéri megismerni. Ő választ szolgáltatót.',
  },
  'Jordan Smith — bargain-hunter, hobby-tier': {
    title: 'Jordan Smith — alkuvadász, Hobbi csomag',
    body: 'Jordan minden megújításkor három szolgáltatótól kér levélben kedvezményt. Végül az olcsó csomagon fog fizetni. Negyedévente nyit egy visszatérítési ticketet is. $80-ért adjuk tovább — mostantól a te gondod.',
  },
  'Beth Park — $50 fire-sale, do not say we didn\'t warn you': {
    title: 'Beth Park — $50-os végkiárusítás, ne mondd, hogy nem szóltunk',
    body: 'Beth az a fajta ügyfél, aki mindig a vezetővel akar beszélni. Két hét alatt három P1-es ticketet nyitott nálunk. Utálja a jelenlegi szolgáltatóját. A következőt is utálni fogja. $50-ért átpasszoljuk valaki másnak. Hobbi csomag, 25-ös elégedettséggel indul — szóltunk.',
  },
  'FRA IX port share — $150 once, $9/mo': {
    title: 'Frankfurti IX-port megosztva — $150 egyszer, $9/hó',
    body: 'Túl nagy frankfurti IX-portot vettünk. Csatlakozz a miénkre: ugyanazok a partnerek, ugyanazok a route szerverek, az ár töredékéért. Egyszer $150 a bekötésért, utána $9/hó, amíg a peering be van kapcsolva. Aki előbb jön — egy hely van.',
  },
  'BIX peering in Budapest — $120 + $10/mo': {
    title: 'BIX peering Budapesten — $120 + $10/hó',
    body: 'A budapesti BIX-portunkon még egy kis hálózat elfér. Egyszer $120 a bekötésért, utána $10/hó. A magyar és a közép-európai forgalom helyben marad: gyorsabb, és kisebb a tranzit-számla. A BGP-beállítást egy hívásban veled együtt csináljuk.',
  },
  'Spare cross-connect at our local IX — $180, $6/mo': {
    title: 'Szabad bekötés a helyi IX-en — $180, $6/hó',
    body: 'Két évre előre kifizettünk egy bekötést a regionális IX-en, és csak a felét használjuk. Vidd a másik felét: egyszer $180, utána $6/hó. Kisvárosi IX, de a nagy tartalom-hálózatok mind ott vannak.',
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
  'Sarah Chen wants stable hobby hosting — referral $200': {
    title: 'Sarah Chen sucht stabiles Hobby-Tier-Hosting — Vermittlung $200',
    body: 'Sarah betreibt einen kleinen DTC-Kosmetik-Webshop auf Squarespace. Will einen echten $5-15/Mon VPS für Staging. Loyaler Typ — zahlt pünktlich, fragt einmal pro Quartal, ob alles OK ist. Wir sind voll, schicken sie für $200 zu dir. Sie wählt den Anbieter.',
  },
  'Tomás López — first-time founder needs hand-holding': {
    title: 'Tomás López — Erstgründer, braucht Handhalten',
    body: 'Tomás hat gerade seinen Sysadmin-Job verlassen, um ein lokales Geschäftsverzeichnis zu starten. Weiß noch nicht, was ein CNAME ist, ist aber geduldig und zahlt im Voraus. Günstiger Hobby-Tier, viele Support-Tickets, aber nett. $150 Vermittlung.',
  },
  'Avery Tran — business-tier, RFC-quoting senior engineer': {
    title: 'Avery Tran — Business-Tier, RFC-zitierender Senior-Engineer',
    body: 'Avery ist Principal Engineer bei einem Fintech. Will ein Business-Paket für sein Nebenprojekt. Wird deine Status-Seite lesen, wird über IPv6 schreiben, zahlt pünktlich, $30/Mon ist für ihn nichts. $400, um ihn vorzustellen. Er wählt den Anbieter.',
  },
  'Jordan Smith — bargain-hunter, hobby-tier': {
    title: 'Jordan Smith — Schnäppchenjäger, Hobby-Tier',
    body: 'Jordan schreibt zur Verlängerung drei Hostern eine Rabattanfrage. Wird letztlich auf dem günstigen Plan zahlen. Wird auch pro Quartal ein Refund-Ticket öffnen. Wir berechnen pauschal $80, um sie loszuwerden — dein Problem.',
  },
  'Beth Park — $50 fire-sale, do not say we didn\'t warn you': {
    title: 'Beth Park — $50 Ausverkauf, sag nicht, wir hätten dich nicht gewarnt',
    body: 'Beth ist die Sorte Kundin, die immer den Vorgesetzten verlangt. Hat bei uns in zwei Wochen drei P1-Tickets eingereicht. Hasst ihren aktuellen Hoster. Wird ihren nächsten auch hassen. Wir verlangen $50, um sie jemand anderem aufzudrücken. Hobby-Paket, Zufriedenheit startet bei 25, du wurdest gewarnt.',
  },
  'FRA IX port share — $150 once, $9/mo': {
    title: 'FRA-IX-Port zum Mitnutzen — $150 einmalig, $9/Monat',
    body: 'Wir haben unseren Frankfurter IX-Port zu groß gekauft. Häng dich an unseren Anteil: gleiche Peers, gleiche Route-Server, ein Bruchteil des Preises. Einmalig $150 für den Cross-Connect, danach $9/Monat, solange Peering aktiv ist. Wer zuerst kommt — ein Platz.',
  },
  'BIX peering in Budapest — $120 + $10/mo': {
    title: 'BIX-Peering in Budapest — $120 + $10/Monat',
    body: 'Unser Budapester BIX-Port hat Platz für ein weiteres kleines Netz. Einmalig $120 für den Anschluss, danach $10/Monat. Ungarischer und mitteleuropäischer Traffic bleibt lokal: schneller, und die Transit-Rechnung sinkt. Die BGP-Konfiguration machen wir mit dir zusammen in einem Call.',
  },
  'Spare cross-connect at our local IX — $180, $6/mo': {
    title: 'Freier Cross-Connect an unserem lokalen IX — $180, $6/Monat',
    body: 'Wir haben einen Cross-Connect am regionalen Austauschpunkt zwei Jahre im Voraus bezahlt und nutzen nur die Hälfte. Nimm die andere Hälfte: einmalig $180, danach $6/Monat. Kleinstadt-IX, aber die großen Content-Netze sind alle da.',
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
