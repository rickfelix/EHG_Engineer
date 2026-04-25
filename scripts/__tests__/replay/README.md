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

`sanitization-checker.mjs` scans `input`, `v1_output`, and `validator_result` for the patterns below. The loader (`loadFixture`) invokes `assertSanitized` automatically, AND `scripts/__tests__/golden/golden-corpus-sanitized.test.js` walks every fixture in CI regardless of which test imports the loader — refusal-on-suspicion is the policy, since the asymmetric cost (re-redact one fixture vs. leak a Supabase service-role key) favors aggression. Capture pipelines must redact these before writing the fixture.

**Patterns covered** (12, frozen via `Object.freeze(SECRET_PATTERNS)`):

| Pattern | Examples |
|---|---|
| `anthropic_api_key` | `sk-ant-...` (incl. admin) |
| `openai_api_key` | `sk-...`, `sk-proj-...`, `sk-svcacct-...`, `sk-admin-...` |
| `aws_access_key` | `AKIA...` |
| `github_token` | `ghp_...` (classic PAT) |
| `github_fine_grained_pat` | `github_pat_...` |
| `private_key_block` | PEM blocks (RSA/EC/DSA/OPENSSH/PGP) |
| `jwt_token` | `eyJ...eyJ...sig` (incl. base64url middles with hyphens) |
| `slack_token` | `xoxb-` / `xoxp-` / `xoxa-` / `xoxs-` |
| `stripe_live_key` | `sk_live_` / `pk_live_` / `rk_live_` (NOT `sk_test_`) |
| `google_api_key` | `AIza...` (39 chars) |
| `sendgrid_api_key` | `SG.{x}.{y}` |
| `postgres_conn_with_password` | `postgres://user:password@host` (passwordless URIs ignored) |

**Known false-positive class**: prose like `"eyJexample0.eyJexample0.signature"` will trip the JWT pattern. Either rephrase the example or redact it; do not add to allowlists.

**Explicit non-coverage** (out of scope; do not assume DLP):
- PII — email addresses, phone numbers, IPv4/IPv6 addresses, postal addresses, names, dates of birth.
- Stripe test keys (`sk_test_` / `pk_test_`) — placeholder convention, not real credentials.
- Bearer tokens with no recognizable prefix or structure.
- Encrypted blobs masquerading as plain text.

If a future target script handles PII or any uncovered credential class, add the pattern in a separate QF before opening the script-rephrase PR.

## Parity contract

A V2 prompt rewrite is acceptable iff `v2Result.passed === fixture.validator_result.passed` for every fixture. We do not require byte-equal V2 output; we require the downstream validator to reach the same verdict. This is FR-3's "fail-fast on shape divergence" contract.

## Rollback

Per PRD FR-5: replay-test failure on a script-rephrase PR blocks the merge. If a regression slips past tests and breaks production, the rollback is a single `git revert` on the offending PR — no feature flags, no shadow tables.
