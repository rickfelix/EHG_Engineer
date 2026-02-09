/**
 * Agent Experience Factory - Unit Tests
 *
 * Covers: compose() interface, caching, token truncation, LRU eviction
 * SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-A
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionKnowledgeCache } from '../../lib/agent-experience-factory/cache/session-knowledge-cache.js';
import {
  estimateTokens,
  allocateTokenBudget,
  truncateByRank,
  PRIORITY
} from '../../lib/agent-experience-factory/token/token-estimator.js';
import { AgentExperienceFactory } from '../../lib/agent-experience-factory/factory.js';

// TS-2: Cache hit avoids redundant adapter calls
describe('SessionKnowledgeCache', () => {
  let cache;

  beforeEach(() => {
    cache = new SessionKnowledgeCache({ ttlMs: 300_000, maxEntries: 100 });
  });

  it('returns null for cache miss', () => {
    const result = cache.get('nonexistent');
    expect(result).toBeNull();
    expect(cache.getStats().misses).toBe(1);
  });

  it('returns cached data on hit', () => {
    cache.set('key1', { items: [{ id: 'p1' }], sourceStatus: 'ok' });
    const result = cache.get('key1');
    expect(result).toEqual({ items: [{ id: 'p1' }], sourceStatus: 'ok' });
    expect(cache.getStats().hits).toBe(1);
  });

  it('expires entries after TTL', () => {
    const shortCache = new SessionKnowledgeCache({ ttlMs: 50 });
    shortCache.set('key1', { items: [] });

    // Immediate get should hit
    expect(shortCache.get('key1')).not.toBeNull();
    expect(shortCache.getStats().hits).toBe(1);

    // After TTL, should miss
    return new Promise(resolve => setTimeout(() => {
      const result = shortCache.get('key1');
      expect(result).toBeNull();
      expect(shortCache.getStats().expired).toBe(1);
      resolve();
    }, 60));
  });

  // TS-5: LRU eviction when cache exceeds max entries
  it('evicts LRU entry when max entries exceeded', () => {
    const smallCache = new SessionKnowledgeCache({ maxEntries: 2 });

    smallCache.set('key1', { data: 'first' });
    smallCache.set('key2', { data: 'second' });

    // Access key1 to make key2 the LRU
    smallCache.get('key1');

    // Third entry should evict key2 (LRU)
    smallCache.set('key3', { data: 'third' });

    expect(smallCache.getStats().evictions).toBe(1);
    expect(smallCache.get('key2')).toBeNull(); // evicted
    expect(smallCache.get('key1')).not.toBeNull(); // still present
    expect(smallCache.get('key3')).not.toBeNull(); // just added
  });

  it('builds deterministic cache keys', () => {
    const key = SessionKnowledgeCache.buildKey('sess1', 'issue_patterns', 'database', 'security', 'v1');
    expect(key).toBe('sess1|issue_patterns|database|security|v1');

    // Same inputs = same key
    const key2 = SessionKnowledgeCache.buildKey('sess1', 'issue_patterns', 'database', 'security', 'v1');
    expect(key).toBe(key2);
  });

  it('tracks hit rate correctly', () => {
    cache.set('key1', { data: 1 });
    cache.get('key1'); // hit
    cache.get('key1'); // hit
    cache.get('miss'); // miss

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(67); // 2/3
  });
});

// TS-4: Token truncation
describe('Token Estimator', () => {
  it('estimates tokens from text length', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens('hello')).toBe(2); // 5 chars / 4 = 1.25, ceil = 2
    expect(estimateTokens('a'.repeat(100))).toBe(25); // 100/4 = 25
  });

  it('is deterministic - same input, same output', () => {
    const text = 'This is a test string for token estimation.';
    const result1 = estimateTokens(text);
    const result2 = estimateTokens(text);
    expect(result1).toBe(result2);
  });
});

describe('Token Budget Allocation', () => {
  it('allocates within budget without truncation', () => {
    const sections = [
      { priority: PRIORITY.ISSUE_PATTERNS, source: 'issue_patterns', content: 'a'.repeat(100) },
      { priority: PRIORITY.RETROSPECTIVES, source: 'retrospectives', content: 'b'.repeat(100) }
    ];

    const result = allocateTokenBudget(sections, 1000);
    expect(result.truncationEvents).toHaveLength(0);
    expect(result.totalTokens).toBe(50); // 200 chars / 4
    expect(result.sections.every(s => !s.truncated)).toBe(true);
  });

  // TS-4: Truncation drops lowest priority first
  it('drops lowest priority sections first when over budget', () => {
    const sections = [
      { priority: PRIORITY.ISSUE_PATTERNS, source: 'issue_patterns', content: 'a'.repeat(200) },
      { priority: PRIORITY.RETROSPECTIVES, source: 'retrospectives', content: 'b'.repeat(200) },
      { priority: PRIORITY.SKILLS, source: 'skills', content: 'c'.repeat(200) }
    ];

    // Budget: 100 tokens = 400 chars. Total content: 600 chars = 150 tokens.
    // P1 (issue_patterns) = 50 tokens, P2 (retrospectives) = 50 tokens -> 100 tokens
    // P3 (skills) should be dropped
    const result = allocateTokenBudget(sections, 100);

    expect(result.truncationEvents.length).toBeGreaterThan(0);

    // Skills (P3) should be truncated/dropped before patterns (P1)
    const skillsSection = result.sections.find(s => s.source === 'skills');
    const patternsSection = result.sections.find(s => s.source === 'issue_patterns');

    expect(skillsSection.truncated).toBe(true);
    expect(patternsSection.truncated).toBe(false);
  });

  it('logs truncation events with original and kept token counts', () => {
    const sections = [
      { priority: PRIORITY.ISSUE_PATTERNS, source: 'issue_patterns', content: 'a'.repeat(800) }
    ];

    const result = allocateTokenBudget(sections, 50); // Budget less than content
    expect(result.truncationEvents).toHaveLength(1);
    expect(result.truncationEvents[0]).toMatchObject({
      source: 'issue_patterns',
      action: 'truncated',
      keptTokens: 50
    });
    expect(result.truncationEvents[0].originalTokens).toBeGreaterThan(50);
  });
});

describe('Rank-based Truncation', () => {
  it('keeps highest ranked items within budget', () => {
    const items = [
      { content: 'a'.repeat(40), rank: 10 },  // 10 tokens
      { content: 'b'.repeat(40), rank: 8 },   // 10 tokens
      { content: 'c'.repeat(40), rank: 5 }    // 10 tokens
    ];

    const result = truncateByRank(items, 20); // Budget for 2 items
    expect(result.kept).toHaveLength(2);
    expect(result.dropped).toHaveLength(1);
    expect(result.totalTokens).toBe(20);
  });
});

// TS-1: Happy path composition + TS-3: Fail-open
describe('AgentExperienceFactory', () => {
  let factory;
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnValue({
        then: vi.fn()
      })
    };

    // Default: return empty results for all tables
    mockSupabase.from.mockImplementation((table) => {
      const chain = {
        select: vi.fn().mockReturnValue(chain),
        eq: vi.fn().mockReturnValue(chain),
        in: vi.fn().mockReturnValue(chain),
        not: vi.fn().mockReturnValue(chain),
        is: vi.fn().mockReturnValue(chain),
        contains: vi.fn().mockReturnValue(chain),
        order: vi.fn().mockReturnValue(chain),
        limit: vi.fn().mockResolvedValue({ data: [], error: null })
      };
      return chain;
    });

    factory = new AgentExperienceFactory(mockSupabase, { cacheTtlMs: 300_000 });
  });

  it('returns empty preamble when no knowledge found', async () => {
    const result = await factory.compose({
      agentCode: 'DATABASE',
      domain: 'database',
      sessionId: 'sess-1',
      maxPromptTokens: 1200
    });

    expect(result.promptPreamble).toBe('');
    expect(result.metadata.agentCode).toBe('DATABASE');
    expect(result.metadata.retrievalSummary).toBeDefined();
    expect(result.metadata.cacheSummary).toBeDefined();
    expect(result.metadata.tokenBudgetSummary).toBeDefined();
  });

  it('returns metadata with retrieval summary for all sources', async () => {
    const result = await factory.compose({
      agentCode: 'TESTING',
      domain: 'testing',
      sessionId: 'sess-2',
      maxPromptTokens: 800
    });

    expect(result.metadata.retrievalSummary).toHaveProperty('issue_patterns');
    expect(result.metadata.retrievalSummary).toHaveProperty('retrospectives');
    expect(result.metadata.retrievalSummary).toHaveProperty('skills');
  });

  it('uses cache on second invocation for same context', async () => {
    // Pre-populate cache with known data to test cache-hit path directly
    const cacheKey = SessionKnowledgeCache.buildKey('sess-3', 'issue_patterns', 'database', '', 'v1');
    factory.cache.set(cacheKey, {
      items: [{ id: 'cached-p1', source: 'issue_patterns', title: 'Cached pattern', severity: 'medium', occurrences: 3, trend: 'stable', solution: null, prevention: [] }],
      sourceStatus: 'ok',
      elapsedMs: 5
    });

    const result = await factory.compose({
      agentCode: 'DATABASE',
      domain: 'database',
      sessionId: 'sess-3',
      maxPromptTokens: 1200
    });

    // Cache should have hits (from the pre-populated entry)
    const stats = factory.cache.getStats();
    expect(stats.hits).toBeGreaterThanOrEqual(1);

    // The result should include the cached pattern data
    expect(result.metadata.cacheSummary.perSource.issue_patterns).toBe(true);
  });

  it('includes invocationId in metadata', async () => {
    const result = await factory.compose({
      agentCode: 'DATABASE',
      domain: 'database',
      sessionId: 'sess-4',
      maxPromptTokens: 1200
    });

    expect(result.metadata.invocationId).toContain('sess-4');
    expect(result.metadata.invocationId).toContain('DATABASE');
  });

  it('respects token budget', async () => {
    const result = await factory.compose({
      agentCode: 'DATABASE',
      domain: 'database',
      sessionId: 'sess-5',
      maxPromptTokens: 100
    });

    expect(result.metadata.tokenBudgetSummary.maxPromptTokens).toBe(100);
    expect(result.metadata.tokenBudgetSummary.estimatedTokensAfter).toBeLessThanOrEqual(100);
  });
});
