/* A D1 binding over an in-memory node:sqlite database.
 *
 * Most tests here fake D1 by matching on SQL text, which cannot test the one
 * thing some fixes are about: which row an ORDER BY picks, what a run_at
 * bound excludes, what ON CONFLICT overwrites. This runs the real SQL.
 *
 * Not a test file (the runner's glob is test/*.test.ts). Fictional data only:
 * the repo is public. */

type Row = Record<string, unknown>;
type Hook = (sql: string, binds: unknown[]) => void;

export interface SqliteD1 {
  db: { exec(sql: string): void; prepare(sql: string): { all(...a: unknown[]): unknown[]; get(...a: unknown[]): unknown; run(...a: unknown[]): unknown } };
  env: { DB: never };
  rows(sql: string, ...binds: unknown[]): Row[];
}

const norm = (v: unknown) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);

/** null when node:sqlite is unavailable, so a caller can skip. */
export async function openD1(schema: string, hook?: Hook): Promise<SqliteD1 | null> {
  let sqlite: typeof import("node:sqlite");
  try { sqlite = await import("node:sqlite"); } catch { return null; }
  const db = new sqlite.DatabaseSync(":memory:");
  db.exec(schema);
  const prepare = (sql: string) => {
    let binds: unknown[] = [];
    const stmt = () => db.prepare(sql);
    const api = {
      bind(...a: unknown[]) { binds = a.map(norm); return api; },
      async first<T = Row>(col?: string): Promise<T | null> {
        hook?.(sql, binds);
        const r = stmt().get(...(binds as never[])) as Row | undefined;
        if (r === undefined) return null;
        return (col ? r[col] : { ...r }) as T;
      },
      async all<T = Row>(): Promise<{ results: T[]; success: true; meta: Record<string, unknown> }> {
        hook?.(sql, binds);
        return { results: (stmt().all(...(binds as never[])) as Row[]).map((r) => ({ ...r })) as T[], success: true, meta: {} };
      },
      async run() {
        hook?.(sql, binds);
        const r = stmt().run(...(binds as never[])) as { changes: number | bigint; lastInsertRowid: number | bigint };
        return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
      },
    };
    return api;
  };
  const DB = { prepare, async batch(list: Array<{ run(): Promise<unknown> }>) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
  return {
    db: db as never,
    env: { DB } as never,
    rows: (sql, ...binds) => (db.prepare(sql).all(...(binds.map(norm) as never[])) as Row[]).map((r) => ({ ...r })),
  };
}

/** The tables the readout snapshot, the memo inputs, the report facts and the
 *  draft path touch, with only the columns they read or write. */
export const SCHEMA = `
CREATE TABLE measurement_registry (client_slug TEXT PRIMARY KEY, active INTEGER, snapshot_source TEXT, measurement_start INTEGER);
CREATE TABLE domains (id INTEGER PRIMARY KEY, client_slug TEXT, domain TEXT, is_competitor INTEGER, competitor_label TEXT, active INTEGER);
CREATE TABLE injection_configs (client_slug TEXT PRIMARY KEY, business_name TEXT);
CREATE TABLE customers (client_slug TEXT PRIMARY KEY, name TEXT, status TEXT, category_label TEXT, plan_markdown TEXT, primary_contact_name TEXT, created_at INTEGER, mrr_cents INTEGER);
CREATE TABLE citation_keywords (id INTEGER PRIMARY KEY, client_slug TEXT, keyword TEXT, category TEXT, active INTEGER DEFAULT 1);
CREATE TABLE citation_runs (id INTEGER PRIMARY KEY, keyword_id INTEGER, engine TEXT, client_cited INTEGER, cited_urls TEXT, cited_entities TEXT, response_text TEXT, run_at INTEGER);
CREATE TABLE query_set_versions (id INTEGER PRIMARY KEY, client_slug TEXT, observed_at INTEGER);
CREATE TABLE citation_snapshots (
  id INTEGER PRIMARY KEY, client_slug TEXT, week_start INTEGER, total_queries INTEGER, client_citations INTEGER,
  citation_share REAL, top_competitors TEXT, keyword_breakdown TEXT, engines_breakdown TEXT, created_at INTEGER,
  measured_at INTEGER, query_set_hash TEXT, query_set_changed_in_window INTEGER, UNIQUE (client_slug, week_start));
CREATE TABLE cron_runs (id INTEGER PRIMARY KEY, task_name TEXT, status TEXT, ran_at INTEGER, duration_ms INTEGER, detail TEXT);
CREATE TABLE admin_inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, title TEXT, body TEXT, action_url TEXT, target_type TEXT,
  target_id INTEGER, target_slug TEXT, urgency TEXT, status TEXT, created_at INTEGER, last_seen_at INTEGER,
  resolved_at INTEGER, resolved_by INTEGER, resolution_note TEXT, snoozed_until INTEGER,
  UNIQUE (kind, target_type, target_id));
CREATE TABLE monthly_memos (
  id INTEGER PRIMARY KEY, client_slug TEXT, month_key TEXT, title TEXT, body_markdown TEXT, rules_hash TEXT,
  delivered_at INTEGER, created_at INTEGER, updated_at INTEGER, facts_json TEXT, UNIQUE (client_slug, month_key));
CREATE TABLE instrument_events (id INTEGER PRIMARY KEY, occurred_at INTEGER, kind TEXT, scope TEXT, engine TEXT, client_slug TEXT, detail TEXT);
CREATE TABLE engine_failures (id INTEGER PRIMARY KEY, engine TEXT, failed_at INTEGER);
`;
