/**
 * SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001 (FR-5, TS-1, TS-6): DB-independent equivalence proof.
 * Round-trips STANDARD_VENTURE_TEMPLATE through templateToBaseRows() + resolveVentureRoles() and
 * asserts the reconstructed shape is identical to the source template for all 28 roles --
 * comparing KEY PRESENCE, not just value (VALIDATION sub-agent finding, LEAD phase: several
 * fields are legitimately absent on some roles, e.g. crews never carry stage_ownership).
 */
import { describe, it, expect } from 'vitest';
import { STANDARD_VENTURE_TEMPLATE } from '../../../lib/agents/venture-ceo-factory.js';
import { templateToBaseRows, resolveVentureRoles, ROLE_FIELD_KEYS } from '../../../lib/org/role-registry-resolver.mjs';

const FIXTURE_VENTURE_ID = 'fixture-venture-role-registry-equivalence';

function buildPinsForAllRoles(baseRows) {
  return baseRows.map((row) => ({ role_key: row.role_key, base_version: 1, overlay_version: null }));
}

describe('role-registry-resolver: equivalence proof (E1b)', () => {
  it('TS-1: reconstructs an identical ceo/executives/crews/budget_distribution shape for all 28 roles', () => {
    const baseRows = templateToBaseRows(STANDARD_VENTURE_TEMPLATE);
    expect(baseRows).toHaveLength(1 + STANDARD_VENTURE_TEMPLATE.executives.length + STANDARD_VENTURE_TEMPLATE.crews.length);
    expect(baseRows).toHaveLength(28);

    const pins = buildPinsForAllRoles(baseRows);
    const resolved = resolveVentureRoles(baseRows, [], pins, FIXTURE_VENTURE_ID, STANDARD_VENTURE_TEMPLATE.budget_distribution);

    // CEO: exact key set and exact values.
    expect(Object.keys(resolved.ceo).sort()).toEqual(Object.keys(STANDARD_VENTURE_TEMPLATE.ceo).sort());
    expect(resolved.ceo).toEqual(STANDARD_VENTURE_TEMPLATE.ceo);

    // Executives: same count, same role_keys, same per-role key sets and values.
    expect(resolved.executives).toHaveLength(STANDARD_VENTURE_TEMPLATE.executives.length);
    for (const sourceExec of STANDARD_VENTURE_TEMPLATE.executives) {
      const match = resolved.executives.find((e) => e.agent_role === sourceExec.agent_role);
      expect(match, `executive ${sourceExec.agent_role} missing from resolved output`).toBeDefined();
      expect(Object.keys(match).sort()).toEqual(Object.keys(sourceExec).sort());
      expect(match).toEqual(sourceExec);
    }

    // Crews: same count, same role_keys, same per-role key sets and values.
    expect(resolved.crews).toHaveLength(STANDARD_VENTURE_TEMPLATE.crews.length);
    for (const sourceCrew of STANDARD_VENTURE_TEMPLATE.crews) {
      const match = resolved.crews.find((c) => c.agent_role === sourceCrew.agent_role);
      expect(match, `crew ${sourceCrew.agent_role} missing from resolved output`).toBeDefined();
      expect(Object.keys(match).sort()).toEqual(Object.keys(sourceCrew).sort());
      expect(match).toEqual(sourceCrew);
    }

    expect(resolved.budget_distribution).toEqual(STANDARD_VENTURE_TEMPLATE.budget_distribution);
  });

  it('TS-1 negative control: a deliberately-dropped field is caught, proving the comparison is not a false-green shallow check', () => {
    const baseRows = templateToBaseRows(STANDARD_VENTURE_TEMPLATE);
    // Seed a defect: drop stage_ownership from one VP's structure layer, simulating a lossy
    // migration.
    const vpRow = baseRows.find((r) => r.role_key === 'VP_STRATEGY');
    expect(vpRow, 'fixture assumption: VP_STRATEGY exists in the template').toBeDefined();
    delete vpRow.structure.stage_ownership;

    const pins = buildPinsForAllRoles(baseRows);
    const resolved = resolveVentureRoles(baseRows, [], pins, FIXTURE_VENTURE_ID, STANDARD_VENTURE_TEMPLATE.budget_distribution);

    const sourceVp = STANDARD_VENTURE_TEMPLATE.executives.find((e) => e.agent_role === 'VP_STRATEGY');
    const resolvedVp = resolved.executives.find((e) => e.agent_role === 'VP_STRATEGY');

    // The seeded defect must be OBSERVABLE: the resolved key set genuinely differs from source.
    expect(Object.keys(resolvedVp).sort()).not.toEqual(Object.keys(sourceVp).sort());
    expect(resolvedVp).not.toEqual(sourceVp);
  });

  it('TS-6-equivalent (resolver level): norms fields never appear in an overlay-derived key -- overlay merge only ever contributes structure/function keys', () => {
    const baseRows = templateToBaseRows(STANDARD_VENTURE_TEMPLATE);
    const NORMS_KEYS = new Set(['token_budget', 'delegation_authority']);
    // Every base row's norms bucket, if present, must be disjoint from ROLE_FIELD_KEYS routed to
    // structure/function -- i.e. the split is a true partition, no field double-counted.
    for (const row of baseRows) {
      const structureKeys = Object.keys(row.structure);
      const functionKeys = Object.keys(row.function);
      const normsKeys = Object.keys(row.norms);
      for (const k of normsKeys) expect(NORMS_KEYS.has(k), `${k} unexpectedly routed to norms`).toBe(true);
      const overlap = structureKeys.filter((k) => functionKeys.includes(k) || normsKeys.includes(k));
      expect(overlap, `role ${row.role_key} has a field double-counted across layers`).toEqual([]);
    }
  });

  it('ROLE_FIELD_KEYS covers every key STANDARD_VENTURE_TEMPLATE actually uses across ceo/executives/crews (fails loud if the template gains a new field this resolver does not know about)', () => {
    const allEntries = [STANDARD_VENTURE_TEMPLATE.ceo, ...STANDARD_VENTURE_TEMPLATE.executives, ...STANDARD_VENTURE_TEMPLATE.crews];
    const seenKeys = new Set();
    for (const entry of allEntries) for (const k of Object.keys(entry)) seenKeys.add(k);
    for (const k of seenKeys) {
      expect(ROLE_FIELD_KEYS, `template field "${k}" is not in ROLE_FIELD_KEYS -- splitRoleLayers would silently drop it`).toContain(k);
    }
  });

  // VALIDATION sub-agent finding (VERIFY phase): the first version of this suite passed
  // overlayRows=[] / overlay_version: null for every pin, so mergeRoleLayers' overlay branch
  // (the entire venture-writes-only-its-overlay mechanism FR-2/FR-3 exist to prove) was never
  // actually executed by any test.
  it('a venture WITH an overlay: overlay structure/function fields override the base, base fields absent from the overlay pass through unchanged', () => {
    const baseRows = templateToBaseRows(STANDARD_VENTURE_TEMPLATE);
    const baseVp = STANDARD_VENTURE_TEMPLATE.executives.find((e) => e.agent_role === 'VP_STRATEGY');

    const overlayRows = [{
      role_key: 'VP_STRATEGY',
      venture_id: FIXTURE_VENTURE_ID,
      version: 1,
      status: 'active',
      // Overlay only touches capabilities (a FUNCTION-layer field) -- everything else on the
      // role must still come from the base row.
      structure: null,
      function: { capabilities: ['venture_overlay_added_capability'] },
    }];

    const pins = baseRows.map((row) => ({
      role_key: row.role_key,
      base_version: 1,
      overlay_version: row.role_key === 'VP_STRATEGY' ? 1 : null,
    }));

    const resolved = resolveVentureRoles(baseRows, overlayRows, pins, FIXTURE_VENTURE_ID, STANDARD_VENTURE_TEMPLATE.budget_distribution);
    const resolvedVp = resolved.executives.find((e) => e.agent_role === 'VP_STRATEGY');

    // Overlay field wins.
    expect(resolvedVp.capabilities).toEqual(['venture_overlay_added_capability']);
    expect(resolvedVp.capabilities).not.toEqual(baseVp.capabilities);

    // Every OTHER field is untouched -- still exactly the base value.
    for (const key of Object.keys(baseVp)) {
      if (key === 'capabilities') continue;
      expect(resolvedVp[key], `overlay must not affect untouched field "${key}"`).toEqual(baseVp[key]);
    }

    // A DIFFERENT role with no overlay for this venture is completely unaffected.
    const resolvedCeo = resolved.ceo;
    expect(resolvedCeo).toEqual(STANDARD_VENTURE_TEMPLATE.ceo);
  });

  it('an overlay can never carry a norms field -- mergeRoleLayers only ever reads overlay.structure/overlay.function, never overlay.norms', () => {
    // Structural proof at the JS level (the schema-level proof is TS-6 in the migration-shape
    // suite): even if a caller mistakenly attached a `norms` key to an overlay row object, the
    // resolver must not consume it.
    const baseRows = templateToBaseRows(STANDARD_VENTURE_TEMPLATE);
    const overlayRows = [{
      role_key: 'venture_ceo',
      venture_id: FIXTURE_VENTURE_ID,
      version: 1,
      status: 'active',
      structure: null,
      function: null,
      norms: { delegation_authority: { can_advance_stage: false } }, // must be ignored
    }];
    const pins = baseRows.map((row) => ({
      role_key: row.role_key,
      base_version: 1,
      overlay_version: row.role_key === 'venture_ceo' ? 1 : null,
    }));

    const resolved = resolveVentureRoles(baseRows, overlayRows, pins, FIXTURE_VENTURE_ID, STANDARD_VENTURE_TEMPLATE.budget_distribution);
    expect(resolved.ceo.delegation_authority).toEqual(STANDARD_VENTURE_TEMPLATE.ceo.delegation_authority);
  });
});
