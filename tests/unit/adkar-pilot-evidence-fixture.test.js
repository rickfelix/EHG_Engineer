/**
 * SD-LEO-INFRA-ADKAR-CHANGE-ADOPTION-FRAMEWORK-001-C (FR-2)
 *
 * Proves the pilot's ADKAR evidence mapping (applied to
 * SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001's metadata by this SD, see FR-1)
 * satisfies the documented completion contract from the parent PRD's FR-2 — WITHOUT depending
 * on sibling Child B's actual gate implementation, which lands independently and did not exist
 * in this worktree at build time (Child B was still in LEAD phase, unclaimed code, when this
 * child was built — the two children are concurrency-safe by design, not sequenced).
 *
 * `evaluateAdkarChecklist` below is a small, self-contained validator implementing the EXACT
 * documented contract (parent PRD FR-2 / docs/protocol/adkar-change-adoption-framework.md once
 * Child A lands): no-op pass if !metadata.requires_adoption; else every one of the 5 stages
 * (awareness/desire/knowledge/ability/reinforcement) must be present with either
 * `evidenced:true`+`citation` or `waived:true`+`reason`. When sibling Child B's real gate
 * lands, it should implement this SAME contract — this test is the executable specification,
 * not a substitute for Child B's own gate + its own tests.
 */
import { describe, it, expect } from 'vitest';

const ADKAR_STAGES = ['awareness', 'desire', 'knowledge', 'ability', 'reinforcement'];

/** Mirrors the documented ADKAR completion-gate contract (parent PRD FR-2). Pure, no I/O. */
function evaluateAdkarChecklist(metadata) {
  if (!metadata || metadata.requires_adoption !== true) {
    return { passed: true, applicable: false, missingStages: [] };
  }
  const checklist = metadata.adkar_checklist || {};
  const missingStages = ADKAR_STAGES.filter((stage) => {
    const entry = checklist[stage];
    if (!entry) return true;
    const hasEvidence = entry.evidenced === true && typeof entry.citation === 'string' && entry.citation.length > 0;
    const hasWaiver = entry.waived === true && typeof entry.reason === 'string' && entry.reason.length > 0;
    return !hasEvidence && !hasWaiver;
  });
  return { passed: missingStages.length === 0, applicable: true, missingStages };
}

describe('evaluateAdkarChecklist — documented contract (parent PRD FR-2)', () => {
  it('is a no-op pass when requires_adoption is not set', () => {
    const result = evaluateAdkarChecklist({});
    expect(result).toEqual({ passed: true, applicable: false, missingStages: [] });
  });

  it('fails and names every missing stage when requires_adoption=true with no checklist', () => {
    const result = evaluateAdkarChecklist({ requires_adoption: true });
    expect(result.passed).toBe(false);
    expect(result.applicable).toBe(true);
    expect(result.missingStages.sort()).toEqual([...ADKAR_STAGES].sort());
  });

  it('fails naming only the incomplete stages', () => {
    const result = evaluateAdkarChecklist({
      requires_adoption: true,
      adkar_checklist: {
        awareness: { evidenced: true, citation: 'x' },
        desire: { waived: true, reason: 'n/a for this change' },
        // knowledge, ability, reinforcement missing
      },
    });
    expect(result.passed).toBe(false);
    expect(result.missingStages.sort()).toEqual(['ability', 'knowledge', 'reinforcement'].sort());
  });

  it('passes when every stage is evidenced or waived-with-reason', () => {
    const result = evaluateAdkarChecklist({
      requires_adoption: true,
      adkar_checklist: {
        awareness: { evidenced: true, citation: 'x' },
        desire: { waived: true, reason: 'n/a' },
        knowledge: { evidenced: true, citation: 'y' },
        ability: { evidenced: true, citation: 'z' },
        reinforcement: { evidenced: true, citation: 'w' },
      },
    });
    expect(result).toEqual({ passed: true, applicable: true, missingStages: [] });
  });
});

describe('the pilot mapping (SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001) satisfies the contract', () => {
  // Fixture, NOT a live query — exact shape applied to the pilot SD's metadata by this SD's
  // FR-1 (verified separately via a before/after DB diff, not by this test). Kept in sync by
  // hand; if the real applied shape ever drifts, TS-1/TS-2 (the DB-level acceptance criteria)
  // are the source of truth, not this fixture.
  const pilotFixtureMetadata = {
    requires_adoption: true,
    adkar_checklist: {
      awareness: { evidenced: true, citation: 'SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-B — role-contract + ADAM_LOOPS wiring surfaces the reconcile/stall-alert change to affected live sessions' },
      desire: { evidenced: true, citation: 'Pilot SD rationale (existing Why-style justification): key_risk field documents cross-session persistence motivation; adam_stall_alert documents the chairman-directed benefit' },
      knowledge: { evidenced: true, citation: 'SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-B — CLAUDE_ADAM.md durable-duty marker + RESPONSIBILITIES landing documents the how' },
      ability: { evidenced: true, citation: 'SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-A — hierarchical adam_task_ledger + CRUD + rehydration module makes the board actually usable/consumed' },
      reinforcement: { evidenced: true, citation: 'SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-C — probePmBoard self-adherence probe FAILs on regression-to-non-use (board stale / threads not progressing)' },
    },
  };

  it('evaluates as fully passing', () => {
    const result = evaluateAdkarChecklist(pilotFixtureMetadata);
    expect(result).toEqual({ passed: true, applicable: true, missingStages: [] });
  });

  it('each stage cites a real pilot child sd_key or the pilot SD itself', () => {
    for (const stage of ADKAR_STAGES) {
      const entry = pilotFixtureMetadata.adkar_checklist[stage];
      expect(entry.citation).toMatch(/SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001|Pilot SD rationale/);
    }
  });
});
