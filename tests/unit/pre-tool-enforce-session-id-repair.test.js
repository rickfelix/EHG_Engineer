/**
 * SD-LEO-INFRA-PERMISSION-FREEZE-STUCK-001 FR-1: the ENFORCEMENT 10 source-side telemetry
 * writer read process.env.CLAUDE_SESSION_ID directly, which QF-20260504-932 already
 * documented as unpropagated to PreToolUse subprocesses -- so the current_tool stamp this
 * block writes (needed to observe permission-pending state) never fired in production.
 *
 * Test shape: STATIC source-pins, matching tests/unit/pre-tool-enforce-column-scope.test.js.
 * The hook runs main() at load and self-enforces repeat-blockers on identical commands, so
 * subprocess exit-code assertions flake across runs -- these pins guard the fix's shape.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const hookSrc = fs.readFileSync(path.resolve('scripts/hooks/pre-tool-enforce.cjs'), 'utf8');
// NOTE: two blocks in this file are independently labeled "ENFORCEMENT 10" (a pre-existing
// numbering collision, out of scope for this SD) -- disambiguate with the full label.
const ENFORCEMENT_10_LABEL = 'ENFORCEMENT 10: Source-Side Telemetry Writer';

describe('SD-LEO-INFRA-PERMISSION-FREEZE-STUCK-001 FR-1: session-id repair (source pins)', () => {
  it('ENFORCEMENT 10 no longer reads process.env.CLAUDE_SESSION_ID directly', () => {
    const enforcement10 = hookSrc.slice(hookSrc.indexOf(ENFORCEMENT_10_LABEL));
    expect(enforcement10).not.toMatch(/const _sessId = process\.env\.CLAUDE_SESSION_ID/);
  });

  it('ENFORCEMENT 10 derives _sessId from the module-level _SESSION_ID with the unknown-fallback guard', () => {
    const enforcement10 = hookSrc.slice(hookSrc.indexOf(ENFORCEMENT_10_LABEL));
    // Must guard against the truthy 'unknown' fallback, matching the precedent at line ~1210 --
    // a bare `if (_sessId)` after a naive swap would PATCH session_id=eq.unknown on every
    // failed derivation.
    expect(enforcement10).toMatch(/_SESSION_ID\s*&&\s*_SESSION_ID\s*!==\s*'unknown'/);
    expect(enforcement10).toMatch(/const _sessId = \(_SESSION_ID && _SESSION_ID !== 'unknown'\) \? _SESSION_ID : '';/);
  });

  it('current_tool / current_tool_args_hash writes are unchanged (fix is scoped to session-id resolution only)', () => {
    const enforcement10 = hookSrc.slice(hookSrc.indexOf(ENFORCEMENT_10_LABEL), hookSrc.indexOf(ENFORCEMENT_10_LABEL) + 4000);
    expect(enforcement10).toMatch(/if \(TOOL_NAME\) patch\.current_tool = TOOL_NAME;/);
    expect(enforcement10).toMatch(/patch\.current_tool_args_hash = argsHash;/);
  });

  it('module-level _SESSION_ID derivation (the correct precedent) is unchanged', () => {
    expect(hookSrc).toMatch(/const _SESSION_ID = _stdinPayload\.session_id \|\|/);
    expect(hookSrc).toMatch(/process\.env\.CLAUDE_SESSION_ID \|\|/);
  });
});
