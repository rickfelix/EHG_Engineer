/**
 * SD-EHG-VISION-V2-AUTONOMOUS-MARKETING-CAPABILITY-001 — FR-3 (verify V1 gauge intact)
 *
 * Proves the V2 ratification is coherence-safe:
 *  (hermetic) the V2 capability is NOT in VDR_REGISTRY (FR-2 deferred the probe), and the seed
 *             logic builds the correct row;
 *  (live)     the V2 rung stays inactive with the single ratified row, the active V1 rung keeps its
 *             25-criteria denominator, and assertRegistryCoherence is ok over the active rung — so
 *             the inactive V2 row is invisible to the live V1 gauge.
 *
 * The live block runs against the engineer DB (where the seed was applied); it reads only — no writes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'dotenv/config';
import { VDR_REGISTRY, assertRegistryCoherence } from '../../../lib/vision/vdr-registry.js';
import { buildV2CriteriaRow, V2_CRITERION, criteriaKey } from '../../../scripts/okr/seed-v2-autonomous-marketing-criteria.mjs';
import { createDatabaseClient } from '../../../scripts/lib/supabase-connection.js';

const V2_CAP = 'Autonomous customer acquisition & distribution';

describe('FR-2: the V2 probe is deferred (not in VDR_REGISTRY)', () => {
  it('VDR_REGISTRY contains no V2 capability / autonomous-campaign probe', () => {
    const caps = VDR_REGISTRY.map((e) => e.capability);
    expect(caps).not.toContain(V2_CAP);
    const blob = JSON.stringify(VDR_REGISTRY).toLowerCase();
    expect(blob).not.toMatch(/autonomous_campaign_execution|autonomous customer acquisition/);
  });
});

describe('FR-1: seed logic builds the ratified V2 row', () => {
  it('buildV2CriteriaRow produces ordinal 1 + the ratified capability for the given rung', () => {
    const row = buildV2CriteriaRow('rung-xyz');
    expect(row).toMatchObject({ rung_id: 'rung-xyz', ordinal: 1, capability: V2_CAP });
    expect(row.today).toMatch(/PLANNING layer only/);
    expect(row.required).toMatch(/WITHOUT the chairman/);
    expect(criteriaKey(row)).toBe(`rung-xyz::${V2_CAP}`);
    expect(V2_CRITERION.capability).toBe(V2_CAP);
  });
});

const HAS_DB = Boolean(process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL);
describe.skipIf(!HAS_DB)('FR-3 (live): V2 recorded inactive; V1 gauge unaffected', () => {
  let client;
  beforeAll(async () => {
    client = await createDatabaseClient('engineer', {
      connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL,
    });
  });
  afterAll(async () => { if (client) await client.end(); });

  it('the V2 rung is inactive and carries the single ratified criterion', async () => {
    const r = await client.query(
      `SELECT r.is_active, count(c.id)::int AS n,
              bool_or(c.capability = $1) AS has_cap
       FROM vision_ladder_rungs r
       LEFT JOIN vision_ladder_criteria c ON c.rung_id = r.id
       WHERE r.rung_key = 'V2'
       GROUP BY r.is_active`,
      [V2_CAP],
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].is_active).toBe(false);
    expect(r.rows[0].n).toBe(1);
    expect(r.rows[0].has_cap).toBe(true);
  });

  it('the active V1 rung keeps its 25-criteria denominator and assertRegistryCoherence is ok', async () => {
    const r = await client.query(
      `SELECT c.capability
       FROM vision_ladder_rungs r
       JOIN vision_ladder_criteria c ON c.rung_id = r.id
       WHERE r.is_active = true`,
    );
    // The active-rung denominator must equal the registry probe count (coherence's real invariant) —
    // derived from VDR_REGISTRY rather than a brittle literal, so a legit future V1 change doesn't
    // spuriously fail this V2-ratification guard, while a V2 row leaking into the active set still would.
    expect(r.rows.length).toBe(VDR_REGISTRY.length); // denominator unchanged by the V2 ratification
    const coherence = assertRegistryCoherence(r.rows.map((x) => ({ capability: x.capability })));
    expect(coherence.ok).toBe(true);
    expect(coherence.staleProbes).toEqual([]);
    expect(coherence.missingProbes).toEqual([]);
  });
});
