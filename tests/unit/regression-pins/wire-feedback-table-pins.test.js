// SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 FR-3 — static-guard regression pins.
// Prevents 16th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 drift.
//
// These pins read source files as strings (no require/import-time module load)
// and assert that the wire-ins from FR-1 and FR-2 stay present. If a future
// edit removes them silently, this test fails fast at PR-level CI.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');

function read(rel) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

describe('SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 wire-in regression pins', () => {
  it('FR-1: complete-quick-fix orchestrator imports resolveFeedback from lib/governance/resolve-feedback', () => {
    const src = read('scripts/modules/complete-quick-fix/orchestrator.js');
    expect(src).toMatch(/import\s*{\s*[^}]*\bresolveFeedback\b[^}]*}\s*from\s*['"][^'"]*lib\/governance\/resolve-feedback(?:\.js)?['"]/);
  });

  it('FR-1: complete-quick-fix orchestrator calls resolveLinkedFeedbackRows after mergeToMain', () => {
    const src = read('scripts/modules/complete-quick-fix/orchestrator.js');
    // The wire-in must live AFTER mergeToMain so the merge commit is on origin/main
    // before we look up its message.
    const idxMerge = src.indexOf('await mergeToMain(');
    const idxResolve = src.indexOf('resolveLinkedFeedbackRows(');
    expect(idxMerge).toBeGreaterThan(-1);
    expect(idxResolve).toBeGreaterThan(idxMerge);
  });

  it('FR-1: lib/governance/resolve-feedback exports parseFeedbackFooters + resolveFeedback', () => {
    const src = read('lib/governance/resolve-feedback.js');
    expect(src).toMatch(/export\s+function\s+parseFeedbackFooters\b/);
    expect(src).toMatch(/export\s+async\s+function\s+resolveFeedback\b/);
  });

  it('FR-1: orchestrator FR-1 wire-in is gated on RESOLVE_FEEDBACK_ON_QF_COMPLETE !== "0"', () => {
    const src = read('scripts/modules/complete-quick-fix/orchestrator.js');
    expect(src).toMatch(/process\.env\.RESOLVE_FEEDBACK_ON_QF_COMPLETE\s*!==\s*['"]0['"]/);
  });

  it('FR-2: lib/governance/emit-feedback.js still references deferred_from_sd_key auto-fill', () => {
    const src = read('lib/governance/emit-feedback.js');
    expect(src).toMatch(/_autoFillDeferredFromSdKey\b/);
    expect(src).toMatch(/deferred_from_sd_key/);
  });

  it('FR-2: emit-feedback.js gates auto-fill on AUTO_FILL_DEFERRED_FROM_SD_KEY !== "0"', () => {
    const src = read('lib/governance/emit-feedback.js');
    expect(src).toMatch(/AUTO_FILL_DEFERRED_FROM_SD_KEY\s*===\s*['"]0['"]/);
  });

  it('FR-2: emit-feedback.js queries v_active_sessions filtered by session_id', () => {
    const src = read('lib/governance/emit-feedback.js');
    expect(src).toMatch(/from\(['"]v_active_sessions['"]\)/);
    expect(src).toMatch(/CLAUDE_SESSION_ID/);
  });
});
