// src/lib/play/catalog.ts
// Hyperscales — a hardver-katalógus és a fejlesztések (kutatási fa) nevei/leírásai HU/DE nyelven.
// Az EN forrás a src/lib/game/server-types.ts és upgrade-tree.ts — ott marad az egyetlen igazság
// (ár, kapacitás); itt csak a megjelenített szöveg fordítása él. Ismeretlen id → EN szöveg.

import { pt, type PlayLocale, type PlayKey } from './strings';
import { EFFECT_KEYS, type EffectKey } from '../game/upgrade-effects';
import { SERVER_SPECS } from '../game/server-types';
import { UPGRADE_SPECS } from '../game/upgrade-tree';

type Tr = { name: string; text: string };

const SERVERS: Record<'hu' | 'de', Record<string, Tr>> = {
  hu: {
    lamp_box: { name: 'Bézs torony (LAMP)', text: 'Pentium III, 512 MB, a ventilátor hangosabb, mint az ügyfélpanaszok. Becsületes munka.' },
    rack_unit: { name: '1U rack-szerver', text: 'Dupla Xeon, redundáns táp, friss adatközpont-illat.' },
    vps_node: { name: 'VPS-csomópont', text: 'KVM-virtualizált, 32 GB RAM. A gyakornok szerint a VPS „Very Powerful Server”.' },
    dedicated_box: { name: 'Dedikált gép (ügyfelenként)', text: 'Annak a profinak, aki ragaszkodik a vashoz. Akkor is panaszkodni fog.' },
    cloud_region: { name: 'Felhőrégió (később)', text: 'A 3. korszakban nyílik — egy későbbi frissítésben.' },
    edge_pop: { name: 'Edge POP (később)', text: 'A 4. korszakban nyílik — egy későbbi frissítésben.' },
  },
  de: {
    lamp_box: { name: 'Beiger Tower (LAMP)', text: 'Pentium III, 512 MB, der Lüfter ist lauter als die Kundenbeschwerden. Ehrliche Arbeit.' },
    rack_unit: { name: '1U-Rackserver', text: 'Dual-Xeon, redundantes Netzteil, riecht nach frischem Rechenzentrum.' },
    vps_node: { name: 'VPS-Knoten', text: 'KVM-virtualisiert, 32 GB RAM. Der Praktikant hält VPS für „Very Powerful Server“.' },
    dedicated_box: { name: 'Dedizierter Server (pro Kunde)', text: 'Für den Profi, der auf Bare Metal besteht. Er wird trotzdem meckern.' },
    cloud_region: { name: 'Cloud-Region (später)', text: 'Wird in Ära 3 freigeschaltet — in einem späteren Update.' },
    edge_pop: { name: 'Edge-POP (später)', text: 'Wird in Ära 4 freigeschaltet — in einem späteren Update.' },
  },
};

// 2026-11-12 (játékmag): a `text` a fejlesztés „miért"-je (rövid magyarázat). A mérhető hatás feliratát az
// effect_data-ból generáljuk (upgradeEffectLines), így a kártya mindig azt mondja, amit a játék tényleg csinál.
const UPGRADES: Record<'hu' | 'de', Record<string, Tr>> = {
  hu: {
    cooling_fan: { name: 'Jobb hűtés', text: 'A hűvösebb gép egy kicsit több terhelést bír, és ritkábban áll le.' },
    ram_bump: { name: 'RAM-bővítés', text: 'Több RAM minden gépben: több oldal fér egy szerverre, havidíj nélkül.' },
    better_psu: { name: 'Redundáns táp', text: 'Egy második tápegység: az áram- és hűtési incidensek sokszor meg sem történnek.' },
    backup_script: { name: 'Napi mentőszkript', text: 'Éjszakai mentés: egy rossz nap után sem vész el az ügyfél adata, így kevesebben mennek el.' },
    cpanel_license: { name: 'cPanel-licenc', text: 'Az ügyfelek egy panelen maguk intézik a levelezést és a DNS-t, ticket helyett.' },
    mod_security: { name: 'mod_security', text: 'Webes tűzfal: a legtöbb betörési kísérlet elakad.' },
    mod_pagespeed: { name: 'mod_pagespeed', text: 'A gyorsabb oldal jobban rangsorol: a SEO és a hirdetés több ügyfelet hoz.' },
    cdn_bind: { name: 'CDN-integráció (EdgeRunners)', text: 'Edge-gyorsítótár: gyorsabb oldalak, kevesebb „lassú az oldalam" ticket, jobb szájhagyomány.' },
    hardware_raid: { name: 'Hardveres RAID', text: 'Egy kiesett lemez már nem jelent elveszett ügyfelet.' },
    ups_battery: { name: 'Szünetmentes táp (UPS)', text: 'Az akkumulátor átvészeli az áramingadozást és a rövid kimaradást.' },
    multi_uplink: { name: 'Többutas BGP', text: 'Több szolgáltató: egy vonalra érkező DDoS már nem visz le.' },
    nagios: { name: 'Nagios-felügyelet', text: 'Előbb látod a hibát, mint ahogy az ügyfél ír: a műszakban gyorsabban mennek a ticketek.' },
    ssh_key_only: { name: 'Csak SSH-kulcsos belépés', text: 'Nincs kitalálható jelszó: a legtöbb betörés egyszerűen elakad.' },
    auto_failover: { name: 'Automatikus átállás', text: 'Másodpercek alatt átveszi egy tartalék: kevesebb leállás, kevesebb dühös búcsú.' },
    ssl_wildcard: { name: 'Wildcard SSL-tanúsítvány', text: 'Ingyenes HTTPS minden oldalon: eladási érv, több regisztrációt hoz.' },
    webmin_license: { name: 'Webmin-licenc', text: 'Automatizált szerverüzemeltetés: olcsóbb fenntartani, kevesebb beállítási ticket.' },
    docker_enabled: { name: 'Konténerek (Docker)', text: 'Konténerekkel több oldal fér minden gépre.' },
    cicd_pipeline: { name: 'CI/CD-folyamat', text: 'A javítás percek alatt kimegy, a sablonválaszok maguktól készülnek.' },
    postgres_addon: { name: 'PostgreSQL-kiegészítő', text: 'Fizetős adatbázis-kiegészítő, amit sok ügyfél megvesz.' },
    cdn_global: { name: 'Globális CDN-pont', text: 'Mindenhol gyors: több regisztráció világszerte, kevesebb sebesség-ticket.' },
  },
  de: {
    cooling_fan: { name: 'Bessere Kühlung', text: 'Kühlere Maschinen vertragen etwas mehr Last und fallen seltener aus.' },
    ram_bump: { name: 'RAM-Aufrüstung', text: 'Mehr RAM in jedem Server: mehr Seiten pro Maschine, ohne zusätzliche Monatsgebühr.' },
    better_psu: { name: 'Redundantes Netzteil', text: 'Ein zweites Netzteil: Strom- und Kühlungsvorfälle passieren oft gar nicht erst.' },
    backup_script: { name: 'Tägliches Backup-Skript', text: 'Nächtliche Backups: Nach einem schlechten Tag sind die Daten noch da, also gehen weniger Kunden.' },
    cpanel_license: { name: 'cPanel-Lizenz', text: 'Kunden regeln Mail und DNS selbst im Panel, statt ein Ticket zu öffnen.' },
    mod_security: { name: 'mod_security', text: 'Eine Web-Firewall stoppt die meisten Einbruchsversuche.' },
    mod_pagespeed: { name: 'mod_pagespeed', text: 'Schnellere Seiten ranken besser: SEO und Werbung bringen mehr Kunden.' },
    cdn_bind: { name: 'CDN-Integration (EdgeRunners)', text: 'Edge-Cache: schnellere Seiten, weniger „meine Seite ist langsam"-Tickets, bessere Mundpropaganda.' },
    hardware_raid: { name: 'Hardware-RAID', text: 'Eine tote Platte bedeutet keinen verlorenen Kunden mehr.' },
    ups_battery: { name: 'USV-Batterie', text: 'Batterien überbrücken Spannungsspitzen und kurze Ausfälle.' },
    multi_uplink: { name: 'Multi-Uplink-BGP', text: 'Mehrere Upstreams: ein DDoS auf einer Leitung legt dich nicht mehr lahm.' },
    nagios: { name: 'Nagios-Monitoring', text: 'Du siehst das Problem, bevor der Kunde schreibt: Tickets gehen in der Schicht schneller.' },
    ssh_key_only: { name: 'Nur SSH-Schlüssel', text: 'Keine Passwörter zum Erraten: die meisten Einbrüche scheitern einfach.' },
    auto_failover: { name: 'Automatisches Failover', text: 'Ein Standby übernimmt in Sekunden: weniger Ausfälle, weniger wütende Abschiede.' },
    ssl_wildcard: { name: 'Wildcard-SSL-Zertifikat', text: 'Kostenloses HTTPS für jede Seite: ein Verkaufsargument, das mehr Anmeldungen bringt.' },
    webmin_license: { name: 'Webmin-Lizenz', text: 'Automatisierte Serververwaltung: günstiger im Betrieb, weniger Konfigurations-Tickets.' },
    docker_enabled: { name: 'Container (Docker)', text: 'Container packen mehr Seiten auf jede Maschine.' },
    cicd_pipeline: { name: 'CI/CD-Pipeline', text: 'Fixes gehen in Minuten raus, Standardantworten schreiben sich fast selbst.' },
    postgres_addon: { name: 'PostgreSQL-Add-on', text: 'Ein kostenpflichtiges Datenbank-Add-on, das viele Kunden buchen.' },
    cdn_global: { name: 'Globaler CDN-POP', text: 'Überall schnell: mehr Anmeldungen weltweit, weniger Geschwindigkeits-Tickets.' },
  },
};

export function serverName(locale: PlayLocale, type: string, fallback?: string): string {
  if (locale !== 'en') { const t = SERVERS[locale]?.[type]; if (t) return t.name; }
  return (SERVER_SPECS as Record<string, { display_name: string }>)[type]?.display_name ?? fallback ?? type;
}
export function serverFlavor(locale: PlayLocale, type: string): string {
  if (locale !== 'en') { const t = SERVERS[locale]?.[type]; if (t) return t.text; }
  return (SERVER_SPECS as Record<string, { flavor: string }>)[type]?.flavor ?? '';
}
export function upgradeName(locale: PlayLocale, id: string): string {
  if (locale !== 'en') { const t = UPGRADES[locale]?.[id]; if (t) return t.name; }
  return UPGRADE_SPECS.find((u) => u.id === id)?.display_name ?? id;
}
/** A fejlesztés „miért"-je (rövid magyarázat). */
export function upgradeWhy(locale: PlayLocale, id: string): string {
  if (locale !== 'en') { const t = UPGRADES[locale]?.[id]; if (t) return t.text; }
  return UPGRADE_SPECS.find((u) => u.id === id)?.effect ?? '';
}

/** Egy hatás felirata: „−25% ticket", „+3 ticket műszakonként"… */
export function effectLabel(locale: PlayLocale, key: EffectKey, value: number): string {
  const v = key.endsWith('_pct') && value < 0 ? '−' + Math.abs(value) : String(Math.abs(value));
  return pt(locale, (`eff.${key}`) as PlayKey, { v });
}

/** A fejlesztés mérhető hatásai feliratként (az effect_data-ból — ez az egyetlen igazság). */
export function upgradeEffectLines(locale: PlayLocale, id: string): string[] {
  const u = UPGRADE_SPECS.find((x) => x.id === id);
  if (!u) return [];
  return Object.entries(u.effect_data)
    .filter(([k]) => (EFFECT_KEYS as readonly string[]).includes(k))
    .map(([k, v]) => effectLabel(locale, k as EffectKey, v));
}

/** Rövid, egysoros hatás-felirat (a Szerverek lap katalógusához): „−25% ticket · +10% új ügyfél". */
export function upgradeEffect(locale: PlayLocale, id: string): string {
  return upgradeEffectLines(locale, id).join(' · ');
}

/** Tesztekhez: minden server-típus és fejlesztés le van-e fordítva. */
export const CATALOG_TRANSLATIONS = { SERVERS, UPGRADES };
