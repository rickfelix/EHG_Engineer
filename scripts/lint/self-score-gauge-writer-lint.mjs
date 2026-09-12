#!/usr/bin/env node
/**
 * Self-score gauge writer-liveness lint.
 * QF-20260911-404: coordinator_self_score_age shipped `enabled: false` with a writer that had
 * produced ZERO rows ever (COORD_SELF_SCORE_V1 set nowhere, no --force bypass to reach it) --
 * a gauge with no writer is not a gauge. This lint is the durable version of that one-time
 * check: every ENABLED self-score-age gauge must name a writer that has actually produced a
 * row in the last 30 days. An enabled gauge with a silent writer would trip PERMANENTLY the
 * moment it goes live, exactly the failure class this QF exists to close.
 *
 * Scope: the 3 self-score-age gauges (adam/coordinator/solomon) specifically -- these share one
 * detector shape (staleSelfScoreDetector) and one failure mode (a ships-inert flag nobody ever
 * flips). A repo-wide "every registered gauge names a live writer" lint would need every gauge
 * entry to carry a writer-category field, which none besides these three do today; that is a
 * separate, larger effort, not smuggled into this QF's fix.
 *
 * KNOWN LIMITATION: this lint is not currently wired into any CI workflow or pre-commit hook --
 * it only runs when explicitly invoked. A future change that flips a self-score-age gauge to
 * enabled:true with a dead writer, without the author running this lint locally, would NOT be
 * caught automatically until someone runs it (or it is later wired into CI, tracked as a
 * follow-up, not part of this QF's scope).
 *
 * Usage: node scripts/lint/self-score-gauge-writer-lint.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { GAUGE_REGISTRY } from '../../lib/governance/gauge-registry.js';

const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

// Maps each self-score-age gauge id to the feedback.category its writer actually inserts into
// (lib/governance/role-self-score.cjs's buildFeedbackInsertRow -- one shared shape, per-role category).
const SELF_SCORE_GAUGE_CATEGORIES = {
  adam_self_score_age: 'adam_self_assessment',
  coordinator_self_score_age: 'coordinator_self_assessment',
  solomon_self_score_age: 'solomon_self_assessment',
};

export async function checkSelfScoreGaugeWriters(supabase) {
  const violations = [];
  for (const gauge of GAUGE_REGISTRY) {
    const category = SELF_SCORE_GAUGE_CATEGORIES[gauge.id];
    if (!category || !gauge.enabled) continue; // out of scope, or disabled (no live-writer promise made)
    const { data, error } = await supabase.from('feedback').select('created_at').eq('category', category).order('created_at', { ascending: false }).limit(1);
    if (error) { violations.push({ id: gauge.id, reason: `query failed: ${error.message}` }); continue; }
    const latest = data && data[0] ? new Date(data[0].created_at).getTime() : null;
    if (!latest || (Date.now() - latest) > THIRTY_DAYS_MS) {
      violations.push({ id: gauge.id, reason: latest ? `writer silent >30d (last row ${data[0].created_at})` : 'writer has never produced a row' });
    }
  }
  return violations;
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const violations = await checkSelfScoreGaugeWriters(supabase);
  if (violations.length) {
    console.error('[self-score-gauge-writer-lint] FAIL — enabled gauge(s) with a dead/silent writer:');
    for (const v of violations) console.error(`  - ${v.id}: ${v.reason}`);
    process.exit(1);
  }
  console.log('[self-score-gauge-writer-lint] PASS — every enabled self-score-age gauge has a writer that fired within 30d.');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('[self-score-gauge-writer-lint] FATAL', e && e.message ? e.message : e); process.exit(1); });
}
