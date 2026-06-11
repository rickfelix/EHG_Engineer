# RCA: ENF-SD-CREATE-SKILL Hook Block — Doc/Enforcement Drift in `leo_protocol_sections`

**Authored**: 2026-05-27 (session b240467a context, requesting agent in LEAD on SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001)
**Trigger**: PreToolUse hook block on first SD creation attempt
**Classification**: `protocol_process` (cross_cutting between docs + enforcement)
**Category**: `cross_cutting` (doc + hook + db-source-of-truth)
**Confidence**: 0.95

---

## Symptom

Bash command `node scripts/leo-create-sd.js --from-plan docs/plans/sd-leo-infra-automate-stage19-cascade-001-plan.md --type orchestrator --title "..." --yes` blocked by `pre-tool-enforce.cjs` rule **ENF-SD-CREATE-SKILL** with message:

```
PROTOCOL VIOLATION (ENF-SD-CREATE-SKILL): Direct leo-create-sd.js invocation blocked.
Use the /sd-create skill instead: Skill tool with skill="sd-create"
... (If invoking from inside the /sd-create skill, prefix with SD_CREATE_VIA_SKILL=1 ...)
```

The hook fired correctly. The requesting session followed `CLAUDE_LEAD_DIGEST.md:120` ("Run `node scripts/leo-create-sd.js`") verbatim. Unblocked on retry via Skill tool; no looping.

## Investigation

### Step 1 — Evidence (timestamps verified via `stat` and `git log --format="%ci"`)

| Artifact | Last Change | Notes |
|---|---|---|
| `scripts/hooks/pre-tool-enforce.cjs` | **2026-05-26 11:31:19** (live) — rule anchored **2026-05-04** in PR #3544 (QF-20260504-484) | ENF-SD-CREATE-SKILL enforcement live for **23 days** |
| `.claude/commands/sd-create.md` (skill spec) | Birth **2026-04-03**, modified **2026-05-06** | Skill spec mandates `SD_CREATE_VIA_SKILL=1` prefix on all canonical calls |
| `CLAUDE_LEAD.md` | **2026-05-27 19:14:12** (regenerated TODAY) | Still says "Run `node scripts/leo-create-sd.js`" at L320-326, L1382, L1397 |
| `CLAUDE_LEAD_DIGEST.md` | **2026-05-27 19:14:12** (regenerated TODAY) | L120 "Run `node scripts/leo-create-sd.js`" — no skill mention |
| `permission_audit_log` (DB) | n/a | **ZERO** ENF-SD-CREATE-SKILL block rows in last 30 days |

The zero-block count is the key forcing function for severity: this is a **near-miss / first-occurrence** event for the audit log, not a recurring failure mode. Likely explanation: prior sessions either invoked the skill from a different starting context (orchestrator-coordinator routing through `/leo`), or the hook itself only landed recently enough that few raw-Bash attempts have happened. Either way, the cost of waiting for it to recur is low.

### Step 2 — Domain expert consult (INLINE — Task tool unavailable in nested sub-agent)

**Documentation-as-Contract / DB-Source-of-Truth lens** (synthesized from CLAUDE.md core rules + `lib/protocol/*` and `generate-claude-md-from-db.js` conventions):

- The protocol is **DB-first**: `leo_protocol_sections` rows are the source; .md files are generated artifacts. A drift fix in the .md files is reverted on next regen.
- **Five rows mention `leo-create-sd.js`; zero mention the skill or the hook.** Concretely:
  - `id=388` (target=`CLAUDE_LEAD.md`, type=`sd_creation_process`, 9145 chars) — **primary drift row** (feeds CLAUDE_LEAD.md L320-326 + L1382 + L1397 + CLAUDE_LEAD_DIGEST.md L107-122)
  - `id=407` (no target_file, type=`sd_creation_anti_pattern`, 718 chars) — **anti-pattern block** with `node scripts/leo-create-sd.js` as the "correct workflow"; renders into LEAD digest at L101-122
  - `id=409` (no target_file, type=`script_anti_patterns`, 944 chars) — broader anti-pattern, feeds `CLAUDE_CORE.md` L1267
  - `id=428` (target=`CLAUDE.md`, type=`work_item_routing`) — references `leo-create-sd.js` in routing table; CLAUDE.md L190 essentials list
  - `id=595` (target=`CLAUDE_EXEC.md`, type=`exec_atomic_insert_writer_consumer_pattern`) — **historical/pattern reference, not instructional** — out of scope
- **No row in `leo_protocol_sections` references either `/sd-create`, `SD_CREATE_VIA_SKILL`, or `ENF-SD-CREATE-SKILL`.** The hook is policy without doctrinal backing in the source-of-truth.
- The expert would NOT prescribe editing CLAUDE_LEAD.md / CLAUDE_LEAD_DIGEST.md directly — those edits drift on regen. Fix must land in `leo_protocol_sections`.
- The expert would also flag that `id=407` and `id=409` having `target_file IS NULL` means they likely render into multiple files via section_type joins; a single row update there cascades to LEAD + CORE simultaneously.
- The expert would NOT recommend deleting the hook ("just relax the rule"). The skill provides description enrichment, vision readiness rubric, and post-creation chaining that the raw script omits; the skill IS the intended user path.

**Inline consult performed under Documentation-as-Contract / DB-Source-of-Truth lens due to sub-agent depth limits (`Task`/`TeamCreate` unavailable in nested sub-agent runtime).**

### Step 3 — 5-Whys

1. **Why was the bash invocation blocked?** ENF-SD-CREATE-SKILL hook matches `^|[\s;&|`]node\s+\S*\bleo-create-sd\.js\b` without `SD_CREATE_VIA_SKILL=1` prefix.
   *Evidence*: hook lines 410-411 of `pre-tool-enforce.cjs`.
2. **Why did the session try the bare bash form?** `CLAUDE_LEAD_DIGEST.md:120` (the file the session loaded) reads: *"Run `node scripts/leo-create-sd.js`"* with no mention of the skill or the env prefix.
   *Evidence*: file content L101-122, regenerated 2026-05-27 19:14:12 (verified via `stat`).
3. **Why does CLAUDE_LEAD_DIGEST.md still say that?** It is auto-generated from `leo_protocol_sections` rows id=388 / id=407 by `scripts/generate-claude-md-from-db.js`; those rows still contain the pre-skill instruction.
   *Evidence*: DB query of `leo_protocol_sections WHERE content LIKE '%leo-create-sd%'` returns 5 rows, **0** mention the skill or the hook.
4. **Why weren't those rows updated when QF-20260504-484 anchored the hook (PR #3544, 2026-05-04)?** The QF's stated scope was *"anchor ENF-12 npm-install guard / ENF-SD-CREATE-SKILL matcher + skill bypass prefix"* — i.e., it tightened the **regex** to stop false-positives and added the bypass prefix. It did NOT include a doc-source migration to update `leo_protocol_sections` rows that prescribed the now-blocked form.
   *Evidence*: PR #3544 commit message + git log; absence of any `leo_protocol_sections` update referencing the skill (DB query).
5. **Why is there no general mechanism to keep the hook ruleset and `leo_protocol_sections` in sync?** No process step requires hook authors to update doctrinal sections when adding/changing a rule, and no inverse linter cross-references `pre-tool-enforce.cjs` rule codes against DB content. The hook and the doctrine evolve independently.
   *Evidence*: search for `ENF-SD-CREATE-SKILL` in `leo_protocol_sections` returns 0 rows; no CI gate or QF guard cross-checks the two.

## Root Cause

**Doctrinal source-of-truth drift between enforcement layer and DB-backed protocol sections.** The ENF-SD-CREATE-SKILL hook was hardened on 2026-05-04 without a corresponding update to the four instructional `leo_protocol_sections` rows (id 388 / 407 / 409 / 428) that prescribe `leo-create-sd.js` invocation. Every regeneration of CLAUDE_LEAD/CLAUDE_LEAD_DIGEST/CLAUDE_CORE/CLAUDE.md (such as today's 19:14:12 regen) reproduces the obsolete instruction. The hook is correct; the doctrine is stale.

This is a **process control gap** (the QF scope did not include the migration step), not a code bug.

## Contributing Factors

- **C1 — Digest discoverability**: The full CLAUDE_LEAD.md DOES carry the same stale instruction (L320-326, L1382, L1397); the issue is not digest-specific. The requesting agent's hypothesis that "the full file might have the skill routing" is **incorrect** — both files share the same upstream row (id=388 + id=407) and both are wrong.
- **C2 — Skill spec lives outside `leo_protocol_sections`**: `.claude/commands/sd-create.md` is hand-authored (per its own L7 comment), so the skill's authoritative spec never participates in the DB regen. The doctrinal sections cannot cross-reference it without a manual link.
- **C3 — No inverse linter**: There is no CI check that scans `pre-tool-enforce.cjs` rule codes and asserts a corresponding mention in `leo_protocol_sections` (or vice versa). Hook authors are not nudged to update doctrine.
- **C4 — Zero-block audit signal hid the drift**: With **0** ENF-SD-CREATE-SKILL blocks in 30 days of `permission_audit_log`, no operational dashboard surfaced the misalignment — it took a first-occurrence trip-up by a session to expose it.
- **C5 — Two-row redundancy in DB**: Both id=388 and id=407 prescribe the same instruction in the same digest, so the digest carries the wrong message twice. Each must be updated.

## CAPA Recommendations

### Corrective (Fix the drift — DB-source, not .md)

**CA-1 — Update `leo_protocol_sections.id=388`** (target=CLAUDE_LEAD.md, type=sd_creation_process):
- Replace bare `node scripts/leo-create-sd.js [--from-plan ...]` examples with the skill-routed form: `Skill tool with skill="sd-create"` (preferred) AND `SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js [--from-plan ...]` (script form for cases where the skill is unavailable, e.g. CI / nested sub-agents).
- Add a one-line callout: *"Direct `node scripts/leo-create-sd.js` invocation without the env prefix is blocked by hook ENF-SD-CREATE-SKILL (see `scripts/hooks/pre-tool-enforce.cjs`)."*

**CA-2 — Update `leo_protocol_sections.id=407`** (no target_file, type=sd_creation_anti_pattern):
- Same content replacement as CA-1, scoped to the "Correct Workflow" / "ALWAYS use the standard CLI" subsections.
- This row renders into the digest's L101-122 "SD Creation Anti-Pattern" block.

**CA-3 — Update `leo_protocol_sections.id=409`** (no target_file, type=script_anti_patterns):
- Change `❌ create-*-sd.js → Use \`node scripts/leo-create-sd.js\`` to `❌ create-*-sd.js → Use the /sd-create skill (or SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js)`.
- This row feeds CLAUDE_CORE.md L1267.

**CA-4 — Update `leo_protocol_sections.id=428`** (target=CLAUDE.md, type=work_item_routing):
- In the essential commands list (CLAUDE.md L190 area), change `Create SD: node scripts/leo-create-sd.js` to `Create SD: /sd-create skill (Skill tool)`. The bare command is still mentioned in CORE for completeness, but CLAUDE.md's quick-reference should match the enforced path.

**CA-5 — Regenerate** by running `node scripts/generate-claude-md-from-db.js`; verify CLAUDE_LEAD.md / CLAUDE_LEAD_DIGEST.md / CLAUDE_CORE.md / CLAUDE.md all now reference the skill.

All four updates above are doctrinal-content edits; no schema or code change. Should fit in one QF.

### Preventive (Prevent re-drift — multi-layer)

**PA-1 — Inverse-linter CI check (recommended primary control)**:
A small script that:
1. Parses `pre-tool-enforce.cjs` for all `auditPermissionDecision(_SESSION_ID, TOOL_NAME, '<RULE-CODE>', ...)` rule codes (regex over the file, ~15 codes today).
2. For each rule code, asserts that **at least one** `leo_protocol_sections.content` mentions the rule code or the bypass mechanism (e.g., `SD_CREATE_VIA_SKILL`).
3. Fails CI with `[ENFORCEMENT_DOCTRINE_DRIFT]` listing offending codes.
- **Location**: new file `scripts/lint/enforcement-doctrine-parity.cjs`, called from existing `npm run lint:protocol` aggregator (or `claude-md:check` if that's the chokepoint).
- **Type**: `validation_gate` (CI-level).

**PA-2 — Hook-author runbook updated** (lighter alternative if PA-1 is too heavy):
A new `leo_protocol_sections` row of type `hook_authoring_checklist` (or similar) that requires hook authors to:
- File a paired `leo_protocol_sections` update for any new ENF-* rule.
- Reference both the rule code AND the bypass mechanism in the doctrine.
- **Type**: `documentation` (process control, no automation).
- **Lower confidence** that this gets followed; PA-1 is preferred.

**PA-3 — Audit-log dashboard surface for ZERO-block-but-existing-rule**:
The fact that `permission_audit_log` shows **0** ENF-SD-CREATE-SKILL blocks in 30 days is suspicious — either the rule is over-specified (false negatives), well-respected (good), or sessions are routing around it (e.g., always using the skill). A small dashboard widget that highlights rules with `block_count=0` over a 30/60/90 day window would surface dormant-but-misaligned rules earlier.
- **Type**: `runtime_check` (observability).
- **Optional / lower priority** than PA-1.

**PA-4 — Pattern entry in `issue_patterns`**:
File `PAT-LEO-INFRA-ENFORCEMENT-DOCTRINE-DRIFT-001`:
- Symptom: hook block fires on instruction from `leo_protocol_sections`-rendered doc.
- Solution: update the source row, run regen, verify cascade.
- Prevention: PA-1 inverse linter.
- This is the **3rd witness** of the broader writer-consumer asymmetry pattern (`PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001`) — enforcement layer (consumer) requires shape that doctrine (writer) doesn't produce. Consider linking as a sub-pattern.

### Feedback Loop (Phase-1 discipline, SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-G)

```jsonc
{
  "feedback_loop": {
    "command": "node scripts/lint/enforcement-doctrine-parity.cjs --rule ENF-SD-CREATE-SKILL",
    "time_to_fail_seconds": 5,
    "deterministic": true
  }
}
```

Pre-CA: the lint will fail (no `leo_protocol_sections` row mentions `ENF-SD-CREATE-SKILL` or `SD_CREATE_VIA_SKILL`).
Post-CA-1..CA-5: the lint should pass for ENF-SD-CREATE-SKILL.
The lint itself is built as part of PA-1; until then, a manual SELECT against `leo_protocol_sections` is the feedback loop.

## Severity & Routing

- **Audit signal**: 0 blocks in 30 days, 1 session (this one) tripped it — **LOW frequency**.
- **Self-recovery**: requesting session unblocked on first retry via Skill tool — **LOW friction in practice**.
- **Doc-correctness ROI**: HIGH — every fresh session reading the digest WILL read the wrong instruction; this trip-up will recur until CA lands.

**Recommended severity: QF (Tier 2, 31-75 LOC equivalent)**.
- 4 small DB row content edits (CA-1..CA-4) + regen verification (CA-5) ≈ 30-60 LOC of content changes + 1 commit message.
- PA-1 inverse linter is a separate, larger piece of work (~75-150 LOC including tests) — file as a **follow-up SD** (`SD-LEO-INFRA-ENFORCEMENT-DOCTRINE-PARITY-LINT-001`, Tier 3) if PA-1 is adopted; can be deferred without harm because the QF closes the immediate drift.

**Do NOT block** the current SD (SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001). This RCA fix is doc-discoverability and runs in parallel.

## Verification

- **Test**:
  1. `SELECT id, content FROM leo_protocol_sections WHERE id IN (388, 407, 409, 428) AND (content LIKE '%SD_CREATE_VIA_SKILL%' OR content LIKE '%sd-create skill%')` — must return 4 rows post-CA.
  2. Run `node scripts/generate-claude-md-from-db.js` and grep `CLAUDE_LEAD.md CLAUDE_LEAD_DIGEST.md CLAUDE_CORE.md CLAUDE.md` for `SD_CREATE_VIA_SKILL` or `sd-create skill` — must return matches in all four.
  3. Bash invocation `node scripts/leo-create-sd.js --help` should still pass the hook (--help bypass intact).
- **Regression**: ensure no `leo_protocol_sections` row newly prescribes the bare bash form. Inverse-linter PA-1 once shipped enforces this permanently.

## Followup Tags

- **Filing recommendation**: QF for CA-1..CA-5 doctrine fix. Title: `QF: leo_protocol_sections drift on ENF-SD-CREATE-SKILL (4 rows)`.
- **Separate SD recommendation**: `SD-LEO-INFRA-ENFORCEMENT-DOCTRINE-PARITY-LINT-001` for PA-1 inverse linter (lower priority, defer if needed).
- **Pattern entry**: `PAT-LEO-INFRA-ENFORCEMENT-DOCTRINE-DRIFT-001` in `issue_patterns` (link to PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 as parent).

## Experts Consulted

- **Documentation-as-Contract / DB-Source-of-Truth (inline)** — performed inline under nested-sub-agent runtime where `Task`/`TeamCreate` are unavailable. Identified the four offending rows, the writer-consumer-asymmetry parent pattern, the PA-1 inverse-linter as the durable preventive, and the explicit recommendation to NOT relax the hook.

---

*RCA produced 2026-05-27 by rca-agent (Claude Opus 4.7 1M ctx) at the request of LEAD session b240467a working SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001. No corrective action implemented — corrective-only per RCA-agent contract.*
