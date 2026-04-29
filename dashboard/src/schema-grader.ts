/**
 * Schema grader -- relocated to the shared aeo-analyzer package as
 * of Phase 6B so both the dashboard Worker and the public schema-
 * check Worker can score JSON-LD identically. This file is a thin
 * re-export so existing dashboard imports keep working.
 */

export { gradeSchema, gradeBucket } from "../../packages/aeo-analyzer/src/schema-grader";
export type { SchemaGrade } from "../../packages/aeo-analyzer/src/schema-grader";
