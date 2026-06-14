/**
 * SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-A — stack-descriptor unit tests
 *
 * Covers:
 *   - validateStackDescriptor: valid/invalid cases
 *   - JSON artifact drift: contracts/stack-descriptor.schema.json deep-equals STACK_DESCRIPTOR_SCHEMA
 *   - isReplitTarget / isCloudTarget predicates
 *   - resolveDbLabel / resolveStorageLabel helpers
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  validateStackDescriptor,
  isReplitTarget,
  isCloudTarget,
  isCloudflareTarget,
  deployTargetFamily,
  resolveDbLabel,
  resolveStorageLabel,
  STACK_DESCRIPTOR_SCHEMA,
} from '../../../lib/venture-deploy/stack-descriptor.js';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_ARTIFACT = join(here, '../../../contracts/stack-descriptor.schema.json');

// ── validateStackDescriptor ────────────────────────────────────────────────

describe('validateStackDescriptor', () => {
  const CF_DESCRIPTOR = {
    db_provider: 'd1',
    deployment_target: 'cloudflare-pages',
    storage: 'r2',
    region: 'auto',
  };

  const REPLIT_DESCRIPTOR = {
    db_provider: 'replit-postgres',
    deployment_target: 'replit-autoscale',
    storage: 'replit-object-storage',
  };

  it('accepts a complete Cloudflare descriptor as valid', () => {
    const { valid, errors } = validateStackDescriptor(CF_DESCRIPTOR);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('accepts a complete Replit descriptor as valid', () => {
    const { valid, errors } = validateStackDescriptor(REPLIT_DESCRIPTOR);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('rejects a descriptor missing db_provider with a named error', () => {
    const { valid, errors } = validateStackDescriptor({ deployment_target: 'cloudflare-pages' });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('db_provider'))).toBe(true);
  });

  it('rejects a descriptor missing deployment_target with a named error', () => {
    const { valid, errors } = validateStackDescriptor({ db_provider: 'd1' });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('deployment_target'))).toBe(true);
  });

  it('rejects when both required fields are missing', () => {
    const { valid, errors } = validateStackDescriptor({});
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('db_provider'))).toBe(true);
    expect(errors.some((e) => e.includes('deployment_target'))).toBe(true);
  });

  it('rejects deployment_target=heroku naming the invalid value', () => {
    const { valid, errors } = validateStackDescriptor({
      db_provider: 'd1',
      deployment_target: 'heroku',
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('heroku') && e.includes('deployment_target'))).toBe(true);
  });

  it('rejects an invalid db_provider value naming it', () => {
    const { valid, errors } = validateStackDescriptor({
      db_provider: 'postgres',
      deployment_target: 'cloudflare-pages',
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('postgres') && e.includes('db_provider'))).toBe(true);
  });

  it('rejects null / non-object inputs', () => {
    expect(validateStackDescriptor(null).valid).toBe(false);
    expect(validateStackDescriptor('string').valid).toBe(false);
    expect(validateStackDescriptor(42).valid).toBe(false);
    expect(validateStackDescriptor([]).valid).toBe(false);
  });

  it('passes through unknown fields (additionalProperties: true)', () => {
    const { valid } = validateStackDescriptor({ ...CF_DESCRIPTOR, graduation: { trigger: 'dau_1000' } });
    expect(valid).toBe(true);
  });

  it('validates optional storage field when present', () => {
    const badStorage = validateStackDescriptor({
      db_provider: 'd1',
      deployment_target: 'cloudflare-pages',
      storage: 'gcs',
    });
    expect(badStorage.valid).toBe(false);
    expect(badStorage.errors.some((e) => e.includes('gcs') && e.includes('storage'))).toBe(true);

    const goodStorage = validateStackDescriptor({
      db_provider: 'd1',
      deployment_target: 'cloudflare-pages',
      storage: 'r2',
    });
    expect(goodStorage.valid).toBe(true);
  });
});

// ── F2: passthrough-slot shape enforcement ──────────────────────────────────

describe('validateStackDescriptor — F2 graduation/connection shape', () => {
  const base = { db_provider: 'd1', deployment_target: 'cloudflare-pages' };

  it('rejects non-object graduation', () => {
    const r = validateStackDescriptor({ ...base, graduation: 'dau_1000' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('graduation'))).toBe(true);
  });

  it('rejects array graduation', () => {
    const r = validateStackDescriptor({ ...base, graduation: ['a'] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('graduation'))).toBe(true);
  });

  it('accepts a plain-object graduation', () => {
    expect(validateStackDescriptor({ ...base, graduation: { trigger: 'dau_1000' } }).valid).toBe(true);
  });

  it('rejects non-object connection', () => {
    const r = validateStackDescriptor({ ...base, connection: 'postgres://x' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('connection'))).toBe(true);
  });

  it('accepts a plain-object connection', () => {
    expect(validateStackDescriptor({ ...base, connection: { url: 'postgres://x' } }).valid).toBe(true);
  });

  it('allows graduation/connection to be omitted entirely', () => {
    expect(validateStackDescriptor(base).valid).toBe(true);
  });
});

// ── F4: cross-field coherence ───────────────────────────────────────────────

describe('validateStackDescriptor — F4 coherence', () => {
  it('accepts coherent cloudflare + d1 + r2', () => {
    expect(validateStackDescriptor({
      db_provider: 'd1', deployment_target: 'cloudflare-pages', storage: 'r2',
    }).valid).toBe(true);
  });

  it('accepts coherent cloud-run + neon (+ r2)', () => {
    expect(validateStackDescriptor({
      db_provider: 'neon', deployment_target: 'cloud-run',
    }).valid).toBe(true);
    expect(validateStackDescriptor({
      db_provider: 'neon', deployment_target: 'cloud-run', storage: 'r2',
    }).valid).toBe(true);
  });

  it('accepts coherent replit-autoscale + replit-postgres + replit-object-storage', () => {
    expect(validateStackDescriptor({
      db_provider: 'replit-postgres',
      deployment_target: 'replit-autoscale',
      storage: 'replit-object-storage',
    }).valid).toBe(true);
  });

  it('rejects cloud target + replit-postgres', () => {
    const r = validateStackDescriptor({
      db_provider: 'replit-postgres', deployment_target: 'cloudflare-pages',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('incoherent'))).toBe(true);
  });

  it('rejects cloud target + replit-object-storage', () => {
    const r = validateStackDescriptor({
      db_provider: 'd1', deployment_target: 'cloud-run', storage: 'replit-object-storage',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('incoherent'))).toBe(true);
  });

  it('rejects replit-autoscale + d1', () => {
    const r = validateStackDescriptor({
      db_provider: 'd1', deployment_target: 'replit-autoscale',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('incoherent'))).toBe(true);
  });

  it('rejects replit-autoscale + r2', () => {
    const r = validateStackDescriptor({
      db_provider: 'replit-postgres', deployment_target: 'replit-autoscale', storage: 'r2',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('incoherent'))).toBe(true);
  });

  it('does NOT add a coherence error when an enum value is itself invalid', () => {
    // bad deployment_target => only the enum error fires, no coherence noise
    const r = validateStackDescriptor({ db_provider: 'd1', deployment_target: 'heroku' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('heroku'))).toBe(true);
    expect(r.errors.some((e) => e.includes('incoherent'))).toBe(false);
  });
});

// ── JSON artifact drift guard ──────────────────────────────────────────────

describe('contracts/stack-descriptor.schema.json drift guard', () => {
  it('deep-equals STACK_DESCRIPTOR_SCHEMA (no drift allowed)', () => {
    const onDisk = JSON.parse(readFileSync(SCHEMA_ARTIFACT, 'utf-8'));
    expect(onDisk).toEqual(STACK_DESCRIPTOR_SCHEMA);
  });
});

// ── Target predicates ──────────────────────────────────────────────────────

describe('isReplitTarget / isCloudTarget', () => {
  it('absent descriptor => Replit', () => {
    expect(isReplitTarget(null)).toBe(true);
    expect(isReplitTarget(undefined)).toBe(true);
    expect(isReplitTarget(false)).toBe(true);
    expect(isCloudTarget(null)).toBe(false);
  });

  it('replit-autoscale => Replit', () => {
    expect(isReplitTarget({ deployment_target: 'replit-autoscale' })).toBe(true);
    expect(isCloudTarget({ deployment_target: 'replit-autoscale' })).toBe(false);
  });

  it('cloudflare-pages => Cloud', () => {
    expect(isReplitTarget({ deployment_target: 'cloudflare-pages' })).toBe(false);
    expect(isCloudTarget({ deployment_target: 'cloudflare-pages' })).toBe(true);
  });

  it('cloudflare-workers => Cloud', () => {
    expect(isCloudTarget({ deployment_target: 'cloudflare-workers' })).toBe(true);
  });

  it('cloud-run => Cloud', () => {
    expect(isCloudTarget({ deployment_target: 'cloud-run' })).toBe(true);
  });

  it('F5: fail-safe — invalid/unknown deployment_target => Replit DEFAULT, not cloud', () => {
    expect(isReplitTarget({ deployment_target: 'heroku' })).toBe(true);
    expect(isReplitTarget({})).toBe(true);
    expect(isReplitTarget({ db_provider: 'd1' })).toBe(true); // no deployment_target
    expect(isCloudTarget({ deployment_target: 'heroku' })).toBe(false);
    expect(isCloudTarget({})).toBe(false);
  });
});

describe('deployTargetFamily (F1 discriminator)', () => {
  it('absent / replit-autoscale => replit', () => {
    expect(deployTargetFamily(null)).toBe('replit');
    expect(deployTargetFamily(undefined)).toBe('replit');
    expect(deployTargetFamily({})).toBe('replit');
    expect(deployTargetFamily({ deployment_target: 'replit-autoscale' })).toBe('replit');
  });

  it('F5: invalid/unknown deployment_target => replit (fail-safe)', () => {
    expect(deployTargetFamily({ deployment_target: 'heroku' })).toBe('replit');
    expect(deployTargetFamily({ deployment_target: '' })).toBe('replit');
    expect(deployTargetFamily('not-an-object')).toBe('replit');
    expect(deployTargetFamily([])).toBe('replit');
  });

  it('cloudflare-pages / cloudflare-workers => cloudflare', () => {
    expect(deployTargetFamily({ deployment_target: 'cloudflare-pages' })).toBe('cloudflare');
    expect(deployTargetFamily({ deployment_target: 'cloudflare-workers' })).toBe('cloudflare');
  });

  it('cloud-run => cloud-run', () => {
    expect(deployTargetFamily({ deployment_target: 'cloud-run' })).toBe('cloud-run');
  });
});

describe('isCloudflareTarget', () => {
  it('true only for cloudflare-pages / cloudflare-workers', () => {
    expect(isCloudflareTarget({ deployment_target: 'cloudflare-pages' })).toBe(true);
    expect(isCloudflareTarget({ deployment_target: 'cloudflare-workers' })).toBe(true);
    expect(isCloudflareTarget({ deployment_target: 'cloud-run' })).toBe(false);
    expect(isCloudflareTarget({ deployment_target: 'replit-autoscale' })).toBe(false);
    expect(isCloudflareTarget(null)).toBe(false);
  });
});

// ── Label helpers ──────────────────────────────────────────────────────────

describe('resolveDbLabel', () => {
  it('d1 => Cloudflare D1', () => {
    expect(resolveDbLabel({ db_provider: 'd1' })).toBe('Cloudflare D1');
  });
  it('neon => Neon Postgres', () => {
    expect(resolveDbLabel({ db_provider: 'neon' })).toBe('Neon Postgres');
  });
  it('replit-postgres => Replit Postgres', () => {
    expect(resolveDbLabel({ db_provider: 'replit-postgres' })).toBe('Replit Postgres');
  });
  it('F6: absent/null/unknown => NEUTRAL label, never "Replit Postgres"', () => {
    expect(resolveDbLabel(null)).toBe('the configured database');
    expect(resolveDbLabel({})).toBe('the configured database');
    expect(resolveDbLabel({ db_provider: 'mystery' })).toBe('the configured database');
    expect(resolveDbLabel(null)).not.toContain('Replit');
  });
});

describe('resolveStorageLabel', () => {
  it('r2 => Cloudflare R2', () => {
    expect(resolveStorageLabel({ storage: 'r2' })).toBe('Cloudflare R2');
  });
  it('replit-object-storage => Replit Object Storage', () => {
    expect(resolveStorageLabel({ storage: 'replit-object-storage' })).toBe('Replit Object Storage');
  });
  it('F7: absent/unknown => NEUTRAL label, never "Replit Object Storage"', () => {
    expect(resolveStorageLabel(null)).toBe('platform-native object storage');
    expect(resolveStorageLabel({})).toBe('platform-native object storage');
    expect(resolveStorageLabel({ storage: 'mystery' })).toBe('platform-native object storage');
    expect(resolveStorageLabel(null)).not.toContain('Replit');
  });
});
