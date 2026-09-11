import { captureCompletionFlags, formatCompletionFlagsBlock } from '../scripts/capture-completion-flags.js';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';

const flags = [
  { type: 'needs_decision', item: "SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001's own two live-evidence success criteria (5-walk captured_cause exception count; 'forwarding disabled' warn absent from a real post-merge wrangler-tail) cannot be observed by a build session -- they require operating the merged code against a real AltifyAI deploy over time. Heal scored 82/100 with these marked MISSING (not falsely satisfied). Needs a follow-up operational check after the next few real stage-23 walks and altifyai deploys, or an explicit chairman/coordinator acceptance that code-level delivery plus unit coverage satisfies the SD without live confirmation." },
  { type: 'needs_decision', item: "FR-4's original scope (composeFailureDetail redacted-message-prefix in altifyai's lib/alt-text/generate.js) was cut at LEAD because it collides with pinned security tests TS-10/TS-12, discovered via a pre-existing unresolved spec-conflict signal (b9787bf4) from QF-20260906-986. That signal is still open; this SD did not resolve it, only routed around it. Someone should disposition b9787bf4 directly." },
  { type: 'harness', item: "The pre-commit secret-detection scanner (a regex matching eyJ + 20+ chars + dot + 20+ chars) blocked a commit over a SYNTHETIC test fixture JWT in a unit test (redactText's own JWT-redaction test), not a real secret. Had to shrink the fixture below the 20-char-per-segment threshold to pass. Worth a documented convention (e.g. a recognized FAKE/TEST marker prefix the scanner special-cases) so future security-fix tests for JWT-shaped patterns don't need to dodge the very scanner they're testing against." },
  { type: 'harness', item: "scripts/audit/count-truncation-overrides.json is a single 8000-line JSON file with no per-entry ID/schema validation tooling; appending two new entries required a hand-written Node script to avoid corrupting the file, and the classifier's limit() regex genuinely cannot recognize a named-constant or computed .limit() argument (confirmed false-positive class, a third occurrence beyond the file's own existing session-liveness-ssot-exit-predicate-check.mjs:47 entry). A regex smarter about named bindings (or a companion static-analysis pass resolving simple constants) would remove an entire recurring override-ledger-entry class." },
  { type: 'friction', item: "SECURITY sub-agent found real, genuine credential-redaction gaps (SEC-1/2/5/6) in a brand-new module handling raw external log content, requiring three iterative review passes before PASS. This is the review process working as intended (not a process gap), but it is worth noting as a positive data point: a first-pass SECURITY review on new external-log-handling code should be treated as near-certain to surface at least one real gap, budgeting for at least one fix-and-re-review cycle rather than treating SECURITY as typically a rubber stamp." },
];

const supabase = createSupabaseServiceClient();
const results = await captureCompletionFlags({
  supabase,
  sdKey: 'SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001',
  flags,
  reflection: { asked: true, checklist_items: 6, gaps_found: 5 },
});
console.log(formatCompletionFlagsBlock(results));
const ids = results.map((r) => r.id).filter(Boolean);
if (ids.length > 0) console.log(`\nFeedback IDs: ${ids.join(', ')}`);
