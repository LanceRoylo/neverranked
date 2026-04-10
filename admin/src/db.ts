// D1 query helpers. Thin wrapper, no ORM.

import type { Client, IntakeSubmission, Stage, Plan, IntakeStatus } from "./types";

export async function listClients(
  db: D1Database,
  filter?: { stage?: Stage },
): Promise<Client[]> {
  const stmt = filter?.stage
    ? db.prepare("SELECT * FROM clients WHERE stage = ?1 ORDER BY updated_at DESC").bind(filter.stage)
    : db.prepare("SELECT * FROM clients ORDER BY updated_at DESC");
  const { results } = await stmt.all<Client>();
  return results ?? [];
}

export async function countClientsByStage(db: D1Database): Promise<Record<string, number>> {
  const { results } = await db
    .prepare("SELECT stage, COUNT(*) as n FROM clients GROUP BY stage")
    .all<{ stage: string; n: number }>();
  const out: Record<string, number> = {};
  for (const row of results ?? []) out[row.stage] = row.n;
  return out;
}

export async function getClientBySlug(db: D1Database, slug: string): Promise<Client | null> {
  const row = await db
    .prepare("SELECT * FROM clients WHERE slug = ?1")
    .bind(slug)
    .first<Client>();
  return row ?? null;
}

export interface NewClientInput {
  slug: string;
  name: string;
  domain?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  stage: Stage;
  plan?: Plan | null;
  notes?: string | null;
}

export async function createClient(db: D1Database, input: NewClientInput): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const res = await db
    .prepare(
      `INSERT INTO clients
        (slug, name, domain, contact_name, contact_email, stage, plan, notes, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
    )
    .bind(
      input.slug,
      input.name,
      input.domain ?? null,
      input.contact_name ?? null,
      input.contact_email ?? null,
      input.stage,
      input.plan ?? null,
      input.notes ?? null,
      now,
    )
    .run();
  return res.meta.last_row_id as number;
}

export interface UpdateClientInput {
  domain?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  stage?: Stage;
  plan?: Plan | null;
  notes?: string | null;
}

export async function updateClient(
  db: D1Database,
  slug: string,
  input: UpdateClientInput,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `UPDATE clients SET
         domain        = COALESCE(?1, domain),
         contact_name  = COALESCE(?2, contact_name),
         contact_email = COALESCE(?3, contact_email),
         stage         = COALESCE(?4, stage),
         plan          = COALESCE(?5, plan),
         notes         = COALESCE(?6, notes),
         updated_at    = ?7
       WHERE slug = ?8`,
    )
    .bind(
      input.domain ?? null,
      input.contact_name ?? null,
      input.contact_email ?? null,
      input.stage ?? null,
      input.plan ?? null,
      input.notes ?? null,
      now,
      slug,
    )
    .run();
}

export async function listIntake(
  db: D1Database,
  filter?: { status?: IntakeStatus; limit?: number },
): Promise<IntakeSubmission[]> {
  const limit = filter?.limit ?? 200;
  const stmt = filter?.status
    ? db
        .prepare("SELECT * FROM intake_submissions WHERE status = ?1 ORDER BY created_at DESC LIMIT ?2")
        .bind(filter.status, limit)
    : db
        .prepare("SELECT * FROM intake_submissions ORDER BY created_at DESC LIMIT ?1")
        .bind(limit);
  const { results } = await stmt.all<IntakeSubmission>();
  return results ?? [];
}

export async function getIntake(db: D1Database, id: number): Promise<IntakeSubmission | null> {
  const row = await db
    .prepare("SELECT * FROM intake_submissions WHERE id = ?1")
    .bind(id)
    .first<IntakeSubmission>();
  return row ?? null;
}

export async function insertIntake(
  db: D1Database,
  input: {
    name?: string | null;
    email: string;
    domain: string;
    goals?: string | null;
    source?: string | null;
  },
): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const res = await db
    .prepare(
      `INSERT INTO intake_submissions
        (name, email, domain, goals, source, status, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'new', ?6)`,
    )
    .bind(
      input.name ?? null,
      input.email,
      input.domain,
      input.goals ?? null,
      input.source ?? null,
      now,
    )
    .run();
  return res.meta.last_row_id as number;
}

export async function setIntakeStatus(
  db: D1Database,
  id: number,
  status: IntakeStatus,
): Promise<void> {
  await db
    .prepare("UPDATE intake_submissions SET status = ?1 WHERE id = ?2")
    .bind(status, id)
    .run();
}

export async function linkIntakeToClient(
  db: D1Database,
  intakeId: number,
  clientId: number,
): Promise<void> {
  await db
    .prepare("UPDATE intake_submissions SET status = 'converted', client_id = ?1 WHERE id = ?2")
    .bind(clientId, intakeId)
    .run();
}
