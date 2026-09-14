#!/usr/bin/env node
// One-off: re-author metadata.functional_requirements for SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001
// per VALIDATION finding V-9 (the mechanical split of scope prose into FRs is lossy; FR-8 swallowed
// the entire out-of-scope/exit-predicate text). This rewrite incorporates V-1..V-8's concrete PLAN
// decisions (FR-3 additive-parameter, FR-5 mechanism rejection, FR-2 hash-pin, FR-8 census
// registration) directly into the FR text so a PRD generator reading this field gets the resolved
// decisions, not the original lossy split.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const functional_requirements = [
  { id: 'FR-1', title: 'Same-day cap of 4, fail-closed on BOTH read-failure branches', description: 'Read a same-day ledger BEFORE sending; a schedule firing twice, a hand re-run, or a duplicate trigger must all be refused past the 4th. CRITICAL per VALIDATION V-3: the shared lib/michael/db.mjs readRows() seam returns {rows:[],tables_absent:true} on a missing relation AND {rows:[],error} on any other read error -- BOTH cases yield an empty array, which reads as "0 sent today" and would fail OPEN unless the verb explicitly checks BOTH tables_absent and error before concluding the cap is unmet (mirror the two-branch check at scripts/michael/todoist-act.mjs:76-77). Test-asserted acceptance criterion, not left implicit.' },
  { id: 'FR-2', title: 'Immutable recipient, hash-pinned', description: 'Recipient is never accepted from a parameter, row, or env override. Per VALIDATION V-8: no literal E.164 chairman number goes into git (existing convention is process.env.CHAIRMAN_PHONE at 8 production sites, e.g. lib/comms/adam-outbound/chairman-sms-gate/index.js:144/:423/:566/:640 -- the caller-first/env-fallback shape this FR forbids copying). Mechanism: hardcode sha256(expected E.164) as a module constant (reuse sha256Hex at lib/michael/db.mjs:89); refuse the send if sha256(resolved recipient) does not match.' },
  { id: 'FR-3', title: 'Messaging identity isolated via an additive optional parameter on the shared provider', description: 'Per VALIDATION V-6 (overrides this SD\'s own Explore pass, which initially suggested a parallel module): extend lib/messaging/providers/twilio-provider.js send() with an optional identity parameter -- send({to, body, mediaUrl, identity}). When identity is supplied, read sid/token/messagingService ONLY from it, never falling back to process.env (mirror lib/marketing/channel-secrets.js:53-58). Michael passes new MICHAEL_TWILIO_* env vars (distinct names, matching the existing MICHAEL_ENCRYPTION_KEY namespace); Adam continues reading TWILIO_* unchanged, zero call-site churn (only 3 real importers, all default-imports; direct precedent: mediaUrl was added the same additive way for SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-D). A parallel module was rejected: it would exit BOTH scripts/lint/transport-test-isolation-guard-lint.mjs\'s frozen GUARDED_FILES list AND tests/unit/outbound-sink-conformance.test.js\'s TRANSPORT_TARGETS census. Delivery-status reconciliation (checkMessageStatus) is OUT OF SCOPE for Michael.' },
  { id: 'FR-4', title: 'Template-only body, never raw personal text', description: 'Body composed from a fixed template plus booleans and counts only -- never raw personal text from mail, calendar, health or household sources -- matching the existing brief assembler (scripts/michael/brief-assemble.mjs) which composes from counts and already-redacted rows.' },
  { id: 'FR-5', title: 'Dedicated Michael-local enable/disable row, read fresh, fail-closed', description: 'Per VALIDATION V-4/V-5: NOT leo_feature_flags (lib/feature-flags/evaluator.js caches 30s and fails OPEN on read error -- "fail-open: keep the existing cache on read failure" -- and CLAUDE.md rule 12 binds specific flags there to chairman ratification, too heavy for a lightweight toggle). NOT michael_rules.auto_apply (scripts/michael/rule-encode.mjs requires an Opus-verifier artifact to flip an active rule off -- too slow for "revocation is a row flip"). Mirror the fresh+fail-closed shape at lib/chairman/sms-decision-whitelist.js:32-54 in a dedicated Michael-local table/row. PLAN must decide explicitly: reuse the staged-unapplied chairman_switchon_policy generalization (database/migrations/20260718_chairman_switchon_policy_STAGED.sql) vs. a new Michael-local table.' },
  { id: 'FR-6', title: 'Universal ledger write, redacted', description: 'Every attempt -- sent, held, or refused -- writes a ledger row at-or-before the external call, redacted the way existing verbs redact (sha256+length, never verbatim body; mirror todoist-act.mjs redactCall).' },
  { id: 'FR-7', title: 'Per-slot dedup key', description: 'Each of the 4 daily ET windows (6am/10am/2pm/6pm) has its own dedup key so a re-run inside an already-sent window cannot double-send it.' },
  { id: 'FR-8', title: 'SHOULD reuse existing gate checks + dry-run-by-default; MUST register in the outbound-sink census', description: 'SHOULD reuse the existing gate\'s quiet-hours/no-secrets/length checks and the dry-run-by-default convention every Michael verb follows. SEPARATELY REQUIRED (VALIDATION V-7, HIGH): this verb is a genuine chairman-reaching sink born OUTSIDE tests/unit/outbound-sink-conformance.test.js\'s coverage (neither DISCOVERY_ROOTS nor ADDITIONAL_SCOPE include scripts/michael or lib/michael) regardless of the FR-3 mechanism. Must be added to ADDITIONAL_SCOPE in the SAME PR with a reason string (mirroring how scripts/adam-decision-email.mjs and siblings were added) -- NOT to NOT_A_SINK. If it cannot inherit lib/adam/should-consult-solomon.js\'s CONSULT_GATE, seed it into KNOWN_DEBT with a linked_ref and raise KNOWN_DEBT_CEILING as an explicit, reviewed PLAN decision (the file says "Never raise this" -- PLAN must document the justified exception).' },
  { id: 'FR-9', title: 'Cross-seat dependency: encode ratification 561878ae into the live Michael contract (VALIDATION V-1/V-2, signaled 6249c0d4)', description: 'The authorizing chairman ratification 561878ae is UNENCODED (encoded_at/encoded_ref both NULL, verified live) -- CLAUDE_MICHAEL.md currently only carries its predecessor b9d3607e, whose encoded text ends "Neither tier is built or scheduled and this clause authorises no build." A seat or gate reading the live contract today sees the opposite of this SD\'s authorization. Per the single-scribe convention, scribe_seat=adam-49eabb23 owns this encode, not the building worker -- signaled to the coordinator (worker-signal 6249c0d4, severity high) as a named cross-seat dependency that should land before/alongside this SD\'s completion, not a build blocker. The encode must also cover 3 other contract sites the carve-out under-scopes (CLAUDE_MICHAEL.md :36 duty index, :56 S3 distraction-duty success criterion, :62 closed verb-script enumeration), not just section 4.' },
];

const nextMetadata = { ...(sdRow.metadata || {}), functional_requirements };

const { error: updErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: nextMetadata })
  .eq('id', sdRow.id);
if (updErr) throw updErr;

console.log('OK: functional_requirements re-authored,', functional_requirements.length, 'FRs written (FR-1..FR-9).');
