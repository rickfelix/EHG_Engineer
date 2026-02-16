/**
 * Chairman Governance Seed Data
 *
 * Creates sample data demonstrating the end-to-end chairman decision flow:
 * 1. Creates a test venture
 * 2. Creates pending decisions at various stages
 * 3. Creates preferences (global + venture-specific)
 * 4. Creates override records
 * 5. Resolves some decisions to show the full lifecycle
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-I
 *
 * Usage: node scripts/chairman-seed-data.js [--clean]
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SEED_TAG = 'chairman-governance-seed';
const CLEAN_MODE = process.argv.includes('--clean');

async function cleanSeedData() {
  console.log('Cleaning seed data...');

  // Clean decisions with seed tag in metadata
  const { error: e1 } = await supabase
    .from('chairman_decisions')
    .delete()
    .eq('metadata->>seed_tag', SEED_TAG);
  if (e1) console.warn('  Decisions clean error:', e1.message);
  else console.log('  Decisions cleaned');

  // Clean overrides with seed tag
  const { error: e2 } = await supabase
    .from('chairman_overrides')
    .delete()
    .eq('outcome_notes', SEED_TAG);
  if (e2) console.warn('  Overrides clean error:', e2.message);
  else console.log('  Overrides cleaned');

  // Clean preferences with seed source
  const { error: e3 } = await supabase
    .from('chairman_preferences')
    .delete()
    .eq('source', SEED_TAG);
  if (e3) console.warn('  Preferences clean error:', e3.message);
  else console.log('  Preferences cleaned');

  console.log('Seed data cleaned');
}

async function seedData() {
  console.log('');
  console.log('Chairman Governance Seed Data');
  console.log('='.repeat(40));

  // Step 1: Get or create a venture for testing
  const { data: ventures } = await supabase
    .from('ventures')
    .select('id, name')
    .limit(1);

  let ventureId;
  if (ventures && ventures.length > 0) {
    ventureId = ventures[0].id;
    console.log(`Using existing venture: ${ventures[0].name} (${ventureId.slice(0, 8)})`);
  } else {
    console.log('No ventures found. Creating decisions without venture_id.');
    ventureId = null;
  }

  // Step 2: Create chairman preferences
  console.log('\n  Creating preferences...');

  const preferences = [
    { key: 'risk.max_drawdown_pct', value: 15, value_type: 'number', venture_id: null },
    { key: 'budget.max_monthly_usd', value: 5000, value_type: 'number', venture_id: null },
    { key: 'tech.stack_directive', value: 'Prefer Node.js + React. No PHP.', value_type: 'string', venture_id: null },
    { key: 'notifications.email', value: 'chairman@ehg.test', value_type: 'string', venture_id: null },
    { key: 'notifications.immediate_enabled', value: true, value_type: 'boolean', venture_id: null },
  ];

  // Add venture-specific preference if venture exists
  if (ventureId) {
    preferences.push({
      key: 'risk.max_drawdown_pct',
      value: 25,
      value_type: 'number',
      venture_id: ventureId,
    });
  }

  for (const pref of preferences) {
    const { error } = await supabase
      .from('chairman_preferences')
      .upsert({
        chairman_id: 'chairman-default',
        venture_id: pref.venture_id,
        preference_key: pref.key,
        preference_value: pref.value,
        value_type: pref.value_type,
        source: SEED_TAG,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'chairman_id,venture_id,preference_key' });

    if (error) {
      console.warn(`    Pref ${pref.key}: ${error.message}`);
    } else {
      const scope = pref.venture_id ? 'venture' : 'global';
      console.log(`    ${pref.key} = ${pref.value} (${scope})`);
    }
  }

  // Step 3: Create chairman decisions showing full lifecycle
  console.log('\n  Creating decisions...');

  const decisions = [
    // Pending decision (waiting for chairman)
    {
      lifecycle_stage: 5,
      status: 'pending',
      decision: 'pending',
      summary: 'Market validation gate: venture needs chairman review of TAM estimates',
      blocking: true,
      decision_type: 'gate_decision',
      metadata: { seed_tag: SEED_TAG },
    },
    // Pending advisory (non-blocking)
    {
      lifecycle_stage: 3,
      status: 'pending',
      decision: 'pending',
      decision_type: 'advisory',
      blocking: false,
      summary: 'Advisory: competitor landscape has shifted since initial analysis',
      metadata: { seed_tag: SEED_TAG },
    },
    // Approved decision (historical)
    {
      lifecycle_stage: 0,
      status: 'approved',
      decision: 'proceed',
      summary: 'Stage 0: Venture approved for Stage 1 pipeline',
      rationale: 'Strong market fit, aligns with portfolio strategy',
      resolved_at: new Date(Date.now() - 7 * 86400000).toISOString(),
      metadata: { seed_tag: SEED_TAG },
    },
    // Rejected decision (historical)
    {
      lifecycle_stage: 10,
      status: 'rejected',
      decision: 'halt',
      summary: 'Stage 10: Budget exceeded threshold, chairman halted venture',
      rationale: 'Monthly burn rate 3x above preference threshold. Requires cost restructuring.',
      resolved_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      metadata: { seed_tag: SEED_TAG },
    },
    // Auto-escalated decision (timed out)
    {
      lifecycle_stage: 22,
      status: 'approved',
      decision: 'auto_escalated',
      summary: 'Stage 22: Auto-escalated after 24h timeout',
      rationale: 'Auto-escalated: decision timed out. Requires chairman review.',
      resolved_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      metadata: {
        seed_tag: SEED_TAG,
        escalation: {
          type: 'timeout',
          strategy: 'auto_approve_with_flag',
          escalated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
        },
      },
    },
  ];

  for (const dec of decisions) {
    const row = { ...dec };
    if (ventureId) row.venture_id = ventureId;

    const { error } = await supabase
      .from('chairman_decisions')
      .insert(row);

    if (error) {
      console.warn(`    Stage ${dec.lifecycle_stage} (${dec.status}): ${error.message}`);
    } else {
      console.log(`    Stage ${dec.lifecycle_stage}: ${dec.status} - ${dec.summary.slice(0, 50)}`);
    }
  }

  // Step 4: Create override records
  console.log('\n  Creating overrides...');

  if (ventureId) {
    const overrides = [
      { component: 'moat_architecture', system_score: 65, override_score: 80, reason: 'Network effects undervalued by algorithm', outcome: 'positive' },
      { component: 'portfolio_evaluation', system_score: 72, override_score: 55, reason: 'Too similar to existing portfolio venture', outcome: 'positive' },
      { component: 'virality', system_score: 45, override_score: 70, reason: 'B2B virality pattern not captured by consumer model', outcome: 'pending' },
    ];

    for (const o of overrides) {
      const { error } = await supabase
        .from('chairman_overrides')
        .insert({
          venture_id: ventureId,
          component: o.component,
          system_score: o.system_score,
          override_score: o.override_score,
          reason: o.reason,
          outcome: o.outcome,
          outcome_notes: SEED_TAG,
        });

      if (error) {
        console.warn(`    ${o.component}: ${error.message}`);
      } else {
        const delta = o.override_score - o.system_score;
        console.log(`    ${o.component}: ${o.system_score} → ${o.override_score} (${delta > 0 ? '+' : ''}${delta})`);
      }
    }
  } else {
    console.log('    Skipped (no venture_id)');
  }

  console.log('\n' + '='.repeat(40));
  console.log('Seed data created successfully');
  console.log('Run: node scripts/chairman-dashboard.js');
}

async function main() {
  if (CLEAN_MODE) {
    await cleanSeedData();
  } else {
    await seedData();
  }
}

main().catch(err => {
  console.error('Seed error:', err.message);
  process.exit(1);
});
