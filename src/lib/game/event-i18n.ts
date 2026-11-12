// Hyperscales — véletlen események (event-options.ts) fordításai.
// Az angol szöveg az event-options.ts-ben marad (tartalék); itt csak hu + de van.
// Kulcsok: `${event}.title`, `${event}.narrative`, `${event}.${option}.label|desc|msg`.
// Hiányzó kulcs -> angol, soha nem dob hibát.

import type { EventDefinition } from './event-options';

type Loc = 'en' | 'hu' | 'de';

const HU: Record<string, string> = {
  'ddos_attempt.title': '🚨 DDoS-támadás érkezik',
  'ddos_attempt.narrative':
    'Valami szkriptkiddie 500 ezer kérés/mp-cel döngeti a peremhálózatodat. A szervereid izzadnak.',
  'ddos_attempt.mitigate_paid.label': 'Fizess $300-t Cloudflare-védelemért',
  'ddos_attempt.mitigate_paid.desc': 'Gyors, drága, és a gond egyszerűen eltűnik.',
  'ddos_attempt.mitigate_paid.msg': 'Elhárítva. Az ügyfelek semmit sem vettek észre.',
  'ddos_attempt.tough_it_out.label': 'Húzd ki valahogy',
  'ddos_attempt.tough_it_out.desc': 'Ingyen van, de mindenki érzi a lassulást.',
  'ddos_attempt.tough_it_out.msg': '47%-os csomagvesztés két órán át. Az ügyfelek tajtékoznak.',
  'ddos_attempt.call_the_isp.label': 'Hívd fel az ISP-t',
  'ddos_attempt.call_the_isp.desc': 'Olcsó, lassú, félmegoldás.',
  'ddos_attempt.call_the_isp.msg': 'Az ISP 40 perc után szűrni kezdett. Pár ártatlan is bánta.',

  'viral_blog.title': '🔥 Az egyik ügyfeled a HN címlapjára került',
  'viral_blog.narrative':
    'Az egyik ügyfeled kis mellékprojektje épp a Hacker News első helyére ugrott. A forgalom 3000%-kal nőtt.',
  'viral_blog.autoscale.label': 'Automatikus skálázás ($150)',
  'viral_blog.autoscale.desc': 'Indíts extra kapacitást, és lovagold meg a hullámot.',
  'viral_blog.autoscale.msg':
    'Meglovagoltad a csúcsot. Az ügyfél imád. +5 elégedettség mindenkinél.',
  'viral_blog.rate_limit.label': 'Korlátozd az ügyfél sávszélességét',
  'viral_blog.rate_limit.desc': 'Olcsó, de ez az ügyfél ki nem állhat majd.',
  'viral_blog.rate_limit.msg': 'Az ügyfél nyilvánosan kiposztolt a Twitteren. Márkasérülés.',

  'electricity_spike.title': '⚡ Az áramszámla az egekben',
  'electricity_spike.narrative':
    'Megjött az áramszámla: 40%-kal a szokásos fölött. A klíma egész nap pörgött a hőhullámban.',
  'electricity_spike.pay_in_full.label': 'Fizess $500-t',
  'electricity_spike.pay_in_full.desc': 'Csak fizesd ki, és lépj tovább.',
  'electricity_spike.pay_in_full.msg': 'Kifizetve. Fájt, de túl vagyunk rajta.',
  'electricity_spike.negotiate.label': 'Alkudj részletfizetésre',
  'electricity_spike.negotiate.desc': 'Oszd el 3 hónapra. Kis renoméveszteség jár vele.',
  'electricity_spike.negotiate.msg': 'Most a 60%-át kifizetted. A szolgáltató savanyú képet vágott.',

  'recruit_ad.title': '👥 Toborzási lehetőség',
  'recruit_ad.narrative':
    'Egy tehetséges rendszergazda írt LinkedInen. Havi $400-t kér, de felgyorsítaná a hibaelhárítást.',
  'recruit_ad.hire.label': 'Vedd fel ($400 belépési bónusz egyszeri összegben)',
  'recruit_ad.hire.desc': 'Gyorsabb hibaelhárítás: +2 hírnév, +2 elégedettség minden ügyfélnél.',
  'recruit_ad.hire.msg': 'Hétfőn kezdett. Már egyszer megmentette a bőrödet.',
  'recruit_ad.pass.label': 'Hagyd ki',
  'recruit_ad.pass.desc': 'Nem kerül semmibe.',
  'recruit_ad.pass.msg': 'A konkurenciához szegődött.',

  'intern_incident.title': '💥 Gyakornoki baki',
  'intern_incident.narrative':
    'A gyakornokod lefuttatta az `rm -rf /` parancsot egy ügyfél adatbázisán. Azt hitte, teszt környezet.',
  'intern_incident.restore_from_backup.label': 'Visszaállítás mentésből ($200 + 4 óra kiesés)',
  'intern_incident.restore_from_backup.desc': 'Ennél jobbat nem tehetsz.',
  'intern_incident.restore_from_backup.msg': 'Visszaállítva, de az ügyfél észrevette.',
  'intern_incident.firing_pizza.label': 'Rúgd ki a gyakornokot, a pizzát számold el költségnek',
  'intern_incident.firing_pizza.desc':
    'Visszaállítani nem lehet (a mentések nem sikerültek). Tiszta kárelhárítás.',
  'intern_incident.firing_pizza.msg': 'Az adatok odavesztek. Az ügyfél egycsillagos értékelést hagyott.',

  'dmca.title': '⚖️ DMCA-eltávolítási felszólítás',
  'dmca.narrative': 'Az egyik ügyfeled jogvédett anyagot tárol. Megjött az ügyvédi levél.',
  'dmca.remove_content.label': 'Töröld a tartalmat és értesítsd az ügyfelet',
  'dmca.remove_content.desc': 'Eleget teszel a kérésnek, és elveszítesz egy ügyfelet.',
  'dmca.remove_content.msg': 'Teljesítetted. Az ügyfél sértődötten távozott.',
  'dmca.fight_it.label': 'Harcolj ellene ($800 ügyvédi díj)',
  'dmca.fight_it.desc': 'Szerinted ez még belefér a méltányos felhasználásba.',
  'dmca.fight_it.msg': 'Elvesztetted a pert. Most ügyvédi számláid VAN, ügyfeled viszont NINCS.',

  'cooling_failure.title': '🌡️ Kiesett az adatközpont hűtése',
  'cooling_failure.narrative': 'Megdöglött a klíma. Szökik a hőmérséklet, a szerverek visszafogják magukat.',
  'cooling_failure.emergency_repair.label': 'Sürgősségi javítás ($600)',
  'cooling_failure.emergency_repair.desc': 'A leggyorsabb megoldás.',
  'cooling_failure.emergency_repair.msg': '90 perc alatt megjavítva. Rövid lassulás volt.',
  'cooling_failure.portable_units.label': 'Hordozható klímák a barkácsboltból',
  'cooling_failure.portable_units.desc': 'Olcsóbb, de egy hétig gyengébb teljesítménnyel jár.',
  'cooling_failure.portable_units.msg': 'Az ügyfelek észrevették. Majd helyreáll.',

  'compliance_audit.title': '📋 SOC 2 audit kérés',
  'compliance_audit.narrative':
    'Egy leendő nagyvállalati ügyfél megkérdezi: „Van SOC 2 Type II tanúsítványotok?" Ez az üzlet megváltoztathatja az évet. Vagy tönkreteheti a negyedévet.',
  'compliance_audit.hire_auditor.label': 'Béreljünk Big 4 auditort ($1,200)',
  'compliance_audit.hire_auditor.desc':
    'Drága, de valódi. 6 hét papírmunka. Megnyitja a nagyvállalati csomagot.',
  'compliance_audit.hire_auditor.msg':
    'Átmentél. Az ügyfél aláírt egy $4k/hó szerződést. Terjed a híred.',
  'compliance_audit.diy_evidence.label': 'Házi bizonyítékcsomag ($200)',
  'compliance_audit.diy_evidence.desc':
    'Olcsó, időigényes, és az ügyfelet talán kielégíti, talán nem.',
  'compliance_audit.diy_evidence.msg':
    'Az ügyfél szerint „egyelőre megteszi". Egy kisebb üzletet kötöttél.',
  'compliance_audit.decline_audit.label': 'Mondd meg nekik, hogy SOC 2-vel nem foglalkozol',
  'compliance_audit.decline_audit.desc': 'Ingyen van. Az ügyfél lelép, más érdeklődők is követhetik.',
  'compliance_audit.decline_audit.msg':
    'Kitweetelték. Ugyanazon a héten még két érdeklődő szó nélkül eltűnt.',

  'competitor_buyout.title': '💼 Felvásárlási ajánlat az asztalon',
  'competitor_buyout.narrative':
    'A BigCloudCo fel akar vásárolni. Alacsony, de valódi pénz. Az ügyfeleid átköltöznének, az alapítói korszakodnak vége.',
  'competitor_buyout.take_the_money.label': 'Add el $6,000-ért',
  'competitor_buyout.take_the_money.desc':
    'Pénz a zsebbe, a játék megy tovább. A renoméd romlik (eladtad magad).',
  'competitor_buyout.take_the_money.msg':
    'Eladtad. A pénz a bankban. Devon tiltakozásul leiratkozott.',
  'competitor_buyout.counter_offer.label': 'Ellenajánlat $80k-ért',
  'competitor_buyout.counter_offer.desc': 'Fej vagy írás: vagy fizetnek, vagy lelépnek.',
  'competitor_buyout.counter_offer.msg': 'Az ellenajánlat elment, a tárgyalás lezárult.',
  'competitor_buyout.reject.label': 'Utasítsd vissza udvariasan',
  'competitor_buyout.reject.desc': 'Független alapító vibe. Az ügyfelek imádják.',
  'competitor_buyout.reject.msg':
    'Kiszivárgott a hír. Három Twitter-szál, mind pozitív. A próbaregisztrációk +18% a héten.',

  'staff_drama.title': '🎭 Személyzeti dráma: az SRE-d fenyegetőzik, hogy felmond',
  'staff_drama.narrative':
    'Lin fel-alá járkál a Slack privátüzenetekben. Három ügyeleti riasztás ezen a héten. Emelést VAGY szabad péntekeket akar, különben lelép.',
  'staff_drama.give_raise.label': 'Add meg az emelést (-$800)',
  'staff_drama.give_raise.desc': 'Marad. A kassza apad. A többi dolgozó is meghallja.',
  'staff_drama.give_raise.msg': 'Lin marad. Devon is észrevette, és ő is emelésről kérdezősködik.',
  'staff_drama.fridays_off.label': 'Szabad péntekek (ingyen)',
  'staff_drama.fridays_off.desc': 'Nincs plusz költség, de a pénteki ügyelet innentől te vagy.',
  'staff_drama.fridays_off.msg':
    'Lin hálás. A pénteki riasztásokat személyesen kezeled. Nyugodjanak békében a hétvégéid.',
  'staff_drama.let_her_walk.label': 'Kívánj neki sok sikert',
  'staff_drama.let_her_walk.desc':
    'Újra egyedül üzemeltetsz. Az új embereknek kb. 4 hét kell, mire beletanulnak.',
  'staff_drama.let_her_walk.msg':
    'Lin elment. 48 órán belül két P1-es hiba. Az ügyfelek hangulata megsínylette.',

  'security_breach.title': '🔓 Gyanús biztonsági behatolás',
  'security_breach.narrative':
    'A naplók szokatlan bejelentkezési kísérleteket mutatnak. Lehet igazi támadás, lehet egy szkriptkiddie.',
  'security_breach.full_audit.label': 'Teljes biztonsági audit ($500)',
  'security_breach.full_audit.desc': 'Alapos, drága, de megnyugtató.',
  'security_breach.full_audit.msg': 'Nem találtak behatolást. Az átláthatóságtól nőtt a renoméd.',
  'security_breach.monitor.label': 'Csak figyeld',
  'security_breach.monitor.desc': 'Ingyen van, de kockázatos.',
  'security_breach.monitor.msg': 'BEJUTOTTAK. Két ügyféladatbázis kiszivárgott. PR-katasztrófa.',
};

const DE: Record<string, string> = {
  'ddos_attempt.title': '🚨 DDoS-Angriff im Anmarsch',
  'ddos_attempt.narrative':
    'Irgendein Script-Kiddie bombardiert deinen Edge mit 500k Anfragen pro Sekunde. Deine Server kommen ins Schwitzen.',
  'ddos_attempt.mitigate_paid.label': 'Zahle $300 für Cloudflare-Schutz',
  'ddos_attempt.mitigate_paid.desc': 'Schnell, teuer, und das Problem löst sich in Luft auf.',
  'ddos_attempt.mitigate_paid.msg': 'Abgewehrt. Die Kunden haben nichts gemerkt.',
  'ddos_attempt.tough_it_out.label': 'Augen zu und durch',
  'ddos_attempt.tough_it_out.desc': 'Kostet nichts, aber jeder merkt die Verlangsamung.',
  'ddos_attempt.tough_it_out.msg': '47 % Paketverlust über 2 Stunden. Die Kunden sind außer sich.',
  'ddos_attempt.call_the_isp.label': 'Ruf den ISP an',
  'ddos_attempt.call_the_isp.desc': 'Billig, langsam, eine halbe Lösung.',
  'ddos_attempt.call_the_isp.msg': 'Der ISP hat nach 40 Minuten gefiltert. Ein paar Unbeteiligte hat es auch erwischt.',

  'viral_blog.title': '🔥 Ein Kunde ist auf der HN-Startseite',
  'viral_blog.narrative':
    'Das Nebenprojekt eines deiner Kunden steht plötzlich auf Platz 1 bei Hacker News. Der Traffic ist um 3000 % gestiegen.',
  'viral_blog.autoscale.label': 'Autoscaling ($150)',
  'viral_blog.autoscale.desc': 'Zusätzliche Kapazität hochfahren und die Welle reiten.',
  'viral_blog.autoscale.msg':
    'Du hast die Spitze gemeistert. Der Kunde liebt dich. +5 Zufriedenheit bei allen.',
  'viral_blog.rate_limit.label': 'Drossle den Kunden per Rate-Limit',
  'viral_blog.rate_limit.desc': 'Billig, aber genau dieser Kunde wird dich hassen.',
  'viral_blog.rate_limit.msg': 'Der Kunde hat dich öffentlich auf Twitter angeprangert. Imageschaden.',

  'electricity_spike.title': '⚡ Stromrechnung explodiert',
  'electricity_spike.narrative':
    'Die Stromrechnung ist da: 40 % über dem Normalwert. Die Klimaanlage lief während der Hitzewelle rund um die Uhr.',
  'electricity_spike.pay_in_full.label': 'Zahle $500',
  'electricity_spike.pay_in_full.desc': 'Einfach zahlen und weitermachen.',
  'electricity_spike.pay_in_full.msg': 'Bezahlt. Schmerzhaft, aber erledigt.',
  'electricity_spike.negotiate.label': 'Verhandle einen Zahlungsplan',
  'electricity_spike.negotiate.desc': 'Auf 3 Monate verteilt. Kleiner Rufschaden.',
  'electricity_spike.negotiate.msg': '60 % davon jetzt ausgehandelt. Der Versorger hat die Stirn gerunzelt.',

  'recruit_ad.title': '👥 Gelegenheit zur Einstellung',
  'recruit_ad.narrative':
    'Ein talentierter Sysadmin hat dir bei LinkedIn geschrieben. Er will $400 im Monat, würde aber die Störungsbehebung beschleunigen.',
  'recruit_ad.hire.label': 'Einstellen ($400 einmaliger Begrüßungsbonus)',
  'recruit_ad.hire.desc': 'Schnellere Störungsbehebung: +2 Ruf, +2 Zufriedenheit bei allen Kunden.',
  'recruit_ad.hire.msg': 'Er hat am Montag angefangen und dir schon einmal den Hals gerettet.',
  'recruit_ad.pass.label': 'Verzichten',
  'recruit_ad.pass.desc': 'Kostet nichts.',
  'recruit_ad.pass.msg': 'Er ist zur Konkurrenz gegangen.',

  'intern_incident.title': '💥 Praktikanten-Panne',
  'intern_incident.narrative':
    'Dein Praktikant hat `rm -rf /` auf der Datenbank eines Kunden ausgeführt. Er dachte, es sei eine Testumgebung.',
  'intern_incident.restore_from_backup.label': 'Aus dem Backup wiederherstellen ($200 + 4 Std. Ausfall)',
  'intern_incident.restore_from_backup.desc': 'Mehr kannst du nicht tun.',
  'intern_incident.restore_from_backup.msg': 'Wiederhergestellt, aber der Kunde hat es bemerkt.',
  'intern_incident.firing_pizza.label': 'Praktikant feuern, Pizza als Spesen abrechnen',
  'intern_incident.firing_pizza.desc':
    'Keine Wiederherstellung möglich (die Backups sind fehlgeschlagen). Reine Schadensbegrenzung.',
  'intern_incident.firing_pizza.msg': 'Daten verloren. Der Kunde hat eine 1-Sterne-Bewertung hinterlassen.',

  'dmca.title': '⚖️ DMCA-Takedown-Aufforderung',
  'dmca.narrative': 'Ein Kunde hostet urheberrechtlich geschütztes Material. Ein Anwaltsschreiben ist eingetroffen.',
  'dmca.remove_content.label': 'Inhalt entfernen und Kunden benachrichtigen',
  'dmca.remove_content.desc': 'Du kommst der Aufforderung nach und verlierst einen Kunden.',
  'dmca.remove_content.msg': 'Erledigt. Der Kunde ist beleidigt abgezogen.',
  'dmca.fight_it.label': 'Dagegen vorgehen ($800 Anwaltskosten)',
  'dmca.fight_it.desc': 'Du glaubst, das könnte noch unter Fair Use fallen.',
  'dmca.fight_it.msg': 'Prozess verloren. Jetzt hast du Anwaltsrechnungen UND keinen Kunden mehr.',

  'cooling_failure.title': '🌡️ Kühlung im Rechenzentrum ausgefallen',
  'cooling_failure.narrative': 'Die Klimaanlage ist tot. Die Temperaturen steigen, die Server drosseln.',
  'cooling_failure.emergency_repair.label': 'Notreparatur ($600)',
  'cooling_failure.emergency_repair.desc': 'Die schnellste Lösung.',
  'cooling_failure.emergency_repair.msg': 'In 90 Minuten repariert. Kurze Verlangsamung.',
  'cooling_failure.portable_units.label': 'Mobile Klimageräte aus dem Baumarkt',
  'cooling_failure.portable_units.desc': 'Günstiger, aber eine Woche lang schlechtere Leistung.',
  'cooling_failure.portable_units.msg': 'Die Kunden haben es gemerkt. Das gibt sich wieder.',

  'compliance_audit.title': '📋 SOC-2-Audit-Anfrage',
  'compliance_audit.narrative':
    'Ein potenzieller Enterprise-Kunde fragt: „Habt ihr SOC 2 Type II?" Dieser Deal kann das Jahr drehen. Oder das Quartal ruinieren.',
  'compliance_audit.hire_auditor.label': 'Einen Big-4-Auditor engagieren ($1,200)',
  'compliance_audit.hire_auditor.desc':
    'Teuer, aber echt. 6 Wochen Papierkram. Schaltet den Enterprise-Tarif frei.',
  'compliance_audit.hire_auditor.msg':
    'Bestanden. Der Kunde hat einen Vertrag über $4k/Monat unterschrieben. Es spricht sich herum.',
  'compliance_audit.diy_evidence.label': 'Nachweispaket in Eigenregie ($200)',
  'compliance_audit.diy_evidence.desc':
    'Billig, zeitaufwendig, und der Kunde ist vielleicht zufrieden, vielleicht nicht.',
  'compliance_audit.diy_evidence.msg':
    'Der Kunde meinte „fürs Erste gut genug". Du hast einen kleineren Deal an Land gezogen.',
  'compliance_audit.decline_audit.label': 'Sag ihnen, dass du kein SOC 2 machst',
  'compliance_audit.decline_audit.desc': 'Kostenlos. Der Kunde geht. Andere Interessenten könnten folgen.',
  'compliance_audit.decline_audit.msg':
    'Sie haben darüber getwittert. In derselben Woche haben dich zwei weitere Interessenten geghostet.',

  'competitor_buyout.title': '💼 Übernahmeangebot auf dem Tisch',
  'competitor_buyout.narrative':
    'BigCloudCo will dich kaufen. Ein Kampfpreis, aber echtes Geld. Deine Kunden würden migriert. Dein Gründer-Modus wäre vorbei.',
  'competitor_buyout.take_the_money.label': 'Für $6,000 verkaufen',
  'competitor_buyout.take_the_money.desc':
    'Geld aufs Konto, das Spiel geht weiter. Der Ruf leidet (Ausverkauf).',
  'competitor_buyout.take_the_money.msg':
    'Verkauft. Das Geld ist auf der Bank. Devon hat aus Protest gekündigt.',
  'competitor_buyout.counter_offer.label': 'Gegenangebot über $80k',
  'competitor_buyout.counter_offer.desc': 'Münzwurf: Entweder sie zahlen oder sie springen ab.',
  'competitor_buyout.counter_offer.msg': 'Das Gegenangebot ist raus, die Verhandlung ist beendet.',
  'competitor_buyout.reject.label': 'Höflich ablehnen',
  'competitor_buyout.reject.desc': 'Indie-Gründer-Vibes. Die Kunden lieben es.',
  'competitor_buyout.reject.msg':
    'Es hat sich herumgesprochen. Drei Twitter-Threads, alle positiv. Testanmeldungen +18 % diese Woche.',

  'staff_drama.title': '🎭 Personaldrama: Dein SRE droht mit Kündigung',
  'staff_drama.narrative':
    'Lin tigert durch deine Slack-DMs. Drei Bereitschafts-Alarme diese Woche. Sie will eine Gehaltserhöhung ODER freie Freitage, sonst geht sie.',
  'staff_drama.give_raise.label': 'Gehaltserhöhung geben (-$800)',
  'staff_drama.give_raise.desc': 'Sie bleibt. Die Kasse blutet. Das andere Personal erfährt davon.',
  'staff_drama.give_raise.msg': 'Lin bleibt. Devon hat es mitbekommen und fragt jetzt auch nach mehr Gehalt.',
  'staff_drama.fridays_off.label': 'Freitage frei (kostenlos)',
  'staff_drama.fridays_off.desc': 'Keine Extrakosten, aber die Freitagsbereitschaft bist ab jetzt du.',
  'staff_drama.fridays_off.msg':
    'Lin ist dankbar. Die Freitags-Alarme übernimmst du persönlich. Ruhe in Frieden, Wochenende.',
  'staff_drama.let_her_walk.label': 'Viel Glück wünschen',
  'staff_drama.let_her_walk.desc':
    'Du bist wieder allein im Betrieb. Neue Leute brauchen etwa 4 Wochen zum Einarbeiten.',
  'staff_drama.let_her_walk.msg':
    'Lin ist gegangen. Zwei P1-Störungen innerhalb von 48 Std. Die Stimmung der Kunden hat gelitten.',

  'security_breach.title': '🔓 Verdacht auf Sicherheitsvorfall',
  'security_breach.narrative':
    'Die Logs zeigen ungewöhnliche Anmeldeversuche. Das kann ein echter Angriff sein oder nur ein Script-Kiddie.',
  'security_breach.full_audit.label': 'Vollständiges Security-Audit ($500)',
  'security_breach.full_audit.desc': 'Gründlich, teuer, aber beruhigend.',
  'security_breach.full_audit.msg': 'Kein Einbruch gefunden. Die Transparenz hat deinen Ruf gestärkt.',
  'security_breach.monitor.label': 'Nur beobachten',
  'security_breach.monitor.desc': 'Kostenlos, aber riskant.',
  'security_breach.monitor.msg': 'Sie sind TATSÄCHLICH eingedrungen. Zwei Kundendatenbanken geleakt. PR-Desaster.',
};

// A competitor_buyout.counter_offer kimenetét a játéklogika dobja (win/lose),
// ezért itt két üzenetvariáns van; az angol szöveg alapján választunk.
const OUTCOME_HU: Record<string, string> = {
  'They paid $80k. Holy crap. The runway is real now.':
    'Kifizettek $80k-t. Atyaúristen. Most már tényleg van tartalék.',
  'They walked. Indie cred intact, but the deal is dead.':
    'Továbbálltak. A független hírneved sértetlen, de az üzlet halott.',
};
const OUTCOME_DE: Record<string, string> = {
  'They paid $80k. Holy crap. The runway is real now.':
    'Sie haben $80k bezahlt. Wahnsinn. Jetzt ist die Runway wirklich da.',
  'They walked. Indie cred intact, but the deal is dead.':
    'Sie sind abgesprungen. Indie-Credibility intakt, aber der Deal ist tot.',
};

function dict(locale: Loc): Record<string, string> | null {
  return locale === 'hu' ? HU : locale === 'de' ? DE : null;
}

function tr(locale: Loc, key: string, fallback: string): string {
  const d = dict(locale);
  const v = d ? d[key] : undefined;
  return v && v.length > 0 ? v : fallback;
}

export function localizeEvent(
  def: EventDefinition,
  locale: Loc,
): { title: string; narrative: string; options: { id: string; label: string; description: string }[] } {
  const e = def.event_type;
  return {
    title: tr(locale, `${e}.title`, def.title),
    narrative: tr(locale, `${e}.narrative`, def.narrative),
    options: def.options.map((o) => ({
      id: o.id,
      label: tr(locale, `${e}.${o.id}.label`, o.label),
      description: tr(locale, `${e}.${o.id}.desc`, o.description),
    })),
  };
}

export function localizeEventMessage(
  eventType: string,
  optionId: string,
  locale: Loc,
  fallback: string,
): string {
  const outcomes = locale === 'hu' ? OUTCOME_HU : locale === 'de' ? OUTCOME_DE : null;
  if (outcomes && outcomes[fallback]) return outcomes[fallback];
  return tr(locale, `${eventType}.${optionId}.msg`, fallback);
}
