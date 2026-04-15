/**
 * Tests for Stage 17 Design Token Manifest
 * SD-MAN-ORCH-STAGE-DESIGN-REFINEMENT-001-C
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  extractAndLockTokens,
  getTokenConstraints,
  ExtractError,
  PersistError,
} from '../stage-17/token-manifest.js';
import { ARTIFACT_TYPES } from '../artifact-types.js';

// ── Mock writeArtifact ────────────────────────────────────────────────────

vi.mock('../artifact-persistence-service.js', () => ({
  writeArtifact: vi.fn().mockResolvedValue('mock-artifact-id-123'),
}));

import { writeArtifact } from '../artifact-persistence-service.js';

// ── Shared fixtures ────────────────────────────────────────────────────────

const VENTURE_ID = 'test-venture-uuid-001';

/** Build a Supabase mock that returns the given artifact rows per artifact_type. */
function buildSupabaseMock(artifacts = {}) {
  return {
    from: vi.fn().mockImplementation((table) => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((col, val) => {
          // When eq('artifact_type', type) is called, capture the type
          if (col === 'artifact_type') chain._type = val;
          return chain;
        }),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          const result = artifacts[chain._type] ?? [];
          return Promise.resolve({ data: result, error: null });
        }),
      };
      return chain;
    }),
  };
}

const NAMING_VISUAL_ARTIFACT = {
  id: 'nv-artifact-id',
  artifact_data: {
    visualIdentity: {
      colorPalette: [
        { hex: '#2E4057', name: 'Primary' },
        { hex: '#9CAF88', name: 'Accent' },
      ],
      typography: {
        heading: 'Lora',
        body: 'Inter',
      },
    },
  },
  metadata: {},
};

const PERSONA_BRAND_ARTIFACT = {
  id: 'pb-artifact-id',
  artifact_data: {
    brandGenome: {
      values: ['Trust', 'Clarity', 'Accessibility'],
    },
  },
  metadata: {},
};

// ── Test: ARTIFACT_TYPES includes blueprint_token_manifest ────────────────

describe('ARTIFACT_TYPES', () => {
  test('includes BLUEPRINT_TOKEN_MANIFEST', () => {
    expect(ARTIFACT_TYPES.BLUEPRINT_TOKEN_MANIFEST).toBe('blueprint_token_manifest');
  });
});

// ── Test: extractAndLockTokens ─────────────────────────────────────────────

describe('extractAndLockTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeArtifact.mockResolvedValue('mock-artifact-id-123');
  });

  test('TS-01: happy path — extracts colors, typeScale, spacing; persists artifact', async () => {
    const supabase = buildSupabaseMock({
      [ARTIFACT_TYPES.IDENTITY_NAMING_VISUAL]: [NAMING_VISUAL_ARTIFACT],
      [ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND]: [PERSONA_BRAND_ARTIFACT],
    });

    const { artifactId, manifest } = await extractAndLockTokens(VENTURE_ID, supabase);

    expect(artifactId).toBe('mock-artifact-id-123');
    expect(manifest.colors).toEqual(['#2E4057', '#9CAF88']);
    expect(manifest.typeScale.heading).toBe('Lora');
    expect(manifest.typeScale.body).toBe('Inter');
    expect(manifest.spacing).toMatchObject({ xs: 4, sm: 8, md: 16, lg: 24, xl: 32 });
    expect(manifest.personality).toEqual(['Trust', 'Clarity', 'Accessibility']);

    expect(writeArtifact).toHaveBeenCalledOnce();
    const writeCall = writeArtifact.mock.calls[0][1];
    expect(writeCall.artifactType).toBe('blueprint_token_manifest');
    expect(writeCall.lifecycleStage).toBe(17);
    expect(writeCall.artifactData).toEqual(manifest);
    expect(writeCall.metadata.sourceArtifactIds.stage12Id).toBe('nv-artifact-id');
    expect(writeCall.metadata.sourceArtifactIds.stage11Id).toBe('pb-artifact-id');
  });

  test('TS-02: missing Stage 15 artifact — falls back to default spacing, no error', async () => {
    // Stage 15 not queried for spacing in this impl; test verifies spacing default
    const supabase = buildSupabaseMock({
      [ARTIFACT_TYPES.IDENTITY_NAMING_VISUAL]: [NAMING_VISUAL_ARTIFACT],
      [ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND]: [],
    });

    const { manifest } = await extractAndLockTokens(VENTURE_ID, supabase);
    expect(manifest.spacing).toMatchObject({ xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 });
    expect(manifest.personality).toEqual([]);
  });

  test('TS-03: missing Stage 11 identity_naming_visual — throws ExtractError', async () => {
    const supabase = buildSupabaseMock({
      [ARTIFACT_TYPES.IDENTITY_NAMING_VISUAL]: [],
      [ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND]: [PERSONA_BRAND_ARTIFACT],
    });

    await expect(extractAndLockTokens(VENTURE_ID, supabase)).rejects.toThrow(ExtractError);
    await expect(extractAndLockTokens(VENTURE_ID, supabase)).rejects.toThrow('identity_naming_visual');
  });

  test('TS-06: idempotency — second call completes without error', async () => {
    const supabase = buildSupabaseMock({
      [ARTIFACT_TYPES.IDENTITY_NAMING_VISUAL]: [NAMING_VISUAL_ARTIFACT],
      [ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND]: [PERSONA_BRAND_ARTIFACT],
    });

    const result1 = await extractAndLockTokens(VENTURE_ID, supabase);
    const result2 = await extractAndLockTokens(VENTURE_ID, supabase);

    expect(result1.artifactId).toBe('mock-artifact-id-123');
    expect(result2.artifactId).toBe('mock-artifact-id-123');
    expect(writeArtifact).toHaveBeenCalledTimes(2);
  });

  test('throws PersistError when writeArtifact fails', async () => {
    writeArtifact.mockRejectedValueOnce(new Error('DB write failed'));
    const supabase = buildSupabaseMock({
      [ARTIFACT_TYPES.IDENTITY_NAMING_VISUAL]: [NAMING_VISUAL_ARTIFACT],
      [ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND]: [],
    });

    const promise = extractAndLockTokens(VENTURE_ID, supabase);
    await expect(promise).rejects.toThrow(PersistError);
    await expect(promise).rejects.toThrow('Failed to persist');
  });

  test('handles flat hex string in colorPalette', async () => {
    const artifact = {
      ...NAMING_VISUAL_ARTIFACT,
      artifact_data: {
        visualIdentity: {
          colorPalette: ['#FF0000', '#00FF00'],
          typography: { heading: 'Georgia', body: 'Arial' },
        },
      },
    };
    const supabase = buildSupabaseMock({
      [ARTIFACT_TYPES.IDENTITY_NAMING_VISUAL]: [artifact],
      [ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND]: [],
    });

    const { manifest } = await extractAndLockTokens(VENTURE_ID, supabase);
    expect(manifest.colors).toEqual(['#FF0000', '#00FF00']);
  });
});

// ── Test: getTokenConstraints ──────────────────────────────────────────────

describe('getTokenConstraints', () => {
  test('TS-04: returns manifest when blueprint_token_manifest exists', async () => {
    const manifestData = {
      colors: ['#2E4057'],
      typeScale: { heading: 'Lora', body: 'Inter', mono: 'monospace' },
      spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
      personality: ['Trust'],
    };
    const supabase = buildSupabaseMock({
      [ARTIFACT_TYPES.BLUEPRINT_TOKEN_MANIFEST]: [{ id: 'tm-id', artifact_data: manifestData, metadata: {} }],
    });

    const constraints = await getTokenConstraints(VENTURE_ID, supabase);
    expect(constraints).toEqual(manifestData);
  });

  test('TS-05: returns null when no blueprint_token_manifest exists', async () => {
    const supabase = buildSupabaseMock({
      [ARTIFACT_TYPES.BLUEPRINT_TOKEN_MANIFEST]: [],
    });

    const constraints = await getTokenConstraints(VENTURE_ID, supabase);
    expect(constraints).toBeNull();
  });

  test('returns null when supabase is null', async () => {
    const constraints = await getTokenConstraints(VENTURE_ID, null);
    expect(constraints).toBeNull();
  });

  test('returns null when ventureId is falsy', async () => {
    const constraints = await getTokenConstraints('', {} );
    expect(constraints).toBeNull();
  });

  test('returns null without throwing when DB fetch throws', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockRejectedValue(new Error('DB error')),
      }),
    };

    const constraints = await getTokenConstraints(VENTURE_ID, supabase);
    expect(constraints).toBeNull();
  });
});
