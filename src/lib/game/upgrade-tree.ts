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

export const UPGRADE_SPECS: UpgradeSpec[] = [
  // Era 1 (8)
  { id: 'cooling_fan', era: 1, display_name: 'Better Cooling', cost_usd_cents: 8000,
    effect: '+10% server capacity, less downtime', effect_data: { capacity_pct: 10, downtime_pct: -10 } },
  { id: 'ram_bump', era: 1, display_name: 'RAM Upgrade', cost_usd_cents: 15000,
    effect: '+50% capacity', effect_data: { capacity_pct: 50 } },
  { id: 'better_psu', era: 1, display_name: 'Redundant PSU', cost_usd_cents: 12000,
    effect: '-30% downtime events', effect_data: { downtime_pct: -30 } },
  { id: 'backup_script', era: 1, display_name: 'Daily Backup Script', cost_usd_cents: 5000,
    effect: '-50% data-loss event impact', effect_data: { dataloss_pct: -50 } },
  { id: 'cpanel_license', era: 1, display_name: 'cPanel License', cost_usd_cents: 25000,
    effect: '+20% customer satisfaction', effect_data: { satisfaction_bonus: 20 } },
  { id: 'mod_security', era: 1, display_name: 'mod_security', cost_usd_cents: 10000,
    effect: '-30% security events', effect_data: { security_pct: -30 } },
  { id: 'mod_pagespeed', era: 1, display_name: 'mod_pagespeed', cost_usd_cents: 8000,
    effect: '+15% page-load satisfaction', effect_data: { satisfaction_bonus: 15 } },
  { id: 'cdn_bind', era: 1, display_name: 'CDN Integration (EdgeRunners)', cost_usd_cents: 30000,
    effect: 'unlocks edge-cache, +25% sat', effect_data: { satisfaction_bonus: 25 }, prereq: 'mod_pagespeed' },

  // Era 2 (12)
  { id: 'hardware_raid', era: 2, display_name: 'Hardware RAID', cost_usd_cents: 40000,
    effect: '-60% data-loss', effect_data: { dataloss_pct: -60 }, prereq: 'backup_script' },
  { id: 'ups_battery', era: 2, display_name: 'UPS Battery Backup', cost_usd_cents: 25000,
    effect: '-50% power-event impact', effect_data: { power_pct: -50 } },
  { id: 'multi_uplink', era: 2, display_name: 'Multi-uplink BGP', cost_usd_cents: 80000,
    effect: '-70% network-down events', effect_data: { network_pct: -70 } },
  { id: 'nagios', era: 2, display_name: 'Nagios Monitoring', cost_usd_cents: 30000,
    effect: 'detect events 30% earlier', effect_data: { event_detection_pct: 30 } },
  { id: 'ssh_key_only', era: 2, display_name: 'SSH-key-only auth', cost_usd_cents: 5000,
    effect: '-40% security events', effect_data: { security_pct: -40 } },
  { id: 'auto_failover', era: 2, display_name: 'Automated Failover', cost_usd_cents: 100000,
    effect: '-80% downtime events', effect_data: { downtime_pct: -80 }, prereq: 'multi_uplink' },
  { id: 'ssl_wildcard', era: 2, display_name: 'SSL Wildcard Cert', cost_usd_cents: 20000,
    effect: '+15% satisfaction', effect_data: { satisfaction_bonus: 15 } },
  { id: 'webmin_license', era: 2, display_name: 'Webmin License', cost_usd_cents: 35000,
    effect: '+10% MRR per customer', effect_data: { mrr_pct: 10 }, prereq: 'cpanel_license' },
  { id: 'docker_enabled', era: 2, display_name: 'Containerization (Docker)', cost_usd_cents: 60000,
    effect: 'unlocks container-deploys', effect_data: { capacity_pct: 30 } },
  { id: 'cicd_pipeline', era: 2, display_name: 'CI/CD Pipeline', cost_usd_cents: 50000,
    effect: '-50% deploy-event impact', effect_data: { deploy_pct: -50 }, prereq: 'docker_enabled' },
  { id: 'postgres_addon', era: 2, display_name: 'PostgreSQL Add-on', cost_usd_cents: 40000,
    effect: 'Pro-tier customer unlock, +20% MRR', effect_data: { mrr_pct: 20 } },
  { id: 'cdn_global', era: 2, display_name: 'Global CDN POP', cost_usd_cents: 150000,
    effect: '+30% satisfaction, Era 3 prereq', effect_data: { satisfaction_bonus: 30 }, prereq: 'cdn_bind' },
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
