#!/usr/bin/env node
/**
 * Completion Flags — capture incidental findings discovered at SD completion to a
 * durable channel (the `feedback` table) via the canonical writer, then surface them.
 *
 * SD-LEO-INFRA-COMPLETION-FLAGS-DURABLE-001 / TR-3, TR-4, TR-5 + FR-1, FR-2, FR-6.
 *
 * No new tables. Every flag is routed to a (category, type, status) tuple and written
 * through lib/governance/emit-feedback.js so dedup + audit semantics are shared with
 * every other feedback writer. The consumer that enforces presence of this record is
 * scripts/hooks/stop-subagent-enforcement/post-completion-validator.js (FR-4); both
 * sides import the frozen metadata-key contract from lib/governance/completion-flag-keys.js
 * so the keys cannot drift (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 defense).
 *
 * Usage:
 *   node scripts/capture-completion-flags.js --sd <SD-KEY> \
 *     --flags '[{"type":"harness","item":"sweep fired no heartbeat"}]' \
 *     [--reflection '{"asked":true,"checklist_items":4,"gaps_found":1}']
 *
 *   # No findings (still writes the no-flags witness):
 *   node scripts/capture-completion-flags.js --sd <SD-KEY> --flags '[]'
 *
 * @module scripts/capture-completion-flags
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { emitFeedback } from '../lib/governance/emit-feedback.js';
import { COMPLETION_FLAG } from '../lib/governance/completion-flag-keys.js';

/**
 * Flag classes whose base routing lands in the harness backlog (deferred-class).
 * These are intentionally EXCLUDED from /leo assist by
 * lib/quality/assist-engine.js::splitEnhancementsExcludingHarnessBacklog and surface in
 * the `npm run sd:next` HARNESS BACKLOG section instead.
 * @private
 */
const HARNESS_FLAG_TYPES = Object.freeze(new Set(['harness', 'quirk', 'friction']));

/**
 * TR-5: the pinned witness tuple. status:'backlog' parks the row "on the shelf"
 * (mapFeedbackLifecycle('backlog') === 'ON_THE_SHELF') so it is durable evidence the
 * reflection ran, without nagging the operator on every assist fall-through. Requires
 * TR-1 (emit-feedback.js status param).
 * @private
 */
const WITNESS_TUPLE = Object.freeze({ type: 'enhancement', category: 'harness_backlog', status: 'backlog' });

/**
 * NON-harness category for findings that need a human decision. There is NO CHECK
 * constraint on feedback.category (verified against information_schema for
 * SD-LEO-INFRA-COMPLETION-FLAGS-DURABLE-001), so a dedicated free-text value is safe and
 * keeps these rows OUT of the harness-backlog exclusion — i.e. they reach /leo assist.
 * @private
 */
const NEEDS_DECISION_CATEGORY = 'completion_flag';

function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

/**
 * Stable string used both for the per-finding dedup_key and as the human-facing item
 * when an explicit `item` was not supplied.
 * @private
 */
function flagFindingText(flag) {
  return flag.item || flag.finding || flag.description || flag.title || JSON.stringify(flag);
}

/**
 * TR-4: pure routing — map a flag to its destination tuple. Unit-testable in isolation.
 *
 * Classes:
 *   - 'harness' | 'quirk' | 'friction' -> harness_backlog / enhancement / new
 *   - 'needs_decision'                 -> completion_flag (NON-harness) / issue / new
 *   - 'tied_to_sd'                     -> base class routing + sd_id = flag.sd_id
 *   - 'already_homed'                  -> { link_only: true } (NO new row)
 *
 * For 'tied_to_sd', the underlying class is read from flag.base_type (defaults to
 * 'harness' when unspecified).
 *
 * @param {Object} flag
 * @param {string} flag.type
 * @returns {{ category?: string, feedbackType?: string, status?: string, sd_id?: string, link_only?: boolean }}
 */
export function routeFlag(flag) {
  const type = flag?.type;

  if (type === 'already_homed') {
    // No new row — reference the existing record only.
    return { link_only: true, existing_id: flag.existing_id ?? null, sd_id: flag.sd_id ?? null };
  }

  if (type === 'needs_decision') {
    return { category: NEEDS_DECISION_CATEGORY, feedbackType: 'issue', status: 'new' };
  }

  if (type === 'tied_to_sd') {
    // Same routing as the base class, but pinned to a specific SD.
    const base = routeFlag({ type: flag.base_type || 'harness' });
    return { ...base, sd_id: flag.sd_id ?? null };
  }

  // Default / harness family.
  if (HARNESS_FLAG_TYPES.has(type)) {
    return { category: 'harness_backlog', feedbackType: 'enhancement', status: 'new' };
  }

  // Unknown class: treat conservatively as harness-backlog (deferred), never silently drop.
  return { category: 'harness_backlog', feedbackType: 'enhancement', status: 'new' };
}

/**
 * FR-6: build the reflection metadata bag, applying a sane default when absent.
 * @private
 */
function normalizeReflection(reflection) {
  const r = reflection && typeof reflection === 'object' ? reflection : {};
  return {
    asked: r.asked === true,
    checklist_items: Number.isFinite(r.checklist_items) ? r.checklist_items : 0,
    gaps_found: Number.isFinite(r.gaps_found) ? r.gaps_found : 0,
  };
}

/**
 * TR-3 / FR-2 / FR-6: write each non-link-only flag to the durable feedback channel via
 * the canonical writer, and — when there are no real findings — write exactly ONE no-flags
 * witness (TR-5). The reflection object is always carried in metadata (FR-6).
 *
 * @param {Object} args
 * @param {Object} args.supabase - Supabase client
 * @param {string} args.sdKey - The SD key (e.g. SD-LEO-INFRA-...)
 * @param {Array<Object>} [args.flags=[]] - Incidental findings
 * @param {Object} [args.reflection] - { asked, checklist_items, gaps_found }
 * @returns {Promise<Array<{ item: string, type: string, routedTo: string, id: string|null }>>}
 *   One entry per real flag (link-only included with routedTo='already_homed (link only)').
 */
export async function captureCompletionFlags({ supabase, sdKey, flags = [], reflection } = {}) {
  if (!supabase) throw new Error('captureCompletionFlags: supabase client is required');
  if (!sdKey) throw new Error('captureCompletionFlags: sdKey is required');

  const reflectionBag = normalizeReflection(reflection);
  const baseMeta = {
    [COMPLETION_FLAG.ORIGIN_KEY]: COMPLETION_FLAG.ORIGIN_VALUE,
    [COMPLETION_FLAG.SOURCE_SD_KEY]: sdKey,
    reflection: reflectionBag,
  };

  const list = Array.isArray(flags) ? flags : [];
  const results = [];

  for (const flag of list) {
    const route = routeFlag(flag);
    const finding = flagFindingText(flag);

    // 'already_homed' -> link only, no new row.
    if (route.link_only) {
      results.push({
        item: finding,
        type: flag.type,
        routedTo: 'already_homed (link only)',
        id: route.existing_id ?? route.sd_id ?? null,
      });
      continue;
    }

    const dedupKey = `completion-flag::${sdKey}::${sha256(finding).slice(0, 16)}`;
    const { id } = await emitFeedback({
      supabase,
      title: `Completion flag (${flag.type}) — ${sdKey}`,
      description: finding,
      type: route.feedbackType,
      category: route.category,
      status: route.status,
      sd_id: route.sd_id ?? null,
      dedup_key: dedupKey,
      metadata: {
        ...baseMeta,
        flag_class: flag.type,
      },
    });

    results.push({
      item: finding,
      type: flag.type,
      routedTo: route.category,
      id,
    });
  }

  // TR-5: no real findings -> write a single no-flags witness so the validator can prove
  // the reflection happened. Pinned tuple {enhancement, harness_backlog, backlog}.
  const realFlagCount = results.filter(r => r.routedTo !== 'already_homed (link only)').length;
  if (realFlagCount === 0) {
    await emitFeedback({
      supabase,
      title: `Completion flags witness — ${sdKey}`,
      description: `No incidental findings flagged at completion of ${sdKey}.`,
      type: WITNESS_TUPLE.type,
      category: WITNESS_TUPLE.category,
      status: WITNESS_TUPLE.status,
      dedup_key: `completion-flag-witness::${sdKey}`,
      metadata: {
        ...baseMeta,
        no_flags: true,
      },
    });
  }

  return results;
}

/**
 * FR-1: render the standardized "Completion Flags" block. When there are zero real flags
 * the block prints exactly `- 0 flags` (explicit, never omitted) so the surface is
 * unambiguous in the completion output.
 *
 * @param {Array<{ item: string, type: string, routedTo: string, id: string|null }>} results
 * @returns {string}
 */
export function formatCompletionFlagsBlock(results = []) {
  const rows = Array.isArray(results) ? results : [];
  const lines = ['## Completion Flags'];
  if (rows.length === 0) {
    lines.push('- 0 flags');
    return lines.join('\n');
  }
  for (const r of rows) {
    lines.push(`- ${r.item} | ${r.type} | ${r.routedTo} | ${r.id ?? '(deduped)'}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * Minimal `--key value` parser matching house style (scripts/log-harness-bug.js).
 * @private
 */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sd') out.sd = argv[++i];
    else if (a === '--flags') out.flags = argv[++i];
    else if (a === '--reflection') out.reflection = argv[++i];
  }
  return out;
}

function parseJsonArg(raw, label, fallback) {
  if (raw === undefined || raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`capture-completion-flags: --${label} is not valid JSON: ${e.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.sd) {
    console.error('Usage: node scripts/capture-completion-flags.js --sd <SD-KEY> --flags <json-array> [--reflection <json>]');
    process.exitCode = 1;
    return;
  }

  const flags = parseJsonArg(args.flags, 'flags', []);
  if (!Array.isArray(flags)) {
    console.error('capture-completion-flags: --flags must be a JSON array');
    process.exitCode = 1;
    return;
  }
  const reflection = parseJsonArg(args.reflection, 'reflection', undefined);

  const { createSupabaseServiceClient } = await import('../lib/supabase-client.js');
  const supabase = createSupabaseServiceClient();

  const results = await captureCompletionFlags({ supabase, sdKey: args.sd, flags, reflection });

  console.log(formatCompletionFlagsBlock(results));
  const ids = results.map(r => r.id).filter(Boolean);
  if (ids.length > 0) {
    console.log(`\nFeedback IDs: ${ids.join(', ')}`);
  }
}

const invokedDirectly = (() => {
  try {
    return process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
