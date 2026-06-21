/**
 * SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-D (FR-2) — integration tests for the claim-time
 * source-integrity wire in evaluateDispatchEligibility.
 *
 * A stub supabase client serves the SD row (strategic_directives_v2) and the source row
 * (roadmap_wave_items). SDs carry NO dependencies so draftDepsSatisfied short-circuits to eligible
 * without a third query — isolating the new auto-refill source axis.
 */
import { describe, it, expect } from 'vitest';
import { evaluateDispatchEligibility } from '../../../lib/fleet/claim-eligibility.cjs';

const SD_KEY = 'SD-REFILL-00ABCD12';
const SOURCE_ID = '4004aa2c-0139-41e0-9cd3-fa42a8148621';

/** A baseline dispatchable SD row (no deps, not terminal, not a parent/fixture). */
function sdRow(overrides = {}) {
  return {
    sd_key: SD_KEY,
    sd_type: 'infrastructure',
    dependencies: [],
    status: 'draft',
    target_application: 'EHG_Engineer',
    metadata: {},
    ...overrides,
  };
}

const autoRefillMeta = { sourced_by: 'auto-refill', promoted_from_roadmap_item_id: SOURCE_ID };

/** Build a stub supabase client + a record of which tables were queried. */
function makeStub({ sd, source = null, sourceError = null }) {
  const queried = [];
  const sb = {
    from(table) {
      queried.push(table);
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        in() { return builder; },
        async maybeSingle() {
          if (table === 'strategic_directives_v2') return { data: sd, error: null };
          if (table === 'roadmap_wave_items') return { data: source, error: sourceError };
          return { data: null, error: null };
        },
        // thenable safety net for any `await builder` path (deps query) — unused with empty deps
        then(resolve) { resolve({ data: [], error: null }); },
      };
      return builder;
    },
  };
  return { sb, queried };
}

const validSource = () => ({ promoted_to_sd_key: SD_KEY, lane: 'build', title: 'real candidate', source_id: SOURCE_ID });

describe('evaluateDispatchEligibility — auto-refill claim-time source guard', () => {
  it('blocks an auto-refill SD whose source lane was declined post-promotion', async () => {
    const { sb } = makeStub({ sd: sdRow({ metadata: autoRefillMeta }), source: { ...validSource(), lane: 'decline' } });
    const verdict = await evaluateDispatchEligibility(sb, SD_KEY);
    expect(verdict).toEqual({ eligible: false, reason: 'refill_source_declined_lane' });
  });

  it('blocks an auto-refill SD whose source was unlinked/re-pointed', async () => {
    const { sb } = makeStub({ sd: sdRow({ metadata: autoRefillMeta }), source: { ...validSource(), promoted_to_sd_key: null } });
    const verdict = await evaluateDispatchEligibility(sb, SD_KEY);
    expect(verdict).toEqual({ eligible: false, reason: 'refill_source_source_unlinked' });
  });

  it('blocks an auto-refill SD whose source row is gone', async () => {
    const { sb } = makeStub({ sd: sdRow({ metadata: autoRefillMeta }), source: null });
    const verdict = await evaluateDispatchEligibility(sb, SD_KEY);
    expect(verdict).toEqual({ eligible: false, reason: 'refill_source_source_missing' });
  });

  it('allows an auto-refill SD whose source is still validly linked and non-declined', async () => {
    const { sb } = makeStub({ sd: sdRow({ metadata: autoRefillMeta }), source: validSource() });
    const verdict = await evaluateDispatchEligibility(sb, SD_KEY);
    expect(verdict).toEqual({ eligible: true });
  });

  it('FAIL-OPEN: a source-fetch error never blocks dispatch', async () => {
    const { sb } = makeStub({ sd: sdRow({ metadata: autoRefillMeta }), sourceError: { message: 'boom' } });
    const verdict = await evaluateDispatchEligibility(sb, SD_KEY);
    expect(verdict).toEqual({ eligible: true });
  });

  it('FAIL-OPEN: an auto-refill SD missing promoted_from_roadmap_item_id is not fetched and stays eligible', async () => {
    const { sb, queried } = makeStub({ sd: sdRow({ metadata: { sourced_by: 'auto-refill' } }) });
    const verdict = await evaluateDispatchEligibility(sb, SD_KEY);
    expect(verdict).toEqual({ eligible: true });
    expect(queried).not.toContain('roadmap_wave_items');
  });

  it('BYTE-IDENTICAL: a non-auto-refill SD never triggers a source fetch', async () => {
    const { sb, queried } = makeStub({ sd: sdRow({ metadata: { sourced_by: 'leo' } }) });
    const verdict = await evaluateDispatchEligibility(sb, SD_KEY);
    expect(verdict).toEqual({ eligible: true });
    expect(queried).not.toContain('roadmap_wave_items');
  });
});
