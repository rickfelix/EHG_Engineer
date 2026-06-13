/**
 * SD-FDBK-FIX-LFA-ACCEPT-ORDERING-001 — pins the post-#4674 re-ghosting fix.
 *
 * Shape (reproduced 4x 2026-06-12/13): LeadFinalApprovalExecutor reconciled the SD
 * to completed (is_working_on=false) BEFORE HandoffRecorder.createArtifact inserted
 * the canonical accepted LFA row; the enforce_is_working_on_for_handoffs trigger
 * then rejected the insert ("Cannot create handoff for SD without active session
 * claim") and every recorder-path LFA ghosted on first attempt.
 *
 * Fix under pin: the executor writes the canonical accepted row PRE-completion
 * (claim still live), fails EARLY (SD never flipped to completed on write failure),
 * and is idempotent so the recorder's later createArtifact call no-ops via the
 * #4674 existing-accepted-row check.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(
  resolve(__dirname, '../../scripts/modules/handoff/executors/lead-final-approval/index.js'),
  'utf8'
);

describe('LFA canonical write ordering (source-contract pin)', () => {
  it('the canonical sd_phase_handoffs insert precedes the status=completed reconcile', () => {
    const canonicalIdx = SRC.indexOf('canonical_pre_completion_write');
    const completedIdx = SRC.indexOf('progress_percentage: 100');
    expect(canonicalIdx).toBeGreaterThan(-1);
    expect(completedIdx).toBeGreaterThan(-1);
    expect(canonicalIdx).toBeLessThan(completedIdx);
  });

  it('fails EARLY: a rejected canonical write returns CANONICAL_LFA_WRITE_FAILED before completion', () => {
    expect(SRC).toContain('CANONICAL_LFA_WRITE_FAILED');
    // The rejection must occur before the completed update in source order.
    expect(SRC.indexOf('CANONICAL_LFA_WRITE_FAILED')).toBeLessThan(SRC.indexOf('progress_percentage: 100'));
  });

  it('is idempotent: an existing accepted LFA row short-circuits the insert', () => {
    const idx = SRC.indexOf('Canonical accepted LFA row already exists');
    expect(idx).toBeGreaterThan(-1);
    expect(idx).toBeLessThan(SRC.indexOf('progress_percentage: 100'));
  });

  it('coerces to_phase APPROVAL->LEAD (CHECK-safe) and uses the allowlisted system tag', () => {
    const block = SRC.slice(SRC.indexOf('canonical_pre_completion_write') - 3000, SRC.indexOf('canonical_pre_completion_write'));
    expect(block).toContain("to_phase: 'LEAD'");
    expect(block).toContain('HANDOFF_SYSTEM_TAG');
  });

  it('recorder idempotency partner (#4674) still present so the later createArtifact no-ops', () => {
    const recorder = readFileSync(
      resolve(__dirname, '../../scripts/modules/handoff/recording/HandoffRecorder.js'),
      'utf8'
    );
    expect(recorder).toContain('canonical row already accepted');
  });
});
