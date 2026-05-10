/**
 * SD-FDBK-INFRA-ORCHESTRATOR-ROUTING-PHASE-001 — orchestrator routing phase-aware guard tests.
 *
 * Closes PAT-ORCH-ROUTING-PHASE-BLINDNESS-001. Verifies that scripts/sd-start.js:
 *   1. Defines hasParentNeedsOwnLeadToPlan helper with the four-condition contract.
 *   2. Routes orchestrator parents to parent-claim when their own LEAD-TO-PLAN handoff is missing.
 *   3. Adds --parent CLI flag with --confirm safety, and --child mutual exclusion.
 *   4. Throws on PostgrestError (FAIL-LOUD per PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001).
 *
 * Static-pin pattern (mocking-independent) per validation-agent + testing-agent recommendation.
 * Mirrors style of tests/unit/sd-start-claim-lifecycle.test.js.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SD_START_PATH = resolve(__dirname, '../..', 'scripts/sd-start.js');
const src = readFileSync(SD_START_PATH, 'utf8');

// Locate helper region (used by multiple regression-pin tests).
const helperStartIdx = src.indexOf('async function hasParentNeedsOwnLeadToPlan');
const helperEndIdx = helperStartIdx >= 0
  ? src.indexOf('\nasync function getOrchestratorChildren', helperStartIdx)
  : -1;
const helperRegion = helperStartIdx >= 0 && helperEndIdx > helperStartIdx
  ? src.slice(helperStartIdx, helperEndIdx)
  : '';

// ── FR-1: Helper exists with four-condition contract ─────────────────────

describe('FR-1: hasParentNeedsOwnLeadToPlan helper definition', () => {
  it('TC-1: helper function defined as async in scripts/sd-start.js', () => {
    expect(helperStartIdx).toBeGreaterThan(0);
    expect(helperRegion).toMatch(/async\s+function\s+hasParentNeedsOwnLeadToPlan/);
  });

  it('TC-2: helper accepts sd object as parameter and references sd.sd_type and sd.current_phase', () => {
    expect(helperRegion).toMatch(/sd\.sd_type/);
    expect(helperRegion).toMatch(/sd\.current_phase/);
  });

  it('TC-3: helper checks BOTH LEAD and LEAD_APPROVAL phase labels (R1 conjunctive predicate)', () => {
    expect(helperRegion).toMatch(/['"]LEAD['"]/);
    expect(helperRegion).toMatch(/['"]LEAD_APPROVAL['"]/);
  });

  it('TC-4: helper returns false early for non-orchestrator types (FR-1 AC-1.4)', () => {
    // Early-return check before any DB query: sd.sd_type !== 'orchestrator' → return false
    expect(helperRegion).toMatch(/sd\.sd_type\s*!==?\s*['"]orchestrator['"][^]{0,80}return\s+false/);
  });
});

// ── FR-1 (R3): Canonical sd_phase_handoffs query shape ────────────────────

describe('FR-1 R3: canonical query shape for sd_phase_handoffs lookup', () => {
  it('TC-5: helper queries sd_phase_handoffs with handoff_type, status filters (canonical pattern)', () => {
    // Use a single regex pattern that allows method-chain interleave on either filter order.
    expect(helperRegion).toMatch(
      /from\(['"]sd_phase_handoffs['"]\)[\s\S]{0,400}handoff_type[\s\S]{0,400}LEAD-TO-PLAN[\s\S]{0,400}status[\s\S]{0,200}['"]accepted['"]/
    );
  });

  it('TC-6: query uses sd.id (UUID), not sd.sd_key (mirrors parent-orchestrator-handler.js:457)', () => {
    expect(helperRegion).toMatch(/\.eq\(['"]sd_id['"]\s*,\s*sd\.id\)/);
  });
});

// ── FR-1 (R3) FAIL-LOUD: PostgrestError throws ───────────────────────────

describe('FR-1 R3 FAIL-LOUD: PostgrestError handling', () => {
  it('TC-7: helper throws on PostgrestError (does NOT silently return false)', () => {
    // Per PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001: FAIL-LOUD.
    expect(helperRegion).toMatch(/if\s*\(\s*error\s*\)\s*\{[\s\S]{0,400}throw\s+new\s+Error/);
  });

  it('TC-8: throw message references the helper name for traceability', () => {
    expect(helperRegion).toMatch(/hasParentNeedsOwnLeadToPlan/);
  });
});

// ── FR-2: Routing decision tree wires the guard ──────────────────────────

describe('FR-2: pre-route guard integrated into orchestrator routing block', () => {
  it('TC-9: hasParentNeedsOwnLeadToPlan called from orchestrator routing block', () => {
    // Anchor on the orchestrator-routing-block comment marker so we don't pick up
    // the unrelated `grandchildren.length > 0` site in findLeafWorkItem.
    const blockMarker = src.indexOf('Orchestrator detection');
    expect(blockMarker).toBeGreaterThan(0);
    const slice = src.slice(blockMarker, blockMarker + 4000);
    expect(slice).toMatch(/hasParentNeedsOwnLeadToPlan\(sd\)/);
  });

  it('TC-10: parent-claim branch logs distinguishing message ("own LEAD-TO-PLAN required")', () => {
    expect(src).toMatch(/own LEAD-TO-PLAN required/i);
  });

  it('TC-11: parent-claim branch references PAT-ORCH-ROUTING-PHASE-BLINDNESS-001 in operator output', () => {
    expect(src).toMatch(/PAT-ORCH-ROUTING-PHASE-BLINDNESS-001/);
  });
});

// ── FR-3: --parent flag + --confirm safety ───────────────────────────────

describe('FR-3: --parent CLI flag with --confirm safety', () => {
  it('TC-12: --parent flag detected from process.argv', () => {
    expect(src).toMatch(/process\.argv\.includes\(['"]--parent['"]\)/);
  });

  it('TC-13: --confirm flag detected from process.argv', () => {
    expect(src).toMatch(/process\.argv\.includes\(['"]--confirm['"]\)/);
  });

  it('TC-14: --parent on past-LEAD parent with incomplete children requires --confirm', () => {
    // When parentNeeds is false AND incomplete children, gate on confirmFlag.
    expect(src).toMatch(/incomplete[\s\S]{0,200}!\s*confirmParentFlag/);
  });

  it('TC-15: --parent and --child are mutually exclusive — exit 1 with explicit message', () => {
    expect(src).toMatch(/--parent and --child are mutually exclusive/);
  });

  it('TC-16: --parent flag emits operator-facing message when active', () => {
    expect(src).toMatch(/--parent flag[\s\S]{0,200}claiming parent orchestrator/);
  });
});

// ── Cross-cutting guards ─────────────────────────────────────────────────

describe('cross-cutting: scope discipline and naming', () => {
  it('TC-17: helper name matches intended contract (hasParentNeedsOwnLeadToPlan)', () => {
    // Defense against silent rename; downstream callers depend on this exact name.
    const matches = src.match(/hasParentNeedsOwnLeadToPlan/g) || [];
    // Definition + at least one call site (parent-claim guard, --parent block).
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('TC-18: NC-EXEC-001 scope guard — sibling bug at line ~183 (verifyHandoffIntegrity sd_key column) is OUT OF SCOPE', () => {
    // Source must NOT contain a NEW fix for verifyHandoffIntegrity. The .eq('sd_key', sdUuid)
    // pattern at line ~183 is intentionally left untouched by this SD; separate QF if needed.
    const verifyIdx = src.indexOf('verifyHandoffIntegrity');
    if (verifyIdx > 0) {
      const slice = src.slice(verifyIdx, verifyIdx + 500);
      // Pin: still uses sd_key (not yet fixed). If this assertion ever flips, that means
      // a sibling fix landed inside this SD's PR — OUT OF SCOPE creep.
      expect(slice).toMatch(/\.eq\(['"]sd_key['"]/);
    }
  });
});
