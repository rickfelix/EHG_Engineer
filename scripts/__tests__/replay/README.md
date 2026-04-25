# Replay Test Framework

Reusable golden-corpus replay harness for `SD-LEO-INFRA-OPUS-HARNESS-PHASE-3-INLINE-SCRIPTS-001`.

PRs #2–5 of this campaign rewrite inline Claude prompts in 4 production scripts (`quality-checker.mjs`, `ai-quality-judge`, `eva-intake-pipeline.js`, `prd-sd-041c/technical-design.js`) from declarative to imperative voice. This framework verifies that each V2 prompt produces output that passes the same downstream validator the V1 output passed.

## Layout

```
scripts/__tests__/replay/        # this framework
  fixture-loader.mjs             # load + shape-validate golden JSON
  validator-runner.mjs           # invoke downstream validator on V2 output
  parity-asserter.mjs            # compare V1 vs V2 validator results
  sanitization-checker.mjs       # scan fixtures for leaked secrets
  fixture-schema.json            # JSON-schema doc of fixture shape
  index.mjs                      # barrel export

scripts/__tests__/golden/        # per-script fixture corpus (built in PRs #2–5)
  <script-name>/
    fixture-001.json
    ...
```

## Usage in a script-rephrase PR

```js
import { describe, it } from 'vitest';
import { loadFixturesForScript, runReplay, assertParity, assertSanitized } from '../replay/index.mjs';
import { promptV2 } from '../../path/to/script.mjs';
import { downstreamValidator } from '../../path/to/validator.mjs';

const GOLDEN_ROOT = new URL('../golden/', import.meta.url).pathname;

describe('replay: <script-name>', async () => {
  const fixtures = await loadFixturesForScript('<script-name>', GOLDEN_ROOT);
  for (const fixture of fixtures) {
    it(`parity holds for ${fixture.captured_at}`, async () => {
      assertSanitized(fixture, fixture.captured_at);
      const { v2Result } = await runReplay({ promptFn: promptV2, fixture, validator: downstreamValidator });
      assertParity({ v1Result: fixture.validator_result, v2Result, fixturePath: fixture.captured_at });
    });
  }
});
```

## Fixture shape

See `fixture-schema.json`. Every fixture must include:

- `input` — the exact input passed to the V1 prompt
- `v1_output` — the V1 prompt's observed output
- `validator_result` — `{ passed: boolean, details? }` from the downstream validator
- `captured_at` — ISO-8601 timestamp
- `sanitized` — `true` (the loader refuses fixtures where this is anything other than literal `true`)

## Sanitization

`sanitization-checker.mjs` scans `input`, `v1_output`, and `validator_result` for: Anthropic API keys (incl. admin), OpenAI API keys (incl. `sk-proj-` / `sk-svcacct-` / `sk-admin-` scoped), AWS access keys, GitHub classic PATs (`ghp_`), GitHub fine-grained PATs (`github_pat_`), PEM private-key blocks, and JWTs. The loader (`loadFixture`) invokes `assertSanitized` automatically — refusal-on-suspicion is the policy, since the asymmetric cost (re-redact one fixture vs. leak a Supabase service-role key) favors aggression. Capture pipelines must redact these before writing the fixture.

**Known false-positive class**: prose like `"eyJexample0.eyJexample0.signature"` will trip the JWT pattern. Either rephrase the example or redact it; do not add to allowlists. Coverage gaps not in scope for PR #1: Slack tokens, Stripe keys, Google API keys, SendGrid keys, postgres connection strings with embedded passwords, PII (email/phone/IP). Cover in a follow-up QF before reusing this framework for any script that touches those services.

## Parity contract

A V2 prompt rewrite is acceptable iff `v2Result.passed === fixture.validator_result.passed` for every fixture. We do not require byte-equal V2 output; we require the downstream validator to reach the same verdict. This is FR-3's "fail-fast on shape divergence" contract.

## Rollback

Per PRD FR-5: replay-test failure on a script-rephrase PR blocks the merge. If a regression slips past tests and breaks production, the rollback is a single `git revert` on the offending PR — no feature flags, no shadow tables.
