import { describe, it, expect } from 'vitest';
import { parseFlags } from '../../../lib/eva/lifecycle/cli-flag-parser.js';

describe('parseFlags (SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-7)', () => {
  it('parses known flags with their values', () => {
    const { values, error } = parseFlags(['node', 's', '--a', '1', '--b', '2'], ['--a', '--b']);
    expect(error).toBeNull();
    expect(values).toEqual({ '--a': '1', '--b': '2' });
  });

  it('rejects a flag value that starts with "--" (the args[i+1] bug class)', () => {
    const { error } = parseFlags(['node', 's', '--citation', '--actor', 'Rick'], ['--citation', '--actor']);
    expect(error).toMatch(/requires a value/);
  });

  it('rejects a flag with no following token at all', () => {
    const { error } = parseFlags(['node', 's', '--citation'], ['--citation']);
    expect(error).toMatch(/end of arguments/);
  });

  it('ignores unknown tokens rather than misparsing them as values', () => {
    const { values, error } = parseFlags(['node', 's', '--unknown', 'x', '--a', '1'], ['--a']);
    expect(error).toBeNull();
    expect(values).toEqual({ '--a': '1' });
  });

  it('a value containing a literal single dash is fine (only "--" prefix is rejected)', () => {
    const { values, error } = parseFlags(['node', 's', '--a', '-5'], ['--a']);
    expect(error).toBeNull();
    expect(values['--a']).toBe('-5');
  });
});
