/**
 * Single source of truth for the server's name + version, read from
 * package.json at startup. Prevents drift between the MCP capabilities
 * banner, the HTTP user-agent strings, and what npm actually published.
 *
 * dist/lib/pkg-info.js sits in dist/lib/, package.json is two dirs up.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "package.json"), "utf-8"),
) as { name: string; version: string };

export const PKG_NAME = pkg.name;
export const PKG_VERSION = pkg.version;
export const USER_AGENT = `neverranked-mcp/${pkg.version}`;
