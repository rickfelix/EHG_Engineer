#!/usr/bin/env node
/**
 * brainstorm-auto-file.mjs — Materialize brainstorm.metadata.companion_sds_to_file
 * declarations into actual strategic_directives_v2 rows.
 *
 * Part of: SD-LEO-INFRA-BRAINSTORM-SOURCE-TRUTH-CHECK-001 (FR-4 + FR-7)
 *
 * Convention: brainstorm_sessions.metadata.companion_sds_to_file = [
 *   { title, sd_type, priority, scope, rationale, target_application }
 * ]
 *
 * Idempotent: re-running on the same brainstorm INSERTs 0 SDs (sd_key UNIQUE check).
 * Audit: each filed/skipped/failed row writes one row to audit_log with the
 * corrected shape (event_type/entity_type/entity_id/metadata/severity/created_by).
 *
 * CLI:
 *   node scripts/eva/brainstorm-auto-file.mjs --brainstorm-id <uuid> [--dry-run] [--json]
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { generateSDKey } from '../modules/sd-key-generator.js';
import { createSD } from '../leo-create-sd.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const REQUIRED_KEYS = ['title', 'sd_type', 'priority', 'scope', 'rationale', 'target_application'];
const VALID_SD_TYPES = new Set([
  'feature',
  'bugfix',
  'enhancement',
  'infrastructure',
  'documentation',
  'security',
  'database',
  'refactor',
  'corrective',
  'orchestrator',
]);
const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);
const VALID_TARGETS = new Set(['EHG', 'EHG_Engineer']);

export function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      opts[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    }
  }
  return opts;
}

export function validateCompanionSdsToFile(value) {
  if (value === undefined || value === null) return { valid: true, entries: [] };
  if (!Array.isArray(value)) {
    return {
      valid: false,
      error: `companion_sds_to_file must be an array, got ${typeof value}`,
      offending: value,
      type_hints: REQUIRED_KEYS.map((k) => `${k}: string`),
    };
  }
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return {
        valid: false,
        error: `entry [${i}] must be an object`,
        offending: entry,
        type_hints: REQUIRED_KEYS,
      };
    }
    const missing = REQUIRED_KEYS.filter((k) => !entry[k]);
    if (missing.length) {
      return {
        valid: false,
        error: `entry [${i}] missing required keys: ${missing.join(', ')}`,
        offending: entry,
        type_hints: [
          'title: string',
          `sd_type: string ∈ {${[...VALID_SD_TYPES].join(', ')}}`,
          `priority: string ∈ {${[...VALID_PRIORITIES].join(', ')}}`,
          'scope: string',
          'rationale: string',
          `target_application: string ∈ {${[...VALID_TARGETS].join(', ')}}`,
        ],
      };
    }
    if (!VALID_SD_TYPES.has(entry.sd_type)) {
      return {
        valid: false,
        error: `entry [${i}].sd_type='${entry.sd_type}' invalid`,
        offending: entry,
        type_hints: [`sd_type: string ∈ {${[...VALID_SD_TYPES].join(', ')}}`],
      };
    }
    if (!VALID_PRIORITIES.has(entry.priority)) {
      return {
        valid: false,
        error: `entry [${i}].priority='${entry.priority}' invalid`,
        offending: entry,
        type_hints: [`priority: string ∈ {${[...VALID_PRIORITIES].join(', ')}}`],
      };
    }
    if (!VALID_TARGETS.has(entry.target_application)) {
      return {
        valid: false,
        error: `entry [${i}].target_application='${entry.target_application}' invalid`,
        offending: entry,
        type_hints: [`target_application: string ∈ {${[...VALID_TARGETS].join(', ')}}`],
      };
    }
  }
  return { valid: true, entries: value };
}

async function checkSdKeyExists(supabase, sdKey) {
  const { data } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key')
    .or(`sd_key.eq.${sdKey},id.eq.${sdKey}`)
    .limit(1);
  return !!(data && data.length > 0);
}

async function writeAuditLog(supabase, eventType, entityId, metadata, severity = 'info') {
  const { error } = await supabase.from('audit_log').insert({
    event_type: eventType,
    entity_type: 'brainstorm_session',
    entity_id: entityId,
    metadata,
    severity,
    created_by: 'brainstorm-auto-file',
  });
  if (error) console.error(`audit_log insert failed: ${error.message}`);
}

async function updateBrainstormFiledList(supabase, brainstormId, filedList) {
  const { data: row, error: readErr } = await supabase
    .from('brainstorm_sessions')
    .select('metadata')
    .eq('id', brainstormId)
    .single();
  if (readErr) throw readErr;
  const next = { ...(row?.metadata || {}), companion_sds_filed: filedList };
  const { error: updErr } = await supabase
    .from('brainstorm_sessions')
    .update({ metadata: next })
    .eq('id', brainstormId);
  if (updErr) throw updErr;
}

export async function autoFileBrainstorm({ brainstormId, supabase, dryRun = false }) {
  const { data: brainstorm, error } = await supabase
    .from('brainstorm_sessions')
    .select('id, metadata')
    .eq('id', brainstormId)
    .single();
  if (error || !brainstorm) {
    throw new Error(`brainstorm load failed: ${error?.message || 'not found'}`);
  }

  const requested = brainstorm.metadata?.companion_sds_to_file;
  const validation = validateCompanionSdsToFile(requested);
  if (!validation.valid) {
    const err = new Error(
      `Malformed companion_sds_to_file: ${validation.error}\n` +
        `  offending: ${JSON.stringify(validation.offending)}\n` +
        `  expected: ${validation.type_hints.join('; ')}`,
    );
    err.code = 'MALFORMED_INPUT';
    throw err;
  }

  if (!validation.entries.length) {
    return { brainstorm_id: brainstormId, results: [], summary: { filed: 0, skipped: 0, failed: 0 } };
  }

  const results = [];
  for (const entry of validation.entries) {
    let actualSdKey = null;
    try {
      const sdKey = await generateSDKey({
        source: 'BRAINSTORM',
        type: entry.sd_type,
        title: entry.title,
      });
      actualSdKey = sdKey;
      const exists = await checkSdKeyExists(supabase, sdKey);
      if (exists) {
        results.push({ requested_title: entry.title, actual_sd_key: sdKey, status: 'skipped_duplicate' });
        if (!dryRun) {
          await writeAuditLog(
            supabase,
            'BRAINSTORM_AUTO_FILE_SD',
            brainstormId,
            { requested: entry, sd_key: sdKey, outcome: 'skipped_duplicate' },
            'info',
          );
        }
        continue;
      }
      if (dryRun) {
        results.push({ requested_title: entry.title, actual_sd_key: sdKey, status: 'dry_run_would_file' });
        continue;
      }
      const created = await createSD({
        sdKey,
        title: entry.title,
        description: entry.scope,
        type: entry.sd_type,
        priority: entry.priority,
        rationale: entry.rationale,
        metadata: {
          filed_by: 'brainstorm-auto-file',
          origin_brainstorm_id: brainstormId,
        },
      });
      const finalKey = created?.sd_key || created?.id || sdKey;
      results.push({ requested_title: entry.title, actual_sd_key: finalKey, status: 'filed' });
      await writeAuditLog(
        supabase,
        'BRAINSTORM_AUTO_FILE_SD',
        brainstormId,
        { requested: entry, sd_key: finalKey, outcome: 'filed' },
        'info',
      );
    } catch (err) {
      results.push({
        requested_title: entry.title,
        actual_sd_key: actualSdKey,
        status: 'failed',
        error: err.message,
      });
      if (!dryRun) {
        await writeAuditLog(
          supabase,
          'BRAINSTORM_AUTO_FILE_SD',
          brainstormId,
          { requested: entry, sd_key: actualSdKey, outcome: 'failed', error: err.message },
          'error',
        );
      }
    }
  }

  if (!dryRun) {
    await updateBrainstormFiledList(supabase, brainstormId, results);
  }

  const summary = results.reduce(
    (acc, r) => {
      if (r.status === 'filed') acc.filed++;
      else if (r.status === 'skipped_duplicate') acc.skipped++;
      else if (r.status === 'failed') acc.failed++;
      return acc;
    },
    { filed: 0, skipped: 0, failed: 0 },
  );
  return { brainstorm_id: brainstormId, results, summary };
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.brainstormId) {
    console.error('Missing --brainstorm-id <uuid>');
    process.exit(2);
  }
  const supabase = createSupabaseServiceClient();
  try {
    const out = await autoFileBrainstorm({
      brainstormId: opts.brainstormId,
      supabase,
      dryRun: !!opts.dryRun,
    });
    if (opts.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log(
        `brainstorm ${opts.brainstormId}: filed=${out.summary.filed} skipped=${out.summary.skipped} failed=${out.summary.failed}`,
      );
      for (const r of out.results) console.log(`  [${r.status}] ${r.requested_title} → ${r.actual_sd_key || 'n/a'}`);
    }
    process.exit(out.summary.failed > 0 ? 1 : 0);
  } catch (err) {
    console.error(`brainstorm-auto-file failed: ${err.message}`);
    process.exit(err.code === 'MALFORMED_INPUT' ? 1 : 2);
  }
}

if (process.argv[1]?.endsWith('brainstorm-auto-file.mjs')) {
  main();
}
