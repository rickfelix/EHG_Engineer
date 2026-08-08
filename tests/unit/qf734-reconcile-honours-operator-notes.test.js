// QF-20260808-734: --verification-notes was SILENTLY DROPPED on the already-merged reconcile path.
//
// buildMergedReconcileUpdate built verification_notes from [qf.verification_notes, <machine note>]
// and never read options.verificationNotes. The flag is parsed and advertised in --help, so it
// accepted the text, the command exited SUCCESS, `status` read `completed`, and the attestation
// landed nowhere. Found only by reading the row back and COMPARING LENGTHS — a status check cannot
// see a field that was never written.
//
// THIS IS THE THIRD INSTANCE OF THE SAME DROP CLASS IN THIS ONE FUNCTION: QF-20260727-731 fixed a
// dropped --runtime-observation here, and its own comment reads "Silence was the defect; a loud
// failure is the fix." An option a caller passes must either be HONOURED or REFUSED LOUDLY —
// never accepted and discarded.
//
// Honour was chosen over the loud-refusal used for --uat-verified because the flags differ in
// kind: --uat-verified would assert a UAT that genuinely did not re-run (a false claim), while
// operator notes are a human attestation that matters MORE on this path — the row closes on a
// merge rather than a test run, so the prose is often the only thing explaining the close.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const { buildMergedReconcileUpdate } = require_(
  path.join(process.cwd(), 'scripts/modules/complete-quick-fix/orchestrator.js')
);

const base = { qf: { verification_notes: 'PRIOR' }, prUrl: 'https://x/pr/1', mergeSha: 'abc123', nowIso: '2026-08-08T12:00:00Z' };

describe('QF-734 reconcile path honours --verification-notes', () => {
  it('includes operator notes on the SCOPE-ACCEPTED (completed) branch', () => {
    const out = buildMergedReconcileUpdate({
      ...base, scopeAcceptedBy: 'Bravo — because X', options: { verificationNotes: 'MY ATTESTATION' },
    });
    expect(out.status).toBe('completed');
    expect(out.verification_notes).toContain('MY ATTESTATION');
    expect(out.verification_notes).toContain('OPERATOR NOTES:');
    expect(out.verification_notes).toContain('PRIOR');        // prior content preserved
    expect(out.verification_notes).toContain('SCOPE ACCEPTED'); // machine note still present
  });

  it('includes operator notes on the WITNESS-ONLY (in_progress) branch too', () => {
    // Both branches dropped it; fixing only the one you happened to exercise is how a
    // half-fixed drop survives.
    const out = buildMergedReconcileUpdate({
      ...base, scopeAcceptedBy: null, options: { verificationNotes: 'MY ATTESTATION' },
    });
    expect(out.status).toBe('in_progress');
    expect(out.verification_notes).toContain('MY ATTESTATION');
    expect(out.verification_notes).toContain('SCOPE ACCEPTANCE OUTSTANDING');
  });

  // --- two-sided: the label must not appear when there is nothing to label ---
  it('adds NO operator section when the flag was not passed', () => {
    const out = buildMergedReconcileUpdate({ ...base, scopeAcceptedBy: 'Bravo — why', options: {} });
    expect(out.verification_notes).not.toContain('OPERATOR NOTES:');
    expect(out.verification_notes).toContain('PRIOR');
  });

  it('treats whitespace-only notes as absent rather than emitting an empty label', () => {
    const out = buildMergedReconcileUpdate({
      ...base, scopeAcceptedBy: 'Bravo — why', options: { verificationNotes: '   \n  ' },
    });
    expect(out.verification_notes).not.toContain('OPERATOR NOTES:');
  });

  it('does not throw when options is omitted entirely', () => {
    const out = buildMergedReconcileUpdate({ ...base, scopeAcceptedBy: 'Bravo — why' });
    expect(out.status).toBe('completed');
    expect(out.verification_notes).not.toContain('OPERATOR NOTES:');
  });
});
