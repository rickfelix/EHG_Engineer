/**
 * Chairman Pipeline Governance Controls - CLI
 * SD-LEO-FEAT-PER-STAGE-AUTO-PROCEED-001 (US-002)
 *
 * Usage:
 *   npm run governance:stages list              - Show all stages with override status
 *   npm run governance:stages get <n>           - Get stage config as JSON
 *   npm run governance:stages set <n> <mode>    - Set stage to auto|manual [reason]
 *   npm run governance:stages reset             - Reset all overrides to default (auto)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { RESERVED_CHAIRMAN_STAGES } from '../lib/eva/autonomy-model.js';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Hard gate stages — the live venture_stages.gate_type='kill' set, UNIONED with
// RESERVED_CHAIRMAN_STAGES (SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H FR-6 + EXEC-phase SECURITY
// finding L9): the table was entirely fictional vs. the live 27-stage pipeline (live-verified
// directly, not via the stale in-file comment's claimed cross-reference to a since-removed
// CHAIRMAN_GATES.BLOCKING export). A kill-only set here would have silently dropped stage 10
// (a promotion gate, but chairman-reserved) from this CLI's --auto refusal, even though
// RESERVED_CHAIRMAN_STAGES still enforces it at runtime elsewhere -- deriving the union from
// the same imported source both sets already agree on prevents that drift from recurring.
const HARD_GATE_STAGES = new Set([3, 5, 13, 24, ...RESERVED_CHAIRMAN_STAGES]);

// Pipeline stage definitions — matches the live venture_stages table (27 stages).
const PIPELINE_STAGES = [
  { num: 1, name: 'Draft Idea' },
  { num: 2, name: 'AI Review' },
  { num: 3, name: 'Comprehensive Validation' },
  { num: 4, name: 'Competitive Intelligence' },
  { num: 5, name: 'Profitability Forecasting' },
  { num: 6, name: 'Risk Evaluation' },
  { num: 7, name: 'Revenue Architecture' },
  { num: 8, name: 'Business Model Canvas' },
  { num: 9, name: 'Exit Strategy' },
  { num: 10, name: 'Customer & Brand Foundation' },
  { num: 11, name: 'Naming & Visual Identity' },
  { num: 12, name: 'GTM & Sales Strategy' },
  { num: 13, name: 'Product Roadmap' },
  { num: 14, name: 'Technical Architecture' },
  { num: 15, name: 'Design Studio' },
  { num: 16, name: 'Financial Projections' },
  { num: 17, name: 'Blueprint Review' },
  { num: 18, name: 'Marketing Copy Studio' },
  { num: 19, name: 'Sprint Planning' },
  { num: 20, name: 'Code Quality Gate' },
  { num: 21, name: 'Distribution Setup' },
  { num: 22, name: 'Visual Assets' },
  { num: 23, name: 'Dedicated Venture UAT' },
  { num: 24, name: 'Launch Readiness' },
  { num: 25, name: 'Go Live & Announce' },
  { num: 26, name: 'Post-Launch Review' },
  { num: 27, name: 'Growth Playbook' },
].map(s => ({ ...s, hardGate: HARD_GATE_STAGES.has(s.num) }));

async function getConfig() {
  const { data, error } = await supabase
    .from('chairman_dashboard_config')
    .select('stage_overrides, global_auto_proceed')
    .eq('config_key', 'default')
    .maybeSingle();

  if (error) throw new Error(`Database error: ${error.message}`);
  return data || { stage_overrides: {}, global_auto_proceed: true };
}

async function saveOverrides(overrides) {
  const { error } = await supabase
    .from('chairman_dashboard_config')
    .update({
      stage_overrides: overrides,
      updated_at: new Date().toISOString()
    })
    .eq('config_key', 'default');

  if (error) throw new Error(`Save error: ${error.message}`);
}

async function emitGovernanceEvent(stageNum, oldValue, newValue, actor) {
  try {
    await supabase.from('eva_event_log').insert({
      event_type: 'governance_override_changed',
      trigger_source: 'manual',
      correlation_id: crypto.randomUUID(),
      status: 'succeeded',
      metadata: { stage_number: stageNum, old_value: oldValue, new_value: newValue, actor, source: 'governance-stages-cli' },
    });
  } catch (err) {
    console.warn(`Event emission warning: ${err.message}`);
  }
}

async function listStages() {
  const config = await getConfig();
  const overrides = config.stage_overrides || {};

  console.log('\n  Chairman Pipeline Governance Controls');
  console.log('  ' + '='.repeat(60));
  console.log(`  Global Auto-Proceed: ${config.global_auto_proceed ? 'ON' : 'OFF'}`);
  console.log('  ' + '-'.repeat(60));
  console.log('  Stage  Name                    Mode      Hard Gate  Override');
  console.log('  ' + '-'.repeat(60));

  for (const stage of PIPELINE_STAGES) {
    const key = `stage_${stage.num}`;
    const override = overrides[key];
    const mode = override ? (override.auto_proceed ? 'AUTO' : 'MANUAL') : 'AUTO';
    const isOverridden = !!override;
    const hardGate = stage.hardGate ? 'YES' : '   ';

    const modeColor = mode === 'MANUAL' ? '\x1b[33m' : '\x1b[32m';
    const reset = '\x1b[0m';

    console.log(
      `  ${String(stage.num).padStart(5)}  ${stage.name.padEnd(22)}  ${modeColor}${mode.padEnd(8)}${reset}  ${hardGate.padEnd(9)}  ${isOverridden ? 'YES' : '   '}`
    );
  }
  console.log('  ' + '-'.repeat(60));
  console.log(`  Total overrides: ${Object.keys(overrides).length}\n`);
}

async function getStage(stageNum) {
  const config = await getConfig();
  const key = `stage_${stageNum}`;
  const stage = PIPELINE_STAGES.find(s => s.num === stageNum);

  if (!stage) {
    console.error(`Error: Stage ${stageNum} does not exist (valid: 1-25)`);
    process.exit(1);
  }

  const override = config.stage_overrides?.[key] || null;
  console.log(JSON.stringify({
    stage_number: stageNum,
    name: stage.name,
    hard_gate: stage.hardGate,
    auto_proceed: override ? override.auto_proceed : true,
    override: override,
    global_auto_proceed: config.global_auto_proceed
  }, null, 2));
}

async function setStage(stageNum, mode, reason) {
  const stage = PIPELINE_STAGES.find(s => s.num === stageNum);
  if (!stage) {
    console.error(`Error: Stage ${stageNum} does not exist (valid: 1-25)`);
    process.exit(1);
  }

  if (stage.hardGate && mode === 'auto') {
    console.error(`Error: Stage ${stageNum} (${stage.name}) is a hard gate and cannot be set to auto`);
    process.exit(1);
  }

  const autoProceed = mode === 'auto';
  const config = await getConfig();
  const overrides = { ...config.stage_overrides };
  const key = `stage_${stageNum}`;

  if (autoProceed) {
    delete overrides[key];
  } else {
    overrides[key] = {
      auto_proceed: false,
      reason: reason || 'Manual review required',
      set_by: 'chairman',
      set_at: new Date().toISOString()
    };
  }

  await saveOverrides(overrides);
  const oldValue = autoProceed ? 'manual' : 'auto';
  const newValue = autoProceed ? 'auto' : 'manual';
  await emitGovernanceEvent(stageNum, oldValue, newValue, 'chairman');
  console.log(`Stage ${stageNum} (${stage.name}) set to ${mode.toUpperCase()}`);
}

async function resetAll() {
  const config = await getConfig();
  const previousOverrides = config.stage_overrides || {};
  await saveOverrides({});
  for (const key of Object.keys(previousOverrides)) {
    const num = parseInt(key.replace('stage_', ''), 10);
    if (!isNaN(num)) await emitGovernanceEvent(num, 'manual', 'auto', 'chairman');
  }
  console.log('All stage overrides reset to default (AUTO)');
}

// CLI routing
const [,, command, ...args] = process.argv;

try {
  switch (command) {
    case 'list':
      await listStages();
      break;
    case 'get':
      await getStage(parseInt(args[0], 10));
      break;
    case 'set':
      await setStage(parseInt(args[0], 10), args[1], args.slice(2).join(' '));
      break;
    case 'reset':
      await resetAll();
      break;
    default:
      console.log('Usage: governance-stages.js <list|get|set|reset> [args]');
      console.log('  list              Show all stages with override status');
      console.log('  get <n>           Get stage config as JSON');
      console.log('  set <n> <mode>    Set stage to auto|manual [reason]');
      console.log('  reset             Reset all overrides to default');
  }
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
