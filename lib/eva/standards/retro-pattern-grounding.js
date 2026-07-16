/**
 * Retro / issue-pattern grounding injection block.
 *
 * SD-LEO-INFRA-STAGE-GROUNDING-INJECTOR-001 FR-2. The operating-model injector
 * grounds COST assumptions but no stage injects the fleet's accumulated LESSONS.
 * This module surfaces relevant retrospective learnings + recurring issue
 * patterns (from REAL retrospectives + issue_patterns rows) into a stage prompt,
 * keyed to the stage type so each stage gets lessons relevant to its domain.
 *
 * Fail-safe by contract: any missing supabase client, query error, or empty
 * result returns '' — it must NEVER break stage prompt assembly. It reads live
 * data (no mock) so a stage genuinely benefits from past lessons.
 */

// Stage-type -> the retrospective learning_category values + issue_patterns
// category values + free-text tag hints most relevant to that stage's claims.
// Unknown stage types fall through to a broad high-signal selection.
const STAGE_TYPE_KEYS = Object.freeze({
  competitive: { retroCategories: ['MARKET', 'COMPETITIVE', 'STRATEGY', 'BUSINESS'], issueCategories: ['process', 'quality'], hints: ['competit', 'pricing', 'market', 'positioning'] },
  architecture: { retroCategories: ['TECHNICAL', 'ARCHITECTURE', 'INFRASTRUCTURE'], issueCategories: ['technical', 'infrastructure', 'schema', 'process'], hints: ['architect', 'tech', 'stack', 'scalab', 'schema', 'migration'] },
  financial: { retroCategories: ['FINANCIAL', 'COST', 'REVENUE', 'BUSINESS'], issueCategories: ['process', 'data'], hints: ['financ', 'cost', 'revenue', 'pricing', 'projection'] },
  gtm: { retroCategories: ['GTM', 'MARKETING', 'DISTRIBUTION', 'GROWTH'], issueCategories: ['process'], hints: ['gtm', 'market', 'distribut', 'growth', 'channel'] },
});

function truncate(str, n) {
  if (!str) return '';
  const s = String(str).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// key_learnings / failure_patterns may be text, array, or JSON — normalise to a short string.
function firstText(value) {
  if (!value) return '';
  if (Array.isArray(value)) return firstText(value[0]);
  if (typeof value === 'object') {
    const v = value.learning || value.text || value.summary || value.description || Object.values(value)[0];
    return firstText(v);
  }
  return String(value);
}

/**
 * @param {object}   opts
 * @param {{from:Function}} opts.supabase   service/anon client (required; else '')
 * @param {string}   [opts.stageType='general']  competitive|architecture|financial|gtm|...
 * @param {number}   [opts.limit=4]         max patterns and max retro learnings emitted
 * @returns {Promise<string>}  formatted injection block, or '' (fail-safe)
 */
// Test/telemetry noise that is not a real engineering lesson (e.g. LLM-provider
// probe stubs with absurd occurrence counts). Excluded from the injected block.
const NOISE_RE = /test-stub|api error:\s*unknown|^\s*$/i;

function hintMatch(text, hints) {
  if (!hints || !hints.length) return true;
  const t = String(text || '').toLowerCase();
  return hints.some((h) => t.includes(h));
}

export async function getRetroPatternGroundingBlock({ supabase, stageType = 'general', limit = 4 } = {}) {
  if (!supabase || typeof supabase.from !== 'function') return '';
  const keys = STAGE_TYPE_KEYS[stageType] || null;
  try {
    // Recurring, still-active issue patterns — the fleet's repeat mistakes.
    // Over-fetch, then filter noise + stage-relevance client-side (the DB's
    // category taxonomy is coarse and learning_category is near-uniform, so
    // text-based relevance is more reliable than a server-side category filter).
    const { data: patternsRaw } = await supabase
      .from('issue_patterns')
      .select('issue_summary,category,severity,occurrence_count,prevention_checklist,trend')
      .eq('status', 'active')
      .order('occurrence_count', { ascending: false })
      .limit(60);
    const cleanPatterns = (patternsRaw || []).filter((p) => p.issue_summary && !NOISE_RE.test(p.issue_summary));
    let patterns = keys
      ? cleanPatterns.filter((p) => keys.issueCategories.includes(p.category) || hintMatch(p.issue_summary, keys.hints))
      : cleanPatterns;
    if (keys && patterns.length < limit) patterns = cleanPatterns; // fall back to broad high-signal

    // Recent retrospective learnings (learning_category is near-uniform, so
    // fetch recent broadly and match relevance on the learning text/title).
    const { data: retrosRaw } = await supabase
      .from('retrospectives')
      .select('title,key_learnings,failure_patterns')
      .not('key_learnings', 'is', null)
      .order('created_at', { ascending: false })
      .limit(80);
    const cleanRetros = (retrosRaw || [])
      .map((r) => ({ text: firstText(r.key_learnings) || firstText(r.failure_patterns), title: r.title }))
      .filter((l) => l.text && !NOISE_RE.test(l.text));
    let lessons = keys
      ? cleanRetros.filter((l) => hintMatch(l.text + ' ' + l.title, keys.hints))
      : cleanRetros;
    if (keys && lessons.length < limit) lessons = cleanRetros; // fall back to broad recent

    return format(patterns, lessons, stageType, limit);
  } catch {
    return '';
  }
}

// @param patterns raw issue_patterns rows; @param lessonList pre-normalised [{text,title}]
function format(patterns, lessonList, stageType, limit) {
  const lines = [];
  const pats = (patterns || []).slice(0, limit);
  const lessons = (lessonList || []).filter((l) => l && l.text).slice(0, limit);

  if (!pats.length && !lessons.length) return '';

  lines.push(`ACCUMULATED LESSONS (relevant to ${stageType} — ground your analysis in these, do not repeat past mistakes):`);
  if (pats.length) {
    lines.push('- Recurring issues to avoid:');
    for (const p of pats) {
      const prev = firstText(p.prevention_checklist);
      lines.push(`  • [${p.severity}/${p.occurrence_count}x${p.trend ? '/' + p.trend : ''}] ${truncate(p.issue_summary, 180)}${prev ? ' — prevent: ' + truncate(prev, 140) : ''}`);
    }
  }
  if (lessons.length) {
    lines.push('- Learnings from prior retrospectives:');
    for (const l of lessons) lines.push(`  • ${truncate(l.text, 200)}`);
  }
  return '\n' + lines.join('\n') + '\n';
}

export { STAGE_TYPE_KEYS };
