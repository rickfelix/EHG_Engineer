/**
 * The evidence gate must PUBLISH the writer contract, not point at work it cannot see.
 * QF-20260807-283.
 *
 * THE DEFECT. Every remediation said "invoke the missing sub-agent(s) via Task tool". A Task-tool
 * sub-agent does NOT write sub_agent_execution_results by itself, so a worker who obeys that hint
 * produces nothing the gate can read, re-runs, and is blocked identically — the hint costs a round
 * trip rather than saving one. Measured: one seat burned two failed handoffs and a blocked tick
 * rediscovering the real writers while precedent rows written the correct way already sat in the
 * table, and a second seat had independently used the same writer hours earlier.
 *
 * WHY IT IS A CONTRACT TEST AND NOT A WORDING TEST. Independent rediscoveries of one contract
 * measure its DISCOVERABILITY; the fix is to publish it at the moment of need. So what must hold
 * is that BOTH writers are named WITH their applicability — choosing the wrong one, not ignorance
 * that a writer exists, is the actual failure mode — and that the misleading Task-tool-only hint
 * is gone from the blocking paths.
 */

import { describe, it, expect } from 'vitest';
import {
  EVIDENCE_WRITER_CONTRACT,
  createSubagentEvidenceGate
} from '../../../scripts/modules/handoff/gates/subagent-evidence-gate.js';

describe('QF-20260807-283: the evidence gate publishes its writer contract', () => {
  it('names BOTH canonical writers, each with its applicability', () => {
    // Both halves required. A message naming only one writer sends every worker in the other
    // situation down the path that produces invisible work.
    expect(EVIDENCE_WRITER_CONTRACT).toMatch(/scripts\/execute-subagent\.js/);
    expect(EVIDENCE_WRITER_CONTRACT).toMatch(/REGISTERED/i);
    expect(EVIDENCE_WRITER_CONTRACT).toMatch(/storeSubAgentResults/);
    expect(EVIDENCE_WRITER_CONTRACT).toMatch(/results-storage\.js/);
  });

  it('states plainly that a Task-tool agent alone writes NO evidence row', () => {
    // The correction that actually saves the round trip: the old hint was not merely vague, it
    // was wrong about what produces a row.
    expect(EVIDENCE_WRITER_CONTRACT).toMatch(/Task-tool sub-agent alone does NOT write/i);
    expect(EVIDENCE_WRITER_CONTRACT).toMatch(/sub_agent_execution_results/);
  });

  it('carries the metadata shape that the repo-resolution gate actually reads', () => {
    // Folklore said to store top-level repo_path/local_path; following it produces evidence the
    // gate cannot read. Naming the real shape here is the difference between a worker writing a
    // row and writing a malformed one.
    expect(EVIDENCE_WRITER_CONTRACT).toMatch(/metadata\.repo_path/);
    expect(EVIDENCE_WRITER_CONTRACT).toMatch(/executed_from_cwd/);
  });

  it('the registered gate definition SURFACES the contract, not a Task-tool-only hint', () => {
    // The contract is worthless if the string a blocked worker actually sees does not contain it.
    const gate = createSubagentEvidenceGate({});
    expect(gate.remediation).toContain(EVIDENCE_WRITER_CONTRACT);
    expect(gate.remediation).not.toMatch(/Invoke the missing sub-agent\(s\) via Task tool/);
  });

  it('CONTROL: the emergency bypass is still documented and still called a bypass', () => {
    // Two-sided. Rewriting the remediation could easily have dropped the escape hatch, or worse,
    // promoted it from "emergency bypass" to an ordinary-looking option.
    const gate = createSubagentEvidenceGate({});
    expect(gate.remediation).toMatch(/LEO_DISABLE_SUBAGENT_EVIDENCE_GATE=1/);
    expect(gate.remediation).toMatch(/bypass/i);
  });
});
