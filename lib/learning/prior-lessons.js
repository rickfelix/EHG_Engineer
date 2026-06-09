/**
 * QF-20260609-457: side-effect-free retrieval of prior lessons (issue_patterns + retrospectives).
 *
 * Extracted from scripts/phase-preflight.js (which is a CLI with module-level side effects, so it
 * could not be imported) so BOTH the manual phase-preflight step AND the enforced handoff precheck
 * can surface relevant history to the next worker at a phase transition. The learning loop was
 * closed on capture (failure-pattern-capture.js) but open on consumption — autonomous /loop workers
 * skipped the manual preflight, so prior lessons never reached them.
 *
 * No module-level DB client: IssueKnowledgeBase's constructor is inert (it reads the module-level
 * supabase inside search()), and retrospectives take an injected supabase client. Importing this
 * module performs no I/O.
 */
import { IssueKnowledgeBase } from './issue-knowledge-base.js';

// Phase-agnostic default categories for the handoff advisory (phase-preflight passes its own).
const DEFAULT_HANDOFF_CATEGORIES = ['process', 'database', 'testing', 'general'];

/**
 * Top issue patterns for an SD category across the given knowledge-base categories.
 * @param {IssueKnowledgeBase} kb - injected knowledge base (search() reads its own supabase)
 */
export async function searchIssuePatterns(kb, sdCategory, categories) {
  const cats = (categories && categories.length) ? categories : DEFAULT_HANDOFF_CATEGORIES;
  const results = [];
  for (const category of cats) {
    const patterns = await kb.search(sdCategory, { category, limit: 3, minSuccessRate: 0 });
    results.push(...patterns);
  }
  // De-duplicate by pattern_id, then rank by overall_score (search() shape).
  const unique = Array.from(new Map(results.map(p => [p.pattern_id, p])).values());
  unique.sort((a, b) => (b.overall_score || 0) - (a.overall_score || 0));
  return unique.slice(0, 5);
}

/**
 * Top published, quality-gated retrospectives ranked by category match + quality + recency.
 * @param {object} supabase - injected service client
 */
export async function searchRetrospectives(supabase, sdCategory, limit = 3) {
  const { data: retrospectives, error } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('status', 'PUBLISHED')
    .gte('quality_score', 70)
    .order('conducted_date', { ascending: false })
    .limit(20);

  if (error || !retrospectives) return [];

  const cat = String(sdCategory || '').toLowerCase();
  const scored = retrospectives.map(retro => {
    const categoryMatch = retro.learning_category?.toLowerCase().includes(cat) ? 1.0 : 0.3;
    const qualityScore = (retro.quality_score || 0) / 100;
    const recency = new Date(retro.conducted_date) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) ? 1.0 : 0.5;
    return { ...retro, relevance_score: categoryMatch * 0.5 + qualityScore * 0.3 + recency * 0.2 };
  });
  scored.sort((a, b) => b.relevance_score - a.relevance_score);
  return scored.slice(0, limit);
}

/**
 * Handoff-facing advisory: print the top prior lessons for an SD. NEVER throws — each half
 * (patterns / retrospectives) fails independently to []. Callers should still wrap in try/catch
 * for defense-in-depth, but this function is self-contained fail-open.
 * @returns {Promise<{patterns: any[], retrospectives: any[]}>}
 */
export async function surfacePriorLessons(supabase, sd, { kb } = {}) {
  const sdCategory = sd?.category || sd?.title || 'general';
  const knowledgeBase = kb || new IssueKnowledgeBase();
  const [patterns, retrospectives] = await Promise.all([
    searchIssuePatterns(knowledgeBase, sdCategory).catch(() => []),
    searchRetrospectives(supabase, sdCategory).catch(() => []),
  ]);

  if (patterns.length || retrospectives.length) {
    console.log('\n📚 Prior lessons (advisory — does not affect this handoff):');
    for (const p of patterns) {
      console.log(`   • [pattern] ${p.issue_summary || p.pattern_id} — success ${Math.round(p.success_rate || 0)}%, seen ${p.occurrence_count ?? '?'}×`);
    }
    for (const r of retrospectives) {
      console.log(`   • [retro] ${r.title || r.learning_category || r.id} — quality ${r.quality_score}`);
    }
  }
  return { patterns, retrospectives };
}
