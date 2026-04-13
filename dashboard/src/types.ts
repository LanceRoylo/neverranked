/**
 * Dashboard — Type definitions
 */

export interface Env {
  DB: D1Database;
  LEADS: KVNamespace;
  ADMIN_SECRET: string;
  ADMIN_EMAIL: string;
  RESEND_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  DASHBOARD_ORIGIN?: string;
}

export interface User {
  id: number;
  email: string;
  name: string | null;
  role: "client" | "admin";
  client_slug: string | null;
  onboarded: number;
  email_digest: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: string | null;
  onboarding_drip_start: number | null;
  onboarding_drip_day3: number | null;
  onboarding_drip_day7: number | null;
  created_at: number;
  last_login_at: number | null;
}

export interface Session {
  id: string;
  user_id: number;
  expires_at: number;
  created_at: number;
}

export interface Domain {
  id: number;
  client_slug: string;
  domain: string;
  is_competitor: number;
  competitor_label: string | null;
  active: number;
  created_at: number;
  updated_at: number;
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

export interface RequestContext {
  user: User | null;
  env: Env;
  url: URL;
  request: Request;
}
