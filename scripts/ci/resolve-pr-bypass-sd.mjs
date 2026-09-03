#!/usr/bin/env node
/**
 * SD-LEO-INFRA-BYPASS-DETECTION-REQUIRED-001 (FR-1, FR-2)
 *
 * Resolves the SD under validation for a pull_request run of leo-bypass-validation.yml, so the
 * bypass-detection check only ever inspects the SD the PR is actually about -- never every
 * non-completed SD updated in the last 7 days (the fleet-wide-SPOF defect this SD fixes).
 *
 * Reuses the CANONICAL branch-key-extractor.js (scripts/lib/branch-key-extractor.js) rather than
 * a new inline regex, per this SD's own scope: "measure which resolver the repo already has
 * before adding one" -- the extractor is already the shared source-of-truth for 4 other call
 * sites.
 *
 * The branch name arrives via the HEAD_REF env var (never interpolated directly into a shell
 * script or JS source string) -- a git ref name is untrusted input and can carry $, backticks,
 * ;, | (same injection class this repo already guards against in
 * .github/workflows/story-gate-check.yml's own PR_TITLE/HEAD_REF handling).
 *
 * Resolution outcomes, printed as GITHUB_OUTPUT-shaped `key=value` lines on stdout:
 *   - resolution=skip-no-key      : branch carries no recognizable SD/QF key (docs/chore/etc
 *                                   branches). Not a bypass -- there is no SD-shaped claim here
 *                                   to validate. Exit 0.
 *   - resolution=skip-qf          : branch is QF-shaped. QFs have no sd_phase_handoffs timeline
 *                                   (the artifact class this check validates), so there is
 *                                   nothing to check. Exit 0.
 *   - resolution=resolved         : branch names an SD key that resolves to a live row.
 *                                   sd_uuid=<uuid> is also printed. Exit 0.
 *   - resolution=unresolved-sd    : branch is SD-branded (matches the SD key pattern) but no row
 *                                   exists for that key. This must NOT silently pass -- an
 *                                   SD-branded branch is asserting an SD identity; if that
 *                                   identity does not exist, the check fails closed rather than
 *                                   skip (scope item 2: "hard-fail for SD-branded branches that
 *                                   resolve to nothing"). Exit 1.
 */
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { extractKey } from '../lib/branch-key-extractor.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const KEY_PREFIX_RE = /^(SD|QF)$/i;

/**
 * QF-20260902-114: extractKey()'s SD_PATTERN is deliberately lazy (stops at the FIRST 3+ digit
 * segment) so a branch embedding a second key later (e.g. "...-but-also-QF-20260101-001") still
 * resolves to only the first key -- required by branch-key-extractor.test.js's own precedence
 * test, and left byte-identical here per coordinator ruling (thread ffbcd82b/67afa469). A real SD
 * key can still have a DIGIT segment before its true terminal one (e.g. SD-LEO-FIX-824-REMAINDER-
 * RECORD-001, "824" mid-key), which extractKey() alone under-resolves. This builds every valid
 * longer candidate by walking segments past extractKey()'s stopping point, adding one candidate at
 * each further digit-run boundary, and stopping BEFORE a later embedded SD-/QF- prefixed token so
 * the precedence contract above is preserved. Longest-first so callers can take the first that
 * resolves.
 * @param {string} branch
 * @returns {string[]} candidate SD keys, longest first, always including extractKey()'s own result
 */
export function buildSdKeyCandidates(branch) {
  const base = extractKey(branch);
  if (!base || base.kind !== 'SD') return [];
  const start = branch.toUpperCase().indexOf(base.key);
  const rest = start === -1 ? base.key : branch.slice(start);
  const segments = rest.split('-');
  const candidates = new Set([base.key]);
  const acc = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (i > 0 && KEY_PREFIX_RE.test(seg)) break;
    acc.push(seg);
    if (/^\d{3,}$/.test(seg)) candidates.add(acc.join('-').toUpperCase());
  }
  return [...candidates].sort((a, b) => b.length - a.length);
}

/**
 * @param {string} branch
 * @param {object} supabase
 * @returns {Promise<{resolution: string, sdUuid: string|null, sdKey: string|null}>}
 */
export async function resolvePrBypassSd(branch, supabase) {
  const extracted = extractKey(branch);

  if (!extracted) {
    return { resolution: 'skip-no-key', sdUuid: null, sdKey: null };
  }
  if (extracted.kind === 'QF') {
    return { resolution: 'skip-qf', sdUuid: null, sdKey: extracted.key };
  }

  for (const key of buildSdKeyCandidates(branch)) {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('sd_key', key)
      .maybeSingle();

    if (error) {
      throw new Error(`strategic_directives_v2 lookup failed for ${key}: ${error.message}`);
    }
    if (data) {
      return { resolution: 'resolved', sdUuid: data.id, sdKey: key };
    }
  }

  return { resolution: 'unresolved-sd', sdUuid: null, sdKey: extracted.key };
}

async function main() {
  const branch = process.env.HEAD_REF || '';
  const supabase = createSupabaseServiceClient();
  const result = await resolvePrBypassSd(branch, supabase);

  console.log(`resolution=${result.resolution}`);
  console.log(`sd_key=${result.sdKey || ''}`);
  console.log(`sd_uuid=${result.sdUuid || ''}`);

  if (result.resolution === 'unresolved-sd') {
    console.error(`SD-branded branch "${branch}" names key ${result.sdKey}, which does not resolve to any strategic_directives_v2 row. Failing closed rather than skipping -- an SD-branded branch asserting a nonexistent SD identity is itself suspicious.`);
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
