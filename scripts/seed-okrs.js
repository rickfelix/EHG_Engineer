#!/usr/bin/env node

/**
 * Seed OKRs - Q1 2026 Objectives and Key Results
 *
 * Seeds the OKR hierarchy for Q1 2026:
 * - 1 Vision (EHG 2028)
 * - 3 Objectives (Truth Engine MVP, Commercial Viability, Founder Capacity)
 * - 10 Key Results
 *
 * Run: node scripts/seed-okrs.js
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '..');

// Load environment
const envPath = path.join(EHG_ENGINEER_ROOT, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

async function seedOKRs() {
  console.log(`\n${colors.cyan}${colors.bold}═══════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold} OKR SEED SCRIPT - Strategic Hierarchy${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

  // =========================================================================
  // 1. VISION
  // =========================================================================
  console.log(`${colors.yellow}[1/4] Seeding Vision...${colors.reset}`);

  const vision = {
    code: 'EHG-2028',
    title: 'EHG Holding Company Vision 2026-2028',
    statement: 'One human (Chairman) orchestrating AI agents to ideate, validate, build, and operate multiple ventures simultaneously. By 2028, EHG operates 3-5 AI-managed ventures with the Chairman in a strategic oversight role.',
    time_horizon_start: '2026-01-01',
    time_horizon_end: '2028-12-31',
    is_active: true,
    created_by: 'seed-script',
  };

  const { data: visionData, error: visionError } = await supabase
    .from('strategic_vision')
    .upsert(vision, { onConflict: 'code' })
    .select()
    .single();

  if (visionError) {
    console.log(`${colors.red}  Error: ${visionError.message}${colors.reset}`);
    return;
  }
  console.log(`${colors.green}  ✓ Vision: ${visionData.code}${colors.reset}`);

  // =========================================================================
  // 2. OBJECTIVES
  // =========================================================================
  console.log(`\n${colors.yellow}[2/4] Seeding Objectives...${colors.reset}`);

  const objectives = [
    {
      vision_id: visionData.id,
      code: 'O1-TRUTH-ENGINE',
      title: 'Ship "The Truth Engine" (Tier 2) MVP',
      description: 'Launch the flagship AI product that validates the EHG model - an AI-powered truth verification and analysis platform.',
      owner: 'Founder',
      cadence: 'quarterly',
      period: '2026-Q1',
      sequence: 1,
      is_active: true,
      created_by: 'seed-script',
    },
    {
      vision_id: visionData.id,
      code: 'O2-COMMERCIAL',
      title: 'Validate Commercial Viability',
      description: 'Prove the business model works with paying customers and sustainable support operations.',
      owner: 'Founder',
      cadence: 'quarterly',
      period: '2026-Q1',
      sequence: 2,
      is_active: true,
      created_by: 'seed-script',
    },
    {
      vision_id: visionData.id,
      code: 'O3-CAPACITY',
      title: 'Maintain Founder Operational Capacity',
      description: 'Ensure sustainable founder workload to prevent burnout and maintain strategic thinking capacity.',
      owner: 'Founder',
      cadence: 'quarterly',
      period: '2026-Q1',
      sequence: 3,
      is_active: true,
      created_by: 'seed-script',
    },
  ];

  const objectiveMap = {};
  for (const obj of objectives) {
    const { data, error } = await supabase
      .from('objectives')
      .upsert(obj, { onConflict: 'code' })
      .select()
      .single();

    if (error) {
      console.log(`${colors.red}  Error seeding ${obj.code}: ${error.message}${colors.reset}`);
    } else {
      objectiveMap[obj.code] = data.id;
      console.log(`${colors.green}  ✓ ${obj.code}: ${obj.title}${colors.reset}`);
    }
  }

  // =========================================================================
  // 3. KEY RESULTS
  // =========================================================================
  console.log(`\n${colors.yellow}[3/4] Seeding Key Results...${colors.reset}`);

  const keyResults = [
    // O1-TRUTH-ENGINE Key Results
    {
      objective_id: objectiveMap['O1-TRUTH-ENGINE'],
      code: 'KR1.1-TECH-ARCH',
      title: 'Finalize Technical Architecture by Jan 31',
      description: 'Complete technical architecture design and documentation for The Truth Engine platform. Due: Jan 31, 2026.',
      metric_type: 'boolean',
      baseline_value: 0,
      current_value: 0,
      target_value: 1,
      unit: 'complete',
      direction: 'increase',
      confidence: 0.7,
      status: 'on_track',
      sequence: 1,
    },
    {
      objective_id: objectiveMap['O1-TRUTH-ENGINE'],
      code: 'KR1.2-SOFT-LAUNCH',
      title: 'Execute Soft Launch/QA Audit by Feb 14',
      description: 'Complete soft launch with 0% human intervention during QA audit phase. Due: Feb 14, 2026.',
      metric_type: 'boolean',
      baseline_value: 0,
      current_value: 0,
      target_value: 1,
      unit: 'complete',
      direction: 'increase',
      confidence: 0.6,
      status: 'on_track',
      sequence: 2,
    },
    {
      objective_id: objectiveMap['O1-TRUTH-ENGINE'],
      code: 'KR1.3-PUBLIC-LAUNCH',
      title: 'Public Commercial Launch ($129) by March 1',
      description: 'Launch The Truth Engine publicly at $129 price point. Due: Mar 1, 2026.',
      metric_type: 'boolean',
      baseline_value: 0,
      current_value: 0,
      target_value: 1,
      unit: 'complete',
      direction: 'increase',
      confidence: 0.5,
      status: 'on_track',
      sequence: 3,
    },
    {
      objective_id: objectiveMap['O1-TRUTH-ENGINE'],
      code: 'KR1.4-COMMERCE-STACK',
      title: 'Complete Commerce Stack integration',
      description: 'Full integration with Stripe and Chargeblast for payment processing and chargeback protection.',
      metric_type: 'boolean',
      baseline_value: 0,
      current_value: 0,
      target_value: 1,
      unit: 'complete',
      direction: 'increase',
      confidence: 0.6,
      status: 'on_track',
      sequence: 4,
    },

    // O2-COMMERCIAL Key Results
    {
      objective_id: objectiveMap['O2-COMMERCIAL'],
      code: 'KR2.1-PAID-USERS',
      title: 'Acquire 15 paid users by March 31',
      description: 'Convert 15 customers to paid subscriptions validating market demand. Due: Mar 31, 2026.',
      metric_type: 'number',
      baseline_value: 0,
      current_value: 0,
      target_value: 15,
      unit: 'users',
      direction: 'increase',
      confidence: 0.5,
      status: 'pending',
      sequence: 1,
    },
    {
      objective_id: objectiveMap['O2-COMMERCIAL'],
      code: 'KR2.2-ZERO-TOUCH',
      title: '>90% zero-touch support ratio',
      description: 'Achieve 90%+ of customer support handled automatically without human intervention.',
      metric_type: 'percentage',
      baseline_value: 0,
      current_value: 0,
      target_value: 90,
      unit: '%',
      direction: 'increase',
      confidence: 0.4,
      status: 'pending',
      sequence: 2,
    },
    {
      objective_id: objectiveMap['O2-COMMERCIAL'],
      code: 'KR2.3-TESTIMONIALS',
      title: 'Secure 5 verified testimonials',
      description: 'Collect 5 verified customer testimonials for social proof and marketing.',
      metric_type: 'number',
      baseline_value: 0,
      current_value: 0,
      target_value: 5,
      unit: 'testimonials',
      direction: 'increase',
      confidence: 0.5,
      status: 'pending',
      sequence: 3,
    },

    // O3-CAPACITY Key Results
    {
      objective_id: objectiveMap['O3-CAPACITY'],
      code: 'KR3.1-HARD-STOP',
      title: 'Hard stop at 11:00 PM',
      description: 'Enforce daily work cutoff at 11:00 PM to maintain sustainable work patterns.',
      metric_type: 'percentage',
      baseline_value: 0,
      current_value: 0,
      target_value: 100,
      unit: '% compliance',
      direction: 'increase',
      confidence: 0.7,
      status: 'on_track',
      sequence: 1,
    },
    {
      objective_id: objectiveMap['O3-CAPACITY'],
      code: 'KR3.2-SUNDAY-AUDIT',
      title: 'Weekly Sunday Strategy Audit',
      description: 'Conduct weekly strategic review and planning session every Sunday.',
      metric_type: 'percentage',
      baseline_value: 0,
      current_value: 0,
      target_value: 100,
      unit: '% compliance',
      direction: 'increase',
      confidence: 0.8,
      status: 'on_track',
      sequence: 2,
    },
    {
      objective_id: objectiveMap['O3-CAPACITY'],
      code: 'KR3.3-UPTIME',
      title: '100% operational uptime (zero burnout days)',
      description: 'Maintain 100% operational capacity with no days lost to burnout or exhaustion.',
      metric_type: 'percentage',
      baseline_value: 100,
      current_value: 100,
      target_value: 100,
      unit: '%',
      direction: 'maintain',
      confidence: 0.9,
      status: 'on_track',
      sequence: 3,
    },
  ];

  for (const kr of keyResults) {
    const { data, error } = await supabase
      .from('key_results')
      .upsert({ ...kr, created_by: 'seed-script' }, { onConflict: 'code' })
      .select()
      .single();

    if (error) {
      console.log(`${colors.red}  Error seeding ${kr.code}: ${error.message}${colors.reset}`);
    } else {
      // Create initial progress snapshot
      await supabase
        .from('kr_progress_snapshots')
        .upsert({
          key_result_id: data.id,
          snapshot_date: new Date().toISOString().split('T')[0],
          value: kr.current_value,
          notes: 'Initial baseline from seed script',
          created_by: 'seed-script',
        }, { onConflict: 'key_result_id,snapshot_date' });

      console.log(`${colors.green}  ✓ ${kr.code}: ${kr.title}${colors.reset}`);
    }
  }

  // =========================================================================
  // 4. SUMMARY
  // =========================================================================
  console.log(`\n${colors.yellow}[4/4] Verification...${colors.reset}`);

  const { data: scorecard } = await supabase
    .from('v_okr_scorecard')
    .select('*')
    .order('sequence');

  if (scorecard && scorecard.length > 0) {
    console.log(`\n${colors.cyan}OKR Scorecard:${colors.reset}`);
    for (const obj of scorecard) {
      console.log(`  ${obj.objective_code}: ${obj.objective_title}`);
      console.log(`    ${obj.progress_dots} ${obj.avg_progress_pct || 0}% avg | ${obj.total_krs} KRs`);
    }
  }

  // Count unaligned SDs
  const { data: unaligned } = await supabase
    .rpc('get_unaligned_sds');

  console.log(`\n${colors.yellow}Unaligned SDs: ${unaligned?.length || 0}${colors.reset}`);
  console.log(`${colors.cyan}Run: node scripts/align-sds-to-krs.js to align SDs to Key Results${colors.reset}`);

  console.log(`\n${colors.green}${colors.bold}✓ OKR seed complete!${colors.reset}\n`);
}

seedOKRs().catch(err => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
