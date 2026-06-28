# leo-stack daemon-down "controlled walk" (walk-mode)

**SD:** SD-LEO-INFRA-RESTART-RESPECTS-DAEMON-DOWN-WALK-001

## Why

`leo-stack restart` starts every enabled worker in `config/workers.json` via `Start-Workers`/`start_workers`.
Those registry workers are the **EVA stage-execution daemon** (`stage-zero-queue-processor`,
`start-stage-worker`/`stage-execution-worker`, `eva-master-scheduler`, `subagent-worker`,
`lib/eva/workers`). So a `restart` during a deliberately **daemon-down** period silently revived the
daemon — which then auto-advanced a venture past a chairman review (S8) and a HARD gate (S10).

## The sentinel

A controlled walk is marked by a sentinel file at the repo root:

```
.leo-stack-walk-mode
```

It is an operator runtime marker (gitignored). While it is present, `leo-stack restart`/`start`:

- brings up the **web servers** normally, and
- leaves the **EVA stage workers STOPPED**, printing a `[WALK-MODE]` notice per skipped worker.

Remove the sentinel and restart to resume the daemon normally. With the sentinel absent, behavior is
unchanged.

## Enter / exit a walk

```bash
# enter a controlled walk (daemon stays down across restarts)
touch .leo-stack-walk-mode
node scripts/cross-platform-run.js leo-stack restart   # web up, EVA stage workers stay stopped

# exit
rm .leo-stack-walk-mode
node scripts/cross-platform-run.js leo-stack restart   # daemon resumes
```

## How it works

The decision is owned by one unit-tested module — `lib/leo-stack/walk-mode.cjs`:

- `isWalkModeActive(repoRoot)` — sentinel present?
- `isEvaStageWorker(worker)` — is this registry worker part of the daemon set? (patterns mirror the
  existing orphan/stale-worker regex in `leo-stack.ps1`)
- `shouldStartWorker(worker, walkActive)` — start unless it's an EVA worker during a walk.
- CLI `node lib/leo-stack/walk-mode.cjs skip-ids` — the worker IDs to skip (empty when no walk).

`leo-stack.ps1` and `leo-stack.sh` call `skip-ids` once and skip those workers. **Fail-closed:** if the
sentinel is present but the helper returns nothing, the scripts fall back to the EVA regex and skip the
whole daemon set — a present walk sentinel never silently revives the daemon.
