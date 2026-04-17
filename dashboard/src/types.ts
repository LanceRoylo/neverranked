/**
 * Dashboard — Type definitions
 */

export interface Env {
  DB: D1Database;
  LEADS: KVNamespace;
  AGENCY_ASSETS: R2Bucket;
  ADMIN_SECRET: string;
  ADMIN_EMAIL: string;
  RESEND_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_AGENCY_SIGNAL_PRICE_ID?: string;
  STRIPE_AGENCY_AMPLIFY_PRICE_ID?: string;
  STRIPE_AGENCY_INTRO_COUPON_ID?: string;
  DASHBOARD_ORIGIN?: string;
  PERPLEXITY_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

export interface GscToken {
  id: number;
  user_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string | null;
  created_at: number;
  updated_at: number;
}

export interface GscProperty {
  id: number;
  client_slug: string;
  site_url: string;
  permission_level: string | null;
  created_at: number;
}

export interface GscSnapshot {
  id: number;
  client_slug: string;
  site_url: string;
  date_start: string;
  date_end: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  top_queries: string;
  top_pages: string;
  created_at: number;
}

export type UserRole = "client" | "admin" | "agency_admin";

export interface User {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  client_slug: string | null;
  agency_id: number | null;
  onboarded: number;
  email_digest: number;
  email_alerts: number;
  email_regression: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: string | null;
  onboarding_drip_start: number | null;
  onboarding_drip_day3: number | null;
  onboarding_drip_day7: number | null;
  nurture_day14_sent: number | null;
  nurture_day30_sent: number | null;
  created_at: number;
  last_login_at: number | null;
  // Runtime-only fields (not in DB)
  _alertCount?: number;
  _roadmapInProgress?: number;
  _agency?: Agency;
  _branding?: BrandingContext;
}

export interface Session {
  id: string;
  user_id: number;
  expires_at: number;
  created_at: number;
}

export type AgencyClientAccess = "internal" | "full";
export type AgencyPlan = "signal" | "amplify";

export interface Domain {
  id: number;
  client_slug: string;
  domain: string;
  is_competitor: number;
  competitor_label: string | null;
  active: number;
  agency_id: number | null;
  plan: AgencyPlan | null;
  client_access: AgencyClientAccess;
  activated_at: number | null;
  sort_order: number;
  // Snippet lifecycle tracking (added by migration 0022). All nullable:
  // null means the event hasn't fired yet for this domain.
  snippet_email_sent_at: number | null;
  snippet_last_checked_at: number | null;
  snippet_last_detected_at: number | null;
  snippet_nudge_day7_at: number | null;
  snippet_nudge_day14_at: number | null;
  created_at: number;
  updated_at: number;
}

export type AgencyStatus = "pending" | "active" | "paused" | "archived";

export interface Agency {
  id: number;
  slug: string;
  name: string;
  contact_email: string;
  logo_url: string | null;
  primary_color: string;
  status: AgencyStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  signal_slot_item_id: string | null;
  amplify_slot_item_id: string | null;
  intro_discount_ends_at: number | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export type AgencyApplicationStatus = "pending" | "approved" | "rejected";

export interface AgencyApplication {
  id: number;
  agency_name: string;
  contact_name: string;
  contact_email: string;
  website: string | null;
  estimated_clients: number | null;
  notes: string | null;
  status: AgencyApplicationStatus;
  reviewed_by: number | null;
  reviewed_at: number | null;
  agency_id: number | null;
  created_at: number;
}

export interface AgencyInvite {
  id: number;
  agency_id: number;
  email: string;
  role: "agency_admin" | "client";
  client_slug: string | null;
  token: string;
  expires_at: number;
  used_at: number | null;
  invited_by: number | null;
  created_at: number;
}

export type AgencySlotEventType = "activated" | "paused" | "resumed" | "removed";

export interface AgencySlotEvent {
  id: number;
  agency_id: number;
  domain_id: number;
  plan: AgencyPlan;
  event_type: AgencySlotEventType;
  stripe_item_id: string | null;
  quantity_before: number | null;
  quantity_after: number | null;
  prorated_amount: number | null;
  note: string | null;
  created_at: number;
}

/** Branding context for a request. Populated by middleware so the layout
 *  can swap logo, primary color, and brand name when the viewer is part
 *  of an agency (admin side) or a Mode-2 client of an agency. */
export interface BrandingContext {
  source: "neverranked" | "agency";
  agency?: Agency;
  showPoweredBy: boolean;
}

export interface ScanResult {
  id: number;
  domain_id: number;
  url: string;
  aeo_score: number;
  grade: string;
  schema_types: string;
  red_flags: string;
  technical_signals: string;
  schema_coverage: string;
  signals_json: string;
  scan_type: string;
  error: string | null;
  scanned_at: number;
}

export interface RoadmapPhase {
  id: number;
  client_slug: string;
  phase_number: number;
  title: string;
  subtitle: string | null;
  description: string | null;
  status: "active" | "completed" | "locked";
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface RoadmapItem {
  id: number;
  client_slug: string;
  phase_id: number | null;
  title: string;
  description: string | null;
  category: string;
  status: "pending" | "in_progress" | "complete";
  sort_order: number;
  due_date: number | null;
  completed_at: number | null;
  client_note: string | null;
  created_at: number;
  updated_at: number;
}

export interface SchemaInjection {
  id: number;
  client_slug: string;
  schema_type: string;
  json_ld: string;
  target_pages: string;
  status: "draft" | "approved" | "paused" | "archived";
  roadmap_item_id: number | null;
  approved_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface InjectionConfig {
  id: number;
  client_slug: string;
  enabled: number;
  cache_ttl: number;
  snippet_token: string;
  business_name: string | null;
  business_url: string | null;
  business_description: string | null;
  business_phone: string | null;
  business_email: string | null;
  business_address: string | null;
  business_logo_url: string | null;
  business_social: string | null;
  created_at: number;
  updated_at: number;
}

export interface CitationKeyword {
  id: number;
  client_slug: string;
  keyword: string;
  category: string;
  active: number;
  created_at: number;
}

export interface CitationRun {
  id: number;
  keyword_id: number;
  engine: string;
  response_text: string;
  cited_entities: string;
  cited_urls: string;
  client_cited: number;
  run_at: number;
}

export interface CitedEntity {
  name: string;
  url: string | null;
  context: string;
}

export interface CitationSnapshot {
  id: number;
  client_slug: string;
  week_start: number;
  total_queries: number;
  client_citations: number;
  citation_share: number;
  top_competitors: string;
  keyword_breakdown: string;
  engines_breakdown: string;
  created_at: number;
}

export interface RequestContext {
  user: User | null;
  env: Env;
  url: URL;
  request: Request;
}
