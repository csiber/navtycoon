// src/lib/forum/translations.ts
// Render-time EN→HU/DE map for the 5 NPC seed threads + 13 NPC seed
// replies. Keyed by EN source title (threads) or by exact body (replies)
// so we don't need a per-row id. Player-posted threads / replies stay
// in author's language.

export type ForumLang = 'en' | 'hu' | 'de';

interface TranslatedThread {
  title: string;
  body: string;
}

const THREAD_HU: Record<string, TranslatedThread> = {
  'still bullish on $TYCOON nfa not financial advice': {
    title: 'továbbra is bullish $TYCOON-on, nfa nem befektetési tanács',
    body: "ide figyelj. host-oltam egy fickó NFT-marketplace-ét a 2024-es télen, mindketten ettük. de az új $TYCOON utility (governance + cold-storage fee discount) tutiba megy. ki más vesz on-chain payment-et a rack-en? ha nem stack-elsz, alszol.",
  },
  'tape drive making a weird grinding noise, anyone else?': {
    title: 'tape-meghajtó fura csikorgó hangot ad, valaki más is?',
    body: "hahó. a napi backup tape-meghajtónk csikorogni kezdett amikor az LTO-5 kazetta töltődik. az ügyfelek még nem vették észre de engem ébren tart. valaki látott már ilyet hasonló gépen? azt gondolom veszek egy refurb pótalkatrészt de a feleségem kérdezi minek nekünk 3 db.",
  },
  'who else is shipping to APAC and what are you paying for transit': {
    title: 'ki más szállít APAC-ra és mit fizettek a transitért',
    body: 'mindjárt aláírok egy 1-éves peering deal-t egy szingapúri tier-1-gyel. árajánlat $0.012/GB egress 95-percentilis számlázással. magasnak tűnik de minden másik versenytárs hasonlót ajánlott a régióban. valaki ennél jobbat kap? helix téged nézlek 👀',
  },
  'thinking very carefully about hiring a second sysadmin': {
    title: 'nagyon óvatosan gondolkodom egy második sysadmin felvételén',
    body: 'A runway 9 hónapnál áll. Az MRR 6% MoM növekedés az utolsó negyedévben. A felvétel kísértés erős, de az előző cégem (nem ebben az iparban) elbukott, mert bevétel előtt vettem fel embert. Szívesen hallanám, mások hogyan időzítették az első felvételüket.',
  },
  'we just rebranded to "agentic infra for retail" — feedback wanted': {
    title: 'rebrand-eltünk "agentic infra for retail"-re — visszajelzés kell',
    body: 'tehát tegnap ship-eltünk egy új landing page-et. a pitch: hostoljuk az agent runtime-ot + a merchant termék-katalógust + a rendelés-pipeline-t, mind egy stack-ben. korai signupok: bárpultosok, food truck-ok, etsy-emberek. valaki más is hasonló tailwind-et lát a pipeline-ban? vagy ez egy újabb pivot ami 90 napon belül elfullad lol',
  },
};

const THREAD_DE: Record<string, TranslatedThread> = {
  'still bullish on $TYCOON nfa not financial advice': {
    title: 'immer noch bullish auf $TYCOON nfa keine Anlageberatung',
    body: 'hör zu. ich habe einem Typ seinen NFT-Marketplace durch den 2024er Winter gehostet, beide haben wir verloren. aber die neue $TYCOON-Utility (Governance + Cold-Storage-Fee-Rabatt) wird groß. wer akzeptiert noch On-Chain-Zahlungen am Rack? wenn du nicht stackst, schläfst du.',
  },
  'tape drive making a weird grinding noise, anyone else?': {
    title: 'Tape-Drive macht ein seltsames Knirschen, sonst noch wer?',
    body: 'hi Leute. unser Daily-Backup-Tape-Drive fängt an zu knirschen wenn die LTO-5-Cartridge geladen wird. Kunden haben es noch nicht bemerkt, aber es hält mich wach. Hat jemand das auf ähnlicher Hardware gesehen? Denke ich kaufe einen refurbed Ersatz, aber meine Frau fragt warum wir drei davon haben.',
  },
  'who else is shipping to APAC and what are you paying for transit': {
    title: 'wer liefert noch nach APAC und was zahlt ihr für Transit',
    body: 'kurz davor einen 1-Jahres-Peering-Deal mit einem Tier-1 in Singapur zu unterschreiben. Angebot $0.012/GB Egress mit 95-Perzentil-Abrechnung. Wirkt hoch, aber jeder andere Wettbewerber in der Region hatte ähnliches. Bekommt jemand bessere? Helix, ich schaue dich an 👀',
  },
  'thinking very carefully about hiring a second sysadmin': {
    title: 'überlege sehr sorgfältig einen zweiten Sysadmin einzustellen',
    body: 'Laufzeit ist bei 9 Monaten. MRR wächst 6% MoM im letzten Quartal. Die Versuchung einzustellen ist stark, aber mein letztes Geschäft (nicht in dieser Branche) scheiterte weil ich vor dem Umsatz eingestellt habe. Würde gerne hören wie andere ihren ersten Hire getimt haben.',
  },
  'we just rebranded to "agentic infra for retail" — feedback wanted': {
    title: 'wir haben uns gerade als "agentic infra for retail" gerebrandet — Feedback gewünscht',
    body: 'also wir haben gestern eine neue Landing Page geshippt. Pitch: wir hosten die Agent-Runtime + den Händler-Katalog + die Order-Pipeline, alles in einem Stack. Early Signups: Barkeeper, Food Trucks, Etsy-Leute. Sieht jemand ähnliche Tailwinds in der Pipeline? Oder ist das nur ein weiterer Pivot der in 90 Tagen verpufft lol',
  },
};

const REPLY_HU: Record<string, string> = {
  'We do not accept tokens. Our procurement runs on invoices. This is the second time this week I\'ve said this in this forum.':
    'Nem fogadunk el tokent. A beszerzésünk számlán fut. Ezen a héten ez a második alkalom hogy ezt mondom itt a fórumon.',
  '+1 to Aurora. I will not be installing a stripe alternative that needs a hardware wallet on my colo cabinet.':
    '+1 Aurorának. Nem fogok stripe-alternatívát telepíteni amihez hardware-wallet kell a colo-szekrényemre.',
  'Tisztítókazettát próbáltad már? Nálunk minden harmadik hónapban azzal lehet csillapítani. Ha az se segít, akkor a fej lehet, ami már megette a magáét.':
    'Tisztítókazettát próbáltad már? Nálunk minden harmadik hónapban azzal lehet csillapítani. Ha az se segít, akkor a fej lehet, ami már megette a magáét.',
  'Page 23 of my SOP covers exactly this. The grinding is the load arm bearing, not the head. Replace the whole drive — repairs cost more than refurb.':
    'A SOP-em 23. oldala pontosan ezt fedi le. A csikorgás a load-arm csapágy, nem a fej. Cseréld le az egész meghajtót — a javítás drágább mint egy refurb.',
  "we're at 0.0094 but we committed 50TB/mo for 18 months. the moment your APAC MRR can support that commit, your rates fall off a cliff. happy to intro you to our peering contact, we're not in the same vertical.":
    'mi 0.0094-en vagyunk de 50TB/hó-ra szerződtünk 18 hónapra. abban a pillanatban amikor az APAC MRR-ed bírja ezt a commit-ot, az áraid lezuhannak. szívesen összekötlek a peering-kontaktunkkal, nem vagyunk azonos vertikálisban.',
  'we pivoted away from APAC last quarter (focus shift to agentic infra for retail) but when we were there we did 0.011 with a smaller provider, slightly worse routing in JKT. ymmv.':
    'mi múlt negyedévben elpivotáltunk az APAC-tól (focus váltás agentic infra for retail-re) de mikor még ott voltunk 0.011-et csináltunk egy kisebb providerrel, kicsit rosszabb routing JKT-ban. ymmv.',
  "We waited too long. Husband-and-wife ops for 7 years before we hired #3, by then we'd already lost 2 customers to slow ticket response. If you have the runway and the growth, do it. Don't be us.":
    'Mi túl sokat vártunk. 7 évig férj-feleség ops voltunk az első felvétel előtt, addigra már elveszítettünk 2 ügyfelet a lassú ticket-válaszidő miatt. Ha van runway-d és növekedésed, csináld. Ne legyél olyan mint mi.',
  "hire a contractor first. lock-in a 3-month engagement, see if they fit the rhythm. that's how we did it during the Q2 pivot.":
    'először vegyél fel egy contractor-t. zárj 3-hónapos engagement-et, nézd meg passzol-e a ritmusba. mi így csináltuk a Q2-es pivot alatt.',
  'That is the 4th pivot from your company this calendar year. I think you should consider that the problem may not be the pivots.':
    'Ez a 4. pivot a cégedtől ebben a naptári évben. Szerintem érdemes elgondolkodnod hogy a probléma talán nem a pivot.',
  'hot take but agentic+retail is undervalued rn. if you add $TYCOON acceptance you double your TAM overnight. dm me about co-marketing.':
    'hot take de az agentic+retail alulárazott most. ha hozzáadod a $TYCOON-elfogadást duplázod a TAM-et egyik napról a másikra. dm-elj co-marketing miatt.',
  "Maelstrom, I'd genuinely watch your churn cohort closely. The bartender persona has high signup intent but low 60-day retention based on what we saw. Happy to share data if useful.":
    'Maelstrom, őszintén figyelnélek a churn-kohort-on. A bárpultos persona magas signup-intenttel rendelkezik de alacsony 60-napos retencióval az általunk látottak alapján. Szívesen megosztom az adatot ha hasznos.',
};

const REPLY_DE: Record<string, string> = {
  'We do not accept tokens. Our procurement runs on invoices. This is the second time this week I\'ve said this in this forum.':
    'Wir akzeptieren keine Token. Unser Procurement läuft über Rechnungen. Das ist diese Woche das zweite Mal dass ich das hier im Forum sage.',
  '+1 to Aurora. I will not be installing a stripe alternative that needs a hardware wallet on my colo cabinet.':
    '+1 zu Aurora. Ich werde keine Stripe-Alternative installieren die eine Hardware-Wallet auf meinem Colo-Schrank braucht.',
  'Tisztítókazettát próbáltad már? Nálunk minden harmadik hónapban azzal lehet csillapítani. Ha az se segít, akkor a fej lehet, ami már megette a magáét.':
    'Hast du eine Reinigungs-Cartridge probiert? Bei uns dämpft das alle 3 Monate. Wenn das nicht hilft, ist es vermutlich der Lesekopf.',
  'Page 23 of my SOP covers exactly this. The grinding is the load arm bearing, not the head. Replace the whole drive — repairs cost more than refurb.':
    'Seite 23 meiner SOP deckt genau das ab. Das Knirschen ist das Load-Arm-Lager, nicht der Kopf. Ersetze das ganze Laufwerk — Reparaturen kosten mehr als refurb.',
  "we're at 0.0094 but we committed 50TB/mo for 18 months. the moment your APAC MRR can support that commit, your rates fall off a cliff. happy to intro you to our peering contact, we're not in the same vertical.":
    'wir sind bei 0.0094, aber haben uns für 50TB/Monat über 18 Monate verpflichtet. sobald dein APAC-MRR diesen Commit trägt, fallen deine Raten ins Bodenlose. gerne stelle ich dich unserem Peering-Kontakt vor, wir sind nicht in derselben Vertikalen.',
  'we pivoted away from APAC last quarter (focus shift to agentic infra for retail) but when we were there we did 0.011 with a smaller provider, slightly worse routing in JKT. ymmv.':
    'wir haben uns letztes Quartal von APAC weggepivotet (Focus-Shift zu agentic infra for retail), aber als wir dort waren machten wir 0.011 bei einem kleineren Provider, etwas schlechteres Routing in JKT. ymmv.',
  "We waited too long. Husband-and-wife ops for 7 years before we hired #3, by then we'd already lost 2 customers to slow ticket response. If you have the runway and the growth, do it. Don't be us.":
    'Wir haben zu lange gewartet. 7 Jahre Ehepaar-Ops vor dem ersten Hire, dann hatten wir schon 2 Kunden an langsame Ticket-Response verloren. Wenn du die Runway und das Wachstum hast, mach es. Sei nicht wie wir.',
  "hire a contractor first. lock-in a 3-month engagement, see if they fit the rhythm. that's how we did it during the Q2 pivot.":
    'stelle zuerst einen Contractor ein. 3-Monats-Engagement, schau ob er in den Rhythmus passt. so haben wir es während des Q2-Pivots gemacht.',
  'That is the 4th pivot from your company this calendar year. I think you should consider that the problem may not be the pivots.':
    'Das ist der 4. Pivot deiner Firma in diesem Kalenderjahr. Vielleicht solltest du in Betracht ziehen, dass das Problem nicht die Pivots sind.',
  'hot take but agentic+retail is undervalued rn. if you add $TYCOON acceptance you double your TAM overnight. dm me about co-marketing.':
    'hot take, aber agentic+retail ist gerade unterbewertet. wenn du $TYCOON-Akzeptanz hinzufügst verdoppelst du dein TAM über Nacht. DM für Co-Marketing.',
  "Maelstrom, I'd genuinely watch your churn cohort closely. The bartender persona has high signup intent but low 60-day retention based on what we saw. Happy to share data if useful.":
    'Maelstrom, ich würde deine Churn-Kohorte genau beobachten. Die Barkeeper-Persona hat hohe Signup-Intent aber niedrige 60-Tages-Retention basierend auf dem was wir sahen. Teile gerne Daten wenn hilfreich.',
};

const THREADS: Record<ForumLang, Record<string, TranslatedThread>> = {
  en: {}, hu: THREAD_HU, de: THREAD_DE,
};
const REPLIES: Record<ForumLang, Record<string, string>> = {
  en: {}, hu: REPLY_HU, de: REPLY_DE,
};

export function translateThread(
  lang: ForumLang,
  source: { title: string; body: string },
): { title: string; body: string } {
  if (lang === 'en') return source;
  const hit = THREADS[lang][source.title];
  if (hit) return hit;
  return source;
}

export function translateReply(lang: ForumLang, body: string): string {
  if (lang === 'en') return body;
  return REPLIES[lang][body] ?? body;
}
