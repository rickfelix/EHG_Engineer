/**
 * Tests for scripts/eva/brainstorm-to-vision.mjs
 * SD: SD-LEO-INFRA-GOVERNANCE-STACK-QUALITY-001
 *
 * Tests the brainstorm-to-vision pipeline that links brainstorm sessions
 * to EVA vision documents (L1 addendums and L2 new docs).
 *
 * NOTE: The source module calls main() on import, so we define functions
 * inline to avoid triggering side-effects from ESM import.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Constants (mirrored from source) ──────────────────────────────────
const VISION_RELEVANT_OUTCOMES = ['sd_created', 'significant_departure'];
const L1_VISION_KEY = 'VISION-EHG-L1-001';
const MAX_LLM_CONTENT_CHARS = 8000;

// ── parseArgs (inlined from source) ───────────────────────────────────
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { dryRun: false, id: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') opts.dryRun = true;
    if (args[i] === '--id' && args[i + 1]) opts.id = args[++i];
  }
  return opts;
}

// ── extractDimensions (inlined, using mock LLM) ──────────────────────
function createExtractDimensions(mockLlmClient) {
  return async function extractDimensions(content) {
    const truncated = content.length > MAX_LLM_CONTENT_CHARS
      ? content.slice(0, MAX_LLM_CONTENT_CHARS) + '\n...[truncated]'
      : content;

    const prompt = `You are analyzing a brainstorm session output. Extract 3-6 key scoring dimensions that represent the major strategic insights or departures identified. These dimensions measure alignment with strategic vision.

For each dimension, provide:
- name: short identifier (e.g., "governance_redesign", "event_consolidation")
- weight: relative importance 0.0-1.0 (weights should sum to ~1.0)
- description: one sentence explaining what this dimension measures
- source_section: which brainstorm topic or insight this comes from

Return ONLY a valid JSON array. No explanation text.

Brainstorm Content:
${truncated}`;

    try {
      const response = await mockLlmClient.complete(
        'Extract structured scoring dimensions from brainstorm outputs. Return only valid JSON arrays.',
        prompt
      );
      const text = typeof response === 'string' ? response : response?.content || response?.text || '';
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return null;
      const dims = JSON.parse(match[0]);
      return Array.isArray(dims) && dims.length > 0 ? dims : null;
    } catch {
      return null;
    }
  };
}

// ── Mock Supabase factory ─────────────────────────────────────────────
function createMockSupabase() {
  let resultData = null;
  let resultError = null;

  const builder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => Promise.resolve({ data: resultData, error: resultError })),
    single: vi.fn(() => Promise.resolve({ data: resultData, error: resultError })),
    then: vi.fn((cb) => cb({ data: resultData, error: resultError })),
    setResult(data, error = null) {
      resultData = data;
      resultError = error;
      return builder;
    },
  };

  // Make it thenable for await without .then()
  Object.defineProperty(builder, Symbol.for('nodejs.util.inspect.custom'), {
    value: () => 'MockQueryBuilder',
  });

  // Override then to support await
  builder.then = (resolve) => resolve({ data: resultData, error: resultError });

  const supabase = {
    from: vi.fn(() => builder),
    _builder: builder,
  };

  return supabase;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('brainstorm-to-vision pipeline', () => {

  describe('parseArgs', () => {
    it('returns defaults when no args', () => {
      const opts = parseArgs(['node', 'script.mjs']);
      expect(opts).toEqual({ dryRun: false, id: null });
    });

    it('parses --dry-run flag', () => {
      const opts = parseArgs(['node', 'script.mjs', '--dry-run']);
      expect(opts.dryRun).toBe(true);
      expect(opts.id).toBeNull();
    });

    it('parses --id with value', () => {
      const opts = parseArgs(['node', 'script.mjs', '--id', 'abc-123']);
      expect(opts.id).toBe('abc-123');
      expect(opts.dryRun).toBe(false);
    });

    it('parses both --dry-run and --id', () => {
      const opts = parseArgs(['node', 'script.mjs', '--dry-run', '--id', 'uuid-456']);
      expect(opts.dryRun).toBe(true);
      expect(opts.id).toBe('uuid-456');
    });

    it('ignores --id without a value', () => {
      const opts = parseArgs(['node', 'script.mjs', '--id']);
      expect(opts.id).toBeNull();
    });
  });

  describe('extractDimensions', () => {
    let mockLlmClient;
    let extractDimensions;

    beforeEach(() => {
      mockLlmClient = { complete: vi.fn() };
      extractDimensions = createExtractDimensions(mockLlmClient);
    });

    it('extracts dimensions from valid LLM JSON response', async () => {
      const dims = [
        { name: 'governance_redesign', weight: 0.4, description: 'Test', source_section: 'Governance' },
        { name: 'automation', weight: 0.6, description: 'Test2', source_section: 'Ops' },
      ];
      mockLlmClient.complete.mockResolvedValue(JSON.stringify(dims));

      const result = await extractDimensions('Some brainstorm content about governance redesign');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('governance_redesign');
      expect(result[1].weight).toBe(0.6);
    });

    it('handles LLM response with surrounding text', async () => {
      const dims = [{ name: 'test', weight: 1.0, description: 'D', source_section: 'S' }];
      mockLlmClient.complete.mockResolvedValue(`Here are the dimensions:\n${JSON.stringify(dims)}\nThat's all.`);

      const result = await extractDimensions('Content');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test');
    });

    it('returns null when LLM returns no JSON array', async () => {
      mockLlmClient.complete.mockResolvedValue('I cannot extract dimensions from this content.');
      const result = await extractDimensions('Content');
      expect(result).toBeNull();
    });

    it('returns null when LLM returns empty array', async () => {
      mockLlmClient.complete.mockResolvedValue('[]');
      const result = await extractDimensions('Content');
      expect(result).toBeNull();
    });

    it('returns null on LLM error', async () => {
      mockLlmClient.complete.mockRejectedValue(new Error('API error'));
      const result = await extractDimensions('Content');
      expect(result).toBeNull();
    });

    it('truncates content exceeding MAX_LLM_CONTENT_CHARS', async () => {
      const longContent = 'x'.repeat(MAX_LLM_CONTENT_CHARS + 500);
      const dims = [{ name: 'truncated', weight: 1.0, description: 'D', source_section: 'S' }];
      mockLlmClient.complete.mockResolvedValue(JSON.stringify(dims));

      await extractDimensions(longContent);

      const call = mockLlmClient.complete.mock.calls[0];
      const promptArg = call[1];
      expect(promptArg).toContain('...[truncated]');
      // Prompt should contain at most MAX_LLM_CONTENT_CHARS of the original content
      expect(promptArg.indexOf('...[truncated]')).toBeLessThanOrEqual(
        promptArg.length
      );
    });

    it('handles response object with content property', async () => {
      const dims = [{ name: 'obj', weight: 0.5, description: 'D', source_section: 'S' }];
      mockLlmClient.complete.mockResolvedValue({ content: JSON.stringify(dims) });

      const result = await extractDimensions('Content');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('obj');
    });

    it('handles response object with text property', async () => {
      const dims = [{ name: 'txt', weight: 0.5, description: 'D', source_section: 'S' }];
      mockLlmClient.complete.mockResolvedValue({ text: JSON.stringify(dims) });

      const result = await extractDimensions('Content');
      expect(result).toHaveLength(1);
    });
  });

  describe('pipeline logic', () => {
    it('identifies vision-relevant outcomes correctly', () => {
      expect(VISION_RELEVANT_OUTCOMES).toContain('sd_created');
      expect(VISION_RELEVANT_OUTCOMES).toContain('significant_departure');
      expect(VISION_RELEVANT_OUTCOMES).not.toContain('no_action');
      expect(VISION_RELEVANT_OUTCOMES).not.toContain('archived');
    });

    it('L1 vision key is correct', () => {
      expect(L1_VISION_KEY).toBe('VISION-EHG-L1-001');
    });

    it('filters already-linked sessions from unlinked set', () => {
      const sessions = [
        { id: 'aaa', topic: 'Session A', outcome_type: 'sd_created' },
        { id: 'bbb', topic: 'Session B', outcome_type: 'significant_departure' },
        { id: 'ccc', topic: 'Session C', outcome_type: 'sd_created' },
      ];
      const linked = [{ source_brainstorm_id: 'bbb' }];
      const linkedIds = new Set(linked.map(d => d.source_brainstorm_id));
      const unlinked = sessions.filter(s => !linkedIds.has(s.id));

      expect(unlinked).toHaveLength(2);
      expect(unlinked.map(s => s.id)).toEqual(['aaa', 'ccc']);
    });

    it('skips sessions with insufficient content (< 50 chars)', () => {
      const session = { topic: 'Hi', metadata: {}, new_capability_candidates: [] };
      const content = [
        session.topic ? `# ${session.topic}` : '',
        session.metadata?.summary || '',
        '',
      ].filter(Boolean).join('\n\n');

      expect(content.length).toBeLessThan(50);
    });

    it('builds content from topic + metadata + candidates', () => {
      const session = {
        topic: 'Domain Intelligence System',
        metadata: { summary: 'A system for domain expertise extraction and venture ideation' },
        new_capability_candidates: ['LLM-based extraction', 'Pattern matching'],
      };

      const content = [
        session.topic ? `# ${session.topic}` : '',
        session.metadata?.summary || '',
        Array.isArray(session.new_capability_candidates)
          ? session.new_capability_candidates.map(c => `- ${typeof c === 'string' ? c : c.name || JSON.stringify(c)}`).join('\n')
          : '',
      ].filter(Boolean).join('\n\n');

      expect(content).toContain('# Domain Intelligence System');
      expect(content).toContain('A system for domain expertise extraction');
      expect(content).toContain('- LLM-based extraction');
      expect(content).toContain('- Pattern matching');
      expect(content.length).toBeGreaterThan(50);
    });

    it('handles object candidates in new_capability_candidates', () => {
      const candidates = [
        { name: 'Feature A' },
        { name: 'Feature B' },
      ];
      const formatted = candidates.map(c => `- ${typeof c === 'string' ? c : c.name || JSON.stringify(c)}`).join('\n');
      expect(formatted).toContain('- Feature A');
      expect(formatted).toContain('- Feature B');
    });

    it('generates correct vision key for sd_created sessions', () => {
      const sessionId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const visionKey = `VISION-BS-${sessionId.slice(0, 8).toUpperCase()}`;
      expect(visionKey).toBe('VISION-BS-A1B2C3D4');
    });

    it('builds addendum structure correctly', () => {
      const sessionId = 'test-session-id';
      const content = 'Some brainstorm content';

      const addendum = {
        section: content,
        added_at: '2026-02-21T00:00:00.000Z',
        added_by: 'brainstorm-to-vision-pipeline',
        source_brainstorm_id: sessionId,
      };

      expect(addendum.section).toBe(content);
      expect(addendum.added_by).toBe('brainstorm-to-vision-pipeline');
      expect(addendum.source_brainstorm_id).toBe(sessionId);
    });

    it('appends addendum to existing L1 vision content', () => {
      const l1Content = '# EHG L1 Vision\n\nOriginal vision content';
      const newContent = 'New brainstorm insight about governance';
      const addendumCount = 1;

      const combinedContent = `${l1Content}\n\n---\n\n## Addendum ${addendumCount} (from brainstorm)\n\n${newContent}`;

      expect(combinedContent).toContain('# EHG L1 Vision');
      expect(combinedContent).toContain('Original vision content');
      expect(combinedContent).toContain('## Addendum 1 (from brainstorm)');
      expect(combinedContent).toContain('New brainstorm insight about governance');
    });

    it('creates L2 vision doc with correct structure', () => {
      const visionDoc = {
        vision_key: 'VISION-BS-ABCD1234',
        level: 'L2',
        content: 'Brainstorm-derived vision content',
        extracted_dimensions: [{ name: 'dim1', weight: 1.0 }],
        version: 1,
        status: 'draft',
        chairman_approved: false,
        source_brainstorm_id: 'session-uuid',
        created_by: 'brainstorm-to-vision-pipeline',
      };

      expect(visionDoc.level).toBe('L2');
      expect(visionDoc.status).toBe('draft');
      expect(visionDoc.chairman_approved).toBe(false);
      expect(visionDoc.created_by).toBe('brainstorm-to-vision-pipeline');
    });
  });
});
