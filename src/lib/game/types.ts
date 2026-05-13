// Hyperscaler — DB-row típusok per tábla.
// Forrás: /home/aika/navtycoon/migrations/0001_initial_schema.sql
//
// Konvenciók:
//  - Pénz INTEGER (USD cents).
//  - Időbélyeg: epoch-seconds (Math.floor(Date.now()/1000)).
//  - Boolean-mezők: 0|1 (SQLite konvenció).
//  - Cross-brand SSO: user_id TEXT — egyezik a PromNET shared users.id-vel.

export type EraId = 1 | 2 | 3 | 4;

export type PlanTier = 'hobby' | 'business' | 'vps' | 'dedicated';

export type PersonaArchetype =
  | 'karen'
  | 'newbie'
  | 'pro'
  | 'cheapskate'
  | 'ghost'
  | 'loyalist'
  | 'drama'
  | 'crypto';

export type ServerType =
  | 'lamp_box'
  | 'rack_unit'
  | 'vps_node'
  | 'dedicated_box'
  | 'cloud_region'
  | 'edge_pop';

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'churned';

export type EventType =
  | 'ddos_attempt'
  | 'viral_blog'
  | 'electricity_spike'
  | 'recruit_ad'
  | 'intern_incident'
  | 'dmca'
  | 'cooling_failure'
  | 'security_breach'
  | 'era_unlock';

export type EventOutcome = 'positive' | 'neutral' | 'negative';

export interface Player {
  user_id: string;
  company_name: string;
  city: string | null;
  founded_at: number;
  current_era: EraId;
  reputation: number;
  cash_usd_cents: number;
  mrr_usd_cents: number;
  pricing_hobby_cents: number;
  pricing_business_cents: number;
  marketing_seo_pct: number;
  marketing_ppc_pct: number;
  marketing_referral_pct: number;
  free_shifts_today: number;
  paid_shifts_today: number;
  is_pro: 0 | 1;
  pro_until: number | null;
  last_active_at: number;
  created_at: number;
  onboarding_completed_at?: number | null;
}

export interface Customer {
  id: number;
  player_id: string;
  name: string;
  persona_archetype: PersonaArchetype;
  plan_tier: PlanTier;
  joined_at: number;
  satisfaction: number;
  churn_risk: number;
  lifetime_value_cents: number;
  last_ticket_at: number | null;
  is_active: 0 | 1;
}

export interface Ticket {
  id: number;
  customer_id: number;
  player_id: string;
  summary: string;
  full_text: string;
  status: TicketStatus;
  resolution: string | null;
  ai_quality_rating: number | null;
  satisfaction_delta: number | null;
  embedding_id: string | null;
  created_at: number;
  resolved_at: number | null;
}

export interface Server {
  id: number;
  player_id: string;
  era: EraId;
  type: ServerType;
  capacity: number;
  current_load: number;
  monthly_cost_cents: number;
  upgrades_json: string;
  purchased_at: number;
}

export interface UpgradeRow {
  player_id: string;
  upgrade_id: string;
  purchased_at: number;
}

export interface GameEvent {
  id: number;
  player_id: string;
  event_type: EventType;
  data_json: string | null;
  spawned_at: number;
  resolved_at: number | null;
  outcome: EventOutcome | null;
}
