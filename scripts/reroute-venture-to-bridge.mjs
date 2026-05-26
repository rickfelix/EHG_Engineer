#!/usr/bin/env node
/**
 * reroute-venture-to-bridge — re-route an in-flight venture onto the LEO-SD bridge (Stage 19 SSOT).
 *
 * SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 / FR-3 (RCA 813d4c3d). For ventures whose S19 bridge hook
 * never fired (the seeded-path schism), this invokes the SAME canonical machinery the hook would
 * (convertSprintToSDs on the existing Stage-18 sd_bridge_payloads), and pins them to the bridge:
 *   1. ventures.build_model = 'leo_bridge'   (SSOT arbiter — future S19 runs/reentry honor it)
 *   2. register the venture in public.applications (routing precondition; future fail-closed trigger)
 *   3. convertSprintToSDs(existing payloads)  → orchestrator + child SDs routed by target_application
 *
 * SAFE to re-run: convertSprintToSDs has an idempotency guard keyed on (venture_id, sprint_name) —
 * a second run no-ops if an orchestrator already exists. DRY-RUN by default; pass --apply to mutate.
 *
 * Usage:  node scripts/reroute-venture-to-bridge.mjs "<venture name or uuid>" [--apply]
 */
import { createSupabaseServiceClient } from '../lib/supabase-connection.js';
import { convertSprintToSDs } from '../lib/eva/lifecycle-sd-bridge.js';

const arg = process.argv[2];
const APPLY = process.argv.includes('--apply');
const NO_GC = process.argv.includes('--no-grandchildren'); // bounded pilot: orchestrator + children only
const SKIP_ENRICH = process.argv.includes('--skip-enrichment'); // skip the slow loadAndEnrichArtifacts step
if (!arg) { console.error('Usage: node scripts/reroute-venture-to-bridge.mjs "<venture name or uuid>" [--apply] [--no-grandchildren] [--skip-enrichment]'); process.exit(2); }

const sb = await createSupabaseServiceClient('engineer');
const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(arg);

const { data: venture } = isUuid
  ? await sb.from('ventures').select('id,name,repo_url,build_model').eq('id', arg).maybeSingle()
  : await sb.from('ventures').select('id,name,repo_url,build_model').ilike('name', arg).limit(1).maybeSingle();
if (!venture) { console.error(`Venture not found: ${arg}`); process.exit(1); }

console.log(`\n=== Re-route venture onto LEO-SD bridge ${APPLY ? '(APPLY)' : '(DRY-RUN)'} ===`);
console.log(`  venture: ${venture.name} (${venture.id})`);
console.log(`  repo_url: ${venture.repo_url || 'NULL'}`);
console.log(`  current build_model: ${venture.build_model ?? 'NULL'}`);

// Fetch the current Stage-18 sprint plan (sd_bridge_payloads).
const { data: art } = await sb.from('venture_artifacts')
  .select('artifact_data,created_at')
  .eq('venture_id', venture.id).eq('artifact_type', 'blueprint_sprint_plan').eq('is_current', true)
  .order('created_at', { ascending: false }).limit(1).maybeSingle();
const ad = art?.artifact_data || {};
const payloads = ad.sd_bridge_payloads || ad.stage18_data?.sd_bridge_payloads || [];
const sprintName = ad.sprint_name || ad.stage18_data?.sprint_name || `Sprint ${new Date().toISOString().slice(0,10)}`;
const sprintGoal = ad.sprint_goal || ad.stage18_data?.sprint_goal || '';
const sprintDuration = ad.sprint_duration_days || ad.stage18_data?.sprint_duration_days || 14;
console.log(`  blueprint_sprint_plan: ${art ? 'is_current' : 'MISSING'} | sd_bridge_payloads: ${Array.isArray(payloads) ? payloads.length : '(none)'} | sprint_name: "${sprintName}"`);
if (!Array.isArray(payloads) || payloads.length === 0) { console.error('  No sd_bridge_payloads — cannot re-route.'); process.exit(1); }
const gcPerChild = NO_GC ? 0 : 4; // ARCHITECTURE_LAYERS (data/api/ui/tests)
const gcTotal = gcPerChild * payloads.length;
console.log(`  Would create: 1 orchestrator + ${payloads.length} children${NO_GC ? ' (--no-grandchildren: grandchildren deferred)' : ` + ~${gcTotal} grandchildren`} = ${1 + payloads.length + gcTotal} SDs (target_application=${venture.name}):`);
payloads.forEach((p, i) => console.log(`    child[${i}] ${p.type || 'feature'}: ${p.title}`));

// Existing orchestrator? (idempotency)
const { data: existingOrch } = await sb.from('strategic_directives_v2')
  .select('sd_key').eq('venture_id', venture.id).eq('sd_type', 'orchestrator')
  .filter('metadata->>sprint_name', 'eq', sprintName).limit(1).maybeSingle();
console.log(`  existing orchestrator for this sprint: ${existingOrch ? existingOrch.sd_key + ' (would no-op)' : 'none'}`);

if (!APPLY) { console.log('\n  DRY-RUN — no changes. Re-run with --apply to execute.'); process.exit(0); }

// ── APPLY ──
// 1. Pin to the bridge (SSOT).
await sb.from('ventures').update({ build_model: 'leo_bridge' }).eq('id', venture.id);
console.log('\n  ✓ set ventures.build_model = leo_bridge');

// 2. Register in applications (routing precondition).
const { data: appRow } = await sb.from('applications').select('id').ilike('name', venture.name).limit(1).maybeSingle();
if (!appRow) {
  const normalized = String(venture.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const { error: regErr } = await sb.from('applications').insert({
    name: venture.name, normalized_name: normalized, kind: 'venture', status: 'active',
    repo_url: venture.repo_url || null, venture_id: venture.id, trust_tier: 'external',
  });
  console.log(regErr ? `  ⚠ applications register failed: ${regErr.message}` : `  ✓ registered '${venture.name}' in applications (venture, trust_tier=external)`);
} else {
  console.log(`  · already in applications registry`);
}

// 3. Invoke the canonical bridge.
const { data: visionDoc } = await sb.from('eva_vision_documents').select('vision_key').eq('venture_id', venture.id).order('version', { ascending: false }).limit(1).maybeSingle();
const { data: archPlan } = await sb.from('eva_architecture_plans').select('plan_key').eq('venture_id', venture.id).order('version', { ascending: false }).limit(1).maybeSingle();
const result = await convertSprintToSDs(
  {
    stageOutput: { sd_bridge_payloads: payloads, sprint_name: sprintName, sprint_goal: sprintGoal, sprint_duration_days: sprintDuration },
    ventureContext: { id: venture.id, name: venture.name },
    evaKeys: { vision_key: visionDoc?.vision_key || null, plan_key: archPlan?.plan_key || null },
    options: { generateGrandchildren: !NO_GC, skipEnrichment: SKIP_ENRICH },
  },
  { supabase: sb, logger: console },
);
console.log('\n=== convertSprintToSDs result ===');
console.log(`  created: ${result.created} | orchestrator: ${result.orchestratorKey} | children: ${result.childKeys?.length || 0} | errors: ${JSON.stringify(result.errors || [])}`);

// 4. Verify the SD tree.
const { data: tree } = await sb.from('strategic_directives_v2')
  .select('sd_key,sd_type,status,target_application,parent_sd_id').eq('target_application', venture.name).order('sd_type');
console.log(`\n=== verify: SDs with target_application='${venture.name}' (${tree?.length || 0}) ===`);
for (const s of (tree || [])) console.log(`  ${s.sd_type.padEnd(13)} ${s.sd_key} status=${s.status} parent=${s.parent_sd_id ? 'yes' : '—'}`);
process.exit(0);
