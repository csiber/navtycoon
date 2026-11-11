// src/lib/play/catalog.ts
// Hyperscales — a hardver-katalógus és a fejlesztések (kutatási fa) nevei/leírásai HU/DE nyelven.
// Az EN forrás a src/lib/game/server-types.ts és upgrade-tree.ts — ott marad az egyetlen igazság
// (ár, kapacitás); itt csak a megjelenített szöveg fordítása él. Ismeretlen id → EN szöveg.

import type { PlayLocale } from './strings';
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

const UPGRADES: Record<'hu' | 'de', Record<string, Tr>> = {
  hu: {
    cooling_fan: { name: 'Jobb hűtés', text: '+10% szerverkapacitás, kevesebb leállás' },
    ram_bump: { name: 'RAM-bővítés', text: '+50% kapacitás' },
    better_psu: { name: 'Redundáns táp', text: '−30% leállási esemény' },
    backup_script: { name: 'Napi mentőszkript', text: '−50% adatvesztési kár' },
    cpanel_license: { name: 'cPanel-licenc', text: '+20% ügyfél-elégedettség' },
    mod_security: { name: 'mod_security', text: '−30% biztonsági esemény' },
    mod_pagespeed: { name: 'mod_pagespeed', text: '+15% elégedettség a gyorsabb oldalbetöltésért' },
    cdn_bind: { name: 'CDN-integráció (EdgeRunners)', text: 'edge-gyorsítótár, +25% elégedettség' },
    hardware_raid: { name: 'Hardveres RAID', text: '−60% adatvesztés' },
    ups_battery: { name: 'Szünetmentes táp (UPS)', text: '−50% áramszünet-kár' },
    multi_uplink: { name: 'Többutas BGP', text: '−70% hálózati kiesés' },
    nagios: { name: 'Nagios-felügyelet', text: '30%-kal korábban észleli az eseményeket' },
    ssh_key_only: { name: 'Csak SSH-kulcsos belépés', text: '−40% biztonsági esemény' },
    auto_failover: { name: 'Automatikus átállás', text: '−80% leállási esemény' },
    ssl_wildcard: { name: 'Wildcard SSL-tanúsítvány', text: '+15% elégedettség' },
    webmin_license: { name: 'Webmin-licenc', text: '+10% MRR ügyfelenként' },
    docker_enabled: { name: 'Konténerek (Docker)', text: 'konténeres telepítés, +30% kapacitás' },
    cicd_pipeline: { name: 'CI/CD-folyamat', text: '−50% telepítési hiba-kár' },
    postgres_addon: { name: 'PostgreSQL-kiegészítő', text: 'profi ügyfelek, +20% MRR' },
    cdn_global: { name: 'Globális CDN-pont', text: '+30% elégedettség' },
  },
  de: {
    cooling_fan: { name: 'Bessere Kühlung', text: '+10 % Serverkapazität, weniger Ausfälle' },
    ram_bump: { name: 'RAM-Aufrüstung', text: '+50 % Kapazität' },
    better_psu: { name: 'Redundantes Netzteil', text: '−30 % Ausfallereignisse' },
    backup_script: { name: 'Tägliches Backup-Skript', text: '−50 % Schaden bei Datenverlust' },
    cpanel_license: { name: 'cPanel-Lizenz', text: '+20 % Kundenzufriedenheit' },
    mod_security: { name: 'mod_security', text: '−30 % Sicherheitsvorfälle' },
    mod_pagespeed: { name: 'mod_pagespeed', text: '+15 % Zufriedenheit durch schnellere Seiten' },
    cdn_bind: { name: 'CDN-Integration (EdgeRunners)', text: 'Edge-Cache, +25 % Zufriedenheit' },
    hardware_raid: { name: 'Hardware-RAID', text: '−60 % Datenverlust' },
    ups_battery: { name: 'USV-Batterie', text: '−50 % Schaden bei Stromausfall' },
    multi_uplink: { name: 'Multi-Uplink-BGP', text: '−70 % Netzwerkausfälle' },
    nagios: { name: 'Nagios-Monitoring', text: 'erkennt Vorfälle 30 % früher' },
    ssh_key_only: { name: 'Nur SSH-Schlüssel', text: '−40 % Sicherheitsvorfälle' },
    auto_failover: { name: 'Automatisches Failover', text: '−80 % Ausfallereignisse' },
    ssl_wildcard: { name: 'Wildcard-SSL-Zertifikat', text: '+15 % Zufriedenheit' },
    webmin_license: { name: 'Webmin-Lizenz', text: '+10 % MRR pro Kunde' },
    docker_enabled: { name: 'Container (Docker)', text: 'Container-Deployments, +30 % Kapazität' },
    cicd_pipeline: { name: 'CI/CD-Pipeline', text: '−50 % Schaden durch Deploy-Fehler' },
    postgres_addon: { name: 'PostgreSQL-Add-on', text: 'Profi-Kunden, +20 % MRR' },
    cdn_global: { name: 'Globaler CDN-POP', text: '+30 % Zufriedenheit' },
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
export function upgradeEffect(locale: PlayLocale, id: string): string {
  if (locale !== 'en') { const t = UPGRADES[locale]?.[id]; if (t) return t.text; }
  return UPGRADE_SPECS.find((u) => u.id === id)?.effect ?? '';
}

/** Tesztekhez: minden server-típus és fejlesztés le van-e fordítva. */
export const CATALOG_TRANSLATIONS = { SERVERS, UPGRADES };
