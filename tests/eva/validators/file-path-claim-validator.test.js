import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import filePathValidator, { isFilePathToken, validate } from '../../../scripts/eva/validators/file-path-claim-validator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');

describe('FilePathClaimValidator', () => {
  it('passes for an existing file', async () => {
    const result = await validate({ path: 'package.json' }, { repo_root: REPO_ROOT });
    expect(result.passed).toBe(true);
    expect(result.severity).toBe('info');
    expect(result.validator_id).toBe('file-path-claim-validator');
  });

  it('fails for a missing file with remediation_hint', async () => {
    const result = await validate({ path: 'does/not/exist.ts' }, { repo_root: REPO_ROOT });
    expect(result.passed).toBe(false);
    expect(result.severity).toBe('error');
    expect(result.remediation_hint).toContain('Confirm path');
  });

  it('rejects malformed claim (missing path)', async () => {
    const result = await validate({}, { repo_root: REPO_ROOT });
    expect(result.passed).toBe(false);
    expect(result.expected).toContain('path');
  });

  it('isFilePathToken accepts known extensions', () => {
    expect(isFilePathToken('src/foo/bar.ts')).toBe(true);
    expect(isFilePathToken('docs/x.md')).toBe(true);
    expect(isFilePathToken('not-a-path')).toBe(false);
    expect(isFilePathToken('foo.bar')).toBe(false);
  });

  it('default export exposes the same surface', () => {
    expect(filePathValidator.VALIDATOR_ID).toBe('file-path-claim-validator');
    expect(typeof filePathValidator.validate).toBe('function');
  });
});
