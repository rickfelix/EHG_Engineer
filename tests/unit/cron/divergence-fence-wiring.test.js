/**
 * SD-LEO-INFRA-OWNERSHIP-PRESERVATION-ASSERTION-001 — the fence must be DISPATCHED, not merely
 * correct. Pattern PAT-PROCESS-PRODUCER-CONSUMER-INVARIANT-001; exemplar
 * tests/unit/cron/chairman-decision-sla-wiring.test.js.
 *
 * THE DEFECT CLASS THIS PINS, and it is the reason this whole SD extends an existing file rather
 * than writing a new one: scripts/severity-pair-divergence-fence.mjs was fully built, correct,
 * and NEVER INVOKED — zero workflow references, zero npm scripts, and zero rows in the live
 * periodic_process_registry across 246 registered processes. It even had a proven true positive.
 * Armed logic with no dispatcher is indistinguishable from logic that always passes, and the
 * failure is silent, because absence has no error message.
 *
 * These assertions are pure fs reads — no DB, no network, no clock — and they are typed as a
 * UNIT test deliberately. tests/integration/** resolves to ZERO FILES in this repo (the vitest db
 * project is disabled with no designated non-production target), so an integration-typed wiring
 * test would SKIP AND REPORT GREEN — which is the same false assurance the SD is about.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const WORKFLOW_REL = '.github/workflows/divergence-fence-cron.yml';
const SCRIPT_REL = 'scripts/severity-pair-divergence-fence.mjs';
const WORKFLOW = path.join(repoRoot, WORKFLOW_REL);
const SCRIPT = path.join(repoRoot, SCRIPT_REL);

const read = (p) => fs.readFileSync(p, 'utf8');
/** Source with comments stripped — a name in prose is not a call site. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the divergence fence names its dispatcher', () => {
  it('the workflow exists and its run step invokes the fence', () => {
    expect(fs.existsSync(WORKFLOW), `missing dispatcher workflow: ${WORKFLOW}`).toBe(true);
    expect(read(WORKFLOW)).toMatch(/node\s+scripts\/severity-pair-divergence-fence\.mjs/);
  });

  it('[SCHEDULE] it is on a SCHEDULE, not workflow_dispatch alone', () => {
    // The assertion that actually pins the fix. A workflow_dispatch-only file would satisfy every
    // other check here while leaving the fence exactly as dormant as it was — which IS the defect.
    const yml = read(WORKFLOW);
    expect(yml, 'a manually-triggered-only workflow does not end dormancy').toMatch(/^\s*schedule:/m);
    expect([...yml.matchAll(/^\s*-\s*cron:\s*'([^']+)'/gm)].length).toBeGreaterThanOrEqual(1);
  });

  it('[SEED-FIRST] the workflow proves the fence can FAIL before trusting that it passed', () => {
    // A fence that has never failed is indistinguishable from one that CANNOT fail. Without this
    // step the daily green run means nothing.
    expect(read(WORKFLOW)).toMatch(/--seed-divergence/);
  });

  it('[TWO CREDENTIAL SETS] the workflow carries BOTH the pg and the supabase-js env', () => {
    // The named risk with no assertion behind it until now. The catalog reads use node-postgres
    // and the consumer wires use supabase-js; a workflow with only the supabase pair leaves the
    // fence unable to read anything, on a runner where that failure is otherwise quiet.
    const yml = read(WORKFLOW);
    for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_POOLER_URL']) {
      expect(yml, `${name} is not wired from secrets`).toMatch(new RegExp(`${name}:\\s*\\$\\{\\{\\s*secrets\\.${name}\\s*\\}\\}`));
    }
  });

  it('ACTIVATION_TRIGGER equals the workflow path, exactly', () => {
    // Two names for one thing is how a registry row ends up pointing at a workflow that does not
    // exist — and a stamp against a row nobody reads fails silently.
    expect(code(SCRIPT)).toMatch(
      new RegExp(`ACTIVATION_TRIGGER\\s*=\\s*['"]${WORKFLOW_REL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`)
    );
  });

  it('the fence registers itself as armed machinery, so the staleness alarm has a row to read', () => {
    const src = code(SCRIPT);
    expect(src).toMatch(/registerArmedMachinery/);
    expect(src, 'the fence must import the canonical registrar, not re-implement it')
      .toMatch(/from\s+['"]\.\.\/lib\/machinery-class\/armed-registration\.js['"]/);
  });

  it('[SILENT-DEATH] registration happens BEFORE the credential check can exit', () => {
    // THE ORDERING IS THE FIX, and it is the opposite of the obvious one. main() used to exit(2)
    // on a missing pooler URL as its first act — before connecting, before every comparator,
    // before registration and before any alert. So on a runner without that secret the fence
    // emitted nothing AND wrote no registry row, leaving the staleness watcher nothing to find.
    // Dead and invisible, identical to never having been scheduled.
    const src = code(SCRIPT);
    const registerAt = src.indexOf('await ensureArmedRegistration()');
    const credCheckAt = src.indexOf('SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL');
    expect(registerAt, 'ensureArmedRegistration() call site not found').toBeGreaterThan(-1);
    expect(credCheckAt, 'credential check not found').toBeGreaterThan(-1);
    expect(registerAt, 'registration must precede the credential check, or a missing secret kills the fence silently')
      .toBeLessThan(credCheckAt);
  });

  it('the parity coupling is wired into the aggregate and is SEEDED', () => {
    const src = code(SCRIPT);
    expect(src, 'the parity comparator must actually run').toMatch(/compareViewBaseParity\(/);
    expect(src, 'and its results must reach the aggregated list').toMatch(/\.\.\.parityResults/);
    expect(src, 'and it must have a seed of its own, or it rides the pre-existing ones untested')
      .toMatch(/seedParityDivergence\(/);
  });

  it('[NEGATIVE] the usage block no longer INVOKES a file that does not exist', () => {
    // The usage block told readers to run scripts/check-severity-pair-divergence.mjs — a file that
    // has never existed. Following it is how a reader concludes the instrument is absent and
    // writes a second one, which is exactly the duplication this SD refused.
    //
    // Matched as an INVOCATION (`node <path>`), not as a mention: the corrected header explains
    // the old pointer in order to retire it, and a scan that cannot tell the correction from the
    // defect would fire on the file that fixed it. Same read-vs-perform narrowing the FR-7
    // propose-only guard already earned — narrowed to the act, not deleted.
    expect(read(SCRIPT), 'the usage block must not tell anyone to run a nonexistent file')
      .not.toMatch(/node\s+scripts\/check-severity-pair-divergence\.mjs/);
    expect(read(SCRIPT), '[CONTROL] and it must name the file that DOES exist')
      .toMatch(/node\s+scripts\/severity-pair-divergence-fence\.mjs/);
    expect(fs.existsSync(path.join(repoRoot, 'scripts/check-severity-pair-divergence.mjs'))).toBe(false);
  });

  it('[CREDENTIALS] the workflow injects a secret name the script ACTUALLY READS', () => {
    // THE DEFECT THIS PINS SHIPPED IN THE FIRST VERSION OF THIS FILE, and two independent
    // reviewers found it before CI did. The workflow injected SUPABASE_POOLER_URL, which is NOT a
    // repo secret — it expanded empty, `conn` was falsy, the script exited 2, and the fence never
    // ran. Meanwhile DATABASE_URL is a real secret that was injected and read by nothing.
    //
    // Asserting the INTERSECTION rather than either side alone: a workflow env var the script
    // never reads is decoration, and a script env var the workflow never sets is a dead fence.
    // It passed locally because .env carries the pooler URL — a green hand-run says nothing about
    // a runner's environment.
    // ⚠️ WHAT THIS TEST CANNOT DO, stated so nobody mistakes it for the whole check: a static file
    // read CANNOT tell whether a GitHub secret EXISTS. The shipped defect was exactly that —
    // SUPABASE_POOLER_URL was spelled correctly, injected correctly, read correctly, and simply
    // did not exist as a secret. Only `gh secret list` finds that, and that is how it was caught.
    // What IS pinnable here is the MAPPING onto a secret known to exist, so this asserts that
    // specific edge rather than a generic "some connection var is present" (my first version
    // asserted exactly that, and it stayed GREEN when I re-introduced the defect — the surviving
    // SUPABASE_POOLER_URL line satisfied it).
    const yml = read(WORKFLOW);
    const src = code(SCRIPT);
    expect(src, 'the script must read SUPABASE_DB_URL as a fallback').toMatch(/process\.env\.SUPABASE_DB_URL/);
    expect(yml, 'SUPABASE_DB_URL must be fed from secrets.DATABASE_URL — the secret that actually exists')
      .toMatch(/SUPABASE_DB_URL:\s*\$\{\{\s*secrets\.DATABASE_URL\s*\}\}/);
  });

  it('[STAMP] a healthy run stamps last_fired_at, or the alarm inverts into a permanent false positive', () => {
    // Registering before the credential check gives the watcher a row to read. A row that is
    // never stamped reads armed-never-produced FOREVER — so fixing the credentials alone would
    // turn a true positive into a permanent false one. These two had to land together.
    // Matched at the CALL SITE (`await stampIfHealthy(`), not the bare name. My first version
    // asserted /stampIfHealthy\(/, which matches the FUNCTION DEFINITION — so deleting the call
    // left the test green. A helper that exists and is never invoked is the same nothing as a
    // helper that does not exist, which is the defect class this entire SD is about.
    const src = code(SCRIPT);
    expect(src, 'the fence must stamp on success').toMatch(/stampLastFired/);
    expect(src, 'and the stamp must actually be CALLED, not merely defined').toMatch(/await\s+stampIfHealthy\(/);
  });

  it('[DEDUP] the UNREADABLE alert has its OWN source_service', () => {
    // recordSystemAlert dedups on (source_service, break_class, resolved_at IS NULL). A tripped
    // -fence alert sits open almost by definition — the drift it reports is what nobody has fixed
    // yet — so a shared source_service would let that open row SWALLOW the unreadable alert, and
    // the fix for the dead-and-invisible mode would be invisible in exactly the same way.
    expect(code(SCRIPT)).toMatch(/divergence-fence-unreadable/);
  });

  it('[CONTROL] the comment-stripper really removes prose, or the assertions above are vacuous', () => {
    // These tests distinguish "the code calls X" from "a comment mentions X". If the stripper were
    // inert, a deleted call site would still pass because the header would still name it.
    const stripped = code(SCRIPT);
    expect(read(SCRIPT), 'the header does discuss periodic_process_registry in prose').toMatch(/periodic_process_registry/);
    expect(stripped, 'and that prose must NOT survive stripping — there is no such call site').not.toMatch(/periodic_process_registry/);
  });
});
