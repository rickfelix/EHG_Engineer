# OKR-Driven Prioritization + Day-28 Hard Stop — Phase-0 Design

**SD:** SD-LEO-INFRA-PHASE-DESIGN-OKR-001
**Phase:** 0 (design-only — no production code)
**Status:** Design for decomposition into buildable child SDs
**Capability anchor:** Solomon STEP-0 vision-gauge shortlist, weakest process-layer capability (0.0)

---

## 0. Why this exists

The vision-gauge's process layer scores "OKR-driven prioritization + day-28 hard stop" as
genuinely unbuilt (0.0). A design-first rung is correct here because the single highest-impact
finding — an already-latent, silently-diverging duplicate scoring implementation — is a code
defect independent of any human decision, while the day-28 automation cadence and which scorer
becomes authoritative are design choices worth settling before any build.

## 1. Premise corrections (verified live, 2026-08-31)

The originating SD condition named "okrs/key_results tables" as the substrate. That framing was
imprecise in a way that would have sent a build-phase reader looking for a table that doesn't
exist.

| SD framing | Reality (verified) | Consequence |
|---|---|---|
| "okrs table" | **No table named `okrs` exists** (`to_regclass('public.okrs')` returns null). | Any future query must target the real tables below. |
| "key_results tables" (join implied) | Substrate is `objectives` (9 rows) + `key_results` (43 rows), joined via **`sd_key_result_alignment`** (73 rows). A same-named `okr_alignments` table also exists but has **0 rows** — it is not the live join path. | Child SDs must query `sd_key_result_alignment`, not `okr_alignments`. |

Verified facts:
- `KR-2026-02-01` ("Improve okr_driven_prioritization score from 60% to 80%") is the live KR
  tracking this exact capability. Status: `at_risk`.
- `KR-GOV-3.3` ("Monthly OKR automation operational") already fully specifies the day-28 hard
  stop — see §3.
- Six `okr_*` support objects exist (`okr_snapshots`, `okr_alignments`, `okr_generation_log`,
  `okr_vision_alignment_records`, `v_okr_scorecard`, `v_sd_okr_context`, `v_okr_hierarchy`), but
  only `sd_key_result_alignment` and `key_results` carry live data relevant to this design.

---

## 2. Unknown #1 — which prioritization mechanism is authoritative

### 2.1 Three independent scorers exist today, not one

| Scorer | File | Consumer | OKR-aware? |
|---|---|---|---|
| `priority-scorer.js` | `scripts/lib/priority-scorer.js` | `okr-priority-sync.js`, `sd-baseline-intelligent.js`, `baseline-insertion-hook.js` | Yes — full 7-key `WEIGHTS.krUrgency` table |
| `SDNextSelector`'s `computeOKRScore` | `scripts/modules/sd-next/SDNextSelector.js:35-48` | `npm run sd:next` (the live, everyday SD-selection command) | Yes — but a **4-key inline subset**, not an import |
| WSJF fetcher | `scripts/wsjf-priority-fetcher.js` | `npm run prio:top3` | **No** — consumes no OKR/KR data at all; a cost-of-delay/job-size model |

`WSJFPriorityFetcher` is a genuinely separate algorithm class with its own query and dependency
logic — reconciling it with the two OKR-aware scorers is a **different problem** (whether WSJF
should ever become OKR-aware) from reconciling the two OKR-aware scorers with each other. This
design treats them separately; see §4.

### 2.2 The two OKR-aware scorers have ALREADY diverged

`SDNextSelector.js:35-48`'s docstring self-admits: *"Inline implementation matching
priority-scorer.js calculateOKRImpact logic."* It is not an import — it is a hand-copied,
narrower re-implementation:

```js
// SDNextSelector.js:35 — 4 keys, no fallback for the other 3 KR statuses
const KR_URGENCY = { off_track: 3.0, at_risk: 2.0, on_track: 1.0, achieved: 0.0 };
...
const urgency = KR_URGENCY[kr.status] ?? 1.0;   // line 41
```

```js
// priority-scorer.js:44-51 — the full 7-key table SDNextSelector copied from
krUrgency: {
  off_track: 3.0, at_risk: 2.0, on_track: 1.0,
  pending: 1.0, achieved: 0.0, missed: 0.0, default: 1.0,
},
```

`SDNextSelector`'s table omits `pending`, `missed`, and `default` entirely, falling through to a
hardcoded `?? 1.0`. This **coincidentally** matches `priority-scorer.js`'s `pending: 1.0`, but
**silently contradicts** `priority-scorer.js`'s explicit `missed: 0.0` — a KR with
`status='missed'` scores **1.0x** (as if on-track) in `sd:next`'s live ranking instead of the
intended **0.0x** (deprioritized, the KR is dead). This is dormant only because zero `key_results`
rows currently carry `status='missed'` (live count, 2026-08-31); the divergence fires silently on
the first one. The correct characterization is broader than "one bad default": **`SDNextSelector`
inlines a 4-key subset of a 7-key table behind a nullish fallback** — any future status value
`priority-scorer.js` adds will silently repeat this same class of bug in `SDNextSelector` unless
someone removes the duplication itself.

### 2.3 Recommendation

Make `priority-scorer.js` the single source of truth. `SDNextSelector.js` should **import**
`calculateOKRImpact`/`rankSDs` from `priority-scorer.js` rather than maintaining a parallel
inline copy — this is a mechanical de-duplication, not a scoring-formula redesign (the intent was
already "matching priority-scorer.js logic"; the bug is that it never actually did). This is
child-SD implementation work (see §5), not something this design pass builds.

---

## 3. Unknown #2 — what activates the day-28 automation

### 3.1 The automation is already fully specified, just unbuilt

`KR-GOV-3.3` ("Monthly OKR automation operational") is not a vague aspiration — its live
description is the concrete spec:

> *"Auto-generate draft OKRs (day 1-5), schedule Chairman review meeting (day 15), hard-stop SD
> creation (day 28). Currently 0 of 3 automation stages running (none); stale: draft OKR
> generation (last 2026-06-10, 81.2d ago); chairman review scheduling (last 2026-07-19, 41.7d
> ago); day-28 hard-stop (never)."*

Live state (2026-08-31): `current_value=0`, `target_value=3`, **`status=off_track`**. `KR-GOV-3.3`
itself is the substrate this design builds on — it needs no new terminology.

### 3.2 The sync path that would feed it is dormant

`scripts/okr-priority-sync.js` (`npm run okr:sync`) already exists and would persist an
OKR-driven `priority_score` onto `strategic_directives_v2`, using `priority-scorer.js`'s
`getDeadlineProximityFactor` for deadline urgency. It is referenced **only** in
`package.json:626` — grepped across all `.github/workflows/*.yml` and `scripts/cron/`'s 33
entries, zero scheduling references exist anywhere. It has been runnable-but-never-run since
authorship.

### 3.3 Recommendation (design, not build)

Each of KR-GOV-3.3's 3 stages maps to a distinct trigger, none of which this design pass builds:

1. **Day 1-5, draft OKR generation** — a monthly cron (first business day) that re-runs whatever
   process last wrote `okr_generation_log` (stale since 2026-06-10) — child-SD scope: restore/
   reschedule that generator, not invent a new one.
2. **Day 15, chairman review scheduling** — a calendar/SMS trigger into the existing chairman
   comms channel (per this repo's established SMS-cadence pattern), not a new comms mechanism.
3. **Day 28, hard-stop SD creation** — the highest-impact piece: schedule `okr-priority-sync.js`
   (§3.2) to run on day 28, gating further SD creation on its output. This is where activating
   the dormant sync script and the day-28 hard stop are the same child SD (see §5, Child SD 2).

---

## 4. WSJF's relationship to this design

`prio:top3` / `wsjf-priority-fetcher.js` is explicitly **not** reconciled by this design. It
consumes no OKR/KR data today, so there is no divergence to fix — only an open question (does
`prio:top3` output ever need OKR-awareness?) that is out of scope here; folding a third,
structurally different scoring model into an OKR reconciliation would be scope creep beyond what
Solomon's shortlist condition asked for ("the gap is the prioritization MECHANISM" — singular,
referring to the OKR-aware mechanism, not a three-way unification).

---

## 5. Proposed child-SD decomposition

**Child SD 1 — De-duplicate the OKR scorer.** Remove `SDNextSelector.js`'s inline
`computeOKRScore` (lines 35-48); import `calculateOKRImpact`/`rankSDs` from
`scripts/lib/priority-scorer.js` instead. Add a regression test asserting a `status='missed'` KR
scores `0.0x` through `sd:next`'s live ranking path (the currently-untested divergence this
design found). No schema change; a small, single-file-boundary fix.

**Child SD 2 — Activate day-28 hard-stop automation.** Schedule `scripts/okr-priority-sync.js`
to run on day 28 of each month (cron or GitHub Actions `schedule:`), gating SD-creation dispatch
on its completed run, and wire `KR-GOV-3.3.current_value` to increment on successful stage
completion so the KR's own tracking becomes self-updating rather than requiring manual edits.
Depends on Child SD 1 landing first (the sync script uses `priority-scorer.js`; keeping the two
scorers in sync during the transition would waste effort).

**Child SD 3 — Restore day 1-5 / day 15 automation.** Investigate and restore whatever last wrote
`okr_generation_log` (stale 81+ days) for draft-OKR generation, and wire the day-15 chairman
review into the existing SMS-cadence comms channel. Independent of Child SD 1/2; can proceed in
parallel.

---

## Out of scope (this design pass)

- No code change to `priority-scorer.js`, `wsjf-priority-fetcher.js`, `SDNextSelector.js`, or
  `okr-priority-sync.js` — de-duplication is Child SD 1's implementation work.
- No cron/workflow scheduling of `okr-priority-sync.js` — a design recommendation only (§3.3),
  activation is Child SD 2's implementation work.
- No automation build for any of KR-GOV-3.3's 3 stages — design only (§3.3).
- No reconciliation of `wsjf-priority-fetcher.js` with the OKR-aware scorers — explicitly
  deferred as a separate, unasked-for problem (§4).
- `KR3.1-HARD-STOP` ("Hard stop at 11:00 PM") — verified unrelated: a different, nightly
  time-of-day hard stop, not the day-28-of-month OKR cycle hard stop this design addresses.
