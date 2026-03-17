import { describe, it, expect } from 'vitest';
import { validateFileScope } from '../../../../scripts/modules/handoff/validators/file-scope-validator.js';

describe('validateFileScope', () => {
  it('returns passed=true with score 70 when prd is missing (never blocks)', async () => {
    const result = await validateFileScope({});
    expect(result.passed).toBe(true); // PAT-VALIDATION-SCHEMA-MISMATCH-001: never blocks
    expect(result.score).toBe(70);
    expect(result.max_score).toBe(100);
    expect(result.issues).toHaveLength(0); // no blocking issues
    expect(result.warnings[0]).toContain('file_scope not defined');
    expect(result.details.source).toBe('not_found');
  });

  it('returns score 70 when file_scope has no create/modify/delete', async () => {
    const result = await validateFileScope({ prd: { file_scope: {} } });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(70);
    expect(result.warnings[0]).toContain('file_scope not defined');
    expect(result.details.create).toBe(0);
    expect(result.details.modify).toBe(0);
    expect(result.details.delete).toBe(0);
  });

  it('returns score 100 with populated create array', async () => {
    const result = await validateFileScope({
      prd: {
        file_scope: {
          create: ['src/new-module.js'],
          modify: [],
          delete: []
        }
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.details.create).toBe(1);
    expect(result.details.source).toBe('column');
  });

  it('returns score 100 with populated modify array', async () => {
    const result = await validateFileScope({
      prd: {
        file_scope: {
          create: [],
          modify: ['src/existing.js', 'src/other.js'],
          delete: []
        }
      }
    });
    expect(result.score).toBe(100);
    expect(result.details.modify).toBe(2);
  });

  it('returns score 100 with populated delete array', async () => {
    const result = await validateFileScope({
      prd: {
        file_scope: {
          create: [],
          modify: [],
          delete: ['src/deprecated.js']
        }
      }
    });
    expect(result.score).toBe(100);
    expect(result.details.delete).toBe(1);
  });

  it('warns when all arrays are empty but keys exist', async () => {
    const result = await validateFileScope({
      prd: {
        file_scope: {
          create: [],
          modify: [],
          delete: []
        }
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(70);
    expect(result.warnings).toContain('file_scope arrays are all empty - consider if any file changes are planned');
  });

  it('reads from prd.metadata.file_scope as fallback', async () => {
    const result = await validateFileScope({
      prd: {
        metadata: {
          file_scope: {
            create: ['src/new-feature.js'],
            modify: [],
            delete: []
          }
        }
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.source).toBe('metadata');
    expect(result.details.create).toBe(1);
  });

  it('prefers prd.file_scope over prd.metadata.file_scope', async () => {
    const result = await validateFileScope({
      prd: {
        file_scope: {
          create: ['primary.js'],
          modify: [],
          delete: []
        },
        metadata: {
          file_scope: {
            create: ['fallback.js', 'other.js'],
            modify: [],
            delete: []
          }
        }
      }
    });
    expect(result.details.source).toBe('column');
    expect(result.details.create).toBe(1);
  });

  it('never returns passed=false (non-blocking validator)', async () => {
    const result = await validateFileScope({ prd: {} });
    expect(result.passed).toBe(true);
  });
});
