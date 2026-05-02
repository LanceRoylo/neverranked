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
  // Used to encrypt per-client secrets at rest in D1 (currently just
  // WordPress Application Passwords). Set via `wrangler secret put
  // WP_ENCRYPTION_KEY`. Must be a 32-byte hex string. Rotating this
  // invalidates every stored credential, so treat it as a one-way
  // secret -- add a new key + migrate before removing the old one.
  WP_ENCRYPTION_KEY?: string;
  // Cloudflare Workflow binding -- per-domain scan runs in its own
  // invocation so each gets its own subrequest budget. Declared in
  // wrangler.jsonc as scan-domain-workflow / ScanDomainWorkflow.
  SCAN_DOMAIN_WORKFLOW: Workflow;
  // Citations + GSC + digests + backup as separate retryable steps,
  // isolated from the scan dispatcher invocation.
  WEEKLY_EXTRAS_WORKFLOW: Workflow;
  // One digest email per user, each in its own invocation so multi-
  // domain gather queries don't blow the per-Worker subrequest cap.
  SEND_DIGEST_WORKFLOW: Workflow;
}

export interface ScheduledDraft {
  id: number;
  client_slug: string;
  title: string;
  kind: string;
  topic_source: "manual" | "citation_gap" | "gsc" | "roadmap";
  source_ref: string | null;
  scheduled_date: number;
  status: "planned" | "drafted" | "approved" | "published" | "skipped" | "failed";
  draft_id: number | null;
  published_url: string | null;
  published_at: number | null;
  error: string | null;
  // Phase C outcome tracking
  target_keyword_id: number | null;
  wp_post_id: number | null;
  outcome_checked_at: number | null;
  earned_citations_count: number | null;
  rank_current: number | null;
  rank_peak: number | null;
  indexed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface WpConnection {
  id: number;
  client_slug: string;
  site_url: string;
  wp_username: string;
  wp_app_password: string; // encrypted at rest
  seo_plugin: string | null;
  default_post_status: "future" | "publish" | "draft";
  default_category_id: number | null;
  last_tested_at: number | null;
  last_test_status: string | null;
  created_at: number;
  updated_at: number;
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

export interface ClientSettings {
  client_slug: string;
  avg_deal_value: number | null; // cents, nullable; null = "not set"
  created_at: number;
  updated_at: number;
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
  totp_secret: string | null;
  totp_enabled_at: number | null;
  totp_recovery_codes: string | null;
  totp_verified?: number; // joined from session row in getUser()
  checklist_dismissed_at: number | null;
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
  snippet_nudge_day21_at: number | null;
  snippet_pause_check_at: number | null;
  // 1 while the domain is on the pre-billing trial. Cleared by webhook
  // or lazy reconcile once the agency activates a Stripe subscription.
  trial: number;
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
  // 1 once this agency has used its one trial client. Prevents
  // delete-and-retry cycling. Cleared from /admin if ops decides.
  trial_used: number;
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
  completed_by: "scan" | "user" | "admin" | null;
  client_note: string | null;
  created_at: number;
  updated_at: number;
}

// ---------- Voice calibration + content drafts ----------

export interface VoiceSample {
  id: number;
  client_slug: string;
  title: string | null;
  source_url: string | null;
  body: string;
  word_count: number;
  uploaded_by_user_id: number | null;
  created_at: number;
  updated_at: number;
}

export interface VoiceFingerprint {
  client_slug: string;
  fingerprint_json: string;
  sample_count: number;
  total_word_count: number;
  computed_at: number;
  model: string | null;
}

/** Shape of the parsed fingerprint JSON. Evolves over time. */
export interface VoiceFingerprintData {
  summary?: string;                   // one-paragraph plain-English voice description
  tone?: string[];                    // ["direct", "conversational", "no fluff"]
  sentence_length?: "short" | "mixed" | "long";
  vocabulary_notes?: string[];        // ["uses 'folks' over 'customers'", ...]
  forbidden_patterns?: string[];      // ["em dashes", "semicolons", "elevate your business"]
  structural_preferences?: string[];  // ["H2-heavy, no H3", "bullet lists for process steps"]
}

export type ContentDraftStatus = "draft" | "in_review" | "approved" | "rejected";
export type ContentDraftKind = "article" | "faq" | "service_page" | "landing";

export interface ContentDraft {
  id: number;
  client_slug: string;
  roadmap_item_id: number | null;
  citation_keyword_id: number | null;
  kind: ContentDraftKind;
  title: string;
  body_markdown: string;
  body_html: string | null;
  voice_score: number | null;
  status: ContentDraftStatus;
  created_by_user_id: number | null;
  approved_by_user_id: number | null;
  approved_at: number | null;
  qa_result_json: string | null;
  qa_level: string | null;
  created_at: number;
  updated_at: number;
}

export interface ContentDraftVersion {
  id: number;
  draft_id: number;
  body_markdown: string;
  voice_score: number | null;
  edited_by_user_id: number | null;
  edited_by_system: string | null;
  created_at: number;
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

// ---------- Admin inbox ----------

export type InboxUrgency = "low" | "normal" | "high";
export type InboxStatus = "pending" | "approved" | "rejected" | "snoozed" | "resolved";

export interface AdminInboxItem {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  action_url: string | null;
  target_type: string | null;
  target_id: number | null;
  target_slug: string | null;
  urgency: InboxUrgency;
  status: InboxStatus;
  resolution_note: string | null;
  resolved_by: number | null;
  created_at: number;
  resolved_at: number | null;
  snoozed_until: number | null;
}

// ---------- Phase 5B: Reddit reply briefs ----------

export interface RedditBriefData {
  gap: string;        // one sentence: what's missing from the thread's existing answers
  angle: string;      // one sentence: what only this client can add
  tone_notes: string[]; // 2-3 bullets on subreddit norms
  dont_do: string[];  // explicit anti-patterns
}

export interface RedditThreadSnapshot {
  op_title: string;
  op_body: string;
  top_comments: { author: string; score: number; body: string }[];
  fetched_at: number;
}

export interface RedditBrief {
  id: number;
  client_slug: string;
  thread_url: string;
  subreddit: string;
  brief_json: string;        // RedditBriefData JSON
  thread_snapshot: string;   // RedditThreadSnapshot JSON
  model: string;
  generated_by: number | null;
  created_at: number;
  updated_at: number;
}

export interface RequestContext {
  user: User | null;
  env: Env;
  url: URL;
  request: Request;
}
