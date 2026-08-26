#!/usr/bin/env node
/**
 * User stories for SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001.
 *
 * One story per PRD functional requirement (FR-1..FR-5), plus US-006 covering the
 * PRD's top-level acceptance criterion #2 (review-queue-only regression), which no
 * single FR owns.
 *
 * Every story carries a populated implementation_context (JSON string with
 * technical_approach / files_to_create / files_to_modify / dependencies /
 * estimated_effort / implementation_guidance) -- the BMAD gate
 * (scripts/modules/bmad-validation.js:116-121) requires >=80% coverage and reads the
 * column as TEXT with a length>50 check.
 *
 * sd_type='feature' => STRICT AI rubric path
 * (scripts/modules/user-story-quality-validation.js:160-170), so each story includes at
 * least one human-verifiable acceptance criterion. The named human-inspectability
 * surface for this SD is the `npm run eva:ideas:status` CLI (PRD Q7).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001';
const SD_UUID = '42bfd675-9169-4eff-8f2d-84f74dd9e021';
const PRD_ID = `PRD-${SD_KEY}`;

const stories = [
  // ────────────────────────────────────────────────────────────────────────────
  {
    n: 1,
    fr: 'FR-1',
    title: 'Schedule the eva-idea-sync pull via a new hourly GitHub Actions cron (YouTube + Todoist "For Processing")',
    user_role: 'Chairman reviewing the ideation queue',
    user_want:
      'the YouTube/Todoist idea pull that today only runs when someone types `npm run eva:ideas:sync` to instead run itself on an hourly schedule, offset ahead of the existing :17 estate-disposition drain',
    user_benefit:
      'ideas the chairman saves to the "For Processing" Todoist project or the YouTube playlist land in the review queue within the hour instead of sitting unseen — the watermark has been frozen at 2026-07-24 because nobody has run the command since',
    priority: 'critical',
    points: 3,
    depends_on: [],
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Human-verifiable: stale watermark visibly advances (PRD FR-1 AC-1)',
        given: '`npm run eva:ideas:status` currently prints a Sync State line for youtube and todoist dated 2026-07-24',
        when: 'the new workflow completes its first run (workflow_dispatch or scheduled) and the operator re-runs `npm run eva:ideas:status`',
        then: 'both the youtube/ and todoist/ Sync State lines show a timestamp from the current day — a date change any reader can see, with no code inspection required'
      },
      {
        id: 'AC-001-2',
        scenario: 'Row-delta with provenance intact (PRD FR-1 AC-2)',
        given: 'eva_youtube_intake and eva_todoist_intake row counts are captured immediately before the run',
        when: 'the workflow run finishes',
        then: 'new rows exist in both tables and each new row has its source provenance column populated (youtube_video_id / todoist_task_id non-null) — counted as a delta, never inferred from the job exit code'
      },
      {
        id: 'AC-001-3',
        scenario: 'Todoist scope stays pinned — no silent widening (PRD FR-1 AC-3 / TR-3 / TS-5)',
        given: 'the new .github/workflows/eva-idea-sync-cron.yml file',
        when: 'the YAML is searched for the string TODOIST_INTAKE_PROJECTS',
        then: 'zero matches — the workflow relies on todoist-sync.js DEFAULT_INTAKE_PROJECTS (["6gfJpjh9Ghvv8fFq"], line 22) so intake cannot widen to the "EVA Next Steps" or "EVA" projects'
      },
      {
        id: 'AC-001-4',
        scenario: 'Cron offset gives the pull a head start over the drain',
        given: '.github/workflows/estate-disposition-cron.yml runs on `17 * * * *`',
        when: "the new workflow's `schedule.cron` expression is read",
        then: 'its minute field is strictly earlier in the hour than 17 (e.g. `5 * * * *`), so the pull completes before the drain consumes the intake tables'
      }
    ],
    given_when_then: [
      {
        scenario: 'TS-1 — scheduled/manual sync run advances watermarks and inserts intake rows',
        given: 'eva_sync_state watermarks are stale and a valid credential/RSS path is configured',
        when: 'the new workflow runs (workflow_dispatch or cron)',
        then: 'eva_sync_state.last_sync_at advances for source_type=youtube and source_type=todoist, and new rows appear in eva_youtube_intake/eva_todoist_intake'
      }
    ],
    technical_notes:
      'The sync script itself is unchanged — this story only adds a trigger. Rollback is deleting the workflow file; `npm run eva:ideas:sync` remains manually runnable exactly as before.',
    implementation_context: {
      technical_approach:
        "Add a new GitHub Actions workflow that invokes `npm run eva:ideas:sync -- --source all` on an hourly schedule, offset earlier in the hour than the existing estate-disposition drain (cron '17 * * * *'). scripts/eva-idea-sync.js already parses --source (line 21, `getArg('--source') || 'all'`) and branches to todoist (line 43) and youtube (line 59), so no script change is needed. Mirror the runner setup from estate-disposition-cron.yml: runs-on ubuntu-latest, actions/setup-node with node-version '22', `npm ci --ignore-scripts`. Include workflow_dispatch so the FR-5 step-3 row-delta verification can be triggered on demand.",
      files_to_create: ['.github/workflows/eva-idea-sync-cron.yml'],
      files_to_modify: [],
      dependencies: [
        'scripts/eva-idea-sync.js (existing, unchanged — --source all entrypoint)',
        'lib/integrations/todoist/todoist-sync.js (existing, unchanged — DEFAULT_INTAKE_PROJECTS pinning)',
        'lib/integrations/youtube/playlist-sync.js (existing — its credential path is resolved by US-002/FR-2)',
        'Secrets already required by the sync: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / TODOIST_API_TOKEN'
      ],
      estimated_effort: 'small (~40 LOC of YAML, no application code)',
      implementation_guidance: [
        '## Implementation Guidance',
        '',
        '**Template**: copy the job scaffold from `.github/workflows/estate-disposition-cron.yml` (schedule at line 12-14, runs-on line 33, node-version 22 at line 47, `npm ci --ignore-scripts` at line 51).',
        '',
        '**Schedule**: use a minute strictly < 17 so the pull lands before the drain — recommend `- cron: \'5 * * * *\'`. Also add `workflow_dispatch:` for on-demand verification runs (FR-5 step 3 needs this).',
        '',
        '**Run step**: `run: npm run eva:ideas:sync -- --source all` — note the `--` is load-bearing, npm swallows the flag without it.',
        '',
        '**DO NOT set TODOIST_INTAKE_PROJECTS in `env:`.** lib/integrations/todoist/todoist-sync.js:22 already hardcodes DEFAULT_INTAKE_PROJECTS = [\'6gfJpjh9Ghvv8fFq\'] (the "For Processing" project, per chairman directive QF-20260612-416). Line 25 reads the env override; setting it in a scheduled workflow would silently widen intake scope permanently. This is TR-3 and is checked by AC-001-3.',
        '',
        '**Failure notification**: the `if: failure()` step is US-004/FR-4 — build this workflow so that step slots in cleanly (a separate job with `needs: <sync-job>` and `if: failure()`, matching gate-health-weekly.yml:148).',
        '',
        '**Verification is a row-delta, not an exit code.** A sibling workflow (youtube-subscription-digest.yml) already demonstrates a green job holding a nonexistent credential. Capture `select count(*) from eva_youtube_intake` / `eva_todoist_intake` before and after.'
      ].join('\n')
    },
    architecture_references: [
      { kind: 'workflow_template', path: '.github/workflows/estate-disposition-cron.yml', note: 'runner/node/npm-ci scaffold and the :17 cron this must be offset from' },
      { kind: 'entrypoint', path: 'scripts/eva-idea-sync.js:21', note: '--source arg parsing; :43 todoist branch, :59 youtube branch' },
      { kind: 'scope_pin', path: 'lib/integrations/todoist/todoist-sync.js:22', note: "DEFAULT_INTAKE_PROJECTS = ['6gfJpjh9Ghvv8fFq'] — do not override" },
      { kind: 'anti_pattern', path: '.github/workflows/youtube-subscription-digest.yml', note: 'green job holding a nonexistent credential — why exit code is not evidence' }
    ],
    example_code_patterns: [
      {
        label: 'schedule + dispatch block (offset ahead of the :17 drain)',
        language: 'yaml',
        code: "on:\n  schedule:\n    - cron: '5 * * * *'   # 12 min ahead of estate-disposition-cron.yml's '17 * * * *'\n  workflow_dispatch:"
      },
      {
        label: 'run step (note the load-bearing `--`)',
        language: 'yaml',
        code: '      - name: Sync ideation sources\n        run: npm run eva:ideas:sync -- --source all\n        env:\n          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}\n          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}\n          TODOIST_API_TOKEN: ${{ secrets.TODOIST_API_TOKEN }}\n          # NO TODOIST_INTAKE_PROJECTS — see TR-3'
      }
    ],
    testing_scenarios: [
      { id: 'TS-1', type: 'integration', priority: 'P0', scenario: 'Scheduled/manual sync run advances watermarks and inserts intake rows' },
      { id: 'TS-5', type: 'integration', priority: 'P1', scenario: "Todoist scope stays pinned to 'For Processing' (6gfJpjh9Ghvv8fFq)" }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    n: 2,
    fr: 'FR-2',
    title: 'Resolve the YouTube credential architecture: prefer the credential-free RSS/API-key path, fall back to a readonly-scoped named secret',
    user_role: 'Chairman (sole custodian of the Google account)',
    user_want:
      'a single yes/no decision — "can the For Processing playlist be unlisted?" — to determine whether the YouTube pull needs any secret at all, and if it does, for that secret to be a narrowly-scoped one I mint once into a named GitHub Environment secret rather than a plaintext token sitting in a database column',
    user_benefit:
      'if the playlist can be unlisted, the chairman never has to touch an OAuth consent screen again and there is no token to rotate, leak, or expire; if it cannot, the token that exists is read-only rather than the current account-takeover-grade read+write scope',
    priority: 'critical',
    points: 5,
    depends_on: [],
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Human-verifiable: the decision is written down with the chairman\'s answer (PRD FR-2 AC-1)',
        given: 'the open question "can the \'For Processing\' YouTube playlist be made unlisted?"',
        when: 'a reader opens the PR description (or the SD decision record)',
        then: 'they see the chairman\'s literal yes/no answer and which of the two named paths was taken — "credential-free RSS/API-key" or "OAuth fallback" — stated in one sentence, not inferred from code'
      },
      {
        id: 'AC-002-2',
        scenario: 'Human-verifiable: the YouTube step reports a pull, not a credential error',
        given: 'the chosen path has been wired up',
        when: 'a reader opens the eva-idea-sync workflow run page on GitHub and expands the sync step',
        then: 'the YouTube section of the log shows a count of items pulled, not an auth/credential error line'
      },
      {
        id: 'AC-002-3',
        scenario: 'OAuth fallback only: no token pair reaches any DB column (PRD FR-2 AC-2)',
        given: 'the OAuth fallback path was chosen',
        when: 'lib/integrations/youtube/oauth-manager.js is searched for eva_sync_state and source_metadata',
        then: 'zero matches remain — getStoredTokens() (currently :44-54) reads only the env var with NO DB fallback, and storeTokens() (currently :61-84) has its DB write removed entirely, not merely its read path'
      },
      {
        id: 'AC-002-4',
        scenario: 'OAuth fallback only: scope is narrowed to readonly (PRD FR-2 AC-3)',
        given: 'the OAuth fallback path was chosen',
        when: 'the SCOPES constant at lib/integrations/youtube/oauth-manager.js:17 is read',
        then: "it is ['https://www.googleapis.com/auth/youtube.readonly'], not the current read+write 'https://www.googleapis.com/auth/youtube'"
      },
      {
        id: 'AC-002-5',
        scenario: 'OAuth fallback only: secret is Environment-scoped, not repo-wide (TR-2)',
        given: 'this repository is PUBLIC with 210+ workflows and zero existing environment protection rules',
        when: 'the new secret YOUTUBE_OAUTH_REFRESH_TOKEN (plus GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) is provisioned',
        then: 'it is attached to a protected GitHub Environment that the sync workflow names via `environment:`, so it is not readable by every other workflow in the repo'
      }
    ],
    given_when_then: [
      {
        scenario: 'TS-2 — circuit breaker surfaces a bad credential instead of silently no-op-ing',
        given: 'the YouTube credential is invalid or revoked',
        when: 'the sync runs 3 consecutive times',
        then: "eva_sync_state.consecutive_failures reaches 3, the circuit opens, and the workflow's if: failure() step fires — it does not silently succeed"
      }
    ],
    technical_notes:
      'This story is decision-gated on a human action outside EXEC control. Per the PRD risk register, if the chairman has not answered by EXEC completion, ship the credential-read wiring ARMED (G3 Definition-of-Done Activation Amendment) with a runbook naming the exact decision and the exact secrets to mint — do NOT fabricate a witness against a revoked or expired credential.',
    implementation_context: {
      technical_approach:
        "Two mutually exclusive branches. PREFERRED: if the chairman confirms the 'For Processing' playlist can be unlisted, re-point lib/integrations/youtube/playlist-sync.js at a credential-free read — either the public RSS feed pattern already running green in production in lib/integrations/youtube/subscription-scanner.js (https://www.youtube.com/feeds/videos.xml?...), or a plain YOUTUBE_API_KEY playlistItems.list call — and delete the oauth-manager.js dependency from the sync path entirely. FALLBACK (only if the playlist must stay private): chairman publishes the Google consent screen to Production (the current token's refresh_token_expires_in=5201s proves Testing mode, which silently expires refresh tokens), re-consents with scope narrowed to youtube.readonly, and pastes the refresh_token into an Environment-scoped GH secret. Then rewrite oauth-manager.js getStoredTokens() to read process.env.YOUTUBE_OAUTH_REFRESH_TOKEN with NO DB fallback, and delete storeTokens()'s DB write-back outright.",
      files_to_create: [
        'docs runbook or PR-description decision record naming the chosen path (no code file if the RSS path is chosen)'
      ],
      files_to_modify: [
        'lib/integrations/youtube/playlist-sync.js (preferred path: re-point to credential-free read)',
        'lib/integrations/youtube/oauth-manager.js (fallback path only: SCOPES line 17, getStoredTokens lines 44-54, storeTokens lines 61-84)',
        '.github/workflows/eva-idea-sync-cron.yml (fallback path only: add `environment:` + secret env wiring)'
      ],
      dependencies: [
        'BLOCKING HUMAN ACTION: chairman answers the playlist-visibility question',
        'lib/integrations/youtube/subscription-scanner.js (existing zero-credential RSS precedent to copy from)',
        'US-001 (the workflow this credential is consumed by)',
        'TR-2 (GitHub Environment must exist before the fallback secret can be scoped to it)'
      ],
      estimated_effort:
        'small if the RSS/credential-free path is chosen (~30 LOC); medium if the OAuth fallback is required (~60 LOC plus chairman-side Google Cloud Console work)',
      implementation_guidance: [
        '## Implementation Guidance',
        '',
        '### Decide first, code second',
        'Do not start either branch until the chairman answers. Ask exactly: *"Can the \'For Processing\' YouTube playlist be switched from Private to Unlisted?"* Unlisted is sufficient for both the RSS feed and a plain API-key `playlistItems.list` read; Private is not.',
        '',
        '### PREFERRED path — eliminate the credential',
        'Copy the fetch/parse shape from `lib/integrations/youtube/subscription-scanner.js`, which runs green daily in production against `https://www.youtube.com/feeds/videos.xml?channel_id=...` with zero credentials. For a playlist the equivalent is `?playlist_id=<id>`. If RSS proves too thin (it caps at ~15 items and omits some metadata), use `GET https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=<id>&key=$YOUTUBE_API_KEY` — an API key is a quota token, not an account credential, and carries none of the custody burden of a refresh token.',
        'When this path is taken, remove the oauth-manager import from the sync path so the OAuth code cannot be reached at all.',
        '',
        '### FALLBACK path — narrow and relocate the credential',
        'Chairman-side, in order: (1) publish the OAuth consent screen to **Production** in Google Cloud Console — the current token reports `refresh_token_expires_in=5201s`, which is the Testing-mode signature and means the token silently dies on a short cadence; (2) re-consent with the narrowed scope; (3) paste the resulting refresh_token into the Environment-scoped secret.',
        '',
        'Code-side, in `lib/integrations/youtube/oauth-manager.js`:',
        '- Line 17: `const SCOPES = [\'https://www.googleapis.com/auth/youtube.readonly\'];` (was the read+write `.../auth/youtube`, which is account-takeover-grade).',
        '- `getStoredTokens()` (lines 44-54): return the env-var token only. **No DB fallback.** A fallback silently re-creates today\'s exposure the moment the env var is unset — that is the whole point of AC-002-3.',
        '- `storeTokens()` (lines 61-84): delete the `eva_sync_state` update/insert entirely. Removing only the read path leaves the write path re-populating the plaintext column.',
        '- Also check the call sites at lines 99, 106, 126 and 180 — line 180 (`await storeTokens(tokens)`) is inside the interactive `runOAuthFlow`, which becomes a no-op / print-the-token-for-manual-paste flow.',
        '',
        '**Secret custody (TR-2)**: this repo is PUBLIC with 210+ workflows and no environment protection rules today. A bare repository secret is readable by every one of those workflows. Create a protected Environment and reference it with `environment: <name>` on the sync job. `GOOGLE_SERVICE_ACCOUNT_JSON` cannot substitute — a service account cannot refresh a user-consent token.',
        '',
        '### If the chairman has not answered by EXEC completion',
        'Ship ARMED per the PRD risk register: wire the credential read, register the workflow, and write the runbook naming the decision and the exact secret names. Do not fabricate a green witness against a dead credential.'
      ].join('\n')
    },
    architecture_references: [
      { kind: 'zero_credential_precedent', path: 'lib/integrations/youtube/subscription-scanner.js', note: 'public RSS ingestion running green in production daily — the pattern to copy for the preferred path' },
      { kind: 'target', path: 'lib/integrations/youtube/oauth-manager.js:17', note: "SCOPES — currently the over-broad read+write 'https://www.googleapis.com/auth/youtube'" },
      { kind: 'target', path: 'lib/integrations/youtube/oauth-manager.js:44-54', note: 'getStoredTokens() reads eva_sync_state.source_metadata.tokens — the DB read to remove' },
      { kind: 'target', path: 'lib/integrations/youtube/oauth-manager.js:61-84', note: 'storeTokens() writes the token pair back to eva_sync_state.source_metadata — the DB write to remove entirely' },
      { kind: 'consumer', path: 'lib/integrations/youtube/playlist-sync.js', note: 'the caller to be re-pointed if the credential-free path is chosen' }
    ],
    example_code_patterns: [
      {
        label: 'preferred path — credential-free playlist RSS read',
        language: 'javascript',
        code: "// Same shape as subscription-scanner.js's channel feed, with playlist_id\nconst res = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST_ID}`);\nconst xml = await res.text(); // no credential, no token, nothing to rotate"
      },
      {
        label: 'fallback path — env-only token read, NO DB fallback',
        language: 'javascript',
        code: "export async function getStoredTokens() {\n  const refresh_token = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;\n  if (!refresh_token) return null;   // fail closed\n  return { refresh_token };\n  // NOTE: deliberately no eva_sync_state fallback — a fallback silently\n  // re-creates the plaintext-credential exposure the moment the env is unset.\n}"
      },
      {
        label: 'fallback path — Environment-scoped secret (TR-2)',
        language: 'yaml',
        code: 'jobs:\n  sync:\n    runs-on: ubuntu-latest\n    environment: youtube-ingestion   # protected env, NOT a repo-wide secret\n    env:\n      YOUTUBE_OAUTH_REFRESH_TOKEN: ${{ secrets.YOUTUBE_OAUTH_REFRESH_TOKEN }}'
      }
    ],
    testing_scenarios: [
      { id: 'TS-2', type: 'integration', priority: 'P0', scenario: 'Circuit breaker surfaces a bad credential instead of silently no-op-ing' },
      { id: 'TS-6', type: 'security', priority: 'P0', scenario: 'Old exposed refresh token is confirmed revoked (invalid_grant / 400 from Google)' }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    n: 3,
    fr: 'FR-3',
    title: 'Drop select_eva_sync_state and revoke all anon/authenticated grants on eva_sync_state (live plaintext-credential exposure)',
    user_role: 'Chairman / anyone whose Google account is behind the stored token',
    user_want:
      'the eva_sync_state table to stop being readable by any holder of an authenticated JWT, and to stop being writable/truncatable by anon',
    user_benefit:
      'the plaintext YouTube OAuth token pair sitting in eva_sync_state.source_metadata today is reachable right now by any authenticated user — SECURITY confirmed it with a live anon-key HTTP GET returning 200; this closes an active credential leak rather than a theoretical one',
    priority: 'critical',
    points: 3,
    depends_on: [],
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Human-verifiable: the token stops being visible to a non-privileged reader',
        given: 'a one-line anon-key query against eva_sync_state that today prints a visible refresh_token string',
        when: 'a person runs that same command after the migration is applied',
        then: 'they see 0 rows / permission denied where the token text used to be printed — the secret visibly disappears from the screen'
      },
      {
        id: 'AC-003-2',
        scenario: 'Migration contains both halves (PRD FR-3 AC-1)',
        given: 'the new migration file under database/migrations/',
        when: 'it is read',
        then: 'it contains BOTH `DROP POLICY ... select_eva_sync_state ON public.eva_sync_state` AND `REVOKE ALL ON public.eva_sync_state FROM anon, authenticated` — the REVOKE is required because anon/authenticated hold INSERT/UPDATE/DELETE/TRUNCATE via a pg_default_acl grant, and TRUNCATE is not RLS-gated at all'
      },
      {
        id: 'AC-003-3',
        scenario: 'Post-migration anon read returns nothing (PRD FR-3 AC-2 / TS-3)',
        given: 'the migration has been applied',
        when: 'an anon-key Supabase client SELECTs from eva_sync_state',
        then: 'the result is 0 rows or a permission-denied error — not the current RLS-filtered-but-readable state that returns 200 with rows'
      },
      {
        id: 'AC-003-4',
        scenario: 'All 5 service-role callers still work (PRD FR-3 AC-3)',
        given: 'oauth-manager.js, playlist-sync.js, todoist-sync.js, release-monitor.js and eva-idea-status.js all already use createSupabaseServiceClient() (TR-1)',
        when: 'each is exercised after the migration',
        then: 'every one behaves identically to before — service_role bypasses RLS, so the lockdown is caller-transparent'
      },
      {
        id: 'AC-003-5',
        scenario: 'Systemic pg_default_acl defect is flagged, not silently absorbed',
        given: 'the same pg_default_acl misconfiguration affects ALL public-schema tables, not just this one',
        when: 'the migration is reviewed',
        then: 'it touches only public.eva_sync_state (zero schema-wide ALTER DEFAULT PRIVILEGES statements) and the systemic defect is recorded as a follow-up SD rather than fixed here'
      }
    ],
    given_when_then: [
      {
        scenario: 'TS-3 — RLS lockdown blocks anon/authenticated read of eva_sync_state',
        given: 'the FR-3 migration has been applied',
        when: 'an anon-key or authenticated-key Supabase client queries eva_sync_state',
        then: 'the query returns 0 rows / permission denied, not the current RLS-filtered-but-readable plaintext-token state'
      }
    ],
    technical_notes:
      'Ships FIRST and independently of the FR-2 credential decision (PRD implementation_approach Phase 1) — it closes the live read exposure regardless of which YouTube credential path is ultimately chosen. Rollback is a DOWN migration re-creating the policy and grants, but rolling back re-opens the exposure and should require an explicit decision.',
    implementation_context: {
      technical_approach:
        'Author a forward migration under database/migrations/ that (a) DROPs the policy `select_eva_sync_state` on public.eva_sync_state — SECURITY confirmed via live pg_policies that it grants role=authenticated SELECT with qual=true — and (b) REVOKEs ALL on public.eva_sync_state FROM anon, authenticated, because those roles additionally hold INSERT/UPDATE/DELETE/TRUNCATE through a systemic pg_default_acl grant and TRUNCATE is never RLS-gated. Keep RLS enabled on the table. This is safe because all five real callers already go through createSupabaseServiceClient(), which uses service_role and bypasses RLS (TR-1). Verify with a real anon-key client, not by re-reading the DDL.',
      files_to_create: [
        'database/migrations/<YYYYMMDD>_eva_sync_state_rls_lockdown.sql',
        'a verification script (or documented one-liner) that performs a live anon-key SELECT and asserts 0 rows'
      ],
      files_to_modify: [],
      dependencies: [
        'None — deliberately independent of FR-2; this is Phase 1 and ships first',
        'TR-1 (all callers must remain on createSupabaseServiceClient())'
      ],
      estimated_effort: 'small (~15 lines of SQL plus a verification script)',
      implementation_guidance: [
        '## Implementation Guidance',
        '',
        '**File**: `database/migrations/<YYYYMMDD>_eva_sync_state_rls_lockdown.sql`.',
        '',
        '**Both halves are required.** Dropping the policy alone is insufficient: `anon` and `authenticated` also hold INSERT/UPDATE/DELETE/**TRUNCATE** on this table via a `pg_default_acl` grant, and TRUNCATE is not RLS-gated at all — a policy drop would leave a live destructive path open.',
        '',
        '**Keep RLS turned on.** Do not use the ALTER TABLE row-level-security-off statement as a shortcut; with RLS on and no policies, non-privileged roles get zero rows, which is exactly the target state.',
        '',
        '**Verify with an actual anon-key client, not by re-reading the SQL.** The pre-state was established with a real anon-key HTTP GET returning 200 with rows; the post-state must be established the same way. Reading the migration file proves what was written, not what the database enforces.',
        '',
        '**Out of scope — flag, do not fix**: the underlying `pg_default_acl` misconfiguration grants these privileges by default on *every* public-schema table. Fixing schema-wide default privileges is a higher-blast-radius change needing its own SD and a per-table review. This migration must contain zero `ALTER DEFAULT PRIVILEGES` statements (AC-003-5). Record the systemic finding as a follow-up.',
        '',
        '**Caller regression check (AC-003-4)**: the five callers are `lib/integrations/youtube/oauth-manager.js`, `lib/integrations/youtube/playlist-sync.js`, `lib/integrations/todoist/todoist-sync.js`, `release-monitor.js`, and `scripts/eva-idea-status.js`. All already use `createSupabaseServiceClient()`. Confirm by grep before applying — if any one of them is on an anon/authenticated client, it will start failing silently after the revoke.'
      ].join('\n')
    },
    architecture_references: [
      { kind: 'target_table', path: 'public.eva_sync_state', note: 'holds the plaintext OAuth token pair in source_metadata.tokens' },
      { kind: 'policy_to_drop', path: 'pg_policies: select_eva_sync_state', note: 'role=authenticated, cmd=SELECT, qual=true — confirmed live by SECURITY' },
      { kind: 'caller', path: 'lib/integrations/youtube/oauth-manager.js:48', note: 'service-role reader — must still work post-revoke' },
      { kind: 'caller', path: 'scripts/eva-idea-status.js:74-77', note: 'service-role reader — also the FR-4 target' },
      { kind: 'out_of_scope', path: 'pg_default_acl (schema-wide)', note: 'systemic grant misconfiguration affecting all public tables — follow-up SD, not this one' }
    ],
    example_code_patterns: [
      {
        label: 'the migration (both halves)',
        language: 'sql',
        code: "BEGIN;\nSET LOCAL lock_timeout = '5s';\n\nDROP POLICY IF EXISTS select_eva_sync_state ON public.eva_sync_state;\n\n-- Required: anon/authenticated also hold INSERT/UPDATE/DELETE/TRUNCATE via\n-- pg_default_acl, and TRUNCATE is not RLS-gated at all.\nREVOKE ALL ON public.eva_sync_state FROM anon, authenticated;\n\n-- RLS stays ENABLED: no policies + no grants => zero rows for those roles.\nNOTIFY pgrst, 'reload schema';\nCOMMIT;"
      },
      {
        label: 'live anon-key verification (the actual acceptance evidence)',
        language: 'javascript',
        code: "const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);\nconst { data, error } = await anon.from('eva_sync_state').select('source_metadata');\n// PASS: data is [] or error is a permission denial.\n// FAIL: data contains any row (today this prints the refresh_token in cleartext)."
      }
    ],
    testing_scenarios: [
      { id: 'TS-3', type: 'security', priority: 'P0', scenario: 'RLS lockdown blocks anon/authenticated read of eva_sync_state' },
      { id: 'TS-3b', type: 'regression', priority: 'P0', scenario: 'All 5 service-role callers unchanged post-migration' }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    n: 4,
    fr: 'FR-4',
    title: 'Stop eva-idea-status.js lying-empty about the sync watermark, and make the new cron announce its own failures',
    user_role: 'Operator checking whether ideation ingestion is alive',
    user_want:
      'the status CLI to say "query failed" when its eva_sync_state read fails instead of printing the same "No sync history" it prints for a genuinely empty table, and the new cron to fire a visible failure notification instead of dying quietly',
    user_benefit:
      'the one surface a human can use to check this pipeline (there is no dashboard for these tables in either repo) currently cannot distinguish "nothing synced" from "I could not look" — and an unattended cron holding a dead credential opens its circuit breaker after 3 failures with nobody told',
    priority: 'high',
    points: 2,
    depends_on: [`${SD_KEY}:US-001`],
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Human-verifiable: the two failure modes print differently (PRD FR-4 AC-1 / TS-4)',
        given: 'the eva_sync_state read is forced to fail (simulated network error or malformed query)',
        when: 'a person runs `npm run eva:ideas:status` and reads the "Sync State:" section',
        then: 'they see an explicit error/"unavailable" line — visibly different text from the "No sync history" line that a genuinely empty table produces'
      },
      {
        id: 'AC-004-2',
        scenario: 'The fix matches the guard the same file already uses for its other two queries',
        given: 'scripts/eva-idea-status.js already guards its todoist (lines 31-36) and youtube (lines 54-59) queries with a `<x>Failed` flag set in a .catch()',
        when: 'the eva_sync_state read at lines 74-77 is fixed',
        then: 'it uses the same in-file pattern — a captured failure flag rendered distinctly — rather than a third, inconsistent style'
      },
      {
        id: 'AC-004-3',
        scenario: 'Human-verifiable: a failed cron run announces itself (PRD FR-4 AC-2)',
        given: 'the new eva-idea-sync workflow fails (e.g. a dead YouTube credential)',
        when: 'a person opens the repository on GitHub',
        then: 'they find a failure notification created by an `if: failure()` step — following the existing pattern at .github/workflows/gate-health-weekly.yml:148-156 — rather than having to notice a red run themselves'
      },
      {
        id: 'AC-004-4',
        scenario: 'A healthy run stays quiet',
        given: 'a successful scheduled sync run',
        when: 'the workflow completes',
        then: 'the `if: failure()` step does not execute and no notification/issue is created — the alert stays meaningful'
      }
    ],
    given_when_then: [
      {
        scenario: 'TS-4 — eva-idea-status.js distinguishes a query error from a genuinely empty sync history',
        given: 'the eva_sync_state query is made to fail (e.g. simulated network error or malformed query)',
        when: '`npm run eva:ideas:status` is run',
        then: "the CLI reports an explicit error, not the same 'No sync history' message it prints for a real empty table"
      }
    ],
    technical_notes:
      'This is the Q7 human-inspectability surface for the whole SD — confirmed that no dashboard or UI exists for eva_sync_state / eva_*_intake in either repo. A status CLI that can lie-empty about the very watermark this SD schedules would make the rest of the SD unverifiable by a human.',
    implementation_context: {
      technical_approach:
        "Two independent, small changes. (1) scripts/eva-idea-status.js line 74 currently destructures only `const { data: syncState } = await supabase.from('eva_sync_state')...`, silently discarding `error`; a failed read then falls to the `else` branch and prints 'No sync history' — identical to a real empty table. Fix it using the exact guard the same file already applies to its other two queries (todoist at lines 31-36, youtube at lines 54-59): a `syncStateFailed` boolean set in a `.catch()`, rendered as a distinct 'unavailable / query error' line. (2) Add a failure-notification job to the new eva-idea-sync-cron.yml gated on `if: failure()`, copying the shape from .github/workflows/gate-health-weekly.yml:148-156 (actions/github-script@v7 creating an issue).",
      files_to_create: [],
      files_to_modify: [
        'scripts/eva-idea-status.js (lines 74-90 — the eva_sync_state read and its render block)',
        '.github/workflows/eva-idea-sync-cron.yml (add the if: failure() notification job — file created by US-001)'
      ],
      dependencies: [
        'US-001 / FR-1 — the workflow file must exist before the failure step can be added to it',
        '.github/workflows/gate-health-weekly.yml (existing if: failure() pattern to copy; 10 workflows already use it)'
      ],
      estimated_effort: 'small (~10 LOC in the CLI, ~15 lines of YAML)',
      implementation_guidance: [
        '## Implementation Guidance',
        '',
        '### Part 1 — scripts/eva-idea-status.js (the swallowed error)',
        'Line 74 today:',
        '```js',
        'const { data: syncState } = await supabase',
        "  .from('eva_sync_state')",
        "  .select('source_type, source_identifier, last_sync_at, total_synced, consecutive_failures')",
        "  .order('source_type');",
        '```',
        'The `error` is discarded. On failure `syncState` is undefined, the `if (syncState?.length)` at line 81 is falsy, and the CLI prints `No sync history` at line 89 — byte-identical to the genuinely-empty case.',
        '',
        '**Use the guard the file already has.** Lines 31-36 and 54-59 establish the in-file idiom: a `let <x>Failed = false;` flag set inside `.catch(() => { <x>Failed = true; return []; })`, then rendered as `${<x>Failed ? \'unavailable\' : ...}` (lines 45, 67). Mirror it — do not invent a third style, and do not just print the raw error object.',
        '',
        'Three render states must be distinguishable to a reader: **failed** ("unavailable — query error: <msg>"), **empty** ("No sync history"), and **populated** (the per-source lines). Two of those collapse into one today.',
        '',
        '### Part 2 — .github/workflows/eva-idea-sync-cron.yml (the silent cron)',
        'Copy the pattern from `.github/workflows/gate-health-weekly.yml:148-156`: a separate job with `if: failure()` and `needs: <sync-job>`, using `actions/github-script@v7` to open an issue. Ten workflows in this repo already use `if: failure()`, so match one rather than inventing a channel.',
        '',
        'This matters because the circuit breaker opens after `consecutive_failures` reaches 3 (TS-2) and today nothing announces that. A dead credential under an unattended hourly cron would otherwise be invisible until someone happened to run the status CLI — which, until Part 1 lands, would itself print "No sync history".'
      ].join('\n')
    },
    architecture_references: [
      { kind: 'defect_site', path: 'scripts/eva-idea-status.js:74-77', note: 'destructures only `data: syncState`, discarding `error`' },
      { kind: 'in_file_pattern', path: 'scripts/eva-idea-status.js:31-36,45', note: 'todoistFailed guard + `unavailable` render — the idiom to mirror' },
      { kind: 'in_file_pattern', path: 'scripts/eva-idea-status.js:54-59,67', note: 'youtubeFailed guard — same idiom' },
      { kind: 'lie_empty_site', path: 'scripts/eva-idea-status.js:89', note: "prints 'No sync history' for BOTH a failed read and an empty table" },
      { kind: 'workflow_pattern', path: '.github/workflows/gate-health-weekly.yml:148-156', note: 'if: failure() + actions/github-script@v7 issue creation' }
    ],
    example_code_patterns: [
      {
        label: 'CLI fix — mirror the existing todoistFailed/youtubeFailed guard',
        language: 'javascript',
        code: "let syncStateFailed = false;\nlet syncStateError = null;\nconst syncState = await supabase\n  .from('eva_sync_state')\n  .select('source_type, source_identifier, last_sync_at, total_synced, consecutive_failures')\n  .order('source_type')\n  .then(({ data, error }) => {\n    if (error) { syncStateFailed = true; syncStateError = error.message; return []; }\n    return data || [];\n  })\n  .catch((e) => { syncStateFailed = true; syncStateError = e.message; return []; });\n\nconsole.log('  Sync State:');\nif (syncStateFailed) {\n  console.log(`    unavailable (query error: ${syncStateError})`);\n} else if (syncState.length) {\n  /* existing per-source render, unchanged */\n} else {\n  console.log('    No sync history');\n}"
      },
      {
        label: 'workflow failure notification (gate-health-weekly.yml shape)',
        language: 'yaml',
        code: "  notify-failure:\n    needs: sync\n    if: failure()\n    runs-on: ubuntu-latest\n    steps:\n      - name: Create failure issue\n        uses: actions/github-script@v7\n        with:\n          script: |\n            await github.rest.issues.create({\n              owner: context.repo.owner,\n              repo: context.repo.repo,\n              title: 'eva-idea-sync cron failed',\n              body: `Run: ${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`\n            });"
      }
    ],
    testing_scenarios: [
      { id: 'TS-4', type: 'unit', priority: 'P0', scenario: 'eva-idea-status.js distinguishes a query error from a genuinely empty sync history' },
      { id: 'TS-2', type: 'integration', priority: 'P1', scenario: 'if: failure() step fires on a credential failure instead of the run dying quietly' }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    n: 5,
    fr: 'FR-5',
    title: 'Execute the credential cutover in five separate, ordered steps — verify by row-delta before revoking or nulling anything',
    user_role: 'EXEC implementer performing the cutover',
    user_want:
      'the re-mint, the row-delta verification, the old-token revocation and the DB-column null-out to happen as five distinct, ordered steps that are written down in the PR, never bundled into one change',
    user_benefit:
      'if the new credential turns out not to work, the old one is still live and the pipeline keeps running — bundling the steps means a bad re-mint takes down ingestion with no way back, and a green exit code alone would hide it (youtube-subscription-digest.yml already proves a job can report success holding a nonexistent credential)',
    priority: 'high',
    points: 2,
    depends_on: [`${SD_KEY}:US-002`],
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'Human-verifiable: the order is written down where a reviewer will see it (PRD FR-5 AC-1)',
        given: 'the EXEC PR for this SD',
        when: 'a reader opens the PR description',
        then: 'they see a numbered 5-step list in exactly this order — (1) resolve the FR-2 decision, (2) publish consent screen + re-mint at youtube.readonly + load the named secret, (3) verify by row-delta, (4) revoke the OLD refresh token at Google, (5) null eva_sync_state.source_metadata for the youtube_oauth row — with step 4 marked as an independently-escalated chairman action that does not wait for EXEC'
      },
      {
        id: 'AC-005-2',
        scenario: 'Human-verifiable: verification is two numbers, not a green checkmark (PRD FR-5 AC-2)',
        given: 'the step-3 verification evidence',
        when: 'a reader looks at it',
        then: 'they see before/after row counts for eva_youtube_intake and eva_todoist_intake presented as a delta (e.g. "eva_youtube_intake: 412 -> 418"), not a workflow exit status or a green check'
      },
      {
        id: 'AC-005-3',
        scenario: 'Step 4 does not precede step 3',
        given: 'the cutover timeline',
        when: 'the old refresh token is revoked at Google',
        then: 'the step-3 row-delta evidence already exists and is non-zero — the old credential is never revoked on the strength of an unverified new one'
      },
      {
        id: 'AC-005-4',
        scenario: 'Step 5 is conditional and last',
        given: 'the OAuth fallback path was NOT taken (the credential-free RSS/API-key path was chosen)',
        when: 'the cutover runs',
        then: 'step 5 is explicitly recorded as not-applicable rather than silently skipped; and where it IS applicable, eva_sync_state.source_metadata is nulled only after storeTokens() has been confirmed to no longer write to it'
      },
      {
        id: 'AC-005-5',
        scenario: 'Revocation of the old token is confirmed, not assumed (TS-6)',
        given: 'the chairman has POSTed the old refresh token to https://oauth2.googleapis.com/revoke',
        when: 'an attempt is made to mint a new access token with that old token',
        then: 'Google returns invalid_grant / 400 — the revocation is proven by a failed use, not by the revoke endpoint returning 200'
      }
    ],
    given_when_then: [
      {
        scenario: 'TS-6 — old exposed refresh token is confirmed revoked',
        given: 'the chairman has revoked the previously-exposed refresh token at Google',
        when: 'an attempt is made to use the old token to mint a new access token',
        then: 'Google returns invalid_grant / 400, confirming the token can no longer be used'
      }
    ],
    technical_notes:
      'Step 4 (revoking the old, already-exposed token) is escalated separately as an urgent independent action and must NOT wait for EXEC completion — but it also must not run before step 3 produces its row-delta. Those two constraints are compatible: escalate now, execute after step 3.',
    implementation_context: {
      technical_approach:
        "Process/sequencing story, not a code change. Encode the exact 5-step order in the PR description and in the runbook, and produce two artefacts: a before/after row-count delta for eva_youtube_intake and eva_todoist_intake (step 3), and a failed-use proof for the old refresh token (step 4, TS-6). The load-bearing constraint from SECURITY is that a re-mint, a DB-column null-out and an old-token revocation must never be combined into one change — each step must be independently reversible, and the old credential must remain live until the new path is proven by actual rows. A green exit code is explicitly not accepted as evidence for step 3.",
      files_to_create: [
        'a row-delta verification script or documented query pair (before/after counts on both intake tables)',
        'runbook / PR-description section stating the 5-step order'
      ],
      files_to_modify: [
        'PR description for the EXEC PR (must contain the numbered 5-step list — this is AC-005-1)'
      ],
      dependencies: [
        'US-002 / FR-2 — the credential decision determines whether steps 2 and 5 apply at all',
        'US-001 / FR-1 — workflow_dispatch on the new workflow is what step 3 triggers',
        'BLOCKING HUMAN ACTION: chairman performs the Google-side revoke in step 4'
      ],
      estimated_effort: 'small (~30 LOC of verification script plus documentation; no application code)',
      implementation_guidance: [
        '## Implementation Guidance',
        '',
        '### The order (verbatim — AC-005-1 checks for exactly this)',
        '1. Resolve the FR-2 credential-architecture decision (chairman answers the playlist-visibility question).',
        '2. **If and only if** the OAuth fallback is used: publish the Google consent screen to Production, re-mint with scope `youtube.readonly`, load the named Environment-scoped secret(s).',
        '3. Trigger a `workflow_dispatch` run and verify **row deltas** in `eva_youtube_intake` / `eva_todoist_intake`.',
        '4. Revoke the OLD refresh token at Google (`POST https://oauth2.googleapis.com/revoke`). Already escalated separately as urgent — it does not wait for EXEC, but it must not precede step 3.',
        '5. **If and only if** the OAuth fallback was used: null `eva_sync_state.source_metadata` for the youtube_oauth row, and confirm `storeTokens()` no longer writes to it.',
        '',
        '### Why step 3 cannot be an exit code',
        '`.github/workflows/youtube-subscription-digest.yml` is a live, in-repo demonstration that a job can report **success** while holding a nonexistent credential. Capture counts before and after and diff them:',
        '```sql',
        'select count(*) from eva_youtube_intake;   -- before, then after',
        'select count(*) from eva_todoist_intake;   -- before, then after',
        '```',
        'Paste both numbers. A delta of 0 is a FAIL for step 3 even if the run is green (unless independently explained by genuinely-zero new source items, which must itself be evidenced).',
        '',
        '### Why the order is load-bearing',
        'Revoking the old token before proving the new path works leaves ingestion dead with no rollback. Nulling the DB column before `storeTokens()` stops writing means the next OAuth refresh silently re-populates it — you would have "fixed" the exposure into a state that re-creates itself. Each step is independently reversible only if it is separate.',
        '',
        '### Step 4 proof (TS-6)',
        'A 200 from the revoke endpoint is the revoke *request* succeeding, not proof the token is dead. Prove it by **using** the old token to request a new access token and observing `invalid_grant` / HTTP 400.'
      ].join('\n')
    },
    architecture_references: [
      { kind: 'anti_pattern', path: '.github/workflows/youtube-subscription-digest.yml', note: 'green job holding a nonexistent credential — the reason step 3 must be a row-delta' },
      { kind: 'target', path: 'lib/integrations/youtube/oauth-manager.js:61-84', note: 'storeTokens() DB write — must be gone before step 5 nulls the column' },
      { kind: 'external', path: 'https://oauth2.googleapis.com/revoke', note: 'step 4 revocation endpoint; prove revocation by failed use, not by a 200' },
      { kind: 'trigger', path: '.github/workflows/eva-idea-sync-cron.yml', note: 'workflow_dispatch is what step 3 fires' }
    ],
    example_code_patterns: [
      {
        label: 'step 3 — row-delta capture (the only accepted evidence)',
        language: 'javascript',
        code: "const count = async (t) => (await sb.from(t).select('*', { count: 'exact', head: true })).count;\nconst before = { yt: await count('eva_youtube_intake'), td: await count('eva_todoist_intake') };\n// ... trigger workflow_dispatch, wait for completion ...\nconst after = { yt: await count('eva_youtube_intake'), td: await count('eva_todoist_intake') };\nconsole.log(`eva_youtube_intake: ${before.yt} -> ${after.yt}`);\nconsole.log(`eva_todoist_intake: ${before.td} -> ${after.td}`);\n// A green run with a 0 delta is a FAIL, not a pass."
      },
      {
        label: 'step 4 proof — revocation confirmed by failed use, not by a 200',
        language: 'bash',
        code: "# The revoke call itself:\ncurl -s -X POST https://oauth2.googleapis.com/revoke -d token=\"$OLD_REFRESH_TOKEN\"\n\n# The PROOF (expect HTTP 400 / \"invalid_grant\"):\ncurl -s -X POST https://oauth2.googleapis.com/token \\\n  -d client_id=\"$GOOGLE_CLIENT_ID\" -d client_secret=\"$GOOGLE_CLIENT_SECRET\" \\\n  -d refresh_token=\"$OLD_REFRESH_TOKEN\" -d grant_type=refresh_token"
      }
    ],
    testing_scenarios: [
      { id: 'TS-6', type: 'security', priority: 'P0', scenario: 'Old exposed refresh token is confirmed revoked (invalid_grant on attempted use)' },
      { id: 'TS-1', type: 'integration', priority: 'P0', scenario: 'Step-3 row-delta verification on both intake tables' }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    n: 6,
    fr: 'PRD acceptance criterion #2 (not owned by any single FR)',
    title: 'Prove the pipeline stays review-queue-only after the cron lands — no auto-created strategic directives',
    user_role: 'Chairman, who wants to approve ideas rather than discover them already approved',
    user_want:
      'evidence that turning the pull from manual into hourly does not cause synced candidates to auto-create strategic directives',
    user_benefit:
      'the chairman keeps the final say on what becomes real work — an hourly ingest that silently manufactured SDs would flood the queue with unreviewed items and invert who decides',
    priority: 'high',
    points: 2,
    depends_on: [`${SD_KEY}:US-001`],
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'Human-verifiable: the SD queue is unchanged across the first scheduled run',
        given: 'a person runs `npm run sd:next` and notes the list of strategic directives shown immediately before the first scheduled sync',
        when: 'they re-run `npm run sd:next` after the run completes',
        then: 'no new strategic directive titles have appeared — the visible queue is the same list'
      },
      {
        id: 'AC-006-2',
        scenario: 'Row-count regression check on strategic_directives_v2',
        given: 'a strategic_directives_v2 count captured before the run',
        when: 'the same count is taken after the run, alongside a non-zero intake-table delta proving the sync actually did work',
        then: 'the strategic_directives_v2 count is unchanged — the sync inserted intake rows without manufacturing directives'
      },
      {
        id: 'AC-006-3',
        scenario: 'Synced rows land in a reviewable, non-terminal state',
        given: 'the new rows in eva_youtube_intake / eva_todoist_intake from the run',
        when: 'their status column is inspected',
        then: 'they sit in a pending/reviewable state awaiting the existing drain, not an auto-promoted one'
      },
      {
        id: 'AC-006-4',
        scenario: 'The downstream drain is untouched by this SD',
        given: 'scripts/intake/drain-intake.mjs and .github/workflows/estate-disposition-cron.yml',
        when: 'this SD\'s diff is reviewed',
        then: 'neither is modified — this SD adds a pull-side trigger only, so the review-queue semantics downstream are unchanged by construction'
      }
    ],
    given_when_then: [
      {
        scenario: 'Review-queue-only invariant survives the scheduling change',
        given: 'the pipeline is empirically review-queue-only today (no auto-created SDs from synced candidates)',
        when: 'the new hourly cron begins running the same sync that previously ran only by hand',
        then: 'zero new strategic_directives_v2 rows are auto-created from newly-synced candidates'
      }
    ],
    technical_notes:
      "This covers the PRD's top-level acceptance criterion #2, which no individual FR owns. The invariant is expected to hold by construction (this SD changes only the trigger, not the drain), but 'expected to hold' is not evidence — the check is cheap and the failure mode (an hourly flood of auto-created SDs) is expensive.",
    implementation_context: {
      technical_approach:
        "Regression verification, not a feature. Capture a strategic_directives_v2 row count and the visible `npm run sd:next` queue immediately before the first scheduled/dispatched run, then re-capture both after. Pair this with the FR-5 step-3 intake row-delta so the check is not vacuous — an unchanged SD count is only meaningful if the sync demonstrably did something. Also confirm by diff that this SD modifies neither scripts/intake/drain-intake.mjs nor .github/workflows/estate-disposition-cron.yml, which is what makes the invariant structural rather than incidental.",
      files_to_create: [
        'regression check folded into the FR-5 row-delta verification script (SD count captured alongside the intake counts)'
      ],
      files_to_modify: [],
      dependencies: [
        'US-001 / FR-1 — needs a real scheduled or dispatched run to observe',
        'US-005 / FR-5 — shares the before/after capture harness',
        'scripts/intake/drain-intake.mjs and .github/workflows/estate-disposition-cron.yml (must remain UNMODIFIED)'
      ],
      estimated_effort: 'small (~15 LOC added to the existing verification script; no production code)',
      implementation_guidance: [
        '## Implementation Guidance',
        '',
        '**Fold this into the FR-5 verification harness** rather than writing a second script — the same before/after window is needed, and pairing the two counts is what makes the result meaningful.',
        '',
        '**Pair the counts, or the check is vacuous.** An unchanged `strategic_directives_v2` count proves nothing if the sync inserted zero intake rows. Assert both in the same breath: intake delta > 0 **and** SD delta == 0.',
        '',
        '```js',
        "const sdCount = async () => (await sb.from('strategic_directives_v2').select('*', { count: 'exact', head: true })).count;",
        '// before: sdCount() + intake counts; after: same two.',
        '// PASS  = intakeDelta > 0 && sdDelta === 0',
        '// VACUOUS (not a pass) = intakeDelta === 0 && sdDelta === 0',
        '```',
        '',
        '**Structural half (AC-006-4)**: confirm by `git diff --name-only` against the merge base that neither `scripts/intake/drain-intake.mjs` nor `.github/workflows/estate-disposition-cron.yml` appears. This SD adds a pull-side trigger only; the drain and its review-queue semantics are explicitly out of scope and unchanged.',
        '',
        '**Context**: the PRD risk register records that both intake tables are already 100% drained (0 undrained rows) — the previously-claimed "~447 item + 49 media link" backlog does not exist. Re-verify this rather than inheriting it, and do not go chasing that backlog; the real 664-row conversion_ledger disposition backlog is separate work with a different owner.'
      ].join('\n')
    },
    architecture_references: [
      { kind: 'must_not_modify', path: 'scripts/intake/drain-intake.mjs', note: 'existing downstream drain — unchanged by this SD' },
      { kind: 'must_not_modify', path: '.github/workflows/estate-disposition-cron.yml', note: 'existing drain schedule — unchanged by this SD' },
      { kind: 'invariant_target', path: 'strategic_directives_v2', note: 'row count must not move across a sync run' },
      { kind: 'human_surface', path: 'npm run sd:next', note: 'the visible queue a person can compare before/after' }
    ],
    example_code_patterns: [
      {
        label: 'paired regression assertion (non-vacuous by construction)',
        language: 'javascript',
        code: "const intakeDelta = (after.yt - before.yt) + (after.td - before.td);\nconst sdDelta = after.sd - before.sd;\n\nif (intakeDelta === 0) throw new Error('VACUOUS: sync inserted no intake rows; SD-count check proves nothing');\nif (sdDelta !== 0) throw new Error(`REGRESSION: ${sdDelta} strategic directives auto-created by a sync run`);\nconsole.log(`PASS: intake +${intakeDelta}, strategic_directives_v2 unchanged`);"
      }
    ],
    testing_scenarios: [
      { id: 'TS-7', type: 'regression', priority: 'P0', scenario: 'Zero strategic_directives_v2 rows auto-created across a sync run with a non-zero intake delta' }
    ]
  }
];

const rows = stories.map((s) => ({
  story_key: `${SD_KEY}:US-${String(s.n).padStart(3, '0')}`,
  prd_id: PRD_ID,
  sd_id: SD_UUID,
  title: s.title,
  user_role: s.user_role,
  user_want: s.user_want,
  user_benefit: s.user_benefit,
  story_points: s.points,
  priority: s.priority,
  status: 'ready',
  acceptance_criteria: s.acceptance_criteria,
  given_when_then: s.given_when_then || [],
  technical_notes: s.technical_notes || null,
  // depends_on/blocks are uuid[] -- resolved in a second pass after all rows exist.
  depends_on: [],
  blocks: [],
  // TEXT column (not jsonb, despite the name) — bmad-validation.js checks length > 50.
  // Stored as a JSON string so the required keys are machine-readable.
  implementation_context: JSON.stringify(s.implementation_context),
  architecture_references: s.architecture_references || [],
  example_code_patterns: s.example_code_patterns || [],
  testing_scenarios: s.testing_scenarios || [],
  test_scenarios: (s.testing_scenarios || []).map((t) => t.id),
  implementation_status: 'pending',
  validation_status: 'pending',
  e2e_test_status: 'not_created',
  created_by: 'STORIES sub-agent (PLAN phase)',
  metadata: { fr: s.fr, source_prd: PRD_ID, generated_by: 'stories-agent v2.0.0' }
}));

let ok = 0;
for (const row of rows) {
  const { data: existing } = await supabase
    .from('user_stories')
    .select('id')
    .eq('story_key', row.story_key)
    .maybeSingle();

  const res = existing
    ? await supabase.from('user_stories').update(row).eq('story_key', row.story_key).select('id, story_key')
    : await supabase.from('user_stories').insert(row).select('id, story_key');

  if (res.error) {
    console.error('ERR', row.story_key, res.error.message);
    process.exit(1);
  }
  ok++;
  console.log(`${existing ? 'UPDATED' : 'INSERTED'}  ${res.data[0].story_key}  id=${res.data[0].id}`);
}
console.log(`\n${ok}/${rows.length} stories written.`);

// -- Second pass: resolve depends_on (uuid[]) now that every row exists ---------
const { data: allRows } = await supabase
  .from('user_stories')
  .select('id, story_key')
  .eq('prd_id', PRD_ID);
const keyToId = Object.fromEntries((allRows || []).map((r) => [r.story_key, r.id]));

for (const st of stories) {
  const deps = (st.depends_on || []).map((k) => keyToId[k]).filter(Boolean);
  if (!deps.length) continue;
  const key = `${SD_KEY}:US-${String(st.n).padStart(3, '0')}`;
  const { error } = await supabase.from('user_stories').update({ depends_on: deps }).eq('story_key', key);
  if (error) { console.error('DEP ERR', key, error.message); process.exit(1); }
  console.log(`DEPS  ${key} -> ${(st.depends_on || []).join(', ')}`);
}
