#!/usr/bin/env node
/**
 * Capture CronGenius M1 orchestrator + children snapshot — pre-refactor baseline.
 *
 * SD: SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001 / FR-A (PRD COND-1, BLOCKING)
 *
 * Captures byte-identical structural snapshot of:
 *   - VISION-CRONGENIUS-API-L2-001
 *   - ARCH-CRONGENIUS-001
 *   - SD-CRONGENIUS-M1-LAUNCH-ORCHESTRATOR-ORCH-001 (parent + children)
 *
 * Volatile fields (UUID ids, timestamps, foreign-id-UUIDs) are stripped so the
 * snapshot is deterministic and re-running the script verifies regression-free
 * refactor of lib/eva/create-orchestrator-from-plan.js (TS-6).
 *
 * Usage:
 *   node scripts/test-helpers/capture-crongenius-snapshot.mjs          # capture if missing
 *   node scripts/test-helpers/capture-crongenius-snapshot.mjs --force --reason "<≥10 chars>"
 *                                                                       # overwrite existing
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../');
const FIXTURE_PATH = resolve(REPO_ROOT, 'tests/fixtures/crongenius-m1-snapshot.json');

const ORCH_KEY = 'SD-CRONGENIUS-M1-LAUNCH-ORCHESTRATOR-ORCH-001';
const ARCH_KEY = 'ARCH-CRONGENIUS-001';
const VISION_KEY = 'VISION-CRONGENIUS-API-L2-001';

const VOLATILE_KEYS = new Set([
  'id', 'created_at', 'updated_at', 'completed_at', 'released_at',
  'claimed_at', 'claiming_session_id', 'active_session_id',
  'heartbeat_at', 'parent_sd_id', 'vision_id', 'venture_id',
  'archived_at', 'last_synced_at', 'chairman_approved_at',
  'invalidated_at', 'quality_checked_at', 'scored_at',
]);

function stripVolatile(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(stripVolatile);
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (VOLATILE_KEYS.has(k)) continue;
    out[k] = stripVolatile(v);
  }
  return out;
}

function parseArgs(argv) {
  const out = { force: false, reason: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--force') out.force = true;
    if (argv[i] === '--reason' && argv[i + 1]) out.reason = argv[++i];
  }
  return out;
}

async function captureSnapshot(supabase) {
  const { data: vision } = await supabase
    .from('eva_vision_documents')
    .select('vision_key, level, status, chairman_approved, version, extracted_dimensions, sections, quality_checked')
    .eq('vision_key', VISION_KEY)
    .single();

  const { data: arch } = await supabase
    .from('eva_architecture_plans')
    .select('plan_key, vision_key, status, chairman_approved, version, extracted_dimensions, sections, quality_checked, quality_issues')
    .eq('plan_key', ARCH_KEY)
    .single();

  const { data: orch } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, sd_type, category, status, current_phase, priority, scope, rationale, target_application, success_metrics, key_principles, strategic_objectives, success_criteria, implementation_guidelines, dependencies, risks, stakeholders, metadata, key_changes, description, non_vertical, non_vertical_justification')
    .eq('sd_key', ORCH_KEY)
    .single();

  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, sd_type, category, status, current_phase, priority, scope, rationale, target_application, success_metrics, key_principles, strategic_objectives, success_criteria, implementation_guidelines, dependencies, risks, stakeholders, metadata, key_changes, description, non_vertical, non_vertical_justification')
    .like('sd_key', `${ORCH_KEY}-%`)
    .order('sd_key');

  return {
    captured_at: new Date().toISOString(),
    sd_source: 'SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001',
    rationale: 'COND-1 baseline: FR-A refactor must preserve byte-identical orchestrator+children structure for same inputs',
    vision: stripVolatile(vision),
    archplan: stripVolatile(arch),
    orchestrator: stripVolatile(orch),
    children: (children || []).map(stripVolatile),
  };
}

async function main() {
  const args = parseArgs(process.argv);

  if (existsSync(FIXTURE_PATH) && !args.force) {
    console.log(`Snapshot already exists at ${FIXTURE_PATH}`);
    console.log('Use --force --reason "<reason>" to overwrite.');
    process.exit(0);
  }

  if (args.force && (!args.reason || args.reason.length < 10)) {
    console.error('--force requires --reason "<≥10 chars>"');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const snapshot = await captureSnapshot(supabase);

  if (!snapshot.orchestrator) {
    console.error(`Orchestrator ${ORCH_KEY} not found — cannot capture baseline.`);
    process.exit(1);
  }

  mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
  writeFileSync(FIXTURE_PATH, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');

  console.log(`Snapshot written: ${FIXTURE_PATH}`);
  console.log(`  vision:       ${snapshot.vision?.vision_key} (${snapshot.vision?.status})`);
  console.log(`  archplan:     ${snapshot.archplan?.plan_key} (${snapshot.archplan?.status})`);
  console.log(`  orchestrator: ${snapshot.orchestrator?.sd_key} (${snapshot.orchestrator?.status})`);
  console.log(`  children:     ${snapshot.children.length}`);
}

main().catch((err) => { console.error('FATAL:', err.message); process.exit(1); });
