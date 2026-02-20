#!/usr/bin/env node
/**
 * EVA Dashboard Command - Aggregated Governance Metrics
 * SD: SD-EHG-ORCH-INTERFACE-AGENTS-001-A
 *
 * Queries all EVA governance tables in parallel and displays
 * a consolidated metrics dashboard.
 *
 * Usage:
 *   node scripts/eva/dashboard-command.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Supabase client
// ============================================================================

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  return createClient(url, key);
}

// ============================================================================
// Dashboard
// ============================================================================

async function dashboard(supabase) {
  const startTime = Date.now();

  // Run all queries in parallel (<=6 queries)
  const [
    visionResult,
    missionResult,
    constitutionResult,
    themeResult,
    okrResult,
    scoreResult,
  ] = await Promise.all([
    // 1. Vision documents
    supabase
      .from('eva_vision_documents')
      .select('vision_key, level, status', { count: 'exact' })
      .eq('status', 'active'),

    // 2. Active mission
    supabase
      .from('missions')
      .select('venture_name, version, status')
      .eq('status', 'active')
      .order('version', { ascending: false })
      .limit(1),

    // 3. Constitution rules
    supabase
      .from('constitution_rules')
      .select('code, enforcement_status', { count: 'exact' }),

    // 4. Strategic themes (current year)
    supabase
      .from('strategic_themes')
      .select('title, status, year', { count: 'exact' })
      .eq('year', new Date().getFullYear()),

    // 5. Active OKR objectives
    supabase
      .from('objectives')
      .select('code, title, is_active', { count: 'exact' })
      .eq('is_active', true),

    // 6. Recent vision scores (last 30 days)
    supabase
      .from('eva_vision_scores')
      .select('total_score, threshold_action, scored_at')
      .gte('scored_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('scored_at', { ascending: false })
      .limit(10),
  ]);

  const elapsed = Date.now() - startTime;

  // Process results
  const visionDocs = visionResult.data || [];
  const mission = missionResult.data?.[0];
  const rules = constitutionResult.data || [];
  const themes = themeResult.data || [];
  const objectives = okrResult.data || [];
  const scores = scoreResult.data || [];

  const avgScore = scores.length > 0
    ? (scores.reduce((sum, s) => sum + (s.total_score || 0), 0) / scores.length).toFixed(1)
    : 'N/A';

  const enforced = rules.filter(r => r.enforcement_status === 'enforced').length;

  // Display dashboard
  console.log('');
  console.log('  EVA Governance Dashboard');
  console.log('  ' + '='.repeat(52));
  console.log('');
  console.log('  Category                 Count    Status');
  console.log('  ' + '-'.repeat(52));

  // Vision
  console.log(`  Vision Documents         ${String(visionDocs.length).padStart(3)}      ${visionDocs.length > 0 ? 'Active' : 'None'}`);
  if (visionDocs.length > 0) {
    const l1 = visionDocs.filter(d => d.level === 'L1').length;
    const l2 = visionDocs.filter(d => d.level === 'L2').length;
    console.log(`    L1 (Portfolio)         ${String(l1).padStart(3)}`);
    console.log(`    L2 (Venture)           ${String(l2).padStart(3)}`);
  }

  // Mission
  console.log(`  Mission                  ${mission ? `v${mission.version}` : '  -'}      ${mission ? mission.status : 'Not set'}`);

  // Constitution
  console.log(`  Constitution Rules       ${String(rules.length).padStart(3)}      ${enforced}/${rules.length} enforced`);

  // Strategic Themes
  console.log(`  Strategic Themes (${new Date().getFullYear()})  ${String(themes.length).padStart(3)}      ${themes.filter(t => t.status === 'active').length} active`);

  // OKRs
  console.log(`  Active Objectives        ${String(objectives.length).padStart(3)}      ${objectives.length > 0 ? 'Current period' : 'None'}`);

  // Vision Scores
  console.log(`  Recent Vision Scores     ${String(scores.length).padStart(3)}      Avg: ${avgScore}/100`);
  if (scores.length > 0) {
    const actions = {};
    scores.forEach(s => { actions[s.threshold_action] = (actions[s.threshold_action] || 0) + 1; });
    const breakdown = Object.entries(actions).map(([k, v]) => `${v} ${k}`).join(', ');
    console.log(`    Last 30 days:          ${breakdown}`);
  }

  console.log('  ' + '-'.repeat(52));
  console.log(`  Query time: ${elapsed}ms (${6} parallel queries)`);
  console.log('');
}

// ============================================================================
// Entry point
// ============================================================================

async function main() {
  const supabase = getSupabase();

  try {
    await dashboard(supabase);
  } catch (err) {
    console.error('Dashboard error:', err.message);
    process.exit(1);
  }
}

// ESM entry point (Windows-compatible)
if (import.meta.url === `file://${process.argv[1]}` ||
    import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  main();
}

export { dashboard };
