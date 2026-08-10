// QF-20260525-785 (RCA CAPA-3): log-harness-bug.js advisory prior-fix scan.
// findPossiblePriorFix does a best-effort, NON-BLOCKING git scan of origin/main and must
// never throw or block filing; main() stamps metadata.possible_prior_fix.
// Behavioral tests are deterministic (gibberish → null, never throws); positive matches
// depend on live git history and are covered by the static format pin + manual verification.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPossiblePriorFix } from '../../../scripts/log-harness-bug.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../scripts/log-harness-bug.js');
const src = readFileSync(SRC, 'utf8');

describe('QF-20260525-785: findPossiblePriorFix is best-effort and never throws', () => {
  it('returns null for a clearly non-existent file + gibberish symptom', () => {
    const r = findPossiblePriorFix({ symptom: 'zzqqxx totally fake symptom 99', file: 'does/not/exist/anywhere.js' });
    expect(r).toBeNull();
  });

  it('does not throw on missing/empty/odd inputs', () => {
    expect(() => findPossiblePriorFix()).not.toThrow();
    expect(() => findPossiblePriorFix({})).not.toThrow();
    expect(() => findPossiblePriorFix({ symptom: null, file: null })).not.toThrow();
    // quotes/special chars in symptom must not break the underlying git command
    expect(() => findPossiblePriorFix({ symptom: 'weird "quoted" $(rm -rf) `tok`', file: null })).not.toThrow();
  });

  it('a hit (when returned) has the expected shape', () => {
    // symptom token "log-harness-bug" matches this very commit's message in most checkouts;
    // assert shape only when a hit is produced (history-dependent, so tolerate null in CI).
    const r = findPossiblePriorFix({ symptom: 'log-harness-bug advisory prior-fix scan', file: 'scripts/log-harness-bug.js' });
    if (r !== null) {
      expect(r).toHaveProperty('commit');
      expect(r).toHaveProperty('when');
      expect(r).toHaveProperty('subject');
      expect(r.via).toMatch(/^(file|keyword):/);
    }
  });
});

describe('QF-20260525-785: source-level guards', () => {
  it('git --format | never reaches a shell (was: quoting pin; now: argv pin — SD-LEO-INFRA-PUBLISH-SHELL-INJECTION-001-A)', () => {
    // The original rule: an unquoted | in --format was a SHELL PIPE and broke the scan. The
    // quoting was the shell-era spelling of that rule. The scan now runs argv-style through the
    // published hardened runner — | travels inside one discrete array token and no shell exists
    // to interpret it — so the pin asserts the structural form instead of the quoting.
    expect(src).toMatch(/'--format=%h\|%cI\|%s'/);
    expect(src).not.toMatch(/execSync\(\s*`git /);
    expect(src).toMatch(/runHardenedGit\(/);
  });

  it('main() is guarded so importing the module does not run the CLI', () => {
    expect(src).toMatch(/invokedDirectly/);
    expect(src).toMatch(/if \(invokedDirectly\) \{/);
  });

  it('the prior-fix hint is advisory (console.warn) and stamped into metadata', () => {
    expect(src).toMatch(/console\.warn\(`⚠️  possible prior fix on origin\/main/);
    expect(src).toMatch(/possible_prior_fix:\s*priorFix \|\| null/);
  });

  it('the scan only counts recent commits (avoids matching every file\'s last commit)', () => {
    expect(src).toMatch(/RECENT_DAYS/);
    expect(src).toMatch(/when < cutoff/);
  });
});
