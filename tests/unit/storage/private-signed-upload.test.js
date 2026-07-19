/**
 * SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-D (FR-2) — private-bucket + signed-URL upload.
 * The cited "precedent" in the parent SD's PRD (lib/eva/logo-image-generator.js,
 * lib/eva/stage-handlers/s11.js) is actually PUBLIC-bucket -- this module and its tests
 * assert the OPPOSITE behavior: never public, signed URL only.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { uploadPrivateAndSign } from '../../../lib/storage/private-signed-upload.js';

function makeFakeStorage({ createBucketError = null, uploadError = null } = {}) {
  const calls = { createBucket: [], upload: [], createSignedUrl: [] };
  return {
    calls,
    storage: {
      createBucket: vi.fn(async (name, opts) => {
        calls.createBucket.push({ name, opts });
        return { error: createBucketError };
      }),
      from(bucket) {
        return {
          upload: vi.fn(async (path, buffer, opts) => {
            calls.upload.push({ bucket, path, opts });
            return { error: uploadError };
          }),
          createSignedUrl: vi.fn(async (path, expiresInSeconds) => {
            calls.createSignedUrl.push({ bucket, path, expiresInSeconds });
            return { data: { signedUrl: `https://signed.example/${bucket}/${path}?exp=${expiresInSeconds}` }, error: null };
          }),
          getPublicUrl: vi.fn(() => { throw new Error('getPublicUrl must never be called by uploadPrivateAndSign'); }),
        };
      },
    },
  };
}

describe('uploadPrivateAndSign (FR-2)', () => {
  it('creates the bucket with public:false', async () => {
    const fake = makeFakeStorage();
    await uploadPrivateAndSign(fake, { bucket: 'daily-review-gantt', path: 'p.png', buffer: Buffer.from('x'), contentType: 'image/png', expiresInSeconds: 300 });
    expect(fake.calls.createBucket[0].opts).toEqual({ public: false });
  });

  it('returns a signedUrl sourced from createSignedUrl, never getPublicUrl', async () => {
    const fake = makeFakeStorage();
    const result = await uploadPrivateAndSign(fake, { bucket: 'daily-review-gantt', path: 'p.png', buffer: Buffer.from('x'), contentType: 'image/png', expiresInSeconds: 300 });
    expect(result.signedUrl).toContain('signed.example');
    expect(fake.calls.createSignedUrl).toHaveLength(1);
    expect(fake.calls.createSignedUrl[0].expiresInSeconds).toBe(300);
  });

  it('tolerates a bucket-already-exists error and still returns a signed URL (create-or-use)', async () => {
    const fake = makeFakeStorage({ createBucketError: { message: 'Bucket already exists' } });
    const result = await uploadPrivateAndSign(fake, { bucket: 'daily-review-gantt', path: 'p.png', buffer: Buffer.from('x'), contentType: 'image/png', expiresInSeconds: 300 });
    expect(result.signedUrl).toContain('signed.example');
  });

  it('throws on a genuine (non-already-exists) createBucket error', async () => {
    const fake = makeFakeStorage({ createBucketError: { message: 'permission denied' } });
    await expect(uploadPrivateAndSign(fake, { bucket: 'x', path: 'p.png', buffer: Buffer.from('x'), contentType: 'image/png', expiresInSeconds: 300 })).rejects.toThrow(/permission denied/);
  });

  it('throws on an upload error', async () => {
    const fake = makeFakeStorage({ uploadError: { message: 'quota exceeded' } });
    await expect(uploadPrivateAndSign(fake, { bucket: 'x', path: 'p.png', buffer: Buffer.from('x'), contentType: 'image/png', expiresInSeconds: 300 })).rejects.toThrow(/quota exceeded/);
  });
});

// Strips /** */ block comments and // line comments so the gate checks actual CODE, not the
// module's own docstrings explaining the anti-pattern it deliberately avoids.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('confidentiality static gate (TR-2)', () => {
  it('the new gantt-renderer.js and private-signed-upload.js CODE (comments excluded) contains zero getPublicUrl/public:true occurrences', () => {
    const files = [
      'lib/chairman/daily-review/gantt-renderer.js',
      'lib/storage/private-signed-upload.js',
    ];
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'));
      expect(code).not.toMatch(/getPublicUrl/);
      expect(code).not.toMatch(/public:\s*true/);
    }
  });
});
