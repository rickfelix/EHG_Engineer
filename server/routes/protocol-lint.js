/**
 * Protocol Linter Dashboard API Routes
 * SD-PROTOCOL-LINTER-DASHBOARD-001
 *
 * Read-only endpoints consumed by /admin/protocol-lint in the EHG repo.
 * Backed by leo_lint_violations / leo_lint_rules / leo_lint_run_history
 * (shipped by parent SD-PROTOCOL-LINTER-001).
 *
 * Mount pattern: requireAuth + requireAdminRole at /api/admin/protocol-lint.
 *
 * Endpoints:
 *   GET /violations   paginated, filterable violations list
 *   GET /rules        rule registry with promotion eligibility
 *   GET /runs         last 30 days of lint run history
 */

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const ADMIN_ROLES = ['chairman', 'executive', 'system_admin_ops', 'admin'];
const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;
const RUNS_WINDOW_DAYS = 30;
const TREND_WINDOW_DAYS = 7;
const PROMOTION_RUN_LOOKBACK = 2;

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Require admin role on req.user.
 *
 * req.user is populated by requireAuth. Accepts either top-level role
 * or Supabase-style user_metadata.role. req.isAdmin (set by internal API key
 * path) short-circuits.
 */
export function requireAdminRole(req, res, next) {
  if (req.isAdmin) return next();
  const role = req.user?.user_metadata?.role ?? req.user?.role;
  if (!role || !ADMIN_ROLES.includes(role)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin role required',
      code: 'NOT_ADMIN'
    });
  }
  next();
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSizeRaw = parseInt(query.pageSize, 10) || PAGE_SIZE_DEFAULT;
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, pageSizeRaw));
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}

const router = Router();

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ────────────────────────────────────────────────────────────────────
// GET /violations — paginated, filterable
// ────────────────────────────────────────────────────────────────────
router.get('/violations', async (req, res) => {
  if (req.query.page !== undefined && parseInt(req.query.page, 10) < 1) {
    return res.status(400).json({ error: 'InvalidRequest', message: 'page must be >= 1', code: 'BAD_PAGE' });
  }

  const { page, pageSize, from, to } = parsePagination(req.query);
  const supabase = getSupabase();

  let q = supabase
    .from('leo_lint_violations')
    .select('violation_id, run_id, rule_id, section_id, file_path, severity, message, context, status, status_reason, detected_at, resolved_at, resolved_by', { count: 'exact' })
    .order('detected_at', { ascending: false })
    .range(from, to);

  if (req.query.severity) q = q.eq('severity', req.query.severity);
  if (req.query.rule_id) q = q.eq('rule_id', req.query.rule_id);
  if (req.query.file) q = q.eq('file_path', req.query.file);
  if (req.query.section_id) q = q.eq('section_id', req.query.section_id);
  if (req.query.status) q = q.eq('status', req.query.status);

  const { data, error, count } = await q;

  if (error) {
    console.error('[protocol-lint] violations query failed:', error.message);
    return res.status(500).json({ error: 'InternalError', message: error.message, code: 'QUERY_FAILED' });
  }

  res.json({
    data: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
    generated_at: new Date().toISOString()
  });
});

// ────────────────────────────────────────────────────────────────────
// GET /rules — registry with promotion_eligible flag
// ────────────────────────────────────────────────────────────────────
router.get('/rules', async (req, res) => {
  const supabase = getSupabase();

  const { data: rules, error: rulesErr } = await supabase
    .from('leo_lint_rules')
    .select('rule_id, severity, description, source_path, enabled, promoted_from_warn_at, created_at, updated_at')
    .eq('enabled', true)
    .order('rule_id', { ascending: true });

  if (rulesErr) {
    console.error('[protocol-lint] rules query failed:', rulesErr.message);
    return res.status(500).json({ error: 'InternalError', message: rulesErr.message, code: 'QUERY_FAILED' });
  }

  const { data: recentRuns } = await supabase
    .from('leo_lint_run_history')
    .select('run_id, started_at, trigger, passed')
    .eq('trigger', 'regen')
    .order('started_at', { ascending: false })
    .limit(PROMOTION_RUN_LOOKBACK);

  const recentRunIds = (recentRuns ?? []).map(r => r.run_id);

  let violationsByRule = new Map();
  if (recentRunIds.length > 0) {
    const { data: recentViolations } = await supabase
      .from('leo_lint_violations')
      .select('rule_id, run_id')
      .in('run_id', recentRunIds);
    for (const v of recentViolations ?? []) {
      const key = v.rule_id;
      violationsByRule.set(key, (violationsByRule.get(key) ?? 0) + 1);
    }
  }

  const sevenDaysAgo = new Date(Date.now() - TREND_WINDOW_DAYS * 86400_000).toISOString();
  const { data: recent7d } = await supabase
    .from('leo_lint_violations')
    .select('rule_id')
    .gte('detected_at', sevenDaysAgo);

  const countsByRule7d = new Map();
  for (const v of recent7d ?? []) {
    countsByRule7d.set(v.rule_id, (countsByRule7d.get(v.rule_id) ?? 0) + 1);
  }

  const enriched = (rules ?? []).map(r => ({
    ...r,
    occurrence_count_last_7d: countsByRule7d.get(r.rule_id) ?? 0,
    promotion_eligible: r.severity === 'warn'
      && recentRunIds.length >= PROMOTION_RUN_LOOKBACK
      && (violationsByRule.get(r.rule_id) ?? 0) === 0
  }));

  enriched.sort((a, b) => {
    if (a.promotion_eligible !== b.promotion_eligible) return a.promotion_eligible ? -1 : 1;
    return a.rule_id.localeCompare(b.rule_id);
  });

  res.json({
    data: enriched,
    total: enriched.length,
    regen_runs_considered: recentRunIds.length,
    generated_at: new Date().toISOString()
  });
});

// ────────────────────────────────────────────────────────────────────
// GET /runs — last 30 days of lint run history
// ────────────────────────────────────────────────────────────────────
router.get('/runs', async (req, res) => {
  const supabase = getSupabase();
  const since = new Date(Date.now() - RUNS_WINDOW_DAYS * 86400_000).toISOString();

  const { data, error, count } = await supabase
    .from('leo_lint_run_history')
    .select('run_id, trigger, total_violations, critical_count, passed, bypass_reason, started_at, ended_at, duration_ms, initiator, metadata', { count: 'exact' })
    .gte('started_at', since)
    .order('started_at', { ascending: false });

  if (error) {
    console.error('[protocol-lint] runs query failed:', error.message);
    return res.status(500).json({ error: 'InternalError', message: error.message, code: 'QUERY_FAILED' });
  }

  res.json({
    data: data ?? [],
    total: count ?? 0,
    window_days: RUNS_WINDOW_DAYS,
    generated_at: new Date().toISOString()
  });
});

// ────────────────────────────────────────────────────────────────────
// GET /trend — 7-day daily violation count (for dashboard chart)
// ────────────────────────────────────────────────────────────────────
router.get('/trend', async (req, res) => {
  const supabase = getSupabase();
  // Bucket window: today + (TREND_WINDOW_DAYS-1) prior days, inclusive, UTC-aligned
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (TREND_WINDOW_DAYS - 1));

  const { data, error } = await supabase
    .from('leo_lint_violations')
    .select('detected_at, severity')
    .gte('detected_at', since.toISOString())
    .order('detected_at', { ascending: true });

  if (error) {
    console.error('[protocol-lint] trend query failed:', error.message);
    return res.status(500).json({ error: 'InternalError', message: error.message, code: 'QUERY_FAILED' });
  }

  const buckets = new Map();
  for (let i = 0; i < TREND_WINDOW_DAYS; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, total: 0, block: 0, warn: 0 });
  }

  for (const v of data ?? []) {
    const key = v.detected_at.slice(0, 10);
    const b = buckets.get(key);
    if (!b) continue;
    b.total += 1;
    if (v.severity === 'block') b.block += 1;
    else if (v.severity === 'warn') b.warn += 1;
  }

  res.json({
    data: Array.from(buckets.values()),
    window_days: TREND_WINDOW_DAYS,
    generated_at: new Date().toISOString()
  });
});

export default router;
