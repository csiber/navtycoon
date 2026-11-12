// Hyperscales — Upgrade-tree (20 specs: Era 1: 8, Era 2: 12).
// Phase 1 scope. Era 3-4 upgrades come in Phase 2.
//
// Konvenciók:
//  - Pénz INTEGER (USD cents).
//  - effect_data: number-only payload — DB-be JSON-ként mehet, de UI-on tipizált.
//  - prereq: másik upgrade.id — availableUpgrades() szűri ha nincs meg.

import type { EraId } from './types';

export interface UpgradeSpec {
  id: string;
  era: EraId;
  display_name: string;
  cost_usd_cents: number;
  effect: string;
  effect_data: Record<string, number>;
  prereq?: string;
}

// 2026-11-12 (játékmag): minden elem konkrét, mérhető hatást kapott (upgrade-effects.ts köti be a tickbe, a
// műszakba és a kijelzésbe). Régi → új: a régi effect_data-kulcsok (satisfaction_bonus, downtime_pct,
// event_detection_pct, deploy_pct…) semmit nem csináltak; a hatást most az effect_data mondja meg, a felirat
// ebből készül (catalog.ts upgradeEffectLines). Az `effect` mező csak az angol „miért" szöveg.
export const UPGRADE_SPECS: UpgradeSpec[] = [
  // Era 1 (8)
  { id: 'cooling_fan', era: 1, display_name: 'Better Cooling', cost_usd_cents: 8000,
    effect: 'Cooler boxes take a little more load and fail less often.',
    effect_data: { capacity_pct: 10, avoid_hardware: 25 } },
  { id: 'ram_bump', era: 1, display_name: 'RAM Upgrade', cost_usd_cents: 15000,
    effect: 'More RAM in every box: more sites per server, no extra monthly fee.',
    effect_data: { capacity_pct: 50 } },
  { id: 'better_psu', era: 1, display_name: 'Redundant PSU', cost_usd_cents: 12000,
    effect: 'A second power supply: power and cooling incidents often never happen.',
    effect_data: { avoid_hardware: 40 } },
  { id: 'backup_script', era: 1, display_name: 'Daily Backup Script', cost_usd_cents: 5000,
    effect: 'Nightly backups: a bad day no longer costs a customer their data, so fewer of them leave.',
    effect_data: { churn_pct: -15, avoid_dataloss: 50 } },
  { id: 'cpanel_license', era: 1, display_name: 'cPanel License', cost_usd_cents: 25000,
    effect: 'Customers fix their own email and DNS in a panel instead of opening a ticket.',
    effect_data: { ticket_pct: -25 } },
  { id: 'mod_security', era: 1, display_name: 'mod_security', cost_usd_cents: 10000,
    effect: 'A web application firewall stops most break-in attempts.',
    effect_data: { avoid_security: 40 } },
  { id: 'mod_pagespeed', era: 1, display_name: 'mod_pagespeed', cost_usd_cents: 8000,
    effect: 'Faster pages rank better: your SEO and ads bring more customers.',
    effect_data: { acq_pct: 15 } },
  { id: 'cdn_bind', era: 1, display_name: 'CDN Integration (EdgeRunners)', cost_usd_cents: 30000,
    effect: 'Edge cache: faster sites, fewer "my site is slow" tickets, better word of mouth.',
    effect_data: { acq_pct: 20, ticket_pct: -10 }, prereq: 'mod_pagespeed' },

  // Era 2 (12)
  { id: 'hardware_raid', era: 2, display_name: 'Hardware RAID', cost_usd_cents: 40000,
    effect: 'A dead disk is no longer a dead customer.',
    effect_data: { churn_pct: -20, avoid_dataloss: 50 }, prereq: 'backup_script' },
  { id: 'ups_battery', era: 2, display_name: 'UPS Battery Backup', cost_usd_cents: 25000,
    effect: 'Batteries ride out power spikes and short outages.',
    effect_data: { avoid_hardware: 50 } },
  { id: 'multi_uplink', era: 2, display_name: 'Multi-uplink BGP', cost_usd_cents: 80000,
    effect: 'Several upstreams: a DDoS on one line no longer takes you offline.',
    effect_data: { avoid_network: 70 } },
  { id: 'nagios', era: 2, display_name: 'Nagios Monitoring', cost_usd_cents: 30000,
    effect: 'You see the problem before the customer writes: tickets are solved faster in a shift.',
    effect_data: { shift_slots: 3 } },
  { id: 'ssh_key_only', era: 2, display_name: 'SSH-key-only auth', cost_usd_cents: 5000,
    effect: 'No passwords to guess: most break-ins simply fail.',
    effect_data: { avoid_security: 40 } },
  { id: 'auto_failover', era: 2, display_name: 'Automated Failover', cost_usd_cents: 100000,
    effect: 'A standby takes over in seconds: fewer outages, fewer angry goodbyes.',
    effect_data: { avoid_hardware: 30, churn_pct: -10 }, prereq: 'multi_uplink' },
  { id: 'ssl_wildcard', era: 2, display_name: 'SSL Wildcard Cert', cost_usd_cents: 20000,
    effect: 'Free HTTPS on every site: a selling point that brings in more sign-ups.',
    effect_data: { acq_pct: 10 } },
  { id: 'webmin_license', era: 2, display_name: 'Webmin License', cost_usd_cents: 35000,
    effect: 'Automated server administration: cheaper to run, fewer config tickets.',
    effect_data: { fee_pct: -20, ticket_pct: -10 }, prereq: 'cpanel_license' },
  { id: 'docker_enabled', era: 2, display_name: 'Containerization (Docker)', cost_usd_cents: 60000,
    effect: 'Containers pack more sites onto every machine.',
    effect_data: { capacity_pct: 30 } },
  { id: 'cicd_pipeline', era: 2, display_name: 'CI/CD Pipeline', cost_usd_cents: 50000,
    effect: 'Fixes ship in minutes and canned answers draft themselves.',
    effect_data: { shift_slots: 2, ai_calls: 20 }, prereq: 'docker_enabled' },
  { id: 'postgres_addon', era: 2, display_name: 'PostgreSQL Add-on', cost_usd_cents: 40000,
    effect: 'A paid database add-on that many customers take.',
    effect_data: { mrr_pct: 10 } },
  { id: 'cdn_global', era: 2, display_name: 'Global CDN POP', cost_usd_cents: 150000,
    effect: 'Fast everywhere: more sign-ups worldwide, fewer speed tickets.',
    effect_data: { acq_pct: 25, ticket_pct: -10 }, prereq: 'cdn_bind' },
];

export function availableUpgrades(currentEra: EraId, ownedIds: Set<string>): UpgradeSpec[] {
  return UPGRADE_SPECS.filter(u =>
    u.era <= currentEra
    && !ownedIds.has(u.id)
    && (!u.prereq || ownedIds.has(u.prereq))
  );
}

export function getUpgradeById(id: string): UpgradeSpec | undefined {
  return UPGRADE_SPECS.find(u => u.id === id);
}
