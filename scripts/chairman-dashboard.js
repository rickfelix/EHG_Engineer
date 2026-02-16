/**
 * Chairman Dashboard CLI
 *
 * Displays pending decisions, override history, preference summary,
 * and decision queue status in a terminal-friendly format.
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-I
 *
 * Usage: node scripts/chairman-dashboard.js [--json]
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JSON_MODE = process.argv.includes('--json');

function log(msg = '') {
  if (!JSON_MODE) console.log(msg);
}

async function getPendingDecisions() {
  const { data, error } = await supabase
    .from('chairman_decisions')
    .select('id, venture_id, lifecycle_stage, status, summary, created_at, decision_type, blocking')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: data || [], error: null };
}

async function getRecentDecisions(limit = 10) {
  const { data, error } = await supabase
    .from('chairman_decisions')
    .select('id, venture_id, lifecycle_stage, status, decision, summary, rationale, created_at, resolved_at')
    .neq('status', 'pending')
    .order('resolved_at', { ascending: false })
    .limit(limit);

  if (error) return { data: [], error: error.message };
  return { data: data || [], error: null };
}

async function getOverrideSummary() {
  const { data, error } = await supabase
    .from('chairman_overrides')
    .select('id, component, system_score, override_score, outcome, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return { data: [], error: error.message };
  return { data: data || [], error: null };
}

async function getPreferenceSummary() {
  const { data, error } = await supabase
    .from('chairman_preferences')
    .select('preference_key, preference_value, value_type, venture_id, source, updated_at')
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) return { data: [], error: error.message };
  return { data: data || [], error: null };
}

async function getDecisionStats() {
  const { data: all } = await supabase
    .from('chairman_decisions')
    .select('status, decision_type, blocking');

  if (!all) return { total: 0, pending: 0, approved: 0, rejected: 0, advisory: 0, blocking: 0 };

  return {
    total: all.length,
    pending: all.filter(d => d.status === 'pending').length,
    approved: all.filter(d => d.status === 'approved').length,
    rejected: all.filter(d => d.status === 'rejected').length,
    advisory: all.filter(d => d.decision_type === 'advisory' || d.status === 'info').length,
    blocking: all.filter(d => d.blocking === true && d.status === 'pending').length,
  };
}

function formatAge(dateStr) {
  const ms = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(ms / 60000)}m`;
}

async function main() {
  log('');
  log('='.repeat(60));
  log('  CHAIRMAN GOVERNANCE DASHBOARD');
  log('='.repeat(60));

  // Stats
  const stats = await getDecisionStats();
  log('');
  log('  Decision Stats');
  log('  ' + '-'.repeat(40));
  log(`  Total Decisions:  ${stats.total}`);
  log(`  Pending:          ${stats.pending}${stats.blocking > 0 ? ` (${stats.blocking} blocking)` : ''}`);
  log(`  Approved:         ${stats.approved}`);
  log(`  Rejected:         ${stats.rejected}`);
  log(`  Advisory:         ${stats.advisory}`);

  // Pending Decisions
  const { data: pending, error: pendingErr } = await getPendingDecisions();
  log('');
  log('  Pending Decisions Queue');
  log('  ' + '-'.repeat(40));
  if (pendingErr) {
    log(`  Error: ${pendingErr}`);
  } else if (pending.length === 0) {
    log('  No pending decisions');
  } else {
    for (const d of pending) {
      const age = formatAge(d.created_at);
      const blockTag = d.blocking ? ' [BLOCKING]' : '';
      const typeTag = d.decision_type === 'advisory' ? ' (advisory)' : '';
      log(`  [${d.id.slice(0, 8)}] Stage ${d.lifecycle_stage} | Age: ${age}${blockTag}${typeTag}`);
      log(`           ${d.summary || 'No summary'}`);
    }
  }

  // Recent Resolved Decisions
  const { data: recent } = await getRecentDecisions(5);
  log('');
  log('  Recent Decisions (last 5)');
  log('  ' + '-'.repeat(40));
  if (recent.length === 0) {
    log('  No resolved decisions');
  } else {
    for (const d of recent) {
      const status = d.status === 'approved' ? 'APPROVED' : d.status === 'rejected' ? 'REJECTED' : d.status.toUpperCase();
      log(`  [${d.id.slice(0, 8)}] Stage ${d.lifecycle_stage} → ${status}`);
      if (d.rationale) log(`           ${d.rationale.slice(0, 60)}`);
    }
  }

  // Override Summary
  const { data: overrides } = await getOverrideSummary();
  log('');
  log('  Override History (last 5)');
  log('  ' + '-'.repeat(40));
  if (overrides.length === 0) {
    log('  No overrides recorded');
  } else {
    for (const o of overrides.slice(0, 5)) {
      const delta = (parseFloat(o.override_score) - parseFloat(o.system_score)).toFixed(1);
      const dir = delta > 0 ? '+' : '';
      log(`  ${o.component}: ${o.system_score} → ${o.override_score} (${dir}${delta}) [${o.outcome}]`);
    }
  }

  // Preferences
  const { data: prefs } = await getPreferenceSummary();
  log('');
  log('  Active Preferences');
  log('  ' + '-'.repeat(40));
  if (prefs.length === 0) {
    log('  No preferences set');
  } else {
    const globalPrefs = prefs.filter(p => !p.venture_id);
    const venturePrefs = prefs.filter(p => p.venture_id);
    if (globalPrefs.length > 0) {
      log('  Global:');
      for (const p of globalPrefs.slice(0, 5)) {
        const val = typeof p.preference_value === 'object' ? JSON.stringify(p.preference_value) : p.preference_value;
        log(`    ${p.preference_key} = ${val} (${p.value_type})`);
      }
    }
    if (venturePrefs.length > 0) {
      log(`  Venture-specific: ${venturePrefs.length} preference(s)`);
    }
  }

  log('');
  log('='.repeat(60));

  // JSON output mode
  if (JSON_MODE) {
    const output = { stats, pending, recent, overrides, prefs };
    console.log(JSON.stringify(output, null, 2));
  }
}

main().catch(err => {
  console.error('Dashboard error:', err.message);
  process.exit(1);
});
