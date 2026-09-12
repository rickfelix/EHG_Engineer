import { execute } from '../lib/sub-agents/retro/index.js';
const SD_UUID = '3f128d5c-8168-4415-86cc-ab5da4663d11';
const lessons = [
  {
    title: 'Rule: never stack PR branches; open every PR against main with a double-dash suffix',
    severity: 'medium',
    tags: ['github', 'branching', 'pr-workflow'],
    message: 'PR 8369 (calendar-read feeder) was auto-closed by GitHub when its stacked base branch was deleted after merge and could not be reopened; it had to be re-created as PR 8371. Every later PR (8372 through 8392) was opened against main on a branch named feat/<SD-KEY>--prN. A slash suffix (feat/<SD-KEY>/prN) collides with the existing branch ref namespace, and a bare -1b suffix broke the pre-commit SD-key regex, so the double-dash suffix is the only form that passes both.',
    root_cause: 'GitHub closes a PR whose base ref is deleted; stacking PRs on each other couples their lifetimes to branch deletion on merge.',
    prevention: 'For multi-PR SDs, branch each PR from main as feat/<SD-KEY>--prN, rebase on main before opening, and never target another feature branch as base.'
  },
  {
    title: 'Rule: write the checkpoint plan before PLAN-TO-EXEC when the PRD carries more than 8 stories, and clear blocked_* metadata after a gate retry passes',
    severity: 'medium',
    tags: ['handoff', 'gates', 'plan-to-exec'],
    message: 'The first PLAN-TO-EXEC attempt (2026-09-06 14:59Z) was rejected by BMAD_PLAN_TO_EXEC at 1417/1500 for a missing checkpoint plan (PRD had more than 8 stories). The retry two minutes later passed at 98, but the SD row kept blocked_at, blocked_reason and blocked_by_gate from the rejection through EXEC and into PLAN_VERIFICATION.',
    root_cause: 'The >8-story checkpoint-plan requirement is only discovered at the gate, and the accepting retry does not clear the blocked_* keys the rejection wrote.',
    prevention: 'Generate the checkpoint plan as part of PRD authoring whenever story count exceeds 8; after any gate retry passes, verify the SD metadata no longer carries blocked_* keys and route the stale-metadata defect if it does.'
  },
  {
    title: 'Rule: edit prose containing backticks or escape sequences through Write-tool patch files, not shell heredocs',
    severity: 'low',
    tags: ['tooling', 'shell', 'editing'],
    message: 'Shell heredoc edits mangled backtick-bearing prose (command substitution) and literal backslash-n escapes in the role contract paragraph and PR bodies. Edits moved to Write-tool patch files applied from the worktree and the corruption stopped. The same failure recurred while writing this retrospective: a quoted heredoc carrying an escaped apostrophe failed to parse and the lesson script had to be written with the Write tool.',
    root_cause: 'Unquoted heredocs and echo interpret backticks and backslash escapes before the text reaches the file, and long prose payloads passed through the shell hit quoting edge cases even under a quoted delimiter.',
    prevention: 'Any edit whose payload contains backticks, dollar signs, apostrophes or backslash escapes goes through the Write tool; verify with a diff before committing.'
  },
  {
    title: 'Rule: keep reviewer prompts as files so agents can be re-spawned after a restart, and keep reviewer scratch copies outside the repo tree',
    severity: 'low',
    tags: ['adversarial-review', 'sub-agents', 'session-restart'],
    message: 'The adversarial reviewer agents from the previous session were unreachable after a seat restart and had to be re-spawned from the same prompt files; because the prompts were on disk this cost minutes, not a re-derivation. Separately, one reviewer left a scratch copy of a test inside the repo tree and vitest picked it up, producing a spurious failure until the copy was removed.',
    root_cause: 'Agent handles do not survive a session restart, and vitest collects any *.test.js under the tree regardless of author.',
    prevention: 'Persist every reviewer prompt to a file at spawn time; instruct reviewers to write scratch files only to the session scratchpad, and add the seat verdict directory to the vitest exclude list (done in PR 8392).'
  },
  {
    title: 'Rule: bound any per-date quota by a ledger snapshot re-read on a fixed cadence, never by an in-memory counter alone',
    severity: 'medium',
    tags: ['gmail-triage', 'quota', 'design-pattern'],
    message: 'The gmail-triage modify ceiling (PR 8378) went through repeated adversarial review rounds before it was accepted: an in-memory counter alone could exceed the per-date ceiling across concurrent or restarted runs. The accepted design snapshots the ledger count at start, decrements against it, and re-reads the ledger every 10 modifies so a parallel writer cannot push the day past the ceiling.',
    root_cause: 'A counter held only in process memory has no view of writes made by other runs against the same date.',
    prevention: 'For any per-date or per-window quota on a side-effecting verb, derive the remaining budget from the durable ledger, re-read it on a fixed cadence during the run, and test the ceiling with an injected concurrent writer.'
  },
  {
    title: 'Rule: a verb that applies staged items to a seat needs replay idempotency, sticky degraded status, bounded identifiers and a produced_at window gate before it is safe',
    severity: 'medium',
    tags: ['classify-apply', 'idempotency', 'design-pattern'],
    message: 'classify-apply (PR 8385) was only accepted after four hardening steps surfaced by review: run_ids recorded on the seat row so a replayed run is a no-op, a degraded status that stays set once tripped rather than flipping back on the next healthy tick, length and charset bounds on every identifier written to the seat row, and a produced_at window gate that refuses staged items older than the tick window.',
    root_cause: 'The first draft treated the apply step as a pure function of the queue and ignored replays, partial failures and stale input.',
    prevention: 'Any seat-mutating verb ships with a replay test, a sticky-degraded test, an identifier-bounds test and a stale-input test before review; use the classify-apply tests in lib/michael as the template.'
  },
  {
    title: 'Rule: when a migration is chairman-gated and unapplied live, every test injects its clients and the first real run is named as a post-migration smoke owned by the chairman',
    severity: 'medium',
    tags: ['migration', 'testing', 'chairman-gated'],
    message: 'The michael_* tables are not applied on the live database because the migration is chairman-gated. All 250 shipped tests (TESTING evidence row 3295c710, commit 68c2b94) inject Supabase and Google clients, so the suite proves the code against the migration shape without a live table. The first real end-to-end run is therefore the host smoke the chairman runs after applying the migration, and that fact is recorded in the SD rather than implied.',
    root_cause: 'Live tables cannot be exercised before a gated migration is applied, so live verification is structurally deferred.',
    prevention: 'For any SD whose tables await a gated migration, state the deferred live smoke explicitly in the PRD acceptance criteria and the handoff, inject every external client in tests, and keep a named owner for the smoke.'
  },
  {
    title: 'Rule: route hardening and bulk verbs discovered during review out of scope explicitly, with a named home, rather than absorbing them into the SD',
    severity: 'low',
    tags: ['scope', 'review', 'routing'],
    message: 'Two items surfaced during adversarial review were routed out of this SD instead of being absorbed: the DB-D8 verify-block hardening and a bulk unarchive verb (PR 8392 refuses the unarchive intent rather than implementing it). Both are recorded as out-of-scope with a destination so they are not lost. Twelve PRs (8364, 8365, 8366, 8371, 8372, 8373, 8375, 8377, 8378, 8379, 8380, 8385) merged on 2026-09-06 with a ship_review_findings row each; eleven at deep tier, one (8377) at standard tier.',
    root_cause: 'Deep-tier review reliably surfaces adjacent work; absorbing it would have broken the PR-size budget and the scope lock.',
    prevention: 'When review surfaces adjacent work, record it in the PR body and the handoff as out-of-scope with a destination SD or backlog entry, and have the code refuse the unimplemented intent explicitly rather than half-implement it.'
  }
];
let ok = 0;
for (const l of lessons) {
  const res = await execute(SD_UUID, { code: 'RETRO' }, { mode: 'lesson', ...l });
  const stored = res.findings?.lesson || res.findings?.retrospective || {};
  console.log('>>> ' + res.verdict + ' | ' + l.title.slice(0, 60) + ' | ' + JSON.stringify(stored).slice(0, 160));
  if (res.verdict === 'PASS') ok++;
}
console.log('LESSONS APPENDED: ' + ok + '/' + lessons.length);
process.exit(0);
