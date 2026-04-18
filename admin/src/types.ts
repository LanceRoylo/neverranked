// Shared types for the admin Worker.

export interface Env {
  DB: D1Database;
  ADMIN_PASSWORD: string;
  ADMIN_SECRET: string;
  STRIPE_SECRET_KEY: string;
}

export interface Client {
  id: number;
  slug: string;
  name: string;
  domain: string | null;
  contact_name: string | null;
  contact_email: string | null;
  stage: Stage;
  plan: Plan | null;
  notes: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface IntakeSubmission {
  id: number;
  name: string | null;
  email: string;
  domain: string;
  goals: string | null;
  source: string | null;
  status: IntakeStatus;
  client_id: number | null;
  created_at: number;
}

export const STAGES = [
  "prospect",
  "paid",
  "auditing",
  "delivered",
  "implementing",
  "ongoing",
  "churned",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  prospect: "Prospect",
  paid: "Paid",
  auditing: "In audit",
  delivered: "Delivered",
  implementing: "Implementing",
  ongoing: "Ongoing",
  churned: "Churned",
};

export const PLANS = ["audit", "signal", "amplify"] as const;
export type Plan = (typeof PLANS)[number];

export const PLAN_LABELS: Record<Plan, string> = {
  audit: "$500 Audit (one-time)",
  signal: "Signal — $2,000/mo",
  amplify: "Amplify — $4,500/mo",
};

export const INTAKE_STATUSES = ["new", "contacted", "converted", "rejected"] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export const INTAKE_STATUS_LABELS: Record<IntakeStatus, string> = {
  new: "New",
  contacted: "Contacted",
  converted: "Converted",
  rejected: "Rejected",
};

export function isStage(x: unknown): x is Stage {
  return typeof x === "string" && (STAGES as readonly string[]).includes(x);
}

export function isPlan(x: unknown): x is Plan {
  return typeof x === "string" && (PLANS as readonly string[]).includes(x);
}

export function isIntakeStatus(x: unknown): x is IntakeStatus {
  return typeof x === "string" && (INTAKE_STATUSES as readonly string[]).includes(x);
}
