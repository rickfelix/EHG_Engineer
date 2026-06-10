/**
 * Unit tests for ENF-15 operative force-push detection (QF-20260610-541, feedback 00934869).
 *
 * Pins both directions of the documentary-content fix:
 *  - a `git push --force` line INSIDE a commit-message body (-m/-F) or a heredoc body is
 *    documentary => no match (the live false-positive: hook blocked a commit whose MESSAGE
 *    documented a force-push, reason=bare_force_disallowed);
 *  - a real operative push (bare, post-&&, on its own line of a multi-line block, or in a
 *    heredoc body fed to a shell) still matches (QF-20260525-345 verified that simply
 *    dropping newline from the boundary class false-negatives the multi-line case).
 */
import { describe, it, expect } from 'vitest';
import pkg from '../../scripts/hooks/lib/force-push-operative.cjs';
const { FORCE_PUSH_RE, stripDocumentaryContent, isOperativeForcePush } = pkg;

describe('documentary mentions => no match', () => {
  it('commit -m body line documenting a force-push (the live ENF-15 false positive)', () => {
    const cmd = 'git commit -m "docs: recovery notes\n\ngit push --force origin main is forbidden; use --force-with-lease"';
    expect(isOperativeForcePush(cmd)).toBe(false);
  });

  it('heredoc body documenting a force-push (git commit -F - <<EOF)', () => {
    const cmd = "git commit -F - <<'EOF'\nchore: update hook docs\n\nNote: the hook even blocked\ngit push --force in a body line.\nEOF";
    expect(isOperativeForcePush(cmd)).toBe(false);
  });

  it('single-line -m mention (QF-20260525-345 regression pin)', () => {
    expect(isOperativeForcePush('git commit -m "see git push --force docs"')).toBe(false);
  });

  it('multi-line gh pr --body mention', () => {
    const cmd = 'gh pr create --title "fix" --body "Steps:\ngit push --force was previously required"';
    expect(isOperativeForcePush(cmd)).toBe(false);
  });

  it('single-quoted multi-line -m body', () => {
    expect(isOperativeForcePush("git commit -m 'note\ngit push --force is documented here'")).toBe(false);
  });

  it('escaped quotes inside a double-quoted -m body', () => {
    expect(isOperativeForcePush('git commit -m "say \\"hi\\"\ngit push --force note"')).toBe(false);
  });

  it('non-string / empty input', () => {
    expect(isOperativeForcePush('')).toBe(false);
    expect(isOperativeForcePush(undefined)).toBe(false);
    expect(isOperativeForcePush(null)).toBe(false);
  });
});

describe('operative pushes => match', () => {
  it('bare force push', () => {
    expect(isOperativeForcePush('git push --force origin feat/SD-X')).toBe(true);
  });

  it('post-&& force push', () => {
    expect(isOperativeForcePush('cd repo && git push --force-with-lease origin feat/SD-X')).toBe(true);
  });

  it('own line of a multi-line block (QF-345 false-negative pin: newline boundary must stay)', () => {
    expect(isOperativeForcePush('git fetch origin\ngit push --force-with-lease origin feat/SD-X')).toBe(true);
  });

  it('operative push AFTER a heredoc terminator still matches', () => {
    const cmd = "git commit -F - <<'EOF'\nmsg body\nEOF\ngit push --force origin feat/SD-X";
    expect(isOperativeForcePush(cmd)).toBe(true);
  });

  it('heredoc body fed to a shell IS executed => still matches (bash <<EOF)', () => {
    expect(isOperativeForcePush("bash <<'EOF'\ngit push --force origin main\nEOF")).toBe(true);
  });

  it('documentary -m on the SAME command as an operative push still matches', () => {
    expect(isOperativeForcePush('git commit -m "x" && git push --force origin feat/SD-X')).toBe(true);
  });
});

describe('exported pieces', () => {
  it('FORCE_PUSH_RE is the verbatim ENF-15 boundary-class regex (newline kept)', () => {
    expect(FORCE_PUSH_RE.source).toBe('(?:^|[;&|(\\n]|&&|\\|\\|)\\s*git\\s+push\\b[^\\n]*--force\\b');
  });

  it('stripDocumentaryContent removes the -m payload but keeps the command skeleton', () => {
    const out = stripDocumentaryContent('git commit -m "a\nb" && git status');
    expect(out).toContain('git commit -m ""');
    expect(out).toContain('git status');
  });
});
