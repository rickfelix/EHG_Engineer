<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\claude\C--Users-rickf-Projects--EHG-EHG-Engineer\eb55b1f8-cbc8-4f18-a601-3a457f6bb424\scratchpad\ideation-credential-followup-plan.md -->
<!-- SD Key: SD-LEO-FEAT-YOUTUBE-INGESTION-CREDENTIAL-001 -->
<!-- Archived at: 2026-08-26T12:26:42.254Z -->

# Plan: YouTube ingestion credential architecture: resolve OAuth vs credential-free RSS path

## Type
feature

## Priority
high

## Summary
SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001 shipped the RLS/grants lockdown, cron
scheduling, observability fix, and atomic sync-state RPC for the EVA idea-ingestion pipeline
(YouTube + Todoist). Its FR-2 (YouTube credential architecture) and FR-5 (credential cutover
sequencing) were carved out and deferred here because they are gated on a single external
decision only the chairman can make: can the "For Processing" YouTube playlist be switched
from Private to Unlisted? That decision determines which of two mutually exclusive
implementation paths this SD executes. It was signaled to the coordinator during the parent
SD's EXEC phase and has not yet been answered.

## Scope
Resolve the YouTube ingestion credential architecture and execute the resulting credential
cutover safely. Two mutually exclusive branches, decided by the chairman's answer to exactly
one question: "Can the 'For Processing' YouTube playlist be switched from Private to
Unlisted?"

**PREFERRED (if yes)**: re-point `lib/integrations/youtube/playlist-sync.js` at a
credential-free read — either the public RSS feed pattern already running green in
production in `lib/integrations/youtube/subscription-scanner.js`
(`https://www.youtube.com/feeds/videos.xml?playlist_id=<id>`), or a plain
`YOUTUBE_API_KEY` `playlistItems.list` call — and remove the `oauth-manager.js` dependency
from the sync path entirely. This eliminates the OAuth credential custody problem class
rather than merely relocating it.

**FALLBACK (if no, playlist must stay private)**: chairman publishes the Google OAuth
consent screen to Production in Google Cloud Console (the current token's
`refresh_token_expires_in=5201s` proves Testing-mode, which silently expires refresh tokens
on a short cadence), re-consents with scope narrowed to `youtube.readonly` (down from the
current over-broad read+write `https://www.googleapis.com/auth/youtube`), and pastes the
resulting refresh_token into a named, GitHub-Environment-scoped secret
(`YOUTUBE_OAUTH_REFRESH_TOKEN`) plus `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. Code-side:
`lib/integrations/youtube/oauth-manager.js`'s `getStoredTokens()` must read the env var with
NO DB fallback (a fallback would silently re-create the exposure the parent SD's FR-3
migration closed), and `storeTokens()`'s DB write-back to `eva_sync_state.source_metadata`
must be removed entirely, not merely its read path.

Do not start either branch until the chairman answers.

## Key Changes
- Decide first, code second: obtain the chairman's playlist-visibility answer before any
  code branch is started.
- If credential-free: re-point `playlist-sync.js` to RSS/API-key read; delete the
  `oauth-manager.js` import from the sync path.
- If OAuth fallback: narrow `oauth-manager.js`'s `SCOPES` constant (line 17) to
  `youtube.readonly`; remove the DB read (`getStoredTokens()`, lines ~44-54) and DB write
  (`storeTokens()`, lines ~61-84) entirely; provision a protected GitHub Environment (this
  repo is PUBLIC with 210+ workflows and zero existing environment protection rules today —
  a bare repository secret would be readable by every one of them) and wire
  `.github/workflows/eva-idea-sync-cron.yml` with `environment: <name>` plus the new secret
  env vars.
- Execute the cutover in this exact order (load-bearing, per the parent SD's SECURITY
  sub-agent finding — never combine a re-mint, a DB-column null-out, and an old-token
  revocation in one step):
  1. Resolve the credential-architecture decision (this SD's own Phase 1).
  2. If OAuth fallback: publish the consent screen, re-mint with `youtube.readonly`, load
     the named secret(s).
  3. Verify via a `workflow_dispatch` run of `eva-idea-sync-cron.yml` that ROW DELTAS
     actually occurred in `eva_youtube_intake` (query row counts before/after — a green exit
     code alone is not evidence; the sibling workflow `youtube-subscription-digest.yml`
     already demonstrates a job can report success while holding a nonexistent credential).
  4. Revoke the OLD refresh token at Google (`POST https://oauth2.googleapis.com/revoke`) —
     this was already escalated separately as an urgent action during the parent SD and may
     already be done by the time this SD is worked; re-verify rather than assume.
  5. Null `eva_sync_state.source_metadata` for the `youtube_oauth` row (OAuth-fallback path
     only) and confirm `oauth-manager.js`'s `storeTokens()` no longer writes to it.

## Risks
- The chairman may not answer promptly — this SD should sit as a normal DRAFT-status queue
  item (workable, not hard-blocked), but its actual LEAD/PLAN work cannot meaningfully start
  until the decision lands. Check for an existing answer before re-asking (search
  `session_coordination`/`feedback` for prior signals referencing this SD's parent,
  SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001, and the playlist-visibility question).
- Combining the re-mint, DB null-out, and old-token revocation into a single step would risk
  a window where either no valid credential exists (if revocation races ahead of re-mint) or
  the plaintext-DB-exposure class re-appears (if the DB write-back removal is skipped). Keep
  the 5-step sequencing above strictly ordered.
- If the OAuth fallback path is chosen, forgetting to scope the new secret(s) to a protected
  GitHub Environment (rather than a bare repository secret) would leave the new credential
  readable by all 210+ other workflows in this public repo — TR-2 from the parent SD.

## Success Criteria
- A decision (RSS/credential-free vs OAuth fallback) is recorded with the chairman's literal
  answer to the playlist-visibility question, stated in one sentence, not inferred from code.
- The YouTube step of `eva-idea-sync-cron.yml`'s workflow run log shows a real pull (item
  count), not a credential/auth error.
- If OAuth fallback: `oauth-manager.js` contains zero code paths that read or write a token
  pair to `eva_sync_state.source_metadata`, and the granted scope is `youtube.readonly`, not
  the prior full `youtube` scope.
- The old, previously-exposed refresh token is confirmed revoked at Google (`invalid_grant`
  on an attempted use) — this is an inherently manual, chairman-performed verification step,
  not owed as an automated test in any coverage gate.
- Step 3's verification queries `eva_youtube_intake` row counts before and after the
  `workflow_dispatch` run, not just the workflow's exit status.

## Files
- lib/integrations/youtube/playlist-sync.js (re-point to credential-free read, preferred path)
- lib/integrations/youtube/oauth-manager.js (fallback path only: SCOPES, getStoredTokens, storeTokens)
- .github/workflows/eva-idea-sync-cron.yml (fallback path only: environment: + secret env wiring)
