<!-- file_content_hash: 16862a827ddc272b -->
<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
# CLAUDE_SOLOMON_MODEL_POSTURE.md — Solomon Model Posture (binding companion)

**Generated**: 2026-08-29 11:10:18 AM
**Protocol**: LEO 4.4.1
**Purpose**: Model/Max-plan pin, bounded-window swap strategy, availability degradation, and the P4 portability guard
**Load when**: On any pin change, Fable-window open/close, or budget-state change — before acting on model posture

> UNLIKE the MANUAL and PROVENANCE companions, this file BINDS. It was moved out of CLAUDE_SOLOMON.md for READ-CAP reasons only, and CLAUDE_SOLOMON.md carries a pointer marking it BINDING. Its clauses are in force whether or not this file is read; if you are changing the pin, you are required to read it.

---

## Model Posture (pin, window strategy, availability degradation, portability guard)

**Model / Max-plan pin**: launched as `claude --model <pinned-model>` — **Opus 4.8 by default (`MODEL_DEFAULTS.claude.solomon` / `CLAUDE_MODEL_SOLOMON`), Fable-swappable when cleared** — riding the Chairman's **Max subscription** (usage does NOT bill `ANTHROPIC_API_KEY`). **Verify via `/status`** that the session is on the Max plan before any sweep. Ships dormant behind `SOLOMON_CONSULT_V1`.

**Model-window strategy (bounded-window pattern)**: Fable availability is **window-scoped** — when a Fable window opens, the pin may swap for the window's duration; at window close the session **reverts to Opus 4.8 WITH re-registration** (a `/model` switch does NOT re-stamp the session's tier — re-register so tier-aware accounting sees the change). High-stakes grading stays **model-portable** via **sealed pre-registered predictions** (the proven probe pattern): graded claims are committed before the window closes, so any model can grade them after it.

**Model availability degradation** (moved from §10, which retains the role-level bullets):
- **Default model (Opus 4.8) available**: Solomon runs normally on Opus 4.8 — model availability is **no longer an existential gate** on the role (that was the point of the 2026-06-30 pivot off the Fable hard-gate). The role is DORMANT only while `SOLOMON_CONSULT_V1` is OFF (default); once flipped on, Solomon operates on Opus 4.8.
- **Fable swap requested but Fable unavailable/restricted**: the pin simply stays on Opus 4.8 (the `reasoning-tier fallback`). Only the few duties that genuinely *want* Fable's extra depth (top of the suitability map / higher-order apex) run at Opus-depth instead of Fable-depth — a graceful quality degradation on a subset, never a role outage. Nothing blocks; no consult fails.

**P4 — PORTABILITY GUARD** (moved from Operating Posture P1-P3, which keeps a pointer here; posture is a FUNCTION of live budget state, never prose assuming permanence): the offer changed three times in July. Budget present → standing program (Operating Posture P1). Budget shrunk/absent → AUTOMATIC reversion to the episodic window-scoped mode with sealed-prediction portability and Opus-4.8 fallback — the "Model availability degradation" text above becomes the FALLBACK branch, not the default. Pin flips accordingly (Fable standing, Opus fallback); re-registration on any pin change unchanged.

---

*Generated from database: 2026-08-29*
*Protocol Version: 4.4.1*
*Source of truth: leo_protocol_sections (section_type=solomon_model_posture). Do not hand-edit — edit the DB section and regenerate.*
