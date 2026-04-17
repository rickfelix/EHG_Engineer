import { describe, test, expect, beforeEach, vi } from 'vitest';
import { runQARubric, generateFillScreens, UploadError } from '../../../lib/eva/stage-17/qa-rubric.js';

vi.mock('../../../lib/eva/stage-17/token-manifest.js', () => ({
  getTokenConstraints: vi.fn().mockResolvedValue({
    colors: ['#ff5733', '#3366cc'],
    typeScale: { heading: 'Inter', body: 'Roboto' },
  }),
}));

const mockWriteArtifact = vi.fn().mockResolvedValue('cached-artifact-id');
vi.mock('../../../lib/eva/artifact-persistence-service.js', () => ({
  writeArtifact: (...args) => mockWriteArtifact(...args),
}));

const mockComplete = vi.fn().mockResolvedValue(
  '<html><nav>Nav</nav><button>CTA</button><body style="color:#ff5733">Generated</body></html>'
);
vi.mock('../../../lib/llm/client-factory.js', () => ({
  getValidationClient: vi.fn(() => ({ complete: mockComplete })),
}));

import { getTokenConstraints } from '../../../lib/eva/stage-17/token-manifest.js';

function makeArtifact(id, type, content, metadata = {}) {
  return { id, artifact_type: type, content, metadata, title: `Screen ${id}` };
}

function createMockSupabase(artifacts = []) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: artifacts, error: null }),
          }),
        }),
      }),
    }),
  };
}

describe('qa-rubric', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComplete.mockResolvedValue(
      '<html><nav>Nav</nav><button>CTA</button><body style="color:#ff5733">Generated</body></html>'
    );
  });

  describe('runQARubric() — Layer 1: Base completeness', () => {
    test('returns HIGH when fewer than 14 artifacts', async () => {
      const artifacts = [makeArtifact('1', 'stage_17_approved_mobile', '<html><nav></nav><button>CTA</button></html>')];
      const result = await runQARubric('v-1', createMockSupabase(artifacts));
      expect(result.highCount).toBeGreaterThan(0);
      expect(result.layers.base.score).toBeLessThan(100);
    });

    test('returns 100 base score with all 14 artifacts', async () => {
      const artifacts = [];
      for (let i = 0; i < 7; i++) {
        artifacts.push(makeArtifact(`m${i}`, 'stage_17_approved_mobile',
          '<html><nav></nav><button>CTA</button><body style="color:#ff5733">M</body></html>'));
        artifacts.push(makeArtifact(`d${i}`, 'stage_17_approved_desktop',
          '<html><nav></nav><button>CTA</button><body style="color:#ff5733">D</body></html>'));
      }
      const result = await runQARubric('v-1', createMockSupabase(artifacts));
      expect(result.layers.base.score).toBe(100);
    });
  });

  describe('runQARubric() — Layer 2: Product spec', () => {
    test('flags missing navigation as MED', async () => {
      const artifacts = [makeArtifact('1', 'stage_17_approved_mobile', '<html><button>CTA</button></html>')];
      const result = await runQARubric('v-1', createMockSupabase(artifacts));
      const navGap = result.items.find(i => i.layer === 2 && i.description.includes('navigation'));
      expect(navGap).toBeTruthy();
      expect(navGap.severity).toBe('MED');
    });

    test('flags missing CTA as MED', async () => {
      const artifacts = [makeArtifact('1', 'stage_17_approved_mobile', '<html><nav>Nav</nav><p>Text</p></html>')];
      const result = await runQARubric('v-1', createMockSupabase(artifacts));
      const ctaGap = result.items.find(i => i.layer === 2 && i.description.includes('CTA'));
      expect(ctaGap).toBeTruthy();
    });

    test('passes when nav and CTA present', async () => {
      const artifacts = [makeArtifact('1', 'stage_17_approved_mobile',
        '<html><nav>Menu</nav><button type="submit">Go</button></html>')];
      const result = await runQARubric('v-1', createMockSupabase(artifacts));
      expect(result.layers.product.score).toBe(100);
    });
  });

  describe('runQARubric() — Layer 3: Brand token consistency', () => {
    test('flags missing brand colors as HIGH', async () => {
      const artifacts = [makeArtifact('1', 'stage_17_approved_mobile',
        '<html><nav></nav><button>CTA</button><body style="color:blue">X</body></html>')];
      const result = await runQARubric('v-1', createMockSupabase(artifacts));
      const brandGap = result.items.find(i => i.layer === 3 && i.description.includes('brand colors'));
      expect(brandGap).toBeTruthy();
      expect(brandGap.severity).toBe('HIGH');
    });

    test('passes when brand color detected', async () => {
      const artifacts = [makeArtifact('1', 'stage_17_approved_mobile',
        '<html><nav></nav><button>CTA</button><body style="color:#ff5733">X</body></html>')];
      const result = await runQARubric('v-1', createMockSupabase(artifacts));
      expect(result.layers.venture.score).toBe(100);
    });

    test('returns 0 score when no token manifest', async () => {
      getTokenConstraints.mockResolvedValueOnce(null);
      const artifacts = [makeArtifact('1', 'stage_17_approved_mobile', '<html></html>')];
      const result = await runQARubric('v-1', createMockSupabase(artifacts));
      expect(result.layers.venture.score).toBe(0);
    });
  });

  describe('runQARubric() — Overall', () => {
    test('overall score is average of 3 layers', async () => {
      const artifacts = [makeArtifact('1', 'stage_17_approved_mobile',
        '<html><nav></nav><button>CTA</button><body style="color:#ff5733">X</body></html>')];
      const result = await runQARubric('v-1', createMockSupabase(artifacts));
      const expected = Math.round((result.layers.base.score + result.layers.product.score + result.layers.venture.score) / 3);
      expect(result.overallScore).toBe(expected);
    });

    test('returns correct severity counts', async () => {
      const artifacts = [makeArtifact('1', 'stage_17_approved_mobile', '<html><p>bare</p></html>')];
      const result = await runQARubric('v-1', createMockSupabase(artifacts));
      expect(result.highCount + result.medCount + result.lowCount).toBe(result.items.length);
    });
  });

  describe('generateFillScreens()', () => {
    test('generates HTML for missing screens', async () => {
      const result = await generateFillScreens(['Dashboard', 'Settings'], {
        ventureId: 'v-test',
        brandTokens: { colors: ['#ff5733'], typeScale: { heading: 'Inter', body: 'Roboto' } },
        qaRunId: 'test-run-1',
      });
      expect(result.screens).toHaveLength(2);
      expect(result.screens[0].screenName).toBe('Dashboard');
      expect(result.screens[0].html).toBeTruthy();
      expect(result.capped).toBe(false);
      expect(result.generated).toBe(2);
    });

    test('calls Claude via getValidationClient().complete()', async () => {
      await generateFillScreens(['Screen1'], {
        ventureId: 'v-test', qaRunId: 'test-run-2',
      });
      expect(mockComplete).toHaveBeenCalledTimes(1);
    });

    test('caps at 3 calls per QA run', async () => {
      const qaRunId = 'test-run-cap-' + Date.now();
      const r1 = await generateFillScreens(['A', 'B', 'C'], { ventureId: 'v-test', qaRunId });
      expect(r1.screens).toHaveLength(3);
      expect(r1.capped).toBe(false);
      expect(r1.generated).toBe(3);

      const r2 = await generateFillScreens(['D'], { ventureId: 'v-test', qaRunId });
      expect(r2.screens).toHaveLength(0);
      expect(r2.capped).toBe(true);
      expect(r2.generated).toBe(3);
    });

    test('caches in venture_artifacts when supabase provided', async () => {
      await generateFillScreens(['Dashboard'], {
        ventureId: 'v-test',
        qaRunId: 'test-run-cache-' + Date.now(),
        supabase: createMockSupabase(),
      });
      expect(mockWriteArtifact).toHaveBeenCalledTimes(1);
      expect(mockWriteArtifact.mock.calls[0][1].artifactType).toBe('s17_archetypes');
    });

    test('returns {screenName, html}[] shape', async () => {
      const result = await generateFillScreens(['TestScreen'], {
        ventureId: 'v-test', qaRunId: 'test-run-shape-' + Date.now(),
      });
      expect(Array.isArray(result.screens)).toBe(true);
      expect(result.screens[0]).toHaveProperty('screenName');
      expect(result.screens[0]).toHaveProperty('html');
    });
  });

  describe('UploadError', () => {
    test('captures gaps array', () => {
      const gaps = [{ description: 'Missing screen', severity: 'HIGH' }];
      const err = new UploadError('Blocked', gaps);
      expect(err.name).toBe('UploadError');
      expect(err.gaps).toHaveLength(1);
    });
  });
});
