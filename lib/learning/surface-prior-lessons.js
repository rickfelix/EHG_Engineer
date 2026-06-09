/**
 * Surface Prior Lessons — consumption side of the learning loop.
 * SD-LEO-FIX-SURFACE-PRIOR-LESSONS-001
 *
 * Side-effect-free, dependency-injected retrieval of prior issue patterns +
 * retrospectives relevant to an SD's category + the phase being entered. Extracted
 * from scripts/phase-preflight.js (where the logic was unexported + only reachable via a
 * MANUAL preflight step autonomous /loop workers skip) so it can ALSO be surfaced at the
 * handoff precheck — the path autonomous workers actually run.
 *
 * Pure data + formatting: clients (kb, supabase) are injected, never imported as
 * module-level singletons, and no I/O/console happens here. Callers decide how to display.
 */

/**
 * Phase-specific search strategies (which issue-pattern categories + retrospective focus
 * are relevant when entering each phase). Single source shared by phase-preflight.js and
 * the handoff precheck surfacing step.
 */
export const PHASE_STRATEGIES = {
  EXEC: {
    name: 'Implementation',
    categories: ['database', 'testing', 'build', 'code_structure', 'performance', 'security'],
    retrospective_focus: ['what_needs_improvement', 'failure_patterns', 'key_learnings'],
    context: 'You are about to start implementation. These patterns show common issues encountered during coding.'
  },
  PLAN: {
    name: 'Planning & Design',
    categories: ['protocol', 'testing', 'over_engineering', 'code_structure'],
    retrospective_focus: ['success_patterns', 'key_learnings', 'what_went_well'],
    context: 'You are creating a PRD. These patterns show proven approaches and pitfalls to avoid in design.'
  },
  LEAD: {
    name: 'Strategic Approval',
    categories: ['over_engineering', 'protocol', 'general'],
    retrospective_focus: ['failure_patterns', 'what_needs_improvement', 'business_value_delivered'],
    context: 'You are evaluating an SD. These patterns show strategic issues and over-engineering risks.'
  }
};

/**
 * Resolve the phase strategy for a handoff type (e.g. "LEAD-TO-PLAN" -> PLAN, the phase being
 * ENTERED; "LEAD-FINAL-APPROVAL" -> LEAD). Falls back to EXEC.
 * @param {string} handoffTypeOrPhase
 * @returns {object} a PHASE_STRATEGIES entry
 */
export function resolvePhaseStrategy(handoffTypeOrPhase) {
  const t = String(handoffTypeOrPhase || '').toUpperCase();
  const dest = t.includes('-TO-') ? t.split('-TO-')[1].split('-')[0] : t.split('-')[0];
  return PHASE_STRATEGIES[dest] || PHASE_STRATEGIES.EXEC;
}

/**
 * Search issue patterns relevant to the SD category across the phase's categories.
 * @param {object} kb - an IssueKnowledgeBase instance (injected); must expose async search(query, options)
 * @param {string} sdCategory
 * @param {object} phaseStrategy - a PHASE_STRATEGIES entry (uses .categories)
 * @returns {Promise<Array>} up to 5 unique patterns sorted by overall_score desc
 */
export async function searchIssuePatterns(kb, sdCategory, phaseStrategy) {
  const results = [];
  for (const category of (phaseStrategy?.categories || [])) {
    const patterns = await kb.search(sdCategory, { category, limit: 3, minSuccessRate: 0 });
    results.push(...patterns);
  }
  // De-duplicate by pattern_id
  const uniquePatterns = Array.from(new Map(results.map((p) => [p.pattern_id, p])).values());
  // Sort by overall score
  uniquePatterns.sort((a, b) => b.overall_score - a.overall_score);
  return uniquePatterns.slice(0, 5); // Top 5 patterns
}

/**
 * Search recent high-quality retrospectives, scored for relevance to the SD category.
 * @param {object} supabase - a Supabase client (injected)
 * @param {string} sdCategory
 * @param {object} _phaseStrategy - accepted for signature parity (unused)
 * @param {number} [limit=3]
 * @returns {Promise<Array>} top-N retrospectives by relevance; [] on error (never throws here)
 */
export async function searchRetrospectives(supabase, sdCategory, _phaseStrategy, limit = 3) {
  const { data: retrospectives, error } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('status', 'PUBLISHED')
    .gte('quality_score', 70)
    .order('conducted_date', { ascending: false })
    .limit(20); // Get recent 20 to filter

  if (error || !retrospectives) {
    return []; // side-effect-free: caller decides whether/how to log
  }

  const cat = String(sdCategory || '').toLowerCase();
  const scored = retrospectives.map((retro) => {
    const categoryMatch = retro.learning_category?.toLowerCase().includes(cat) ? 1.0 : 0.3;
    const qualityScore = retro.quality_score / 100;
    const recency = new Date(retro.conducted_date) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) ? 1.0 : 0.5;
    return { ...retro, relevance_score: categoryMatch * 0.5 + qualityScore * 0.3 + recency * 0.2 };
  });

  scored.sort((a, b) => b.relevance_score - a.relevance_score);
  return scored.slice(0, limit);
}

/**
 * Combined retrieval: prior issue patterns + retrospectives for an SD + phase.
 * @param {object} args
 * @param {object} args.kb - IssueKnowledgeBase instance
 * @param {object} args.supabase - Supabase client
 * @param {string} args.sdCategory
 * @param {object} args.phaseStrategy - a PHASE_STRATEGIES entry
 * @param {number} [args.limit=3]
 * @returns {Promise<{patterns: Array, retrospectives: Array}>}
 */
export async function surfacePriorLessons({ kb, supabase, sdCategory, phaseStrategy, limit = 3 }) {
  const patterns = await searchIssuePatterns(kb, sdCategory, phaseStrategy);
  const retrospectives = await searchRetrospectives(supabase, sdCategory, phaseStrategy, limit);
  return { patterns, retrospectives };
}

/**
 * Pure formatter for an advisory prior-lessons block (no I/O).
 * @param {Array} [patterns=[]]
 * @param {Array} [retrospectives=[]]
 * @returns {string}
 */
export function formatPriorLessons(patterns = [], retrospectives = []) {
  const lines = ['📚 Prior lessons (advisory — informational; does NOT affect the gate verdict):'];
  if (!patterns.length && !retrospectives.length) {
    lines.push('   (no relevant prior patterns or retrospectives found)');
    return lines.join('\n');
  }
  if (patterns.length) {
    lines.push(`   Issue patterns (${patterns.length}):`);
    for (const p of patterns) {
      const id = p.pattern_id || p.id || '?';
      const summary = String(p.issue_summary || p.summary || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      lines.push(`     • [${id}] ${summary}`);
    }
  }
  if (retrospectives.length) {
    lines.push(`   Retrospectives (${retrospectives.length}):`);
    for (const r of retrospectives) {
      const label = String(r.title || r.sd_id || r.sd_key || 'retrospective').replace(/\s+/g, ' ').trim().slice(0, 120);
      lines.push(`     • ${label}`);
    }
  }
  return lines.join('\n');
}
