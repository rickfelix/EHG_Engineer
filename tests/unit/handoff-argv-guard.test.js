// QF-20260807-289 — fail-closed argv on handoff.js.
//
// Two things are under test, and the second matters more than the first.
//   1. The guard rejects unknown flags and accepts real ones.
//   2. The whitelist STAYS complete. A fail-closed guard on the canonical mutating script
//      fails in two directions, and they are not symmetric: missing a rejection lets one
//      bad invocation through, while a WRONGLY rejected flag hard-breaks that invocation
//      for every seat in the fleet. A hand-maintained list rots, so the drift test below
//      reads the parsers and fails the moment a parse site outruns the registry.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  KNOWN_HANDOFF_FLAGS,
  NEAR_MISS,
  findUnknownFlags,
  formatUnknownFlagError,
} from '../../lib/handoff-argv-guard.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('findUnknownFlags', () => {
  it('flags the invocation that caused this QF', () => {
    expect(findUnknownFlags(['execute', 'PLAN-TO-EXEC', 'SD-X-001', '--precheck'])).toEqual(['--precheck']);
  });

  it('accepts a documented bypass with its reason', () => {
    const args = ['execute', 'PLAN-TO-EXEC', 'SD-X-001', '--bypass-validation', '--bypass-reason', 'TICKET-1'];
    expect(findUnknownFlags(args)).toEqual([]);
  });

  it('accepts every registered flag, so the registry can never reject itself', () => {
    expect(findUnknownFlags([...KNOWN_HANDOFF_FLAGS])).toEqual([]);
  });

  it('never mistakes a flag VALUE for a flag', () => {
    // --bypass-reason is positional; its value must not be re-scanned as an option.
    expect(findUnknownFlags(['execute', 'X', 'SD-1', '--bypass-reason', 'not-a-flag'])).toEqual([]);
    expect(findUnknownFlags(['execute', 'LEAD-TO-PLAN', 'SD-ABC-001'])).toEqual([]);
  });

  it('stops scanning at a bare -- terminator', () => {
    expect(findUnknownFlags(['execute', '--', '--whatever'])).toEqual([]);
  });

  it('matches the name half of --flag=value', () => {
    expect(findUnknownFlags(['--bypass-reason=TICKET-1'])).toEqual([]);
    expect(findUnknownFlags(['--nonsense=1'])).toEqual(['--nonsense']);
  });

  it('reports each unknown flag once, in order', () => {
    expect(findUnknownFlags(['--zed', '--alpha', '--zed'])).toEqual(['--zed', '--alpha']);
  });

  it('ignores single-dash tokens rather than guessing at them', () => {
    expect(findUnknownFlags(['-v'])).toEqual([]);
  });
});

describe('formatUnknownFlagError', () => {
  it('states that nothing ran — the operator believed they were safe', () => {
    expect(formatUnknownFlagError(['--precheck'])).toContain('NOTHING WAS EXECUTED');
  });

  it('names the two real dry-run paths when --precheck is the near miss', () => {
    const msg = formatUnknownFlagError(['--precheck']);
    expect(msg).toContain('precheck TYPE SD-ID');
    expect(msg).toContain('--dry-run');
  });

  it('lists the documented flags so the operator can self-correct', () => {
    expect(formatUnknownFlagError(['--nope'])).toContain('--bypass-validation');
  });

  it('every near-miss key is itself unknown, or the suggestion would be unreachable', () => {
    for (const key of NEAR_MISS.keys()) {
      expect(KNOWN_HANDOFF_FLAGS.has(key), `${key} is registered AND in NEAR_MISS`).toBe(false);
    }
  });
});

// The registry must cover every flag the handoff path actually parses. Comments are
// stripped first: cli-main.js discusses "--vision-key/--arch-key" in prose, and matching
// prose would let a test pass on a flag no code reads (and, worse, hide a real parse site
// behind a false positive).
const PARSER_FILES = [
  'scripts/modules/handoff/cli/cli-main.js',
  'scripts/modules/handoff/cli/leo5-commands.js',
  'scripts/modules/handoff/auto-proceed-resolver.js',
  'lib/cross-sd-overlap.js',
];

const PARSE_SITE = /(?:args|argv)\.(?:includes|indexOf|lastIndexOf)\(\s*'(--[a-z0-9-]+)'|===\s*'(--[a-z0-9-]+)'|getFlag\(\s*'(--[a-z0-9-]+)'/g;

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('registry drift', () => {
  it('registers every flag parsed on the handoff.js path', () => {
    const missing = [];
    for (const rel of PARSER_FILES) {
      const src = stripComments(readFileSync(resolve(REPO, rel), 'utf8'));
      for (const m of src.matchAll(PARSE_SITE)) {
        const flag = m[1] || m[2] || m[3];
        if (flag && !KNOWN_HANDOFF_FLAGS.has(flag)) missing.push(`${rel}: ${flag}`);
      }
    }
    expect(missing, `unregistered flags would be REJECTED at runtime:\n${missing.join('\n')}`).toEqual([]);
  });

  it('actually finds parse sites — a regex that matches nothing would pass vacuously', () => {
    // Without this the drift test is a green light wired to no bulb.
    const src = stripComments(readFileSync(resolve(REPO, 'scripts/modules/handoff/cli/cli-main.js'), 'utf8'));
    expect([...src.matchAll(PARSE_SITE)].length).toBeGreaterThan(3);
  });
});

// End-to-end at the consumer: the guard has to fire in the real binary, not just in a
// unit. Both cases exit before any DB work, so this touches nothing.
describe('handoff.js binary', () => {
  const run = (args) => {
    try {
      return { status: 0, out: execFileSync(process.execPath, ['scripts/handoff.js', ...args], { cwd: REPO, encoding: 'utf8', stdio: 'pipe' }) };
    } catch (e) {
      return { status: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
    }
  };

  it('refuses --precheck on execute, non-zero, without reaching a gate', () => {
    const { status, out } = run(['execute', 'PLAN-TO-EXEC', 'SD-DOES-NOT-EXIST-001', '--precheck']);
    expect(status).toBe(2);
    expect(out).toContain('Unknown flag');
    expect(out).toContain('NOTHING WAS EXECUTED');
  });

  it('still runs a legitimate invocation — the fleet-breaking direction', () => {
    const { status, out } = run(['help']);
    expect(status).toBe(0);
    expect(out).toContain('LEO Protocol Handoff System');
  });
});
