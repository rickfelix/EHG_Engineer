# Untrusted-Origin Allowlist (`isUntrustedOrigin`)

- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: LEO fleet worker (SD-LEO-GEN-SECURITY-TELEGRAM-BOT-001)
- **Last Updated**: 2026-08-18
- **Tags**: security, content-sanitizer, prompt-injection, feedback, allowlist

## What it is

`lib/factory/content-sanitizer.js`'s `isUntrustedOrigin(feedback)` decides whether a `feedback`
row's text must be XML-quarantine-wrapped before it reaches an LLM prompt or a full-authority EXEC
agent's instruction context. It is the security boundary between raw, caller-supplied text and
anything that later reads that text as trusted context.

## Design: enumerate-untrusted-by-exception (fail-open by default)

`isUntrustedOrigin` has two distinct behaviors:

- **Missing or malformed `source_type`** (not a string): fails **closed** — always untrusted,
  regardless of allowlist contents.
- **A well-formed but unrecognized `source_type` string**: fails **open** — trusted unless
  explicitly listed in `PUBLIC_ORIGIN_SOURCE_TYPES`.

This is an *enumerate-untrusted-by-exception* design, not a fail-closed one. A new
CHECK-constrained `source_type` value (`feedback_source_type_check`) joins "trusted" by default
the moment it's added to the constraint, unless someone remembers to also add it to
`PUBLIC_ORIGIN_SOURCE_TYPES`. Whether a value belongs in the allowlist is not derivable from the
schema alone — it depends on which write paths can reach that `source_type` and whether any of
them are reachable by an untrusted caller (unauthenticated, anon-key, or externally-controlled).

## Addition history

| `source_type` | Added by | Live write path that armed it | Status when found |
|---|---|---|---|
| `user_feedback` | Original design (pre-dates this list) | MarketLens's `/api/feedback` route | Already covered |
| `error_capture` | SD-FDBK-FIX-SECURITY-ISUNTRUSTEDORIGIN-OMITS-001 | `record_venture_error` / `fn_submit_venture_error` — SECURITY DEFINER RPCs, `GRANT EXECUTE TO anon`, caller-supplied `p_message` | Live, unmitigated |
| `venture_worker` | Same SD (EXEC-phase SECURITY sub-agent finding) | `fn_submit_venture_feedback` — SECURITY DEFINER, anon EXECUTE, secret-gated per venture; zero provisioned keys at the time, so silent/not-yet-armed | Silent, not yet armed |
| `telegram` | SD-LEO-GEN-SECURITY-TELEGRAM-BOT-001 | `telegram_bot_insert_feedback` — a PERMISSIVE RLS INSERT policy, anon-key-reachable, no venture predicate, live from 2026-02-23 until dropped 2026-08-16 (2 days before this fix) | Live, produced at least one real row |

Three consecutive SDs, three consecutive omissions of the same shape. Each was found and closed
individually; none was found by auditing the allowlist itself against the live schema — each was
found by someone independently noticing a specific write path.

## Open question, deliberately deferred each time

Every SD above scoped itself to closing the *specific* value it found, and explicitly declined to
redesign the mechanism itself (inverting to a TRUSTED-allowlist — enumerate what's safe, treat
everything else as untrusted by default) as out of scope. As of this doc, the live
`feedback_source_type_check` constraint has 13 values; 4 are classified untrusted (above), 9 are
classified trusted by the `trustedTypes` list in `tests/content-sanitizer.test.js` — but that
classification has never been independently audited value-by-value against which write paths can
reach each of the 9 "trusted" values. The db-tier test added by this SD
(`tests/database/feedback-source-type-allowlist-membership.db.test.js`) only proves the two lists
are disjoint and cover all 13 live values — it does **not** prove the 9 "trusted" values are
correctly classified, only that they're accounted for somewhere.

A genuine fix requires either (a) a trusted-allowlist inversion, or (b) a recurring audit that
checks every `source_type` value's actual write paths (RLS policies + SECURITY DEFINER RPC grants)
against its classification, not just its presence in one list or the other. Neither has been built
yet.

## Related files

- `lib/factory/content-sanitizer.js` — `isUntrustedOrigin`, `PUBLIC_ORIGIN_SOURCE_TYPES`
- `tests/content-sanitizer.test.js` — unit-level classification tests, `trustedTypes` mirror
- `tests/database/feedback-source-type-allowlist-membership.db.test.js` — live-schema membership/coverage test (does not audit write-path reachability)
- `tests/unit/sd-creation/feedback-adapter-untrusted-origin.test.js` — end-to-end quarantine-wrapping test
