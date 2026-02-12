/**
 * Agent Experience Factory
 * Dynamically assembles experienced agent context at invocation time
 *
 * compose(invocationContext) → {promptPreamble, metadata}
 *
 * Queries issue_patterns, retrospectives, and skills at invocation time,
 * applies token budgets with priority-based truncation, and caches
 * per session to avoid redundant DB queries.
 *
 * SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-A (FR-1, FR-2, FR-3, FR-4, FR-5)
 */

import { IssuePatternsAdapter } from './adapters/issue-patterns-adapter.js';
import { RetrospectivesAdapter } from './adapters/retrospectives-adapter.js';
import { SkillsAdapter } from './adapters/skills-adapter.js';
import { SessionKnowledgeCache } from './cache/session-knowledge-cache.js';
import {
  allocateTokenBudget,
  PRIORITY
} from './token/token-estimator.js';

/** Hard cap on total compose() time (TR-2) */
const COMPOSE_TIMEOUT_MS = 600;

/** Default per-source timeout (TR-2) */
const DEFAULT_SOURCE_TIMEOUT_MS = 120;

/** Default max prompt tokens */
const DEFAULT_MAX_PROMPT_TOKENS = 1200;

export class AgentExperienceFactory {
  /**
   * @param {Object} supabase - Supabase client
   * @param {Object} [options]
   * @param {number} [options.cacheTtlMs=300000] - Cache TTL (default 5 min)
   * @param {number} [options.cacheMaxEntries=50] - Max cache entries
   */
  constructor(supabase, options = {}) {
    this.supabase = supabase;
    this.adapters = {
      issue_patterns: new IssuePatternsAdapter(supabase),
      retrospectives: new RetrospectivesAdapter(supabase),
      skills: new SkillsAdapter(supabase)
    };
    this.cache = new SessionKnowledgeCache({
      ttlMs: options.cacheTtlMs || 300_000,
      maxEntries: options.cacheMaxEntries || 50
    });
  }

  /**
   * Compose an experienced agent context bundle
   * Deterministic for the same invocationContext and knowledge snapshot
   *
   * @param {Object} invocationContext
   * @param {string} invocationContext.agentCode - Sub-agent code (e.g., 'DATABASE')
   * @param {string} invocationContext.domain - Domain filter (e.g., 'database')
   * @param {string} [invocationContext.category] - Optional category filter
   * @param {string} invocationContext.sessionId - Session ID for caching
   * @param {string} [invocationContext.sdId] - Current SD ID for context
   * @param {number} [invocationContext.maxPromptTokens=1200] - Token budget
   * @param {string} [invocationContext.queryVersion='v1'] - Cache version key
   * @returns {Promise<{promptPreamble: string, metadata: Object}>}
   */
  async compose(invocationContext) {
    const {
      agentCode,
      domain,
      category,
      sessionId,
      sdId,
      maxPromptTokens = DEFAULT_MAX_PROMPT_TOKENS,
      queryVersion = 'v1'
    } = invocationContext;

    const composeStart = Date.now();
    const retrievalSummary = {};
    const cacheResults = {};

    // Retrieve from all sources (with caching and fail-open)
    const sources = ['issue_patterns', 'retrospectives', 'skills'];
    const fetchParams = { domain, category, limit: 5, timeoutMs: DEFAULT_SOURCE_TIMEOUT_MS, queryVersion };

    const results = await Promise.race([
      Promise.all(sources.map(source =>
        this._fetchWithCache(source, sessionId, fetchParams)
      )),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('COMPOSE_TIMEOUT')), COMPOSE_TIMEOUT_MS)
      )
    ]).catch(err => {
      // Hard cap timeout - return whatever we have
      if (err.message === 'COMPOSE_TIMEOUT') {
        return sources.map(() => ({
          items: [],
          sourceStatus: 'timeout',
          elapsedMs: COMPOSE_TIMEOUT_MS,
          error: 'compose() hard cap exceeded',
          cacheHit: false
        }));
      }
      throw err;
    });

    // Build retrieval summary
    sources.forEach((source, i) => {
      const r = results[i];
      retrievalSummary[source] = {
        status: r.sourceStatus,
        itemCount: r.items?.length || 0,
        elapsedMs: r.elapsedMs,
        error: r.error || null
      };
      cacheResults[source] = r.cacheHit || false;
    });

    // Flatten all items and build prompt sections by priority
    const patternItems = results[0]?.items || [];
    const retroItems = results[1]?.items || [];
    const skillItems = results[2]?.items || [];

    const sections = [];

    // P1: Issue Patterns
    if (patternItems.length > 0) {
      sections.push({
        priority: PRIORITY.ISSUE_PATTERNS,
        source: 'issue_patterns',
        content: this._formatPatterns(patternItems)
      });
    }

    // P2: Retrospectives
    if (retroItems.length > 0) {
      sections.push({
        priority: PRIORITY.RETROSPECTIVES,
        source: 'retrospectives',
        content: this._formatRetrospectives(retroItems)
      });
    }

    // P3: Skills
    if (skillItems.length > 0) {
      sections.push({
        priority: PRIORITY.SKILLS,
        source: 'skills',
        content: this._formatSkills(skillItems)
      });
    }

    // Apply token budget with priority-based truncation
    const { sections: allocated, truncationEvents, totalTokens } = allocateTokenBudget(sections, maxPromptTokens);

    // Build prompt preamble from allocated sections
    const preambleParts = allocated
      .filter(s => s.content.length > 0)
      .map(s => s.content);

    const promptPreamble = preambleParts.length > 0
      ? `\n════════════════════════════════════════════════════════════════\nDYNAMIC KNOWLEDGE (Agent Experience Factory)\n════════════════════════════════════════════════════════════════\n${preambleParts.join('\n')}\n════════════════════════════════════════════════════════════════\n`
      : '';

    const composeElapsedMs = Date.now() - composeStart;

    const metadata = {
      invocationId: `${sessionId}-${agentCode}-${Date.now()}`,
      agentCode,
      domain,
      category: category || null,
      sdId: sdId || null,
      sessionId,
      retrievalSummary,
      cacheSummary: {
        ...this.cache.getStats(),
        perSource: cacheResults
      },
      tokenBudgetSummary: {
        maxPromptTokens,
        estimatedTokensAfter: totalTokens,
        sectionsIncluded: allocated.filter(s => s.content.length > 0).length,
        sectionsDropped: allocated.filter(s => s.truncated && s.content.length === 0).length
      },
      truncationEvents,
      composeElapsedMs,
      composedAt: new Date().toISOString()
    };

    return { promptPreamble, metadata };
  }

  /**
   * Fetch from adapter with session cache
   * @private
   */
  async _fetchWithCache(source, sessionId, params) {
    const cacheKey = SessionKnowledgeCache.buildKey(
      sessionId, source, params.domain, params.category, params.queryVersion
    );

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, cacheHit: true };
    }

    const adapter = this.adapters[source];
    const result = await adapter.fetch(params);

    // Cache successful results
    if (result.sourceStatus === 'ok' || result.sourceStatus === 'empty') {
      this.cache.set(cacheKey, result);
    }

    return { ...result, cacheHit: false };
  }

  /**
   * Format issue patterns into prompt section
   * @private
   */
  _formatPatterns(items) {
    let section = '────────────────────────────────────────────────────────────────\nKNOWN ISSUES & PROVEN SOLUTIONS (Dynamic)\n────────────────────────────────────────────────────────────────\n';
    items.forEach((p, i) => {
      const icon = p.severity === 'critical' ? '[CRITICAL]' : p.severity === 'high' ? '[HIGH]' : '[MEDIUM]';
      section += `${i + 1}. ${icon} [${p.id}] ${p.title}\n`;
      section += `   Occurrences: ${p.occurrences} | Trend: ${p.trend}\n`;
      if (p.solution) {
        section += `   Solution: ${p.solution.substring(0, 120)}\n`;
      }
    });
    if (items.some(p => p.prevention?.length > 0)) {
      section += '\nPREVENTION CHECKLIST:\n';
      const seen = new Set();
      items.flatMap(p => p.prevention).forEach(item => {
        if (!seen.has(item)) {
          seen.add(item);
          section += `[ ] ${item}\n`;
        }
      });
    }
    return section;
  }

  /**
   * Format retrospective learnings into prompt section
   * @private
   */
  _formatRetrospectives(items) {
    let section = '────────────────────────────────────────────────────────────────\nLEARNINGS FROM PAST WORK (Dynamic)\n────────────────────────────────────────────────────────────────\n';
    items.forEach((r, i) => {
      section += `${i + 1}. ${r.title}\n`;
      if (r.learnings.length > 0) {
        r.learnings.forEach(l => {
          const text = typeof l === 'string' ? l : (l.learning || l.insight || JSON.stringify(l));
          section += `   - ${text.substring(0, 150)}\n`;
        });
      }
      if (r.failurePatterns.length > 0) {
        section += `   Avoid: ${r.failurePatterns[0]}\n`;
      }
    });
    return section;
  }

  /**
   * Format skills into prompt section
   * @private
   */
  _formatSkills(items) {
    let section = '────────────────────────────────────────────────────────────────\nRELEVANT AGENT CAPABILITIES (Dynamic)\n────────────────────────────────────────────────────────────────\n';
    items.forEach((s, i) => {
      section += `${i + 1}. ${s.title}`;
      if (s.capabilities.length > 0) {
        section += `: ${s.capabilities.slice(0, 3).join(', ')}`;
      }
      section += '\n';
      if (s.successPatterns.length > 0) {
        section += `   Success: ${s.successPatterns[0]}\n`;
      }
    });
    return section;
  }
}
