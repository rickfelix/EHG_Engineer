// QF-20260808-450: scripts/modules/orchestrator/subagent-execution.js was UNPARSEABLE on main.
//
// Commit 4263e776 (SD-LEO-INFRA-WRITER-SUB-AGENT-001/FR-2) correctly removed the
// `verdict: result.verdict || 'WARNING'` laundering, but the edit also deleted the success path's
// `return {` opener and its sub_agent_code/sub_agent_name fields — leaving `verdict:
// result.verdict,` dangling with no enclosing object. node --check failed; the module could not
// load at all.
//
// WHY NO TEST CAUGHT IT: nothing in tests/ imported this module. A module with zero importers is
// invisible to the whole suite — a green run says nothing about it. The FIRST test below is
// therefore the load itself: an ESM import fails outright on a syntax error, so this file failing
// to parse can never again be a silent green.
//
// (Separately reported, NOT fixed here: scripts/lint/no-unfenced-verdict-mutation-lint.mjs — which
// DOES cover this file — catches a parse failure, console.warn's "skipped (parse)", and returns []
// i.e. CLEAN. Its own comment says "a silent drop and a pass look identical downstream", then
// returns the pass. That is why CI stayed green on a broken file. Fixing it is a separate change
// with real blast radius — any legitimately unparseable file would start failing CI — so it is a
// reported finding, not scope smuggled into a hotfix.)
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REL = 'scripts/modules/orchestrator/subagent-execution.js';

describe('QF-450 subagent-execution module health', () => {
  it('LOADS — an ESM import throws on a syntax error, which is the whole point of this test', async () => {
    const mod = await import(`../../${REL}`);
    expect(typeof mod.executeSubAgent).toBe('function');
    // The other exports the orchestrator depends on; a partial module is also a broken module.
    expect(typeof mod.normalizeDetailedAnalysis).toBe('function');
    expect(typeof mod.storeSubAgentResult).toBe('function');
  });

  describe('success-path return shape', () => {
    // Comment-stripped: this file and the source both QUOTE the broken form in their prose, and a
    // scan that matches its own commentary is the self-satisfying-test trap.
    const executable = fs
      .readFileSync(path.join(process.cwd(), REL), 'utf8')
      .split('\n')
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      })
      .join('\n');

    it('restores the identity fields the error path also returns', () => {
      // Both branches must carry these, or a caller cannot tell which agent produced a result.
      expect(executable.match(/sub_agent_code:\s*code/g) || []).toHaveLength(2);
      expect(executable.match(/sub_agent_name:\s*name/g) || []).toHaveLength(2);
    });

    it('passes the verdict through UNMODIFIED — the FR-2 removal is NOT reinstated', () => {
      // The regression that matters most: this hotfix restores SYNTAX, it must not restore the
      // `|| 'WARNING'` laundering. WARNING sits in the evidence gate's ACCEPT set, so reinstating
      // it would silently promote a crashed sub-agent to a passing verdict.
      expect(executable).toContain('verdict: result.verdict,');
      expect(executable).not.toMatch(/verdict:\s*result\.verdict\s*\|\|/);
      expect(executable).not.toContain("|| 'WARNING'");
    });
  });
});
