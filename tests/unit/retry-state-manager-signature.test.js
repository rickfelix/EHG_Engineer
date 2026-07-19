/**
 * SD-FDBK-ENH-PRE-TOOL-ENFORCE-001 — signatureFor() content discrimination.
 *
 * The RCA tiered-enforcement edit-throttle previously keyed Edit/Write/MultiEdit
 * signatures on the FILE PATH ALONE, so 3 distinct edits to one file (a legit
 * multi-part change) collided into one signature and false-tripped the 3-strikes
 * block. signatureFor now mixes an edit-content digest: distinct edits → distinct
 * signatures (no false retry), identical re-attempts → same signature (true retry
 * still caught). Bash signatures are unchanged.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { signatureFor } = require('../../scripts/hooks/retry-state-manager.cjs');

describe('signatureFor content discrimination (SD-FDBK-ENH-PRE-TOOL-ENFORCE-001)', () => {
  it('Edit: distinct content to the SAME file → distinct signatures (no false retry)', () => {
    const a = signatureFor('Edit', { file_path: 'a.js', old_string: 'X', new_string: 'Y' });
    const b = signatureFor('Edit', { file_path: 'a.js', old_string: 'P', new_string: 'Q' });
    expect(a).not.toBe(b);
    expect(a).toMatch(/^Edit:a\.js:[0-9a-f]{12}$/);
  });

  it('Edit: IDENTICAL content to the same file → identical signature (true retry preserved)', () => {
    const a = signatureFor('Edit', { file_path: 'a.js', old_string: 'X', new_string: 'Y' });
    const b = signatureFor('Edit', { file_path: 'a.js', old_string: 'X', new_string: 'Y' });
    expect(a).toBe(b);
  });

  it('Edit: same old_string but different new_string → distinct signatures', () => {
    const a = signatureFor('Edit', { file_path: 'a.js', old_string: 'X', new_string: 'Y' });
    const b = signatureFor('Edit', { file_path: 'a.js', old_string: 'X', new_string: 'Z' });
    expect(a).not.toBe(b);
  });

  it('Write: distinct content → distinct signatures', () => {
    const a = signatureFor('Write', { file_path: 'a.js', content: 'one' });
    const b = signatureFor('Write', { file_path: 'a.js', content: 'two' });
    expect(a).not.toBe(b);
  });

  it('MultiEdit: distinct edits → distinct signatures', () => {
    const a = signatureFor('MultiEdit', { file_path: 'a.js', edits: [{ old_string: 'X', new_string: 'Y' }] });
    const b = signatureFor('MultiEdit', { file_path: 'a.js', edits: [{ old_string: 'P', new_string: 'Q' }] });
    expect(a).not.toBe(b);
  });

  it('Bash: signature format unchanged (no content-digest regression)', () => {
    expect(signatureFor('Bash', { command: 'ls -la' })).toMatch(/^Bash:[0-9a-f]{16}$/);
  });

  it('Edit: missing file_path → null (unchanged guard)', () => {
    expect(signatureFor('Edit', {})).toBeNull();
  });

  it('SD-LEO-INFRA-RCA-TIERED-SIGNATURE-FALSE-POSITIVE-001: Bash — stdout_sha alone (no exit_code/stderr_sha) still triggers outcome admixture', () => {
    const baseline = signatureFor('Bash', { command: 'x' });
    const withStdoutSha = signatureFor('Bash', { command: 'x' }, { stdout_sha: 'abc123' });
    expect(withStdoutSha).not.toBe(baseline);
    expect(withStdoutSha).toMatch(/^Bash:[0-9a-f]{16}:[0-9a-f]{8}$/);
  });

  it('SD-LEO-INFRA-RCA-TIERED-SIGNATURE-FALSE-POSITIVE-001: Bash — same exit_code+stderr_sha but different stdout_sha → distinct signatures', () => {
    const a = signatureFor('Bash', { command: 'x' }, { exit_code: 0, stderr_sha: '', stdout_sha: 'aaa' });
    const b = signatureFor('Bash', { command: 'x' }, { exit_code: 0, stderr_sha: '', stdout_sha: 'bbb' });
    expect(a).not.toBe(b);
  });

  it('SD-LEO-INFRA-RCA-TIERED-SIGNATURE-FALSE-POSITIVE-001: Bash — identical {exit_code, stderr_sha, stdout_sha} → identical signature (stuck-loop detection preserved)', () => {
    const outcome = { exit_code: 0, stderr_sha: '', stdout_sha: 'same' };
    const a = signatureFor('Bash', { command: 'x' }, outcome);
    const b = signatureFor('Bash', { command: 'x' }, outcome);
    expect(a).toBe(b);
  });
});
