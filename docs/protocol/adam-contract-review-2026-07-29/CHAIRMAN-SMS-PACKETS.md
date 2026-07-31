# Two chairman decisions, drafted in the ratified SMS-decide format

**SD**: SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 / FR-3
**Drafted**: 2026-07-31 by fleet worker Alpha-2 (session 8aa7b984)
**For**: Adam to send — the SMS bridge is the Adam→chairman leg and the fleet never auto-texts.

These are the last two things gating FR-3. Everything else on the SD is built, tested and pushed.
Drafted rather than described so Adam can send without re-deriving the options.

**Serialize them.** The contract's ratified format is ONE question per message and ONE decision
outstanding at a time. Packet 1 first; Packet 2 only after it resolves.

Format follows §5g(c2): terse context → labeled options → recommended option + one-line rationale →
explicit reply instruction. Both have a genuinely safe default, so both are eligible for the
retry→auto-default policy — but see the note under Packet 2, which I do **not** think should
auto-default.

---

## PACKET 1 — the composite

> Adam's contract rewrite is ready. It's the shortened version you approved on 7/29 PLUS three
> restorations of things that approval would have deleted: acceptance-sitting ownership, four SD
> sourcing rules, and the sourcing-engine section a sibling SD updated after your approval. Each
> restores content you'd already approved being in the contract — but the whole is not literally the
> file you signed.
>
> A) Land it with all three restorations
> B) Land only what you signed on 7/29, drop the three
> C) Send me the three restorations to read first
>
> RECOMMENDED: A — each restoration puts back a rule you already approved, and B would silently
> delete a chairman-directed sourcing rule and revert a sibling SD that shipped yesterday.
>
> Reply A, B or C. DETAILS for the full text of any restoration.

**Safe default**: A. Reversible (row-level rollback from a hashed 9-row snapshot), non-spend.

---

## PACKET 2 — the SMS heartbeat cadence

> Landing Adam's contract changes your text heartbeat cadence and I don't want that to slip past
> you. The old contract says HOURLY. The new one drops the word entirely, so it would land with no
> stated cadence. Separately, you told me on 7/19 to use every 30 minutes "until I restore hourly" —
> that override is still live.
>
> A) Keep 30 minutes, write it into the contract
> B) Go back to hourly
> C) Something else — tell me the interval
>
> RECOMMENDED: A — it matches what you actually asked for most recently, and writing it down stops
> the next contract edit from quietly changing it again.
>
> Reply A, B or C.

**NO SAFE DEFAULT — do not auto-apply this one.** The contract's no-reply policy auto-applies a
stated default after two retries, and that is right for most items. Not here: every option changes
how often his phone buzzes, so an unanswered question auto-selecting a cadence is the fleet choosing
its own contact frequency with him. Per the contract's own guardrail — *an item with NO safe default
STAYS HELD and escalates* — this one holds.

---

## Why these are the only two left

The scope question was settled by the coordinator (five-row consolidation, keep 614, §6 → row 602).
The govern-vs-demote question was settled by the chairman at 12:08:50Z — *"A - govern, no
auto-default"*, verified at source in `sms_relay_staging` row `6cc469b1`. Companions are landed and
governed. The apply path is implemented, preflight-clean, and triple-gated.

Both of these are **content** calls. Neither the coordinator nor a worker should make them.
