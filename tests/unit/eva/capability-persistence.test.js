/**
 * Unit tests for capability persistence + reuse.
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 6 (FR-015)
 */
import { describe, it, expect } from 'vitest';
import {
  capabilityIdFor, toCapabilityRecord, findReusable, planCapabilityWrites, DIMENSION_CAPABILITY,
} from '../../../lib/eva/bridge/capability-persistence.js';

const dbSection = { dimension: 'data-schema', code: 'DATABASE', section: 'CREATE TABLE connections (...)' };
const stackSection = { dimension: 'venture-stack-compliance', code: 'VENTURE_STACK', section: 'Clerk + Replit Postgres' };

describe('capabilityIdFor / toCapabilityRecord', () => {
  it('produces a stable, slugified id from code+dimension', () => {
    expect(capabilityIdFor(dbSection)).toBe('cap-database-data-schema');
  });

  it('maps a data-schema section to a database_schema/application capability', () => {
    const rec = toCapabilityRecord(dbSection, { ventureId: 'v1' });
    expect(rec.capability_type).toBe('database_schema');
    expect(rec.category).toBe('application');
    expect(rec.capability_id).toBe('cap-database-data-schema');
    expect(rec.source_venture_id).toBe('v1');
  });

  it('maps venture-stack-compliance to a governance quality_gate', () => {
    const rec = toCapabilityRecord(stackSection);
    expect(rec.capability_type).toBe('quality_gate');
    expect(rec.category).toBe('governance');
  });

  it('truncates an overlong section into the description', () => {
    const rec = toCapabilityRecord({ dimension: 'data-schema', code: 'DATABASE', section: 'x'.repeat(400) });
    expect(rec.description.length).toBe(280);
  });

  it('unknown dimensions fall back to service/application', () => {
    const rec = toCapabilityRecord({ dimension: 'mystery', code: 'Z', section: 's' });
    expect(rec.capability_type).toBe('service');
    expect(rec.category).toBe('application');
    expect(Object.keys(DIMENSION_CAPABILITY).length).toBeGreaterThan(5);
  });
});

describe('findReusable / planCapabilityWrites — cross-venture compounding', () => {
  it('reuses an existing capability instead of re-creating it (a second venture inherits it)', () => {
    const existing = [{ capability_id: 'cap-database-data-schema', reuse_count: 1 }];
    const r = planCapabilityWrites([dbSection], existing, { ventureId: 'v2' });
    expect(r.toCreate).toEqual([]);
    expect(r.toReuse).toEqual([{ capability_id: 'cap-database-data-schema', prior_reuse_count: 1 }]);
  });

  it('creates a capability the platform has never seen', () => {
    const r = planCapabilityWrites([stackSection], [], { ventureId: 'v1' });
    expect(r.toReuse).toEqual([]);
    expect(r.toCreate).toHaveLength(1);
    expect(r.toCreate[0].capability_id).toBe('cap-venture-stack-venture-stack-compliance');
  });

  it('dedups within a single batch (two sections of the same capability => one create)', () => {
    const r = planCapabilityWrites([dbSection, { ...dbSection, section: 'again' }], []);
    expect(r.toCreate).toHaveLength(1);
  });

  it('tolerates empty / non-array input', () => {
    expect(planCapabilityWrites().toCreate).toEqual([]);
    expect(findReusable({ capability_id: 'x' }, null)).toBeNull();
  });
});
