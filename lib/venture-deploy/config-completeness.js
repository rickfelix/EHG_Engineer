/**
 * Deploy-Config Completeness Checker — SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-5 (class e).
 *
 * The chairman's incident: AltifyAI's Clerk publishable key AND its D1 database_id both
 * reached production as scaffold placeholders, because the CI build succeeds on an empty or
 * placeholder value with no post-build assertion -- `npm run build` does not know or care
 * whether `database_id = "00000000-0000-0000-0000-000000000000"` is real.
 *
 * SCOPE, stated honestly: this checks a venture's LOCAL CLONE's wrangler.toml for known
 * placeholder patterns -- it does NOT enforce anything at a chokepoint yet. FR-4's own
 * investigation this session found the real production deploy chokepoint (promote(), the sole
 * caller of cli-adapters.js) and confirmed a venture's deploy work has historically bypassed
 * EHG_Engineer's own pipeline entirely via a hand-run CI workflow in the venture's OWN repo
 * (exactly what happened to AltifyAI) -- wiring this checker into lib/venture-deploy/publish.js
 * alone would NOT have caught that incident, since publish.js was never in the path that
 * actually shipped it. Where to enforce this (a venture-template CI step vs. an
 * EHG_Engineer-side pipeline hook) is a follow-up scoping decision, not resolved here. This
 * module provides the CHECK, callable from either.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** Exact placeholder values this codebase is known to scaffold-seed. */
const KNOWN_PLACEHOLDERS = Object.freeze({
  database_id: '00000000-0000-0000-0000-000000000000',
});

/** Generic placeholder-shaped token patterns, checked against any TOML string value. */
const GENERIC_PLACEHOLDER_PATTERNS = [
  /^CHANGEME$/i,
  /^your-.+/i,
  /^<.+>$/,
  /^xxxx+$/i,
  /^TODO$/i,
  /^placeholder$/i,
  // Independent sweep finding: the chairman's incident (module header, above) named the Clerk
  // publishable key as the OTHER half alongside database_id -- this checker only ever covered
  // the D1 half. VITE_CLERK_PUBLISHABLE_KEY is the canonical var name (docs/03_protocols_and_
  // standards/venture-hosting-standard.md), but these patterns are key-agnostic like the rest
  // of this list, so they apply regardless of which TOML key holds the value.
  /^YOUR_.+$/i, // e.g. YOUR_CLERK_PUBLISHABLE_KEY -- an underscore-style placeholder NAME used as a value
  /^pk_(test|live)_?$/i, // Clerk key prefix with an empty/near-empty suffix, never filled in
  /^pk_(test|live)_(your[_-]?key|placeholder|changeme|xxx+)/i, // Clerk key prefix + an obvious placeholder token
];

/**
 * Pure: does this string value look like a placeholder that was never actually configured?
 * @param {string} key - the TOML key, for the exact-match table above
 * @param {string} value
 * @returns {boolean}
 */
export function isPlaceholderValue(key, value) {
  if (typeof value !== 'string') return false;
  // Independent sweep finding: an empty value is exactly "never actually configured" -- the
  // same failure mode this whole function exists to catch, previously undetected for every key.
  if (value.trim() === '') return true;
  if (KNOWN_PLACEHOLDERS[key] && value === KNOWN_PLACEHOLDERS[key]) return true;
  return GENERIC_PLACEHOLDER_PATTERNS.some((re) => re.test(value.trim()));
}

/**
 * Pure: scan wrangler.toml source text for `key = "value"` assignments and flag placeholders.
 * Deliberately narrow (line-based key="value" matching, not a full TOML parser) -- wrangler.toml
 * files in this codebase are hand-authored and simple; a full parser is not warranted for a
 * completeness check whose only job is spotting an unreplaced scaffold value.
 * @param {string} tomlSource
 * @returns {Array<{key: string, value: string, placeholder: boolean}>}
 */
export function scanTomlForPlaceholders(tomlSource) {
  const findings = [];
  const lineRe = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"([^"]*)"\s*(?:#.*)?$/;
  for (const line of String(tomlSource || '').split('\n')) {
    const match = line.match(lineRe);
    if (!match) continue;
    const [, key, value] = match;
    findings.push({ key, value, placeholder: isPlaceholderValue(key, value) });
  }
  return findings;
}

/**
 * Check a venture's local clone for deploy-config completeness. I/O wrapper around the pure
 * scanTomlForPlaceholders() above.
 * @param {string|null} repoPath - local clone path, or null if unknown/not cloned
 * @returns {{checked: boolean, reason?: string, placeholders: Array<{key:string,value:string}>}}
 */
export function checkDeployConfigCompleteness(repoPath) {
  if (!repoPath) return { checked: false, reason: 'no local clone path provided', placeholders: [] };
  const tomlPath = join(repoPath, 'wrangler.toml');
  if (!existsSync(tomlPath)) return { checked: false, reason: 'no wrangler.toml found at this path', placeholders: [] };

  let source;
  try {
    source = readFileSync(tomlPath, 'utf8');
  } catch (err) {
    return { checked: false, reason: `wrangler.toml unreadable: ${err.message}`, placeholders: [] };
  }

  const findings = scanTomlForPlaceholders(source);
  const placeholders = findings.filter((f) => f.placeholder).map(({ key, value }) => ({ key, value }));
  return { checked: true, placeholders };
}
