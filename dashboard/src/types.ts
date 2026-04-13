/**
 * Dashboard — Type definitions
 */

export interface Env {
  DB: D1Database;
  LEADS: KVNamespace;
  ADMIN_SECRET: string;
  ADMIN_EMAIL: string;
  RESEND_API_KEY?: string;
}

export interface User {
  id: number;
  email: string;
  name: string | null;
  role: "client" | "admin";
  client_slug: string | null;
  onboarded: number;
  email_digest: number;
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

export interface RequestContext {
  user: User | null;
  env: Env;
  url: URL;
  request: Request;
}
