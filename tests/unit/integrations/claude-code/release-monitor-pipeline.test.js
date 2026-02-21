/**
 * Claude Code Release Monitor Pipeline Tests
 *
 * Unit tests for all 4 pipeline modules:
 *   1. release-monitor.js   — GitHub fetch, dedup, circuit breaker
 *   2. release-analyzer.js  — keyword relevance scoring
 *   3. chairman-notifier.js — Telegram notification formatting
 *   4. approval-handler.js  — approval routing, expiry
 *
 * Part of SD-LEO-FEAT-AUTOMATED-CLAUDE-CODE-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock setup ────────────────────────────────────────────

vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
  config: vi.fn(),
}));

// Chainable Supabase mock
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockLt = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();

const chainable = {
  insert: mockInsert,
  select: mockSelect,
  update: mockUpdate,
  eq: mockEq,
  lt: mockLt,
  order: mockOrder,
  limit: mockLimit,
  single: mockSingle,
  maybeSingle: mockMaybeSingle,
};

for (const fn of Object.values(chainable)) {
  fn.mockReturnValue(chainable);
}

const mockFrom = vi.fn().mockReturnValue(chainable);
const mockSupabase = { from: mockFrom };

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

vi.mock('../../../../lib/notifications/telegram-adapter.js', () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue({ success: true, providerMessageId: 'msg_123' }),
}));

// Set env vars before imports
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
process.env.TELEGRAM_CHAT_ID = '12345';

// ── Imports (after mocks) ─────────────────────────────────

const { analyzeRelevance, IMPACT_KEYWORDS, AUTO_SKIP_THRESHOLD } = await import(
  '../../../../lib/integrations/claude-code/release-analyzer.js'
);

const { formatTelegramMessage } = await import(
  '../../../../lib/integrations/claude-code/chairman-notifier.js'
);

// ── Helpers ───────────────────────────────────────────────

function makeGitHubRelease(overrides = {}) {
  return {
    id: 100001,
    tag_name: 'v1.0.30',
    name: 'Claude Code v1.0.30',
    body: 'Bug fixes and improvements',
    html_url: 'https://github.com/anthropics/claude-code/releases/tag/v1.0.30',
    published_at: '2026-02-21T10:00:00Z',
    prerelease: false,
    ...overrides,
  };
}

function makeIntakeRow(overrides = {}) {
  return {
    id: 'intake-uuid-001',
    github_release_id: 100001,
    tag_name: 'v1.0.30',
    title: 'Claude Code v1.0.30',
    description: 'Bug fixes and improvements',
    release_url: 'https://github.com/anthropics/claude-code/releases/tag/v1.0.30',
    published_at: '2026-02-21T10:00:00Z',
    is_prerelease: false,
    status: 'pending',
    relevance_score: null,
    impact_areas: null,
    recommendation: null,
    analysis_summary: null,
    workflow_improvements: null,
    ...overrides,
  };
}

// ── Reset mocks ──────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(chainable)) {
    fn.mockReturnValue(chainable);
  }
  mockFrom.mockReturnValue(chainable);
});

// ══════════════════════════════════════════════════════════
// 1. RELEASE ANALYZER TESTS
// ══════════════════════════════════════════════════════════

describe('release-analyzer', () => {
  describe('analyzeRelevance', () => {
    it('returns high relevance for release with many keyword hits', () => {
      const intake = makeIntakeRow({
        title: 'Major sub-agent and tool improvements',
        description:
          'New agent spawn capabilities, better bash tool, improved git workflow, ' +
          'enhanced memory persistence, context compaction, performance boost, ' +
          'streaming API changes, MCP server support',
      });

      const result = analyzeRelevance(intake);

      expect(result.relevanceScore).toBeGreaterThanOrEqual(0.7);
      expect(result.recommendation).toBe('adopt');
      expect(result.impactAreas.length).toBeGreaterThan(3);
    });

    it('returns medium relevance for moderate keyword hits', () => {
      const intake = makeIntakeRow({
        title: 'Git workflow improvements',
        description: 'Better commit handling and diff viewer',
      });

      const result = analyzeRelevance(intake);

      expect(result.relevanceScore).toBeGreaterThanOrEqual(0.3);
      expect(result.relevanceScore).toBeLessThanOrEqual(1.0);
      expect(['adopt', 'evaluate', 'monitor']).toContain(result.recommendation);
      expect(result.impactAreas).toContain('git');
    });

    it('returns low relevance for irrelevant release', () => {
      const intake = makeIntakeRow({
        title: 'Minor internal update',
        description: 'Fixed a typo in the readme. Updated license year.',
      });

      const result = analyzeRelevance(intake);

      // "Updated" contains "update" which doesn't match any area keywords
      // but "read" in "readme" matches tools area ("read" keyword)
      // So score may be low but not necessarily zero
      expect(result.relevanceScore).toBeLessThanOrEqual(0.3);
      expect(['skip', 'monitor']).toContain(result.recommendation);
    });

    it('handles empty description gracefully', () => {
      const intake = makeIntakeRow({
        title: '',
        description: null,
      });

      const result = analyzeRelevance(intake);

      expect(result.relevanceScore).toBe(0);
      expect(result.recommendation).toBe('skip');
      expect(result.impactAreas).toHaveLength(0);
      expect(result.summary).toContain('minimal relevance');
    });

    it('detects all 9 impact areas', () => {
      // Build a description that hits every area
      const intake = makeIntakeRow({
        title: 'sub-agent automation memory performance tools git security ide api',
        description: 'spawn hook context speed bash commit permission vscode claude',
      });

      const result = analyzeRelevance(intake);

      expect(result.impactAreas).toEqual(
        expect.arrayContaining([
          'sub-agent',
          'automation',
          'memory',
          'performance',
          'tools',
          'git',
          'security',
          'ide',
          'api',
        ])
      );
    });

    it('caps relevance score at 1.0', () => {
      // Overload with keywords to exceed normalization
      const allKeywords = Object.values(IMPACT_KEYWORDS).flat().join(' ');
      const intake = makeIntakeRow({
        title: allKeywords,
        description: allKeywords,
      });

      const result = analyzeRelevance(intake);

      expect(result.relevanceScore).toBeLessThanOrEqual(1.0);
    });

    it('extracts improvements from release notes', () => {
      const intake = makeIntakeRow({
        title: 'Agent improvements',
        description:
          '- Improved sub-agent spawn performance\n' +
          '- New bash tool timeout configuration\n' +
          '- Fixed git commit hook handling\n' +
          '- Minor typo fix',
      });

      const result = analyzeRelevance(intake);

      expect(result.improvements.length).toBeGreaterThan(0);
      expect(result.improvements[0]).toHaveProperty('area');
      expect(result.improvements[0]).toHaveProperty('description');
      expect(result.improvements[0]).toHaveProperty('source', 'release_notes');
    });

    it('limits improvements to 10 entries', () => {
      // Create description with many matching lines
      const lines = Array.from({ length: 20 }, (_, i) =>
        `- Agent spawn improvement ${i}: better tool execution and bash performance`
      ).join('\n');

      const intake = makeIntakeRow({
        title: 'Massive agent update',
        description: lines,
      });

      const result = analyzeRelevance(intake);

      expect(result.improvements.length).toBeLessThanOrEqual(10);
    });

    it('includes summary with impact areas when relevant', () => {
      const intake = makeIntakeRow({
        title: 'New agent features',
        description: 'Sub-agent spawning improvements',
      });

      const result = analyzeRelevance(intake);

      expect(result.summary).toContain('impacts');
      expect(result.summary).toContain('sub-agent');
    });
  });

  describe('IMPACT_KEYWORDS', () => {
    it('contains 9 impact areas', () => {
      expect(Object.keys(IMPACT_KEYWORDS)).toHaveLength(9);
    });

    it('each area has at least 3 keywords', () => {
      for (const [area, keywords] of Object.entries(IMPACT_KEYWORDS)) {
        expect(keywords.length, `${area} should have >= 3 keywords`).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('AUTO_SKIP_THRESHOLD', () => {
    it('defaults to 0.3', () => {
      expect(AUTO_SKIP_THRESHOLD).toBe(0.3);
    });
  });
});

// ══════════════════════════════════════════════════════════
// 2. CHAIRMAN NOTIFIER TESTS
// ══════════════════════════════════════════════════════════

describe('chairman-notifier', () => {
  describe('formatTelegramMessage', () => {
    it('includes tag name and relevance percentage', () => {
      const intake = makeIntakeRow({
        tag_name: 'v1.2.0',
        relevance_score: 0.85,
        recommendation: 'adopt',
      });

      const msg = formatTelegramMessage(intake);

      expect(msg).toContain('v1.2.0');
      expect(msg).toContain('85%');
      expect(msg).toContain('ADOPT');
    });

    it('lists workflow improvements when present', () => {
      const intake = makeIntakeRow({
        tag_name: 'v1.3.0',
        relevance_score: 0.6,
        recommendation: 'evaluate',
        workflow_improvements: [
          { area: 'tools', description: 'New bash timeout configuration' },
          { area: 'git', description: 'Improved branch management' },
        ],
      });

      const msg = formatTelegramMessage(intake);

      expect(msg).toContain('Key Improvements for EHG');
      expect(msg).toContain('tools');
      expect(msg).toContain('bash timeout');
      expect(msg).toContain('git');
    });

    it('lists impact areas when present', () => {
      const intake = makeIntakeRow({
        tag_name: 'v2.0.0',
        relevance_score: 0.7,
        recommendation: 'adopt',
        impact_areas: ['sub-agent', 'automation', 'memory'],
      });

      const msg = formatTelegramMessage(intake);

      expect(msg).toContain('Impact');
      expect(msg).toContain('sub-agent');
      expect(msg).toContain('automation');
      expect(msg).toContain('memory');
    });

    it('contains approval instructions', () => {
      const intake = makeIntakeRow({ tag_name: 'v1.0.0', relevance_score: 0.5 });

      const msg = formatTelegramMessage(intake);

      expect(msg).toContain('Approve');
      expect(msg).toContain('48h');
    });

    it('handles zero relevance score', () => {
      const intake = makeIntakeRow({
        tag_name: 'v0.0.1',
        relevance_score: 0,
        recommendation: 'skip',
      });

      const msg = formatTelegramMessage(intake);

      expect(msg).toContain('0%');
      expect(msg).toContain('SKIP');
    });

    it('handles null workflow_improvements', () => {
      const intake = makeIntakeRow({
        tag_name: 'v1.0.0',
        workflow_improvements: null,
      });

      const msg = formatTelegramMessage(intake);

      expect(msg).not.toContain('Key Improvements');
    });

    it('limits improvements to 5 in message', () => {
      const intake = makeIntakeRow({
        tag_name: 'v1.0.0',
        relevance_score: 0.8,
        recommendation: 'adopt',
        workflow_improvements: Array.from({ length: 8 }, (_, i) => ({
          area: `area-${i}`,
          description: `Improvement ${i}`,
        })),
      });

      const msg = formatTelegramMessage(intake);

      // Should cap at 5 improvements in the message
      const bulletCount = (msg.match(/•/g) || []).length;
      expect(bulletCount).toBeLessThanOrEqual(5);
    });
  });
});

// ══════════════════════════════════════════════════════════
// 3. RELEASE MONITOR INTEGRATION (mock-based)
// ══════════════════════════════════════════════════════════

describe('release-monitor (mock-based)', () => {
  it('syncReleases returns expected shape', async () => {
    // Mock fetch for GitHub API
    const mockRelease = makeGitHubRelease();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([mockRelease]),
      headers: { get: vi.fn() },
    });

    // Mock circuit breaker check (circuit closed)
    mockMaybeSingle.mockResolvedValueOnce({ data: { consecutive_failures: 0 }, error: null });
    // Mock loadKnownReleases
    mockSelect.mockReturnValue(chainable);
    chainable.select = mockSelect;
    // Return empty known IDs (all releases are new)
    // Need to handle the from('eva_claude_code_intake').select('github_release_id') chain
    // First call: from('eva_sync_state') for circuit check → maybeSingle
    // Second call: from('eva_claude_code_intake').select('github_release_id') → data
    mockFrom.mockImplementation((table) => {
      if (table === 'eva_sync_state') {
        return {
          ...chainable,
          select: vi.fn().mockReturnValue({
            ...chainable,
            eq: vi.fn().mockReturnValue({
              ...chainable,
              eq: vi.fn().mockReturnValue({
                ...chainable,
                maybeSingle: vi.fn().mockResolvedValue({ data: { consecutive_failures: 0 }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'eva_claude_code_intake') {
        return {
          ...chainable,
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return chainable;
    });

    const { syncReleases } = await import(
      '../../../../lib/integrations/claude-code/release-monitor.js'
    );

    const result = await syncReleases({
      dryRun: true,
      supabase: mockSupabase,
    });

    expect(result).toHaveProperty('releasesFound');
    expect(result).toHaveProperty('inserted');
    expect(result).toHaveProperty('skipped');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('dryRun', true);
  });
});

// ══════════════════════════════════════════════════════════
// 4. APPROVAL HANDLER INTEGRATION (mock-based)
// ══════════════════════════════════════════════════════════

describe('approval-handler (mock-based)', () => {
  it('processApprovals returns expected shape', async () => {
    // Build a deep mock that supports the full chain: from().select().eq().eq().lt()
    const mockLtFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockEq2 = vi.fn().mockImplementation(() => ({
      lt: mockLtFn,
      // Also resolve directly for .eq().eq() chains that terminate
      then: (resolve) => resolve({ data: [], error: null }),
    }));
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2, lt: mockLtFn });
    const mockSelectFn = vi.fn().mockReturnValue({ eq: mockEq1 });

    const deepMockSupabase = {
      from: vi.fn().mockReturnValue({ select: mockSelectFn }),
    };

    const { processApprovals } = await import(
      '../../../../lib/integrations/claude-code/approval-handler.js'
    );

    const result = await processApprovals({ supabase: deepMockSupabase });

    expect(result).toHaveProperty('approved');
    expect(result).toHaveProperty('rejected');
    expect(result).toHaveProperty('expired');
    expect(result).toHaveProperty('feedbackItems');
    expect(result.approved).toBe(0);
    expect(result.rejected).toBe(0);
    expect(result.expired).toBe(0);
  });
});
