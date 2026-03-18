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
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Pipeline stage definitions (25 stages)
const PIPELINE_STAGES = [
  { num: 1, name: 'Ideation', hardGate: false },
  { num: 2, name: 'Research', hardGate: false },
  { num: 3, name: 'Validation', hardGate: true },
  { num: 4, name: 'Market Analysis', hardGate: false },
  { num: 5, name: 'Business Model', hardGate: true },
  { num: 6, name: 'Competitor Analysis', hardGate: false },
  { num: 7, name: 'MVP Definition', hardGate: false },
  { num: 8, name: 'Technical Assessment', hardGate: false },
  { num: 9, name: 'Financial Modeling', hardGate: true },
  { num: 10, name: 'Team Formation', hardGate: false },
  { num: 11, name: 'Prototype', hardGate: false },
  { num: 12, name: 'User Testing', hardGate: false },
  { num: 13, name: 'Pivot/Persevere', hardGate: true },
  { num: 14, name: 'Go-to-Market', hardGate: false },
  { num: 15, name: 'Launch Prep', hardGate: false },
  { num: 16, name: 'Soft Launch', hardGate: false },
  { num: 17, name: 'Metrics Review', hardGate: true },
  { num: 18, name: 'Scale Planning', hardGate: false },
  { num: 19, name: 'Funding Strategy', hardGate: false },
  { num: 20, name: 'Partnership', hardGate: false },
  { num: 21, name: 'Growth Phase', hardGate: false },
  { num: 22, name: 'Optimization', hardGate: false },
  { num: 23, name: 'Expansion', hardGate: false },
  { num: 24, name: 'Maturity', hardGate: false },
  { num: 25, name: 'Exit Strategy', hardGate: true },
];

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
    .upsert({
      config_key: 'default',
      company_id: '00000000-0000-0000-0000-000000000000',
      stage_overrides: overrides,
      updated_at: new Date().toISOString()
    }, { onConflict: 'company_id,config_key' });

  if (error) throw new Error(`Save error: ${error.message}`);
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
  console.log(`Stage ${stageNum} (${stage.name}) set to ${mode.toUpperCase()}`);
}

async function resetAll() {
  await saveOverrides({});
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
