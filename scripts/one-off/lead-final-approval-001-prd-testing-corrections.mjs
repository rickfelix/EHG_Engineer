#!/usr/bin/env node
// SD-LEO-FIX-LEAD-FINAL-APPROVAL-001 PLAN phase: corrects the PRD based on PLAN-phase TESTING
// sub-agent findings (C1-C4), each independently re-verified by PLAN with its own reproduction
// before being accepted:
//   C1: FR-3's uniform payload matrix would test sink #1 (unquoted) with payloads that are INERT
//       against it (quote-breakout is neutralized by an unquoted-context quirk: an unmatched "
//       causes cmd.exe to treat everything after it as a literal quoted string, swallowing the
//       following &). Verified directly: bare '&' executes against sink #1, quote-breakout does
//       NOT. The matrix must be asymmetric per sink, not uniform.
//   C2: backtick/$() substitution is never interpreted by cmd.exe on either sink -- a TS-4-style
//       assertion using only that payload class is a guaranteed false green on a Windows host
//       (this repo's real EXEC hosts), and pr-merge-verification.test.js has no blocking CI, so
//       it will only ever run on Windows in practice.
//   C3: FR-4's conversion of gates.js:763/:1015 to execFileSync silently kills 28 execSync
//       string-mock references across ALL 14 existing tests (not just FR-1a's scoped 5) --
//       execFileSync as an unconfigured vi.fn() returns undefined, JSON.parse(undefined||'[]')
//       silently yields [], so mocked scenarios stop being exercised while tests keep "passing".
//   C4: FR-2's charset guard, if implemented inside the branch-filtering step, could silently
//       EXCLUDE a malformed branch from the unmerged-branch scan entirely -- a fail-open, not a
//       fail-closed. Must explicitly route a rejected branch into the blocking/unverified path.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-LEAD-FINAL-APPROVAL-001';

export async function correctPRD() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: prd, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('id, functional_requirements, test_scenarios, risks')
    .eq('directive_id', SD_KEY)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const functional_requirements = prd.functional_requirements.map((fr) => {
    if (fr.id === 'FR-1a') {
      return {
        ...fr,
        title: 'Migrate ALL execSync-string-mocked tests broken by FR-1 AND FR-4 conversions (verified: 14, not 5)',
        description: fr.description + " CORRECTED (PLAN-phase TESTING, independently re-verified): FR-4's conversion of gates.js:763/:1015 to execFileSync additionally kills 28 execSync string-mock references (`cmd.startsWith('gh pr list')` / `.includes('--state open')` / `.includes('--state merged')`) spread across all 14 existing tests in the same file -- execFileSync as an unconfigured vi.fn() returns undefined, and JSON.parse(undefined || '[]') silently yields [], so mocked scan scenarios (including the Scan-C saturation test) stop being exercised while the suite keeps reporting green. FR-1a's real scope is the FULL test file, not just the 5 sites FR-1 alone would break.",
        acceptance_criteria: [
          ...fr.acceptance_criteria,
          'ALL execSync-string-mock references broken by BOTH FR-1 and FR-4 conversions are migrated to execFileSync mocks (verified count: 14 tests reference the affected mock shapes, not 5)',
          'Every migrated call site has an explicit expect(execFileSync).toHaveBeenCalledWith(...) argv-shape assertion (not just a return-value assertion), so a future accidental regression to a shell form fails loudly rather than silently returning undefined',
          'At least one test asserts execSync is called ZERO times for the converted code paths post-fix -- a platform-and-payload-independent regression guard',
        ],
      };
    }
    if (fr.id === 'FR-2') {
      return {
        ...fr,
        description: fr.description + ' CORRECTED (PLAN-phase TESTING, independently re-verified): the guard must explicitly ROUTE a rejected branch into the blocking/unverified path (e.g. surfaced into unmergedBranches or an equivalent refusal), NEVER silently filtered out of the branch population being scanned -- if implemented inside the branchBelongsToSd filtering step without this routing, a charset-violating branch simply disappears from the unmerged-branch check, which is a fail-open (an attacker names a branch with one metacharacter and the completion gate never sees it), the opposite of the guard\'s intent.',
        acceptance_criteria: [
          ...fr.acceptance_criteria,
          'A branch rejected by the charset guard is surfaced as blocking/unverified to the caller, never silently excluded from the branch population being scanned',
          'The regex is anchored and full-string (e.g. /^[A-Za-z0-9._/-]+$/.test(b), not an unanchored .test() which returns true if ANY substring matches), and character-class ordering keeps the trailing hyphen last so it is never misread as a range operator (e.g. NOT [A-Za-z0-9.-_/], which admits a 0x2E-0x5F range including \';\',\'<\',\'>\',\':\')',
          'Unit tests explicitly assert both \';\' and \'"\' are rejected by the regex, and that the full legitimate-branch population still passes (a guard that rejects everything would satisfy a naive "malformed input rejected" test)',
        ],
      };
    }
    if (fr.id === 'FR-3') {
      return {
        ...fr,
        title: 'Per-sink ASYMMETRIC payload matrix (platform-invariant, not a uniform matrix)',
        description: 'CORRECTED from a uniform quote-breakout + backtick/$() matrix (PLAN-phase TESTING, independently re-verified by PLAN with its own reproduction): the two sinks have OPPOSITE injection-vulnerable payload classes because sink #1 is UNQUOTED and sink #2 is double-quote-wrapped. Verified directly: against sink #1 (unquoted), bare \'&\'/\'|\'/\';\' execute (both cmd.exe and POSIX sh); a quote-breakout payload does NOT execute against sink #1 (the unmatched leading " causes cmd.exe to treat everything through the next " as a literal quoted string, swallowing the & operators as literal characters) -- so a quote-breakout-only test would be a FALSE GREEN even against fully vulnerable sink #1 code. Against sink #2 (quoted), the converse holds: bare \'&\' does NOT break out (quotes hold on Windows), only a space-free quote-breakout payload executes. Backtick/$() substitution is NEVER interpreted by cmd.exe on either sink -- since pr-merge-verification.test.js has no blocking CI (verified: can-auto-advance-tests.yml states neither test:unit nor test:integration runs in CI), these tests will only ever execute on a Windows host in practice, so a backtick/$()-only assertion is a guaranteed false green there and must be explicitly platform-gated (e.g. describe.skipIf(process.platform===\'win32\') or forced shell:\'/bin/sh\') rather than counted as proof of a fix on the host where EXEC will actually run it.',
        acceptance_criteria: [
          'Sink #1 (unquoted) tested with bare &, |, ; -- all three verified to execute pre-fix on both cmd.exe and POSIX sh',
          'Sink #2 (quoted) tested with a SPACE-FREE quote-breakout payload (a literal " followed by shell metacharacters) -- verified to execute pre-fix; a bare & alone is insufficient proof for this sink since it does not break out on Windows',
          'Each payload is demonstrated to actually execute pre-fix against ITS OWN targeted sink before being trusted as a regression assertion -- a payload that does not fire pre-fix is not evidence and must not be counted toward "proves the sink is fixed"',
          'Any backtick/$()-based payload is explicitly platform-gated (skipped on win32, or run under a forced POSIX shell) rather than asserted unconditionally, since it is inert on cmd.exe and would otherwise silently prove nothing on the host where these tests actually run',
          'Branch-name payloads used in a real scratch-repo reproduction are SPACE-FREE (git refs cannot contain spaces -- a payload with a space fails at branch-creation time, which could be misread as "the payload was neutralized" rather than "the branch could never be created")',
          'Detection of a substitution-style payload (backtick/$()) uses a SIDE-EFFECT marker (e.g. a file write), not stdout scanning -- command substitution consumes the injected command\'s output INTO the argument itself, making it invisible to a stdout-based detector even when it genuinely executed',
          'The primary proof-of-fix assertion is argv-shape (the branch name arrived as exactly one argv element, no shell was invoked) -- platform-independent and cannot false-green; the injection-reproduction payloads are a secondary, platform-aware demonstration',
        ],
      };
    }
    if (fr.id === 'FR-4') {
      return {
        ...fr,
        description: fr.description + ' CORRECTED inventory (PLAN-phase TESTING, independently re-verified): one additional sink found -- gates/invocation-path-gate.js:351 (`git diff --name-only --diff-filter=A ${mainRef}...HEAD ...`, unquoted `${mainRef}` interpolation) is the SAME unquoted-ref class as cross-sd-file-overlap-temporal-ship.js:62 and must be included in the convert-or-justify audit. gates.js:601\'s `--repo ${repo}` (hardcoded literal array, genuinely safe) should also be explicitly recorded in the audit output as "no interpolation risk" for completeness, since the audit claims a full accounting.',
        acceptance_criteria: [
          ...fr.acceptance_criteria,
          'gates/invocation-path-gate.js:351\'s unquoted ${mainRef} interpolation is converted to execFileSync-array',
          'gates.js:601\'s hardcoded --repo interpolation is explicitly recorded in the audit output as verified-safe (no interpolation risk), not silently omitted from the accounting',
        ],
      };
    }
    return fr;
  });

  const test_scenarios = [
    { id: 'TS-1', type: 'regression', test_type: 'unit', scenario: "Sink #1 (unquoted, git rev-list --count) with bare '&', '|', ';' branch-name payloads", expected: 'Pre-fix: each executes an injected command (documents the vulnerability, verified directly). Post-fix: none execute; correct commit count returned for the legitimate portion of the name.' },
    { id: 'TS-2', type: 'regression', test_type: 'unit', scenario: 'Sink #2 (double-quoted, gh pr list --head) with a SPACE-FREE quote-breakout payload', expected: 'Pre-fix: injected command executes (verified: quote-breakout fires, bare & alone does not). Post-fix: no injection, gh receives the literal branch string as a single argv element.' },
    { id: 'TS-3', type: 'regression', test_type: 'unit', scenario: "Cross-check: bare '&' against sink #2, and quote-breakout against sink #1 -- the INERT direction of the asymmetric matrix", expected: "Neither fires, even pre-fix (documents WHY a uniform payload matrix would be a false green -- verified directly: bare '&' does not break sink #2's quotes on Windows, and a quote-breakout string does not execute against sink #1's unquoted context because the unmatched leading \" swallows the following & as a literal character)." },
    { id: 'TS-4', type: 'regression', test_type: 'unit', scenario: 'Both sinks with a backtick/$() substitution payload, PLATFORM-GATED (skipped on win32 or forced to a POSIX shell), detected via a side-effect marker file, never stdout scanning', expected: 'Zero injection post-fix on a POSIX host; the test is explicitly excluded from asserting anything on Windows, where this payload class is inert on both sinks regardless of fix status' },
    { id: 'TS-5', type: 'regression', test_type: 'unit', scenario: 'Full gates/pr-merge-verification.test.js suite after FR-1/FR-1a/FR-4 conversions, including argv-shape assertions for every converted call site', expected: '14+ tests pass, 0 silently-dead mocks (each converted site has an explicit toHaveBeenCalledWith argv assertion, not just a return-value check)' },
    { id: 'TS-6', type: 'regression', test_type: 'unit', scenario: "Ref-charset guard against the repo's real live branch population, plus explicit ';' and '\"' rejection tests", expected: "0 legitimate branches rejected; ';' and '\"' are explicitly asserted rejected (not just implied by the regex)" },
    { id: 'TS-7', type: 'regression', test_type: 'unit', scenario: 'A charset-violating branch reaching the FR-2 guard', expected: 'The branch is surfaced as blocking/unverified, NOT silently excluded from the scanned population (fail-closed, not fail-open)' },
  ];

  const risks = [...prd.risks, {
    risk: "FR-4's test-migration blast radius was undercounted (FR-1a originally scoped 5 tests; FR-4's own conversions independently break ~14, via 28 silently-dead execSync string-mock references across the full test file)",
    mitigation: 'Corrected in FR-1a: scope now explicitly covers ALL execSync-string-mock references broken by either FR-1 or FR-4, verified at 14 tests / 28 mock references, with mandatory argv-shape assertions so a silently-dead mock cannot pass unnoticed.',
    severity: 'high',
    rollback_plan: 'N/A -- test-scope correction, no runtime rollback needed.',
  }];

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements, test_scenarios, risks })
    .eq('id', prd.id);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log(`Corrected PRD content for ${SD_KEY} (id=${prd.id}).`);
  return { prdId: prd.id };
}

if (isMainModule(import.meta.url)) {
  correctPRD().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
