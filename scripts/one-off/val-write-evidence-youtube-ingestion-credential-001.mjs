import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-FEAT-YOUTUBE-INGESTION-CREDENTIAL-001';
const supabase = await getSupabaseClient();

const summary = [
  'LEAD-phase VALIDATION for the YouTube ingestion credential architecture decision.',
  'DUPLICATE CHECK: PASS - no overlapping SD. Swept 68 youtube-mentioning SDs; only 5 name the youtube lib files.',
  'The one same-day sibling (SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001, completed) remediated the TOKEN, not the ARCHITECTURE,',
  'and the parent SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001 metadata.deferred_followups explicitly names THIS sd_key as',
  'the carrier of its FR-2/FR-5. The carve-out is legitimate and non-duplicative.',
  'BLOCKED CHECK: CONFIRMED GENUINELY BLOCKED - plan_content states verbatim "Do not start either branch until the chairman',
  'answers", and chairman_decisions a94f88c8 is the ONLY row of 730 matching the question (server-side filter, not a capped',
  'in-memory grep) with status=pending, decision=pending, decided_by=null, consumed_at=null, updated_at===created_at.',
  'MECHANISM VERIFICATION: 4 of the plan\'s load-bearing claims are WRONG or incomplete against current code.',
  'The severe one is F1: the FALLBACK branch narrows a SHARED SCOPES constant to youtube.readonly, which would break',
  'six production WRITE call sites in two sibling modules that authenticate through the same oauth-manager.',
  'CONDITIONAL_PASS: the SD is legitimate and should proceed once the chairman answers, but the plan as written must be',
  'corrected at PLAN before either branch is implementable.',
].join(' ');

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  summary,
  findings: [
    {
      id: 'F1',
      severity: 'critical',
      title: 'FALLBACK branch is self-contradictory: narrowing SCOPES to youtube.readonly would break 6 production WRITE call sites',
      detail:
        'The plan characterises oauth-manager.js SCOPES as "the current over-broad read+write https://www.googleapis.com/auth/youtube" and directs narrowing it to youtube.readonly. That scope is NOT over-broad — the write half is actively exercised. SCOPES is a single module-level constant (oauth-manager.js:28) consumed by every caller of getAuthenticatedClient(), and TWO sibling modules besides playlist-sync.js authenticate through it and perform writes: lib/integrations/post-processor.js (imports at :15; playlists.insert :183, playlistItems.insert :262, playlistItems.delete :277) and lib/integrations/youtube/strategy-extract-core.js (reached via scripts/eva/youtube-strategy-extract.js:231-233; playlists.insert :271, playlistItems.insert :302, playlistItems.delete :329). Narrowing the shared constant to readonly would silently break the entire post-processing disposal path — the mechanism that moves videos to the "Processed" playlist and removes them from "For Processing". Only playlist-sync.js is read-only. Any scope narrowing must therefore be per-consumer (a second, read-only client for the sync path) rather than a single-constant edit, which is a materially different and larger change than the plan describes.',
      evidence:
        'lib/integrations/youtube/oauth-manager.js:28 (single shared SCOPES const), :142 getAuthenticatedClient; grep of playlistItems.delete|playlistItems.insert|playlists.insert -> 6 hits across post-processor.js:183,262,277 and strategy-extract-core.js:271,302,329; importers: post-processor.js:15, playlist-sync.js:12, scripts/eva/youtube-strategy-extract.js:231',
    },
    {
      id: 'F2',
      severity: 'high',
      title: 'PREFERRED branch presumes a playlist ID that does not exist anywhere — and its only source is an OAuth-gated call',
      detail:
        'Both PREFERRED variants are written against "<id>" (RSS ?playlist_id=<id>, or playlistItems.list for playlistId). No such ID is configured anywhere in the repo: a grep for YOUTUBE_PLAYLIST_ID / PLAYLIST_ID across lib, scripts, .github and .env.example returns zero configuration hits (destination_playlist_id is an unrelated eva_youtube_intake column recording the "Processed" target). Today playlist-sync.js does not use an ID at all — findTargetPlaylist() (:32-52) discovers the playlist BY NAME ("For Processing", :17) via youtube.playlists.list({ mine: true }) (:36-41). The mine parameter is an authenticated-user selector; it has no meaning under an API key and cannot survive removal of OAuth. So the credential-free branch silently requires a step the plan never states: obtain the playlist ID once and persist it as configuration (env var or DB), replacing name-based discovery with ID-based lookup. Until that step exists, neither PREFERRED variant is implementable as written.',
      evidence:
        'lib/integrations/youtube/playlist-sync.js:17 (TARGET_PLAYLIST_NAME), :32-52 (findTargetPlaylist), :36-41 (playlists.list mine:true), :298 (call site); grep YOUTUBE_PLAYLIST_ID -> 0 config hits; identical mine:true discovery also at post-processor.js:171 and strategy-extract-core.js:266',
    },
    {
      id: 'F3',
      severity: 'high',
      title: 'The two PREFERRED options are NOT interchangeable: the RSS variant destroys youtube_playlist_item_id, which is load-bearing',
      detail:
        'The plan offers RSS and API-key playlistItems.list as an "either/or". They are not equivalent. playlist-sync.js:135 persists youtube_playlist_item_id: item.id, and the module header (:6) states plainly "Uses playlistItemId for post-processing removal." That column is consumed by three separate modules to delete items from the source playlist: post-processor.js:276-277 (playlistItems.delete({ id: item.youtube_playlist_item_id })), strategy-extract-core.js:248/252/329, and lib/eva/youtube-backlog-clear.js:65 (filters rows on its presence). It is 100% populated in production: all 284 of 284 eva_youtube_intake rows carry a non-null youtube_playlist_item_id. A YouTube RSS feed exposes yt:videoId but has no playlistItem identity at all (confirmed by live probe, F8), so every row ingested via the RSS variant would carry NULL and become permanently undisposable. The API-key playlistItems.list variant DOES return item.id and preserves the contract. PLAN must pick the API-key variant, or explicitly accept and redesign the disposal path.',
      evidence:
        'lib/integrations/youtube/playlist-sync.js:6, :135, :188; consumers post-processor.js:276-277, strategy-extract-core.js:248,252,329, lib/eva/youtube-backlog-clear.js:65; live DB: eva_youtube_intake total=284, rows with non-null youtube_playlist_item_id=284',
    },
    {
      id: 'F4',
      severity: 'medium',
      title: 'RSS is hard-capped at 15 entries with no pagination — measured, not assumed',
      detail:
        'I probed both feed variants live against a public channel and its uploads playlist. Both returned HTTP 200 with exactly 15 <entry> elements and no pagination token. The current fetchPlaylistVideos() (playlist-sync.js:60-79) paginates unbounded via nextPageToken at maxResults=50, and the backlog this pipeline handles is demonstrably larger than 15 (284 intake rows exist; a prior SD, SD-LEO-INFRA-DISTILL-YT-REVIEW-GAP-AND-BACKLOG-CLEAR-001, cleared 115 stranded videos). The RSS variant would therefore silently truncate the playlist to its 15 most recent items — a data-loss failure mode that produces no error and would read as a successful sync. The repo already half-knows this: scripts/one-off/insert-user-stories-ideation-ingestion-connectors-001.mjs:224 notes RSS "caps at ~15 items and omits some metadata", but the SD scope and plan_content promote RSS to first position without carrying that caveat forward. RSS also omits duration and tags, which getVideoDetails() (:87-109) currently supplies via videos.list.',
      evidence:
        'Live probe .artifacts-val-rss-probe.mjs: channel_id -> HTTP 200, 15 entries; playlist_id -> HTTP 200, 15 entries; both has-duration=false, has-playlistItemId=false. Compare playlist-sync.js:60-79 (unbounded pagination), :87-109 (getVideoDetails)',
    },
    {
      id: 'F5',
      severity: 'medium',
      title: 'The YouTube sync circuit breaker is currently OPEN and latched — the SD\'s own verification step would read false-green',
      detail:
        'Live eva_sync_state row a89eba22 (source_type=youtube, source_identifier="For Processing") has consecutive_failures=3. isCircuitOpen() (playlist-sync.js:254-263) trips at >=3, and syncYouTube() (:286-290) then returns { skipped: true } BEFORE the try block and before any updateSyncState() call — so the breaker cannot self-heal on its own; nothing in the success path ever runs to reset it. The SD\'s success criterion #2 requires a workflow_dispatch run showing "a real pull (item count), not a credential/auth error". Under the current latched-open breaker that run will exit cleanly with zero items and NO error, which is exactly the false-green the plan\'s step 3 warns about in the abstract without naming this mechanism. PLAN must add an explicit "reset consecutive_failures to 0" precondition before the verification run, or the SD can be marked verified while the sync is still dead.',
      evidence:
        'live DB eva_sync_state id=a89eba22-2a6f-47bf-b136-92b76f892427 ident="For Processing" consecutive_failures=3 updated_at=2026-08-26T16:22:17Z; lib/integrations/youtube/playlist-sync.js:254-263 (isCircuitOpen), :286-290 (early return before try/updateSyncState)',
    },
    {
      id: 'F6',
      severity: 'low',
      title: 'Every line-number reference in the plan for oauth-manager.js is stale',
      detail:
        'The plan (and the upstream user-story script it derives from) cites SCOPES at line 17, getStoredTokens at lines ~44-54, and storeTokens at lines ~61-84. Measured against current HEAD: SCOPES is line 28, getStoredTokens spans 68-89, storeTokens spans 96-134. The drift is explained — SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001 inserted a 17-line header and the encryption plumbing after the plan was authored — so this is not a fabricated citation, but it does confirm the plan was written against a pre-encryption snapshot and its code-shape claims must be re-read at PLAN rather than trusted. Non-blocking on its own; it is the reason F1/F7 went unnoticed.',
      evidence:
        'lib/integrations/youtube/oauth-manager.js:28, :68-89, :96-134 vs plan_content "SCOPES constant (line 17)", "getStoredTokens(), lines ~44-54", "storeTokens(), lines ~61-84"; same stale numbers at scripts/one-off/insert-user-stories-ideation-ingestion-connectors-001.mjs:206,244',
    },
    {
      id: 'F7',
      severity: 'low',
      title: 'The plan\'s plaintext-exposure premise is stale, and it credits the wrong SD for closing it',
      detail:
        'plan_content justifies the no-DB-fallback requirement as preventing re-creation of "the exposure the parent SD\'s FR-3 migration closed". Independently measured rather than taken from the prior diligence note: eva_sync_state row 5ea38ba3 (youtube_oauth) now has source_metadata = {} — literally zero keys, no legacy plaintext tokens key and no encrypted_tokens. oauth-manager.js now encrypts at rest via lib/security/encryption.cjs (AES-256-GCM), attributed in its own header (:3-16) to SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001, a separate completed SD — not to the parent SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001, whose plan_content contains no FR-3 at all. This corroborates the existing lead_diligence finding #1 by independent measurement and adds the attribution correction. Consequence: this SD is a pure architecture-simplification choice with no live credential urgency, which should be reflected in how PLAN sequences it. The no-DB-fallback requirement itself remains sound on design grounds.',
      evidence:
        'live DB eva_sync_state id=5ea38ba3-6b46-4f17-be5a-3a87a4075143 source_metadata keys=[] (tokens=false, encrypted_tokens=false); lib/integrations/youtube/oauth-manager.js:3-16, :24, :106; parent SD metadata.plan_content contains zero FR-3 matches',
    },
    {
      id: 'F8',
      severity: 'info',
      title: 'POSITIVE: the unproven RSS playlist_id variant now IS proven to work — open verification item discharged',
      detail:
        'The existing lead_diligence correctly flagged that subscription-scanner.js proves only the channel_id variant (:25) and that ?playlist_id= was "NOT the variant proven in this codebase\'s production traffic", requiring its own verification before parity is assumed. That was the right call, and I have now discharged it rather than leaving it open: a live fetch of https://www.youtube.com/feeds/videos.xml?playlist_id=<public uploads playlist> returns HTTP 200, 26003 bytes, 15 <entry> elements with yt:videoId present — byte-for-byte the same document shape as the channel_id feed (26016 bytes, 15 entries). So the endpoint is live and subscription-scanner.js\'s fetch/parse code shape transfers directly. The parity that FAILS is not RSS-vs-RSS but RSS-vs-current-mechanism, on the three counts in F3 and F4 (no playlistItemId, 15-item cap, no duration/tags). Net: the RSS pattern is trustworthy as a fetch primitive and untrustworthy as a drop-in replacement for playlist-sync.js.',
      evidence:
        '.artifacts-val-rss-probe.mjs live output: playlist_id -> HTTP 200 OK, bytes=26003, entries=15, yt:videoId=true; channel_id -> HTTP 200 OK, bytes=26016, entries=15. lib/integrations/youtube/subscription-scanner.js:25',
    },
    {
      id: 'F9',
      severity: 'info',
      title: 'GATE 1 duplicate/infrastructure sweep: clean',
      detail:
        'Swept strategic_directives_v2 for youtube across title/description/scope/sd_key -> 68 SDs; of those only 5 name the youtube lib files in description/scope, and 4 are completed predecessors with disjoint scope (SD-LEO-ORCH-EVA-IDEA-PROCESSING-001C built the integration; SD-LEO-FEAT-CONNECT-ASSIST-ENGINE-001 and SD-LEO-INFRA-DISTILL-YT-REVIEW-GAP-AND-BACKLOG-CLEAR-001 touched downstream disposition; SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001 did token remediation). None of the four decides the credential architecture. No in-flight SD competes. Existing infrastructure that this SD can reuse rather than rebuild: lib/integrations/youtube/video-metadata.js:48 already demonstrates a working YOUTUBE_API_KEY read-only path in this codebase ("Uses YOUTUBE_API_KEY for read-only access (no OAuth needed)"), which is a closer and stronger precedent for the PREFERRED branch than the RSS pattern the plan leads with, and it is not mentioned anywhere in the plan.',
      evidence:
        'strategic_directives_v2 sweep (68 youtube SDs, 5 file-naming, 4 completed-disjoint); parent metadata.deferred_followups names this sd_key for FR-2/FR-5; lib/integrations/youtube/video-metadata.js:8,48',
    },
  ],
  conditions: [
    {
      action:
        'F1 (BLOCKING on FALLBACK branch): do not narrow the shared oauth-manager SCOPES constant. Six production write call sites in post-processor.js and strategy-extract-core.js authenticate through it. Any readonly narrowing must introduce a separate read-only client for the sync path only.',
      priority: 'critical',
      blocking: true,
    },
    {
      action:
        'F2 (BLOCKING on PREFERRED branch): add an explicit step to obtain and persist the "For Processing" playlist ID as configuration. Neither credential-free variant is implementable while discovery depends on OAuth-gated playlists.list({ mine: true }) name matching.',
      priority: 'critical',
      blocking: true,
    },
    {
      action:
        'F3: at PLAN, select the YOUTUBE_API_KEY playlistItems.list variant over RSS, or explicitly redesign the disposal path. RSS yields no playlistItem id and would strand every new row (284/284 current rows depend on that column).',
      priority: 'high',
      blocking: true,
    },
    {
      action:
        'F5: reset eva_sync_state consecutive_failures to 0 for source_identifier="For Processing" BEFORE the success-criterion-2 workflow_dispatch verification run, or the latched-open circuit breaker will return skipped:true with no error and the SD will verify false-green.',
      priority: 'high',
      blocking: false,
    },
    {
      action:
        'F6/F7: re-read oauth-manager.js at PLAN rather than trusting the plan\'s line numbers, and correct the plan\'s attribution of the plaintext-exposure fix to SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001 rather than "the parent SD\'s FR-3".',
      priority: 'medium',
      blocking: false,
    },
  ],
  justification:
    'CONDITIONAL_PASS rather than PASS: the SD is non-duplicative, correctly carved out from its parent, and genuinely blocked on an unanswered chairman decision (all three independently measured). But four load-bearing mechanism claims in plan_content are wrong or incomplete against current code, one of them severely — narrowing the shared SCOPES constant as the FALLBACK branch directs would break six production write call sites in two sibling modules. The SD should proceed once the chairman answers; the plan must be corrected first.',
  warnings: [
    'The FALLBACK branch as written would cause a production regression in the YouTube post-processing disposal path. It reads as a one-line constant edit and is not one.',
    'Both PREFERRED variants are written against a playlist "<id>" that does not exist as configuration; the only current source of it is the OAuth call the branch is meant to remove.',
    'The sync circuit breaker is already latched open (consecutive_failures=3), so the SD\'s primary verification method returns green-with-zero-items today regardless of which branch ships.',
  ],
  recommendations: [
    'Record the chairman answer to decision a94f88c8 verbatim before any PLAN work, per the SD\'s own success criterion 1 and its "Do not start either branch until the chairman answers" instruction.',
    'If the answer is YES (unlisted): implement via YOUTUBE_API_KEY + playlistItems.list, NOT RSS — it preserves item.id (F3), paginates past 15 (F4), and lib/integrations/youtube/video-metadata.js:48 already proves the API-key pattern in this codebase. Add the playlist-ID provisioning step from F2 as an explicit prerequisite task.',
    'If the answer is NO (stays private): replace the single-constant scope narrowing with a two-client design — keep the full youtube scope for post-processor.js and strategy-extract-core.js writes, and give playlist-sync.js its own youtube.readonly client. Re-scope the PLAN estimate accordingly; this is not the small change the plan implies.',
    'Add a PLAN task to reset the circuit breaker before verification, and strengthen success criterion 2 to assert a nonzero eva_youtube_intake row delta AND consecutive_failures=0, so a skipped run cannot pass as a pull.',
    'Refresh the plan\'s oauth-manager.js line references and correct the FR-3 attribution so the durable record does not carry citations a future reader will find pointing at the wrong lines.',
  ],
  validation_mode: 'prospective',
  metadata: {
    recorded_by: 'validation-agent (Task tool dispatch)',
    assessment_type: 'lead_phase_due_diligence',
    sd_key: SD_KEY,
    model: 'claude-opus-5[1m]',
    blocked_status: 'GENUINELY_BLOCKED',
    blocked_evidence: {
      plan_text: 'plan_content states verbatim: "Do not start either branch until the chairman answers."',
      decision_row: 'a94f88c8-bf97-4c04-a11a-084817cdc185',
      decision_state: 'status=pending, decision=pending, decided_by=null, consumed_at=null, updated_at===created_at (2026-08-26T18:23:25Z) — never touched since filing',
      population_check: 'server-side .or(summary.ilike) filter across all 730 chairman_decisions rows returned exactly 1 match; deliberately NOT a capped fetch grouped in memory',
    },
    independently_reproduced: [
      'chairman_decisions: 730 total rows, server-side filter -> exactly 1 match (a94f88c8), status=pending/decision=pending/decided_by=null/consumed_at=null, updated_at===created_at',
      'eva_sync_state 5ea38ba3 (youtube_oauth): source_metadata keys = [] (no plaintext tokens, no encrypted_tokens)',
      'eva_sync_state a89eba22 ("For Processing"): consecutive_failures = 3 -> circuit breaker latched OPEN',
      'eva_youtube_intake: total=284, pending=0, rows with non-null youtube_playlist_item_id = 284/284',
      'oauth-manager.js SCOPES = ["https://www.googleapis.com/auth/youtube"] at line 28 (plan says line 17)',
      'getAuthenticatedClient importers: playlist-sync.js:12 (read-only), post-processor.js:15 (writes), scripts/eva/youtube-strategy-extract.js:231 (writes)',
      '6 write call sites under the shared SCOPES: post-processor.js:183,262,277 + strategy-extract-core.js:271,302,329',
      'grep YOUTUBE_PLAYLIST_ID / PLAYLIST_ID across lib, scripts, .github, .env.example -> 0 configuration hits',
      'LIVE RSS probe: ?playlist_id= -> HTTP 200, 26003 bytes, 15 entries, yt:videoId present, no playlistItemId, no duration',
      'LIVE RSS probe: ?channel_id= -> HTTP 200, 26016 bytes, 15 entries (same shape, same 15-item cap)',
      'strategic_directives_v2 sweep: 68 youtube SDs, 5 name the lib files, 4 completed with disjoint scope, 0 competing in-flight',
      'parent SD metadata.deferred_followups explicitly names this sd_key as carrier of FR-2/FR-5',
      'parent SD plan_content contains zero FR-3 matches (plan misattributes the encryption fix to it)',
    ],
    gates_assessed: {
      gate1_lead_pre_approval:
        'CONDITIONAL — duplicate check PASS (no overlapping SD, carve-out legitimate per parent deferred_followups); infrastructure check PASS with a reuse note (video-metadata.js:48 API-key precedent unreferenced by the plan); claims verification FAIL (4 of the plan mechanism claims wrong/incomplete, F1 severe)',
      gate2_plan_prd:
        'NOT REACHED — SD is pre-decision. When reached, F1/F2/F3 conditions must be resolved in the PRD or the resulting user stories will encode a production regression.',
    },
    prior_diligence_relationship: {
      source: 'strategic_directives_v2.metadata.lead_diligence (recorded by Hotel-2, 2026-08-26T18:26:00Z)',
      treatment:
        'Its 3 findings were re-measured independently rather than relayed. Finding 1 (stale plaintext-exposure urgency) CORROBORATED by direct DB read plus an attribution correction (F7). Finding 2 (RSS channel_id vs playlist_id unproven) CORROBORATED and its open verification item DISCHARGED by live probe (F8). Finding 3 (SCOPES still needs narrowing) CORROBORATED as to the literal constant value but its CONCLUSION REVERSED — narrowing that shared constant is unsafe, not merely pending (F1).',
    },
    verification_scripts: [
      '.artifacts-val-sd-read.mjs',
      '.artifacts-val-sd-core.mjs',
      '.artifacts-val-plan.mjs',
      '.artifacts-val-dupes.mjs',
      '.artifacts-val-decision.mjs',
      '.artifacts-val-decision2.mjs',
      '.artifacts-val-state.mjs',
      '.artifacts-val-state2.mjs',
      '.artifacts-val-rss-probe.mjs',
    ],
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_KEY,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'VALIDATION',
  supabase,
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('VALIDATION', SD_KEY, null, results, { phase: 'LEAD' });
console.log('Stored VALIDATION evidence id:', stored.id);
console.log('verdict:', results.verdict, '| confidence:', results.confidence, '| findings:', results.findings.length);
console.log('repo_path:', results.metadata?.repo_path);
console.log('executed_from_cwd:', results.metadata?.executed_from_cwd);
console.log('repo_resolved:', results.metadata?.repo_resolved, '| registry_source:', results.metadata?.registry_source);
