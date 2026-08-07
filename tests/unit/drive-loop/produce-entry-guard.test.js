/**
 * QF-20260807-992 — the drive-report producer's CLI entry guard must FIRE, on every platform.
 *
 * THE DEFECT: scripts/drive-report-produce.mjs:71 hand-rolled the guard as
 *   import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')
 * On Windows that builds `file://C:/…` (TWO slashes) against an import.meta.url of
 * `file:///C:/…` (THREE). It never matched, so main() never ran: exit 0, no output, NO ROW
 * written. On Linux both render `file:///home/…`, so the GHA path worked and the defect was
 * invisible until someone ran it by hand.
 *
 * WHY THE ASSERTIONS BELOW ARE POSITIVE, NOT NEGATIVE — this is the coordinator's explicit
 * instruction and it is the difference between a real proof and a comfortable one: it is not
 * enough to show the guard "stopped not-firing". A guard that returns false for EVERYTHING also
 * stops not-firing, and would pass any test that only checks the old expression is gone. So the
 * load-bearing case asserts the guard returns TRUE for a Windows-shaped argv — the exact input
 * that used to produce false.
 *
 * The producer is the ONLY writer of drive_reports. An entry point that never fires is
 * indistinguishable from a run with nothing to do, so an empty table reads as "the migration is
 * still gated" rather than "the guard is broken" — which is precisely how this survived.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMainModule } from '../../../lib/utils/is-main-module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCER = path.resolve(__dirname, '../../../scripts/drive-report-produce.mjs');
const SRC = readFileSync(PRODUCER, 'utf8');

// The exact broken expression, reproduced so the two can be compared on identical input rather
// than described in prose.
const handRolled = (argv1) => `file://${argv1}`.replace(/\\/g, '/');

const origArgv1 = process.argv[1];
afterEach(() => { process.argv[1] = origArgv1; });

describe('QF-20260807-992 — producer entry guard fires cross-platform', () => {
  it('FIRES for a Windows argv path — the case that used to silently return false', () => {
    const winPath = String.raw`C:\Users\rickf\Projects\_EHG\EHG_Engineer\scripts\drive-report-produce.mjs`;
    process.argv[1] = winPath;
    const metaUrl = pathToFileURL(winPath).href;

    // THE LOAD-BEARING ASSERTION. Positive, on the exact input that broke.
    expect(isMainModule(metaUrl)).toBe(true);

    // And the counter-demonstration on the SAME input: the old expression disagrees, which is the
    // defect stated as a comparison rather than as a claim.
    expect(handRolled(winPath)).toBe('file://C:/Users/rickf/Projects/_EHG/EHG_Engineer/scripts/drive-report-produce.mjs');
    expect(metaUrl).toBe('file:///C:/Users/rickf/Projects/_EHG/EHG_Engineer/scripts/drive-report-produce.mjs');
    expect(handRolled(winPath) === metaUrl, 'the old guard must be shown FAILING here').toBe(false);
  });

  it('FIRES for a POSIX-shaped argv path — the platform that always worked must not regress', () => {
    // NOTE: asserted against the HOST's own resolution, not a hardcoded POSIX URL. My first
    // version expected 'file:///home/...' and failed here, because pathToFileURL on Windows
    // resolves a leading-slash path against the current drive ('file:///C:/home/...'). The
    // property under test — the guard agrees with whatever Node derives from argv[1] — is
    // host-independent; the literal URL string is not, and hardcoding it tests the host instead
    // of the guard.
    const posixPath = '/home/runner/work/EHG_Engineer/scripts/drive-report-produce.mjs';
    process.argv[1] = posixPath;
    expect(isMainModule(pathToFileURL(posixPath).href)).toBe(true);
  });

  it('FIRES for paths with spaces and unicode, which the manual replace mis-encodes', () => {
    // Not decoration: pathToFileURL applies Node's own percent-encoding — the same encoder
    // import.meta.url is built with — while a slash-replace leaves the raw bytes.
    const spaced = String.raw`C:\Users\Rick Felix\proj\drive-report-produce.mjs`;
    process.argv[1] = spaced;
    const metaUrl = pathToFileURL(spaced).href;
    expect(isMainModule(metaUrl)).toBe(true);
    expect(metaUrl).toContain('%20');
    expect(handRolled(spaced) === metaUrl).toBe(false);
  });

  it('does NOT fire when the module is imported rather than executed', () => {
    // The guard must still be a guard. A predicate that returns true for everything would pass
    // every assertion above and make the producer run on import.
    process.argv[1] = String.raw`C:\Users\rickf\some\other-entrypoint.mjs`;
    const someModule = pathToFileURL(String.raw`C:\Users\rickf\lib\imported-module.mjs`).href;
    expect(isMainModule(someModule)).toBe(false);
  });

  it('does NOT fire when argv[1] is absent (embedded / -e / REPL)', () => {
    process.argv[1] = undefined;
    expect(isMainModule('file:///anything.mjs')).toBe(false);
  });

  it('the producer imports the canonical guard and no hand-rolled template survives IN CODE', () => {
    expect(SRC).toMatch(/import \{ isMainModule \} from '\.\.\/lib\/utils\/is-main-module\.js'/);
    expect(SRC).toMatch(/if \(isMainModule\(import\.meta\.url\)\)/);

    // COMMENTS ARE STRIPPED BEFORE THE SCAN, and that is not a convenience. My first version
    // scanned the raw source and went RED — because the fix's own comment QUOTES the broken
    // expression to explain what was wrong. The documentation of a defect tripped the detector for
    // that defect. Same shape as a cron `*/15` silently closing a block comment: prose about code,
    // read as code. The pin must assert about what SHIPS.
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    expect(code, 'a hand-rolled file:// entry guard reappeared in executable code')
      .not.toMatch(/`file:\/\/\$\{process\.argv\[1\]\}`/);
    // Two-sided: prove the stripper did not simply eat everything, or the assertion above is
    // vacuous and would pass against a file that reintroduced the bug.
    expect(code).toMatch(/isMainModule\(import\.meta\.url\)/);
  });
});
