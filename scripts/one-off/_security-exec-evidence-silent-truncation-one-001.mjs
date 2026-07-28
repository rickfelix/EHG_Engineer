#!/usr/bin/env node
/**
 * One-off: record SECURITY EXEC-phase evidence for SD-LEO-INFRA-SILENT-TRUNCATION-ONE-001
 * (EXEC-TO-PLAN handoff). Recorded via the canonical writer (CLAUDE.md prologue rule 11).
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '4d825dee-12c2-43da-ab32-5b2bb4ae6f36';
const SD_KEY = 'SD-LEO-INFRA-SILENT-TRUNCATION-ONE-001';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'SECURITY', supabase });

  let results = {
    verdict: 'PASS',
    confidence: 85,
    findings: [
      {
        id: 'F1-session-and-correlation-ids-are-not-bearer-credentials',
        severity: 'INFO',
        summary: "session_id/correlation_id are opaque row keys and coordination-routing addresses (target_session in worker-signal.cjs:385/553/712), not secrets. Authorization for mutating actions (POST /api/fleet/sessions/:id/{open,takeover,hand-back}, server/routes/fleet-sessions.js) is enforced by requireAuth (Bearer JWT or X-Internal-Api-Key, server/middleware/auth.js:52) evaluated independently of the session_id path param -- possessing a session_id lets you ADDRESS an action at that session, it does not itself grant authority to perform it.",
      },
      {
        id: 'F2-audience-is-local-operator-surfaces-only',
        severity: 'INFO',
        summary: "All four changed call sites print to local stdout only: assign-fleet-identities.cjs / coordinator-hourly-review.cjs / fleet-dashboard.cjs are operator/cron CLI diagnostics, and session-role-orient.cjs is a SessionStart hook (wired in .claude/settings.json:93) whose output is injected into a worker's own model context. server/index.js:387 binds the HTTP server to 127.0.0.1 only (not internet-facing); scripts/leo-stack.ps1 redirects server stdout to a local .logs/engineer-<ts>.log on the same machine. No output crosses to a less-trusted network boundary.",
      },
      {
        id: 'F3-role-line-widens-placement-not-disclosure',
        severity: 'LOW',
        summary: "session-role-orient.cjs:82 now puts the coordinator's FULL 36-char session_id (was 8 hex chars) into the [ROLE] line delivered to every worker at session start, which becomes part of that worker's model-context and is sent to the model provider as conversation content -- a genuine widening of WHERE the full identifier travels. However this is not a new DISCLOSURE: the same full session_id was already retrievable in full and UNAUTHENTICATED from GET /api/fleet-panel (server/routes/fleet-panel.js:108, mounted with optionalAuth at server/index.js:262, untouched by this diff -- confirmed via `git diff origin/main...HEAD -- server/routes/fleet-panel.js` returning empty). Given F1 (session_id carries no bearer authority on its own), landing the full value in a worker's transcript does not by itself grant a transcript-reader or the model provider any capability beyond what any party could already pull from the unauthenticated fleet-panel endpoint.",
      },
      {
        id: 'F4-preexisting-scope-gap-not-introduced-here',
        severity: 'LOW',
        summary: "fleet-sessions.js's own pre-existing header comment (lines 18-25, predates this SD) documents a KNOWN SCOPE BOUNDARY: once requireAuth passes, there is no per-session ownership check, so any authenticated caller can target ANY session_id for open/takeover/hand-back (single-operator trust model, not independently re-evaluated for a caller-role gate). Full display of session_id makes an exact id trivially copyable instead of requiring an attacker to guess against an 8-char (~32-bit) prefix within a small live-session population -- a marginal convenience to an already-authenticated insider, not a new authorization bypass. This gap is out of scope for SD-LEO-INFRA-SILENT-TRUNCATION-ONE-001 (not touched by its diff) and is flagged here as a follow-up candidate, not a blocker.",
      },
      {
        id: 'F5-log-volume-hygiene-negligible',
        severity: 'INFO',
        summary: "No material log bloat. coordinator-hourly-review.cjs and fleet-dashboard.cjs already cap the flagged-row array to 10 (the untouched `.slice(0, 10)` on the array, distinct from the removed `.slice(0, 8)` on the id/correlationId strings); per-row growth is ~2x24 hex chars. assign-fleet-identities.cjs roster output is bounded by live fleet size (single-digit to low tens of workers). session-role-orient.cjs emits once per session start. Not a scraping or storage concern.",
      },
      {
        id: 'F6-account-uuid-credential-hygiene-untouched-and-intact',
        severity: 'INFO',
        summary: "Confirmed the one truncation in this codebase that IS a security control was neither touched nor bypassed. `git diff origin/main...HEAD -- lib/fleet/account-identity.cjs` is empty (file not in this SD's diff). Its exported contract (docstring line 61: 'EXACTLY these 3 keys, nothing else, ever') still returns only accountUuid8 = sanitizeField(accountUuid).slice(0, 8) (line 81) -- the full accountUuid is never returned. Grepped all four changed files for accountUuid/account_uuid: every reference (assign-fleet-identities.cjs:26,28,715,718,765,777) is to the already-short accountUuid8 field name; none reads or newly surfaces the full account uuid. Credential hygiene for the local process account identity is unaffected.",
      },
    ],
    metadata: {
      direct_answers: {
        q1_disclosure: "session_id and correlation_id are opaque identifiers / coordination-routing addresses, NOT bearer tokens. Authorization on the one HTTP surface that acts on a session_id (POST /api/fleet/sessions/:id/*) is enforced independently by requireAuth (Bearer JWT or internal API key). Possessing a session_id lets a caller target a message or an authenticated API call at that session; it does not authenticate the caller. Caveat: fleet-sessions.js's own pre-existing (not introduced here) KNOWN SCOPE BOUNDARY comment notes there is no per-session ownership check once authenticated -- a real gap, but unrelated to display truncation and unrelated to this SD's diff.",
        q5_account_uuid_control: "Confirmed clean. lib/fleet/account-identity.cjs is not part of this diff; getAccountIdentity() still returns exactly {email, orgName, accountUuid8} with accountUuid8 hard-truncated to 8 chars (line 81) and the full accountUuid discarded. No roster or dashboard code path touched by this change reads or displays the full account uuid.",
      },
      files_reviewed: [
        'scripts/assign-fleet-identities.cjs',
        'scripts/hooks/session-role-orient.cjs',
        'scripts/hooks/__tests__/session-role-orient.test.js',
        'scripts/coordinator-hourly-review.cjs',
        'scripts/fleet-dashboard.cjs',
        'server/routes/fleet-sessions.js (context, untouched)',
        'server/routes/fleet-panel.js (context, untouched)',
        'server/middleware/auth.js (context, untouched)',
        'server/index.js (context, untouched)',
        'lib/fleet/account-identity.cjs (context, untouched)',
        'scripts/worker-signal.cjs (context, untouched)',
      ],
      commit_reviewed: '1516709e3b2',
      diff_range: 'origin/main...HEAD',
    },
    phase: 'EXEC',
    summary: "PASS for EXEC-TO-PLAN. This change makes four identifier-display sites (Fleet Identity Roster + diagnostics, the [ROLE] worker-orientation line, and the relay-drop diagnostic in coordinator-hourly-review.cjs + its fleet-dashboard.cjs duplicate) print session_id/correlation_id in FULL instead of an 8-12 char prefix, closing the silent-truncation-to-fabricated-identifier defect. Adversarial review found this is not a net security regression: (1) session ids are opaque routing keys, not bearer credentials -- HTTP authorization is enforced independently via requireAuth; (2) all four outputs stay on local operator-facing surfaces (CLI stdout, a local log file, a SessionStart hook's own worker-context injection) behind a server that binds to 127.0.0.1 only; (3) the [ROLE] line's full-session-id placement into worker model-context (session-role-orient.cjs:82) is a genuine widening of WHERE the id travels, rated LOW, but is not a new disclosure -- the same full session_id was already retrievable unauthenticated from GET /api/fleet-panel, untouched by this diff; (4) a pre-existing (not introduced here) missing per-session-ownership check on the mutating /api/fleet/sessions/:id/* routes is the real authorization gap in this area and is flagged as a follow-up, out of scope for this SD; (5) the one truncation in this codebase that IS a security control -- lib/fleet/account-identity.cjs's hard 8-char accountUuid8 cap -- was verified untouched and intact; no path in this diff reads or surfaces a full account uuid. No log-volume or hygiene concern (row-count caps pre-existing and untouched).",
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('SECURITY', SD_ID, { name: 'SECURITY (Chief Security Architect)' }, results, { sdKey: SD_KEY, phase: 'EXEC' });
  console.log('SECURITY result stored:', stored.id, stored.verdict, stored.confidence);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
