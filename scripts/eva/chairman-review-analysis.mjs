#!/usr/bin/env node
/**
 * Chairman Review Analysis — Quality Feedback Loop
 * SD: SD-CHAIRMAN-REVIEW-CHECKPOINT-FOR-ORCH-001-B
 *
 * Analyzes chairman review patterns from Step 8.7 across brainstorm sessions
 * to surface rubric tuning recommendations.
 *
 * Usage:
 *   node scripts/eva/chairman-review-analysis.mjs
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RUBRIC_CATEGORIES = [
  'Market Size',
  'Competitive Moat',
  'Technical Feasibility',
  'Revenue Model',
  'Team Fit',
  'Timing',
  'Regulatory Risk',
  'Capital Requirements',
];

async function fetchReviewData() {
  const { data, error } = await supabase
    .from('brainstorm_sessions')
    .select('id, topic, domain, metadata, created_at')
    .not('metadata', 'is', null);

  if (error) {
    console.error('Query error:', error.message);
    return [];
  }

  // Filter to sessions that have chairman_review in metadata
  return (data || []).filter(s => {
    const meta = s.metadata || {};
    return meta.chairman_review || meta.chairmanReview;
  });
}

function extractDecisions(session) {
  const meta = session.metadata || {};
  const review = meta.chairman_review || meta.chairmanReview || {};
  const items = review.items || review.decisions || [];

  return items.map(item => ({
    category: item.category || 'Unknown',
    decision: (item.decision || item.action || '').toLowerCase(),
    sessionId: session.id,
    topic: session.topic,
    date: session.created_at,
  }));
}

function computeStats(allDecisions) {
  const stats = new Map();

  for (const cat of RUBRIC_CATEGORIES) {
    stats.set(cat, { accept: 0, flag: 0, research: 0, total: 0 });
  }

  for (const d of allDecisions) {
    const cat = d.category;
    if (!stats.has(cat)) {
      stats.set(cat, { accept: 0, flag: 0, research: 0, total: 0 });
    }
    const s = stats.get(cat);
    s.total++;

    if (d.decision.includes('accept')) s.accept++;
    else if (d.decision.includes('flag')) s.flag++;
    else if (d.decision.includes('research') || d.decision.includes('needs')) s.research++;
    else s.accept++; // default
  }

  return stats;
}

function generateRecommendations(stats) {
  const recs = [];

  for (const [cat, s] of stats) {
    if (s.total === 0) continue;

    const acceptRate = s.accept / s.total;
    const flagRate = s.flag / s.total;
    const researchRate = s.research / s.total;

    // High accept rate = category may not need as much scrutiny
    if (acceptRate > 0.9 && s.total >= 3) {
      recs.push({
        category: cat,
        type: 'reduce_weight',
        message: `${cat}: ${(acceptRate * 100).toFixed(0)}% acceptance rate across ${s.total} reviews — consider reducing scrutiny weight or auto-accepting`,
      });
    }

    // High research rate = category is consistently problematic
    if (researchRate > 0.3 && s.total >= 3) {
      recs.push({
        category: cat,
        type: 'increase_weight',
        message: `${cat}: ${(researchRate * 100).toFixed(0)}% research-needed rate — consider adding pre-brainstorm research checklist for this category`,
      });
    }

    // High flag rate = category needs attention but isn't blocking
    if (flagRate > 0.5 && s.total >= 3) {
      recs.push({
        category: cat,
        type: 'refine_criteria',
        message: `${cat}: ${(flagRate * 100).toFixed(0)}% flag rate — consider refining the flagging criteria to be more specific`,
      });
    }
  }

  return recs;
}

function formatReport(sessions, allDecisions, stats, recs) {
  const lines = [];
  lines.push('');
  lines.push('# Chairman Review Analysis Report');
  lines.push('═'.repeat(50));
  lines.push('');
  lines.push(`Sessions analyzed: ${sessions.length}`);
  lines.push(`Total decisions:   ${allDecisions.length}`);
  lines.push('');

  // Category breakdown
  lines.push('## Category Breakdown');
  lines.push('─'.repeat(50));
  lines.push(`${'Category'.padEnd(25)} ${'Accept'.padEnd(8)} ${'Flag'.padEnd(8)} ${'Research'.padEnd(10)} Total`);
  lines.push('─'.repeat(50));

  for (const cat of RUBRIC_CATEGORIES) {
    const s = stats.get(cat) || { accept: 0, flag: 0, research: 0, total: 0 };
    if (s.total > 0) {
      const acceptPct = `${((s.accept / s.total) * 100).toFixed(0)}%`;
      const flagPct = `${((s.flag / s.total) * 100).toFixed(0)}%`;
      const resPct = `${((s.research / s.total) * 100).toFixed(0)}%`;
      lines.push(`${cat.padEnd(25)} ${acceptPct.padEnd(8)} ${flagPct.padEnd(8)} ${resPct.padEnd(10)} ${s.total}`);
    } else {
      lines.push(`${cat.padEnd(25)} ${'—'.padEnd(8)} ${'—'.padEnd(8)} ${'—'.padEnd(10)} 0`);
    }
  }
  lines.push('');

  // Recommendations
  lines.push('## Rubric Tuning Recommendations');
  lines.push('─'.repeat(50));
  if (recs.length === 0) {
    lines.push('No recommendations yet — need more data (3+ reviews per category).');
  } else {
    for (const r of recs) {
      const icon = r.type === 'reduce_weight' ? '⬇️' : r.type === 'increase_weight' ? '⬆️' : '🔧';
      lines.push(`${icon}  ${r.message}`);
    }
  }
  lines.push('');

  // Session list
  if (sessions.length > 0) {
    lines.push('## Sessions with Chairman Reviews');
    lines.push('─'.repeat(50));
    for (const s of sessions.slice(0, 10)) {
      const date = new Date(s.created_at).toLocaleDateString();
      lines.push(`  ${date} — ${s.topic || 'Untitled'} (${s.domain || 'unknown'})`);
    }
    if (sessions.length > 10) {
      lines.push(`  ... and ${sessions.length - 10} more`);
    }
  }

  lines.push('');
  lines.push('═'.repeat(50));
  return lines.join('\n');
}

async function run() {
  const sessions = await fetchReviewData();

  if (sessions.length === 0) {
    console.log('');
    console.log('# Chairman Review Analysis Report');
    console.log('═'.repeat(50));
    console.log('');
    console.log('No brainstorm sessions with chairman reviews found.');
    console.log('');
    console.log('Chairman reviews are recorded when Step 8.7 fires during /brainstorm.');
    console.log('Run a few brainstorms with the chairman review checkpoint enabled,');
    console.log('then re-run this analysis to see patterns.');
    console.log('');
    console.log('═'.repeat(50));
    return;
  }

  const allDecisions = sessions.flatMap(extractDecisions);
  const stats = computeStats(allDecisions);
  const recs = generateRecommendations(stats);

  console.log(formatReport(sessions, allDecisions, stats, recs));
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
