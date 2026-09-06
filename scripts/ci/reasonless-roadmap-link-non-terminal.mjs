#!/usr/bin/env node
// reasonless-roadmap-link-non-terminal.mjs — FR-3 of SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-D.
//
// Asserts a LEVEL, never a delta: non_terminal.without_reason === 0 over the LIVE, actionable
// belt (non-terminal SDs only). The historical corpus (all.without_reason, currently ~134 rows
// predating this module) is printed as information ONLY — this predicate never asserts anything
// about it, and never compares two counts against each other (that anti-pattern is what
// eslint-rules/no-count-delta-gate-assertion.js guards against on this directory).
//
// A zero-denominator read (no row anywhere carries the key) prints INSUFFICIENT_DATA rather than
// a bare PASS, mirroring scripts/ci/chairman-awareness-live-owner-count.mjs's FR-5a precedent —
// "the query returned nothing" and "zero defects" are different claims.
//
// Wired via `npm run ci:reasonless-roadmap-links` (package.json) rather than a GitHub workflow —
// scheduling automation is explicitly out of this SD's scope (a red job on a self-renewing count,
// since new reasonless rows can be minted at any time, would be switched off).
//
// Usage: node scripts/ci/reasonless-roadmap-link-non-terminal.mjs
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { pathToFileURL } from 'url';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
import { countRoadmapLinkExceptionsByScope, classifyExceptionShape, TERMINAL_SD_STATUSES } from '../../lib/sourcing-engine/roadmap-link-exception.js';

config();

const PREDICATE = 'strategic_directives_v2 NON-TERMINAL rows with metadata.roadmap_link_exception.reason_supplied !== true';

/**
 * Pure verdict builder — the CI predicate's testable core. `rows` carry {sd_key, status,
 * metadata}. Never asserts a delta between two runs; asserts the current non_terminal level.
 */
export function buildVerdict(rows) {
  const scoped = countRoadmapLinkExceptionsByScope(rows || []);
  if (scoped.all.total === 0) {
    return {
      status: 'INSUFFICIENT_DATA', scope: 'non_terminal', predicate: PREDICATE,
      note: 'Zero rows anywhere carry metadata.roadmap_link_exception -- this is NOT the same as zero defects. Re-run once real traffic has landed rows.',
      all: scoped.all, non_terminal: scoped.non_terminal,
    };
  }

  // Offenders must be the SAME set countRoadmapLinkExceptionsByScope counted into
  // non_terminal.without_reason — non-terminal AND reasonless. A terminal SD with a reasonless
  // (historical) row must never appear here; this predicate is scoped to the live belt only.
  const terminalSet = new Set(TERMINAL_SD_STATUSES);
  const offending_rows = (rows || [])
    .filter((r) => r && !terminalSet.has(r.status))
    .filter((r) => {
      const ex = r.metadata && r.metadata.roadmap_link_exception;
      return Boolean(ex) && classifyExceptionShape(ex) !== 'canonical_reasoned';
    })
    .map((r) => ({ sd_key: r.sd_key, status: r.status, shape: classifyExceptionShape(r.metadata.roadmap_link_exception) }));

  const status = scoped.non_terminal.without_reason === 0 ? 'PASS' : 'FAIL';
  return {
    status, scope: 'non_terminal', predicate: PREDICATE,
    all: scoped.all, non_terminal: scoped.non_terminal,
    offending_rows: status === 'FAIL' ? offending_rows : [],
  };
}

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error(JSON.stringify({ status: 'error', error: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required' }));
    process.exitCode = 1;
    return;
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  let rows;
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, status, metadata')
      .not('metadata->roadmap_link_exception', 'is', null)
      .order('sd_key', { ascending: true }));
  } catch (e) {
    console.error(JSON.stringify({ status: 'error', error: e.message }));
    process.exitCode = 1;
    return;
  }

  const result = buildVerdict(rows);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'FAIL' ? 1 : 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((e) => {
    console.error(JSON.stringify({ status: 'error', error: e.message }));
    process.exitCode = 1;
  });
}
