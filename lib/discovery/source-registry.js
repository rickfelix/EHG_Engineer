/**
 * Mission-Anchored Discovery Source Registry
 * SD-MAN-INFRA-STAGE-REVIVAL-PLUMBING-001 (FR-1)
 *
 * Replaces the hardcoded single-competitor path at OpportunityDiscoveryService
 * runScan Step 1. Each source emits the competitorData-shaped payload the
 * gap-analyzer consumes: { competitor_reference, competitive_intelligence:
 * { company, product, market, swot } }.
 *
 * STRUCTURAL NO-FORCING RULE: rows produced via this registry are calibration
 * cohort ground truth for SD-MAN-INFRA-GATE-BAR-REGIME-001 — NOT revenue
 * candidates. No launches from cohort output; gates are never forced to make
 * a cohort idea pass (chairman ruling, sitting #1 item 3, 2026-06-11).
 *
 * GATED: scans run only via explicit invocation (chairman button / CLI). No
 * cron, no auto-dispatch; the dark→live conjunctive enable stays false (TR-1).
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

function db() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** Shape helper: every source funnels into the gap-analyzer's expected payload. */
function shapePayload(sourceKey, reference, { company = {}, product = {}, market = {}, swot = {} } = {}) {
  return {
    source_key: sourceKey,
    competitor_reference: reference,
    competitive_intelligence: { company, product, market, swot },
  };
}

/**
 * (1) harness_exhaust — mine feedback / issue_patterns / retrospectives for
 * venture-shaped problems. The factory's own friction is demand evidence.
 */
async function gatherHarnessExhaust() {
  const supabase = db();
  if (!supabase) throw new Error('harness_exhaust requires Supabase credentials');
  const [{ data: fb }, { data: pats }, { data: retros }] = await Promise.all([
    supabase.from('feedback').select('category, description').eq('status', 'new').limit(40),
    supabase.from('issue_patterns').select('issue_summary, category, occurrence_count').eq('status', 'active').limit(20),
    supabase.from('retrospectives').select('key_learnings').order('created_at', { ascending: false }).limit(10),
  ]);
  return shapePayload('harness_exhaust', 'EHG harness exhaust (internal friction corpus)', {
    market: {
      observed_problems: (fb || []).map((f) => `[${f.category}] ${String(f.description).slice(0, 300)}`),
      recurring_patterns: (pats || []).map((p) => `[x${p.occurrence_count} ${p.category}] ${String(p.issue_summary).slice(0, 300)}`),
      operator_learnings: (retros || []).flatMap((r) => (Array.isArray(r.key_learnings) ? r.key_learnings : [])).slice(0, 30),
    },
  });
}

/**
 * (2) intake_streams — re-point the EXISTING youtube/todoist intake plumbing
 * (lib/integrations/youtube/subscription-scanner.js delivery targets
 * eva_youtube_intake / eva_todoist_intake) as a discovery source. Reuse, not
 * rebuild: this reads the landed intake rows, not the APIs.
 */
async function gatherIntakeStreams() {
  const supabase = db();
  if (!supabase) throw new Error('intake_streams requires Supabase credentials');
  const [{ data: yt }, { data: td }] = await Promise.all([
    supabase.from('eva_youtube_intake').select('title, summary, created_at').order('created_at', { ascending: false }).limit(30),
    supabase.from('eva_todoist_intake').select('content, created_at').order('created_at', { ascending: false }).limit(30),
  ]);
  return shapePayload('intake_streams', 'Chairman intake streams (YouTube + Todoist)', {
    market: {
      youtube_signals: (yt || []).map((v) => `${v.title}: ${String(v.summary || '').slice(0, 240)}`),
      todoist_signals: (td || []).map((t) => String(t.content).slice(0, 240)),
    },
  });
}

/**
 * (3) competitor_teardown — the pre-existing path, registered. Routes through
 * the canonical competitive-intelligence layer.
 */
async function gatherCompetitorTeardown({ targetUrl, serviceConfig } = {}) {
  if (!targetUrl) throw new Error('competitor_teardown requires targetUrl');
  const { analyzeCompetitor } = await import('../competitive-intelligence/index.js');
  return analyzeCompetitor(targetUrl, { serviceConfig });
}

/**
 * (4) capability_overhang — scan the capability ledger for built-but-
 * unleveraged capabilities (zero/low reuse) that could anchor a venture.
 */
async function gatherCapabilityOverhang() {
  const supabase = db();
  if (!supabase) throw new Error('capability_overhang requires Supabase credentials');
  const { data: caps, error } = await supabase.from('v_capability_ledger').select('*').limit(50);
  if (error) throw new Error(`capability ledger read failed: ${error.message}`);
  return shapePayload('capability_overhang', 'EHG capability overhang (built, unleveraged)', {
    product: { existing_capabilities: (caps || []).map((c) => JSON.parse(JSON.stringify(c))) },
  });
}

/**
 * The registry. Order = mission priority. nursery_recombination is DEFERRED
 * until the calibration cohort reaches n>=3 ventures (nothing to recombine yet).
 */
export const DISCOVERY_SOURCES = [
  { key: 'harness_exhaust', name: 'Harness exhaust mining', active: true, gather: gatherHarnessExhaust },
  { key: 'intake_streams', name: 'Chairman intake streams (YouTube/Todoist)', active: true, gather: gatherIntakeStreams },
  { key: 'competitor_teardown', name: 'Competitor teardown (canonical CI layer)', active: true, gather: gatherCompetitorTeardown },
  { key: 'capability_overhang', name: 'Capability overhang scan', active: true, gather: gatherCapabilityOverhang },
  { key: 'nursery_recombination', name: 'Nursery recombination', active: false, reason: 'DEFERRED until calibration cohort n>=3 — no nursery corpus to recombine yet', gather: null },
];

export function listSources() {
  return DISCOVERY_SOURCES.map(({ key, name, active, reason }) => ({ key, name, active, ...(reason ? { reason } : {}) }));
}

export function getSource(key) {
  return DISCOVERY_SOURCES.find((s) => s.key === key) || null;
}

/**
 * Resolve + run a source's gather. Throws a navigable error for unknown or
 * deferred sources (replaces the old 'Market trend scans require target URL'
 * dead-end throw at runScan Step 1).
 */
export async function gatherFromSource(key, params = {}) {
  const source = getSource(key);
  if (!source) {
    throw new Error(`Unknown discovery source '${key}'. Available: ${listSources().map((s) => s.key).join(', ')}`);
  }
  if (!source.active) {
    throw new Error(`Discovery source '${key}' is deferred: ${source.reason}`);
  }
  return source.gather(params);
}
