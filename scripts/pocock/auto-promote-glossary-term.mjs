#!/usr/bin/env node
/**
 * auto-promote-glossary-term.mjs — Pocock glossary auto-promotion (Child A)
 *
 * Scans sd_phase_handoffs body + feedback table description (and MEMORY.md
 * when running locally) for terms with >=3 occurrences in a 7d rolling window.
 *
 * Drafts qualifying terms to pocock_glossary_terms (status='draft') with a
 * computed confidence_score. Rejected candidates (stop-word, below floor,
 * >10/week cap) go to pocock_oos_findings.
 *
 * Singleton via try_claim_cron_lock RPC (pattern reused from
 * scripts/cron/fr-c-generator.mjs:91). Failed claim exits 0, not 1.
 *
 * CI safety: when process.env.CI === 'true', MEMORY.md scan is SKIPPED
 * (file is user-local, unreachable from GitHub Actions runners — R4 mitigation
 * from LEAD risk-agent evidence 0f7a236b).
 *
 * Hard cap: 10 drafts per Friday cron tick.
 *
 * Algorithm:
 *   - Tokenize each source body via bigram + trigram regex.
 *   - Filter against STOP_WORDS (preloaded with the 30 seed term names so
 *     existing canonical terms are not re-promoted).
 *   - Count occurrences across the 7d window.
 *   - For each multi-token term with count >= 3, compute confidence:
 *       count        * 0.10
 *     + alias_hits   * 0.20  (Levenshtein <=2 variants observed)
 *     + handoff_hits * 0.20
 *     + retro_hits   * 0.30
 *     Floor: 0.70 — below floor → pocock_oos_findings rejected entry.
 *   - INSERT into pocock_glossary_terms (status='draft').
 *
 * SD: SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-A
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const LOCK_NAME = 'pocock-glossary-promotion-weekly';
// p_owner must be a UUID per fr-c-generator.mjs precedent (try_claim_cron_lock signature)
const LOCK_OWNER = randomUUID();
const LOCK_OWNER_LABEL = `auto-promote@${os.hostname()}@${process.pid}`;
const LOCK_TTL_SECONDS = 6 * 60 * 60; // 6h — covers a Friday cron run with safety margin
const WEEKLY_CAP = parseInt(process.env.POCOCK_GLOSSARY_WEEKLY_CAP || '10', 10);
const CONFIDENCE_FLOOR = 0.70;
const WINDOW_DAYS = 7;
const DRY_RUN = process.argv.includes('--dry-run');
const IS_CI = process.env.CI === 'true';

// Stop-word list: existing canonical glossary terms (do not re-promote) plus
// generic English bigrams/trigrams that contain only stop-words.
const STOP_WORDS = new Set([
  'leo protocol', 'auto proceed', 'auto-proceed', 'campaign mode', 'product mode',
  'handoff complete', 'gate passed', 'sub agent', 'sub-agent', 'retrospective written',
  'claim acquired', 'claim released', 'session start',
  'writer-consumer asymmetry', 'writer consumer asymmetry',
  'canonical writer', 'canonical pause', 'bypass verb',
  'mode declaration', 'ai-provenance', 'ai provenance',
  'dual-scan trigger', 'dual scan trigger',
  // Pocock-imported terms (Not Yet Witnessed quarantine section)
  'cascade trigger', 'stale resolver branch', 'stale-resolver-branch',
  'phantom completion', 'lineage gap', 'advisory verdict', 'god orchestrator',
  'shallow module', 'deep module', 'deletion test',
  'adapter', 'seam', 'leverage', 'locality', 'scope completion',
]);

// English stop-words that disqualify any candidate whose tokens are entirely
// from this set (catches "and the", "before the", "of the", etc.).
const ENGLISH_STOP_TOKENS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one',
  'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old',
  'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too',
  'use', 'with', 'this', 'that', 'from', 'have', 'will', 'been', 'were', 'they',
  'into', 'over', 'when', 'then', 'than', 'their', 'these', 'those', 'before',
  'after', 'about', 'above', 'below', 'between', 'through', 'during', 'against',
  'because', 'while', 'where', 'which', 'each', 'other', 'some', 'such', 'only',
  'also', 'just', 'very', 'much', 'many', 'most', 'more',
]);

function isEnglishStopOnly(candidate) {
  const tokens = candidate.split(/\s+/);
  return tokens.every(t => ENGLISH_STOP_TOKENS.has(t));
}

function log(level, msg, extra = {}) {
  const entry = { level, msg, ts: new Date().toISOString(), ...extra };
  console.error(JSON.stringify(entry));
}

async function claimLock() {
  const { data, error } = await supabase.rpc('try_claim_cron_lock', {
    p_name: LOCK_NAME,
    p_owner: LOCK_OWNER,
    p_ttl_seconds: LOCK_TTL_SECONDS,
  });
  if (error) {
    log('error', 'try_claim_cron_lock failed', { error: error.message });
    return false;
  }
  return data === true;
}

async function releaseLock() {
  try {
    await supabase.rpc('release_cron_lock', {
      p_name: LOCK_NAME,
      p_owner: LOCK_OWNER,
    });
  } catch (e) {
    log('warn', 'release_cron_lock failed (non-fatal)', { error: e.message });
  }
}

function extractTermCandidates(text) {
  if (!text || typeof text !== 'string') return [];
  const cleaned = text.toLowerCase().replace(/[^a-z0-9\s/-]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = cleaned.split(/\s+/).filter(t => t.length >= 3);
  const candidates = new Set();
  // Bigrams
  for (let i = 0; i < tokens.length - 1; i++) {
    candidates.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  // Trigrams
  for (let i = 0; i < tokens.length - 2; i++) {
    candidates.add(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  }
  return [...candidates].filter(c =>
    !STOP_WORDS.has(c) && !/^\d/.test(c) && !isEnglishStopOnly(c)
  );
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = a[i - 1] === b[j - 1]
        ? matrix[i - 1][j - 1]
        : 1 + Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1]);
    }
  }
  return matrix[a.length][b.length];
}

function clusterAliases(terms) {
  // Group near-identical variants. Returns Map<canonical, aliases[]>.
  const sorted = [...terms].sort();
  const groups = new Map();
  const consumed = new Set();
  for (const t of sorted) {
    if (consumed.has(t)) continue;
    const aliases = [];
    for (const other of sorted) {
      if (other !== t && !consumed.has(other) && levenshtein(t, other) <= 2) {
        aliases.push(other);
        consumed.add(other);
      }
    }
    groups.set(t, aliases);
    consumed.add(t);
  }
  return groups;
}

async function fetchSources() {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const handoffs = await supabase
    .from('sd_phase_handoffs')
    .select('id, executive_summary, deliverables_manifest, key_decisions, action_items, created_at')
    .gte('created_at', cutoff)
    .limit(2000);
  const feedback = await supabase
    .from('feedback')
    .select('id, title, description, created_at')
    .gte('created_at', cutoff)
    .limit(2000);
  if (handoffs.error) log('warn', 'handoffs fetch failed', { error: handoffs.error.message });
  if (feedback.error) log('warn', 'feedback fetch failed', { error: feedback.error.message });
  return {
    handoffs: handoffs.data || [],
    feedback: feedback.data || [],
  };
}

function scanMemoryMdLocal() {
  if (IS_CI) {
    log('info', 'CI=true — skipping MEMORY.md scan (user-local file)');
    return '';
  }
  const memoryPath = process.env.POCOCK_MEMORY_PATH
    || path.join(os.homedir(), '.claude', 'projects', 'C--Users-rickf-Projects--EHG-EHG-Engineer', 'memory', 'MEMORY.md');
  try {
    if (fs.existsSync(memoryPath)) {
      return fs.readFileSync(memoryPath, 'utf8');
    }
  } catch (e) {
    log('warn', 'MEMORY.md read failed (non-fatal)', { error: e.message, path: memoryPath });
  }
  return '';
}

function computeConfidence({ count, alias_hits, handoff_hits, retro_hits }) {
  return Math.min(
    1.0,
    count * 0.10 + alias_hits * 0.20 + handoff_hits * 0.20 + retro_hits * 0.30,
  );
}

async function existingTerms() {
  const { data } = await supabase
    .from('pocock_glossary_terms')
    .select('term, status');
  return new Set((data || []).map(r => r.term.toLowerCase()));
}

async function draftCountThisWeek() {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const { count, error } = await supabase
    .from('pocock_glossary_terms')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'draft')
    .gte('created_at', weekStart.toISOString());
  if (error) {
    log('warn', 'draftCountThisWeek failed', { error: error.message });
    return 0;
  }
  return count || 0;
}

async function recordOosFinding({ description, rationale, source }) {
  if (DRY_RUN) return;
  const { error } = await supabase.from('pocock_oos_findings').insert({
    category: 'auto_promote_rejected',
    description,
    rationale,
    source: source || {},
  });
  if (error) log('warn', 'pocock_oos_findings INSERT failed', { error: error.message });
}

async function draftTerm({ term, aliases, count, confidence, source_events }) {
  if (DRY_RUN) {
    log('info', 'DRY_RUN: would draft term', { term, count, confidence });
    return;
  }
  const { error } = await supabase.from('pocock_glossary_terms').insert({
    term,
    definition: 'AUTO-DRAFT pending chairman review. See source_events for context.',
    avoid_aliases: aliases,
    occurrence_count: count,
    confidence_score: confidence,
    status: 'draft',
    source_events,
  });
  if (error) log('warn', 'pocock_glossary_terms INSERT failed', { term, error: error.message });
  else log('info', 'drafted glossary term', { term, count, confidence });
}

async function main() {
  const claimed = await claimLock();
  if (!claimed) {
    log('info', 'cron lock held by another tick — no-op exit');
    process.exit(0);
  }

  try {
    const sources = await fetchSources();
    const memoryText = scanMemoryMdLocal();

    const corpusByType = {
      handoff: sources.handoffs.map(h =>
        [h.executive_summary, JSON.stringify(h.deliverables_manifest || ''),
         JSON.stringify(h.key_decisions || ''),
         JSON.stringify(h.action_items || '')].join(' '),
      ),
      feedback: sources.feedback.map(f => `${f.title || ''} ${f.description || ''}`),
      memory: memoryText ? [memoryText] : [],
    };

    // Tally candidates across sources
    const counts = new Map();   // term → { count, handoff, retro }
    for (const [src, bodies] of Object.entries(corpusByType)) {
      for (const body of bodies) {
        const cands = extractTermCandidates(body);
        for (const cand of cands) {
          const rec = counts.get(cand) || { count: 0, handoff: 0, retro: 0 };
          rec.count += 1;
          if (src === 'handoff') rec.handoff += 1;
          if (src === 'memory') rec.retro += 1; // memory treated as retro-equivalent signal
          counts.set(cand, rec);
        }
      }
    }

    // Filter to terms with >=3 occurrences
    const qualifying = [...counts.entries()].filter(([, r]) => r.count >= 3);
    log('info', 'qualifying candidates above 3-occurrence threshold', { count: qualifying.length });

    // Alias clustering
    const aliasGroups = clusterAliases(qualifying.map(([t]) => t));

    // Existing terms — do not re-draft
    const existing = await existingTerms();
    const drafted = await draftCountThisWeek();
    let remainingCap = Math.max(0, WEEKLY_CAP - drafted);
    log('info', 'weekly cap status', { drafted, cap: WEEKLY_CAP, remaining: remainingCap });

    for (const [canonical, aliases] of aliasGroups.entries()) {
      const rec = counts.get(canonical);
      if (existing.has(canonical.toLowerCase())) continue;
      const confidence = computeConfidence({
        count: rec.count,
        alias_hits: aliases.length,
        handoff_hits: rec.handoff,
        retro_hits: rec.retro,
      });
      if (confidence < CONFIDENCE_FLOOR) {
        await recordOosFinding({
          description: canonical,
          rationale: `confidence_score ${confidence.toFixed(3)} below floor ${CONFIDENCE_FLOOR}`,
          source: { count: rec.count, handoff_hits: rec.handoff, retro_hits: rec.retro, aliases },
        });
        continue;
      }
      if (remainingCap <= 0) {
        await recordOosFinding({
          description: canonical,
          rationale: `weekly cap of ${WEEKLY_CAP} drafts already reached`,
          source: { count: rec.count, confidence },
        });
        continue;
      }
      await draftTerm({
        term: canonical,
        aliases,
        count: rec.count,
        confidence,
        source_events: [{ count: rec.count, handoff_hits: rec.handoff, retro_hits: rec.retro }],
      });
      remainingCap -= 1;
    }

    log('info', 'auto-promote run complete', { drafted_this_run: WEEKLY_CAP - drafted - remainingCap });
  } finally {
    await releaseLock();
  }
}

main().catch(err => {
  log('error', 'fatal error', { error: err.message, stack: err.stack });
  releaseLock().finally(() => process.exit(1));
});
