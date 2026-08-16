# C3 REVIEW — the LEO handoff / gate spine (REVIEW-ONLY PR, never merge)

Base branch deletes 12 files; this head restores them byte-identical to main so the diff carries their full text. Every SD in this system passes through these files at every phase boundary; they have never been reviewed as a unit. Findings are triaged by Adam and routed to the belt as QFs/SDs.

## What these files are
- `HandoffOrchestrator.js` + `ResultBuilder.js` — entry point for `handoff.js execute <PHASE> <SD>`; routes to executors, assembles the verdict.
- `executors/BaseExecutor.js` — the shared pipeline every phase executor runs (pre-checks, gates, recording, auto-migrations).
- `executors/lead-final-approval/index.js` — the COMPLETION guard: the last gate before an SD is marked completed.
- `recording/HandoffRecorder.js` — writes the canonical `sd_phase_handoffs` state (the DB is the source of truth).
- `gates/subagent-evidence-gate.js` — requires fresh `sub_agent_execution_results` rows per phase (SUBAGENT_EVIDENCE_MISSING).
- `gates/scope-completion-gate.js`, `gates/fr-delivery-classifier.js`, `gates/fr-delivery-traceability-gate.js` — decide whether the PRD's functional requirements were actually delivered.
- `lib/handoff/wait-verdict.js`, `parent-detection.js`, `gate-skip-detection.js` — orchestrator-parent lifecycle (WAIT vs FAIL), parent detection, and detection of gates that were skipped.

## Focus asks (priority order)
1. **False PASS paths**: any way a gate returns pass/skip when its subject was not measured (empty result treated as pass; caught error treated as pass; a `limit`/window/filter that silently narrows the population; a bypass flag or "not applicable" branch reachable by ordinary input). Name the input that produces the false green.
2. **State written vs state claimed**: does `HandoffRecorder` persist exactly what the orchestrator reports (accepted/rejected, gate scores, evidence ids)? Any path where the CLI prints success but the row is not written, or written with a different verdict (PERSIST≠RETURN)?
3. **Sub-agent evidence gate**: can stale, wrong-phase, wrong-SD, or fixture rows satisfy it? Is "fresh" measured against the right clock/phase?
4. **Completion guard (lead-final-approval)**: what does it NOT check that a completed SD should have (retrospective, PR merged, deliverables, completion flags)? Any ordering where the SD is marked completed before the check finishes?
5. **Parent lifecycle**: WAIT vs FAIL — can a parent with incomplete children complete? Can `parent-detection` misclassify a leaf as parent (or vice-versa) from metadata alone?
6. **Bypass surface**: `--bypass-validation`, skip flags, env toggles — are they audited (reason recorded) and bounded, or is any silent?

Severity: label pre-existing (all of it is on main); we care about correctness classes, not merge blocking.
