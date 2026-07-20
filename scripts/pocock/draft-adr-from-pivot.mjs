#!/usr/bin/env node
/**
 * draft-adr-from-pivot.mjs — Auto-draft ADRs from brainstorm pivot_history (Child B)
 *
 * Scans brainstorm_sessions.metadata.pivot_history (JSONB array of
 * {pivots: string[], reason: string, pivoted_at: timestamptz, pre_pivot_debate_id?}).
 *
 * Confidence-scored drafts above threshold 0.7 INSERT into pocock_adrs
 * with status='proposed' for chairman review via accept_adr RPC.
 *
 * Hard cap: 5 drafts per cron tick (POCOCK_ADR_DRAFTS_PER_TICK env override).
 * Dedupe: Jaccard >=80% against existing pocock_adrs.title rejects.
 * Singleton: try_claim_cron_lock(name='pocock-adr-drafter', UUID owner, 6h TTL).
 *
 * Cross-Child A consumer loop: EXEC writes 3 deferral rows into
 * pocock_oos_findings for judiciary_verdicts / not_doing / pivot_history-writer
 * surfaces that are absent or unowned. Idempotent on re-run.
 *
 * SD: SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-B
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — every existing ADR title feeds
// the Jaccard dedupe check; a capped read past row 1000 would silently let a duplicate ADR
// through with no error.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const LOCK_NAME = 'pocock-adr-drafter';
const LOCK_OWNER = randomUUID();
const LOCK_TTL_SECONDS = 6 * 60 * 60;
const DRAFTS_PER_TICK = parseInt(process.env.POCOCK_ADR_DRAFTS_PER_TICK || '5', 10);
const CONFIDENCE_FLOOR = 0.7;
const DEDUPE_JACCARD_THRESHOLD = 0.8;
const DRY_RUN = process.argv.includes('--dry-run');
const SD_KEY_FOR_DEFERRAL = 'SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-B';

function log(level, msg, extra = {}) {
  console.error(JSON.stringify({ level, msg, ts: new Date().toISOString(), ...extra }));
}

async function claimLock() {
  const { data, error } = await supabase.rpc('try_claim_cron_lock', {
    p_name: LOCK_NAME, p_owner: LOCK_OWNER, p_ttl_seconds: LOCK_TTL_SECONDS,
  });
  if (error) { log('error', 'try_claim_cron_lock failed', { error: error.message }); return false; }
  return data === true;
}

async function releaseLock() {
  try {
    await supabase.rpc('release_cron_lock', { p_name: LOCK_NAME, p_owner: LOCK_OWNER });
  } catch (e) { log('warn', 'release_cron_lock failed', { error: e.message }); }
}

function tokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3),
  );
}

function jaccard(a, b) {
  const A = tokens(a); const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  const intersection = [...A].filter(t => B.has(t)).length;
  const union = new Set([...A, ...B]).size;
  return intersection / union;
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function computeConfidence(pivot) {
  // factors: reason length (norm to 200 chars), pivot count (>=2 strong),
  // unique-token count in reason
  const reasonLen = (pivot.reason || '').length;
  const pivotCount = Array.isArray(pivot.pivots) ? pivot.pivots.length : 0;
  const uniqueTokens = tokens(pivot.reason).size;
  const score =
    Math.min(reasonLen / 200, 1) * 0.4 +
    Math.min(pivotCount / 2, 1) * 0.3 +
    Math.min(uniqueTokens / 30, 1) * 0.3;
  return Math.round(score * 1000) / 1000;
}

async function existingAdrTitles() {
  let rows = [];
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('pocock_adrs')
      .select('id, title')
      .order('id', { ascending: true }));
  } catch { /* fail-open: empty list (matches prior data||[] fallback on error) */ }
  return rows.map(r => r.title);
}

async function nextAdrNumber() {
  const { data } = await supabase
    .from('pocock_adrs')
    .select('adr_number')
    .order('adr_number', { ascending: false })
    .limit(1);
  return (data && data[0] ? data[0].adr_number : 0) + 1;
}

async function recordOosFinding({ description, rationale, source }) {
  if (DRY_RUN) {
    log('info', 'DRY_RUN: would record OOS finding', { description, rationale });
    return;
  }
  const { error } = await supabase.from('pocock_oos_findings').insert({
    category: 'auto_draft_rejected',
    description, rationale,
    rejected_in_sd: SD_KEY_FOR_DEFERRAL,
    source: source || {},
  });
  if (error) log('warn', 'pocock_oos_findings INSERT failed', { error: error.message });
}

async function recordDeferralLoop() {
  // Idempotent: only insert deferrals once per SD
  const { data: existing } = await supabase
    .from('pocock_oos_findings')
    .select('id')
    .eq('rejected_in_sd', SD_KEY_FOR_DEFERRAL)
    .eq('category', 'cross_cutting');
  if (existing && existing.length >= 3) return;

  const deferrals = [
    {
      category: 'cross_cutting',
      description: 'judiciary_verdicts table absent from EHG_Engineer schema',
      rationale: 'Child B brief listed judiciary verdicts as a draft-adr-from-pivot input source. Table verified absent (PGRST205) at LEAD time. Deferred per fail-soft pattern: drafter operates on pivot_history alone; judiciary integration to be revisited via follow-up SD if/when judiciary_verdicts ships.',
      rejected_in_sd: SD_KEY_FOR_DEFERRAL,
    },
    {
      category: 'cross_cutting',
      description: 'not_doing free-text entries lack structured-field parsing',
      rationale: 'brainstorm_sessions.metadata.not_doing entries are free-text strings, not structured records. Heuristic-only parsing exceeded Child B scope. Future SD can introduce a brainstorm pre-flight to structure not_doing entries (category, rationale, rejected_in_brainstorm_id).',
      rejected_in_sd: SD_KEY_FOR_DEFERRAL,
    },
    {
      category: 'cross_cutting',
      description: 'brainstorm_sessions.metadata.pivot_history live writer not confirmed',
      rationale: 'Drafter operates against existing pivot_history rows for the 12 seed ADR backfill. Live cron writer that populates pivot_history during brainstorm sessions is not yet confirmed. Follow-up SD: instrument brainstorm session lifecycle to emit pivot_history entries.',
      rejected_in_sd: SD_KEY_FOR_DEFERRAL,
    },
  ];
  if (DRY_RUN) {
    log('info', 'DRY_RUN: would record 3 deferral loop entries');
    return;
  }
  const { error } = await supabase.from('pocock_oos_findings').insert(deferrals);
  if (error) log('warn', 'deferral loop INSERT failed', { error: error.message });
  else log('info', 'recorded 3 deferral rows for cross-Child A consumer loop');
}

async function fetchPivotHistorySources() {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('brainstorm_sessions')
    .select('id, metadata, created_at')
    .gte('created_at', cutoff)
    .limit(500);
  if (error) {
    log('warn', 'brainstorm_sessions fetch failed', { error: error.message });
    return [];
  }
  const pivots = [];
  for (const session of data || []) {
    const history = session.metadata && Array.isArray(session.metadata.pivot_history)
      ? session.metadata.pivot_history : [];
    for (const entry of history) {
      pivots.push({ session_id: session.id, ...entry });
    }
  }
  return pivots;
}

async function main() {
  const claimed = await claimLock();
  if (!claimed) {
    log('info', 'cron lock held by another tick — no-op exit');
    process.exit(0);
  }

  try {
    await recordDeferralLoop();

    const pivots = await fetchPivotHistorySources();
    log('info', 'pivot_history rows fetched', { count: pivots.length });

    if (pivots.length === 0) {
      log('info', 'no pivot_history entries to draft from — exiting cleanly');
      return;
    }

    const existing = await existingAdrTitles();
    let nextNum = await nextAdrNumber();
    let drafted = 0;

    // Sort pivots by confidence descending so we draft the strongest first
    const scored = pivots
      .map(p => ({ ...p, _confidence: computeConfidence(p) }))
      .sort((a, b) => b._confidence - a._confidence);

    for (const pivot of scored) {
      if (drafted >= DRAFTS_PER_TICK) {
        await recordOosFinding({
          description: (pivot.reason || '').slice(0, 200),
          rationale: `weekly drafts-per-tick cap of ${DRAFTS_PER_TICK} reached`,
          source: { confidence: pivot._confidence, session_id: pivot.session_id },
        });
        continue;
      }

      if (pivot._confidence < CONFIDENCE_FLOOR) {
        await recordOosFinding({
          description: (pivot.reason || '').slice(0, 200),
          rationale: `confidence ${pivot._confidence} below floor ${CONFIDENCE_FLOOR}`,
          source: { session_id: pivot.session_id },
        });
        continue;
      }

      // Build candidate title from pivot reason (first 80 chars, slug for filename)
      const candidateTitle = (pivot.reason || '').trim().split('\n')[0].slice(0, 100);
      if (!candidateTitle) continue;

      // Jaccard dedupe against existing ADR titles
      const maxSim = existing.length === 0
        ? 0
        : Math.max(...existing.map(t => jaccard(candidateTitle, t)));
      if (maxSim >= DEDUPE_JACCARD_THRESHOLD) {
        await recordOosFinding({
          description: candidateTitle,
          rationale: `Jaccard ${maxSim.toFixed(2)} >= ${DEDUPE_JACCARD_THRESHOLD} dedupe with existing ADR`,
          source: { session_id: pivot.session_id, confidence: pivot._confidence },
        });
        continue;
      }

      if (DRY_RUN) {
        log('info', 'DRY_RUN: would draft ADR', {
          adr_number: nextNum,
          title: candidateTitle,
          confidence: pivot._confidence,
        });
        drafted += 1;
        existing.push(candidateTitle);
        nextNum += 1;
        continue;
      }

      const body = `Auto-drafted from brainstorm pivot. Reason: ${(pivot.reason || '').slice(0, 600)}`;
      const { error } = await supabase.from('pocock_adrs').insert({
        adr_number: nextNum,
        slug: slugify(candidateTitle).slice(0, 60) || `auto-draft-${nextNum}`,
        title: candidateTitle,
        body,
        status: 'proposed',
        source_brainstorm_id: pivot.session_id,
      });
      if (error) {
        log('warn', 'pocock_adrs INSERT failed', { error: error.message, adr_number: nextNum });
        continue;
      }
      log('info', 'drafted ADR', { adr_number: nextNum, title: candidateTitle, confidence: pivot._confidence });
      drafted += 1;
      existing.push(candidateTitle);
      nextNum += 1;
    }

    log('info', 'draft-adr-from-pivot run complete', { drafted });
  } finally {
    await releaseLock();
  }
}

main().catch(err => {
  log('error', 'fatal error', { error: err.message, stack: err.stack });
  releaseLock().finally(() => process.exit(1));
});
