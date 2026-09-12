/**
 * QF-20260912-632 — ENF-19 unquoted-heredoc-with-command-substitution guard.
 *
 * Reproduces the measured incident shape (an unquoted heredoc appending a role seat's
 * session-state record, whose body contained an apply-script command line) against the new
 * detector, plus the quoted-delimiter and $VAR-only false-positive coverage the fix-shape names.
 */
import { describe, it, expect } from 'vitest';
import { decideHeredocSubstitution, findHeredocs } from '../../../scripts/hooks/lib/heredoc-substitution-guard.cjs';

describe('findHeredocs', () => {
  it('extracts an unquoted heredoc tag, body, and terminator', () => {
    const cmd = ['cat >> file <<EOF', 'line one', 'line two', 'EOF'].join('\n');
    const [h] = findHeredocs(cmd);
    expect(h.tag).toBe('EOF');
    expect(h.quoted).toBe(false);
    expect(h.body).toBe('line one\nline two');
    expect(h.terminatorFound).toBe(true);
  });

  it("recognizes a single-quoted delimiter ('EOF') as quoted", () => {
    const cmd = ["cat >> file <<'EOF'", 'body', 'EOF'].join('\n');
    const [h] = findHeredocs(cmd);
    expect(h.quoted).toBe(true);
  });

  it('recognizes a double-quoted delimiter ("EOF") as quoted', () => {
    const cmd = ['cat >> file <<"EOF"', 'body', 'EOF'].join('\n');
    const [h] = findHeredocs(cmd);
    expect(h.quoted).toBe(true);
  });

  it('handles <<- with a tab-indented terminator', () => {
    const cmd = ['cat >> file <<-EOF', 'body', '\tEOF'].join('\n');
    const [h] = findHeredocs(cmd);
    expect(h.terminatorFound).toBe(true);
    expect(h.body).toBe('body');
  });
});

describe('decideHeredocSubstitution', () => {
  it('BLOCKS an unquoted heredoc whose body contains a backtick (measured incident shape)', () => {
    const cmd = [
      'cat >> .claude/adam-session-state-49eabb23.md <<EOF',
      'Ran `node scripts/apply-migration.js --issue-token` and got a token.',
      'EOF',
    ].join('\n');
    const d = decideHeredocSubstitution(cmd);
    expect(d.matched).toBe(true);
    expect(d.outcome).toBe('block');
    expect(d.reason).toBe('backtick');
    expect(d.quotedForm).toBe("<<'EOF'");
  });

  it('BLOCKS an unquoted heredoc whose body contains $( ) command substitution', () => {
    const cmd = ['cat >> file <<EOF', 'today is $(date)', 'EOF'].join('\n');
    const d = decideHeredocSubstitution(cmd);
    expect(d.matched).toBe(true);
    expect(d.outcome).toBe('block');
    expect(d.reason).toBe('cmd_sub');
  });

  it('BLOCKS when the body contains BOTH a backtick and $( )', () => {
    const cmd = ['cat >> file <<EOF', '`whoami` and $(date)', 'EOF'].join('\n');
    const d = decideHeredocSubstitution(cmd);
    expect(d.reason).toBe('backtick_and_cmd_sub');
  });

  it('ALLOWS the identical body when the delimiter is quoted (the standard fix)', () => {
    const cmd = [
      "cat >> file <<'EOF'",
      'Ran `node scripts/apply-migration.js --issue-token` and got a token.',
      'EOF',
    ].join('\n');
    expect(decideHeredocSubstitution(cmd)).toEqual({ matched: false });
  });

  it('ALLOWS an unquoted heredoc whose body only uses $VAR (never blocked -- ordinary expansion)', () => {
    const cmd = ['cat >> file <<EOF', 'session=$SESSION_ID role=${ROLE}', 'EOF'].join('\n');
    expect(decideHeredocSubstitution(cmd)).toEqual({ matched: false });
  });

  it('ALLOWS a plain command with no heredoc at all', () => {
    expect(decideHeredocSubstitution('git status')).toEqual({ matched: false });
  });

  it('ALLOWS printf -- never a heredoc, so never operative', () => {
    expect(decideHeredocSubstitution('printf "%s\\n" "line with a backtick \\`x\\`" >> file')).toEqual({ matched: false });
  });
});
