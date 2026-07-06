import { describe, test, expect, beforeEach, vi } from 'vitest';

const mockWriteArtifact = vi.fn().mockResolvedValue('manifest-artifact-id');

vi.mock('../../../lib/eva/artifact-persistence-service.js', () => ({
  writeArtifact: (...args) => mockWriteArtifact(...args),
}));

import {
  extractAndLockTokens,
  getTokenConstraints,
  ensureTokenManifestLocked,
  ExtractError,
} from '../../../lib/eva/stage-17/token-manifest.js';

const IDENTITY_NAMING_VISUAL = {
  id: 'naming-visual-id',
  artifact_data: {
    visualIdentity: {
      colorPalette: [{ hex: '#2563EB' }, { hex: '#06B6D4' }],
      typography: { heading: 'Montserrat', body: 'Lato' },
    },
  },
};

/**
 * Stateful Supabase mock: tracks whether a blueprint_token_manifest has been
 * "locked" (via writeArtifact) so ensureTokenManifestLocked's idempotency can
 * be tested against two real, sequential calls.
 */
function createMockSupabase({ hasIdentityVisual = true } = {}) {
  let locked = false;
  mockWriteArtifact.mockImplementation(async () => {
    locked = true;
    return 'manifest-artifact-id';
  });

  const from = vi.fn(() => {
    let artifactType;
    const builder = {
      select() { return builder; },
      eq(col, val) {
        if (col === 'artifact_type') artifactType = val;
        return builder;
      },
      order() { return builder; },
      limit() {
        let data = [];
        if (artifactType === 'blueprint_token_manifest') {
          data = locked ? [{ id: 'manifest-artifact-id', artifact_data: { colors: ['#2563EB'] }, metadata: {} }] : [];
        } else if (artifactType === 'identity_naming_visual') {
          data = hasIdentityVisual ? [IDENTITY_NAMING_VISUAL] : [];
        } else if (artifactType === 'identity_persona_brand') {
          data = [];
        }
        return Promise.resolve({ data, error: null });
      },
    };
    return builder;
  });

  return { from, _isLocked: () => locked };
}

describe('token-manifest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractAndLockTokens()', () => {
    test('throws ExtractError when identity_naming_visual is missing', async () => {
      const supabase = createMockSupabase({ hasIdentityVisual: false });
      await expect(extractAndLockTokens('v-1', supabase)).rejects.toThrow(ExtractError);
    });

    test('extracts and persists a manifest when identity_naming_visual exists', async () => {
      const supabase = createMockSupabase();
      const { artifactId, manifest } = await extractAndLockTokens('v-1', supabase);
      expect(artifactId).toBe('manifest-artifact-id');
      expect(manifest.colors).toEqual(['#2563EB', '#06B6D4']);
      expect(mockWriteArtifact).toHaveBeenCalledTimes(1);
    });
  });

  describe('ensureTokenManifestLocked()', () => {
    test('locks tokens on first call when none exist yet', async () => {
      const supabase = createMockSupabase();
      const manifest = await ensureTokenManifestLocked('v-1', supabase);
      expect(manifest.colors).toEqual(['#2563EB', '#06B6D4']);
      expect(mockWriteArtifact).toHaveBeenCalledTimes(1);
    });

    test('is idempotent — a second call short-circuits without re-locking', async () => {
      const supabase = createMockSupabase();
      await ensureTokenManifestLocked('v-1', supabase);
      await ensureTokenManifestLocked('v-1', supabase);
      expect(mockWriteArtifact).toHaveBeenCalledTimes(1);
    });

    test('propagates ExtractError when no identity_naming_visual exists', async () => {
      const supabase = createMockSupabase({ hasIdentityVisual: false });
      await expect(ensureTokenManifestLocked('v-1', supabase)).rejects.toThrow(ExtractError);
      expect(mockWriteArtifact).not.toHaveBeenCalled();
    });
  });

  describe('getTokenConstraints()', () => {
    test('returns null when no manifest is locked', async () => {
      const supabase = createMockSupabase();
      const result = await getTokenConstraints('v-1', supabase);
      expect(result).toBeNull();
    });

    test('never throws — returns null on missing supabase/ventureId', async () => {
      await expect(getTokenConstraints(null, null)).resolves.toBeNull();
      await expect(getTokenConstraints('v-1', null)).resolves.toBeNull();
    });
  });
});
