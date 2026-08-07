# LEO Protocol Session State
**Last Updated**: 2026-07-26 ~12:40 ET (Adam session, pre-compaction #2)
**Session Focus**: LEO `/builder/sessions` UI — SHIPPED, awaiting the chairman's personal review

---

## CHAIRMAN'S GOALS (standing, his words)
1. **"I want that Leo app done. That's my main focus."** — the Sessions UI, reviewed by him.
2. **"I want to be able to transition out of cursor."** — now the top remaining goal.
3. **Governance**: *"you have governance and oversight over the coordinator, and it's also your goal to drive progress."*
4. He is impatient with back-and-forth and token burn. Ultracode is ON — be exhaustive and RIGHT, not fast.

## STATUS: THE UI SHIPPED — HE STILL CANNOT SEE IT
- **ehg PR #774** merged 16:00:17Z + **EHG_Engineer PR #6519** merged 15:59:42Z. Backend-first, deliberately (frontend-first would render element 5 "not captured" for every row).
- `BuilderSessionsPage.tsx` on `origin/main`: **467 lines** (was 252). I verified **all 11 elements present**; 2 declared PARTIAL by the author (element 11's *hide* has no backend route; it reports "not wired" rather than silently failing).
- **BLOCKER**: Vite on :8080 (pid 19520, cwd `_EHG\ehg`) serves the **ehg main tree**, which is checked out on `chore/untrack-auth-storage-state` = **PR #773**. So :8080 renders the OLD 252-line page.
- **I DECIDED PR #773 LANDS** (routed to me): real security fix — tracked `.auth/user.json` holds a **live Supabase refresh token**; checks SUCCESS; open 4h+. Execution routed to the coordinator's ship path (CONST-002: I don't hand-merge).
- **Hazard measured, not assumed**: coordinator + Golf both refused to switch that tree citing a live-session branch. I queried all 9 active sessions — **every `current_branch` reads `main`, none on that branch** — and ran the control (field populated 9/9, so the negative is real). Zero of the 4 modified files collide with the incoming diff. The switch is safe.
- **TRAP**: `git pull` in that tree says *"Already up to date"* — true and misleading; it tracks the feature branch.

## THE REVIEW GATE — DO NOT LET ANYONE CLOSE IT
QF-20260726-642: `uat_verified=false`, gate in `verification_notes`. **Only his personal review of the rendered page closes it.** Tests, CI, merged PRs, and my element count are all explicitly insufficient — the first build passed every mechanical check and shipped 3 of 11.

## THE SPEC — DO NOT RE-DERIVE
`docs/design/leo-sessions-artifact-2026-07-26.png` — **UNTRACKED, not in git**. Durable copies: `Projects/_EHG/_design-backup/` and the scratchpad (md5 519a2155c81f7115b6090f9586fec20e, 144455 bytes). Full 11-element spec is in QF-642's description, along with the element-5 source pin and the not-captured render requirement.

## MY BIGGEST ERROR TODAY — the lesson, not the incident
I **verified a symptom first-hand and then RELAYED the mechanism** from Solomon without re-deriving it. The coordinator built on my relay, I told the chairman, an SD was filed on it. A 10-agent adversarial verification **refuted the mechanism entirely** (orphan tickers: 0, not 15; the "15" was a coincidence of two unrelated counts; re-parenting is impossible by construction).
**Real cause**: `lib/fleet/session-liveness.cjs:59-64` parses `terminal_id` as `win-cc-{port}-{pid}`; live sessions write a bare UUID. `hasPidAlive` TRUE for **0 of 22** sessions — **dead since 2026-04-04**. Working resolver already exists at `stale-session-sweep.cjs:526-563`, never migrated.
**Use `process_alive_at`** as the discriminator — the only column that separated dead from live with no overlap. `heartbeat_at` has 12+ writers; `is_alive` actively promotes corpses.
SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 scope carries the full refutation (readback confirmed). **Foxtrot is building it.**

## OPEN THREADS
- **Cursor exit**: `SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001` and `-001-E` — both now claim-free after the dead-seat clearing. **Push these to live seats; this is his #2 goal.**
- **Pending, needs a written response not an ack**: `review_request` id `796f7e73` — 8-SD bidirectional Coordinator↔Adam review.
- Deferred by his sole-focus directive: solomon-health + plan-check adherence runs (~45h overdue); six MATERIALISE sourcing items.
- **The LEO app is NOT on the roadmap** — `plan-check-status.mjs` returns Wave-1 items only, so his main focus isn't tracked by the plan-of-record tooling. Worth fixing.

## FLEET STATE
Shared root `EHG_Engineer` **behind=0** (the fast-forward landed — that one command cleared reap/sync/restart/relaunch/claims). Fleet **6 live, 0 dead** by PID. My own session has `pid=null`, so PID checks cannot evaluate it.

## STANDING GOTCHAS (each cost a real error)
- **Verify the mechanism, not just the symptom.** Separate evidence; say which is which.
- **Run a control before believing a negative** — a field that is never populated returns the same empty answer.
- **`heartbeat_at` / `is_alive` are NOT liveness.** PID is, when the resolver works.
- Bash `/tmp` ≠ Node `/tmp` on Windows (Node resolves `C:\tmp`) — use the scratchpad path.
- `adam-advisory` caps at **4096 chars**; CONST-010 blocks the words urgent/immediately/critical **even when quoting them**; the 2-hypothesis bar fires on model-cutoff-shaped claims — clear it with a real handoff check, then `--alarm-verified`.
- `quick_fixes` has no `metadata` column (use `uat_verified`/`verification_notes`); QF key is `id`; `sms_relay_staging` uses `body_raw`/`received_at`/`drained_at`.
- Check the **right repo** (ehg vs EHG_Engineer) and the **right tree** (working copy vs `origin/main`).
