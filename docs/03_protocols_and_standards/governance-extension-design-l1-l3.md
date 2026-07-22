# Governance Extension Design — Formalizing L1–L3 Oversight (DESIGN-ONLY)

**SD:** SD-LEO-INFRA-L4-GOVERNANCE-FORMALIZATION-NIST-EU-AI-ACT-001 (DESIGN-ONLY, `sd_type=documentation`)
**Purpose:** Extend the EVA Manifesto's L1–L4 chain of command to formalize **who at L1/L2/L3 owns** the human-oversight sign-off (EU Art.14), the transparency disclosures (EU Art.50), and the audit + retention duties surfaced by `governance-mapping-nist-euaiact.md` and `governance-gap-list.md`.
**Deadline anchor:** EU AI Act high-risk obligations bind **2026-08-02**. This document assigns *ownership of the obligation*; it does **not** build the mechanisms that enforce it (see "Implementation OUT" below).

> **SCOPE FENCE — DESIGN ONLY.** This document names owners and duties. It writes no code, adds no gate, and emits no events. Every build item is explicitly deferred to a follow-on SD in the "Implementation OUT" section.

---

## 1. Baseline: the EVA Manifesto chain of command

From `docs/reference/eva-manifesto-v1.md:76-85` (chain-of-command diagram):

```
L1: Chairman (Rick)      - Ecosystem Governance, Ultimate Authority
L2: EVA (Chief of Staff) - Interpretation, Orchestration, Synthesis
L3: Venture CEOs         - Autonomous Venture Leadership
L4: VPs → Crews          - Functional Execution
```

The authority/spend matrix at `eva-manifesto-v1.md:128-134` lists: **L4 (Crew) $0**, **L3 (VP) $50**, **L2 (CEO) $500**, **EVA $1,000 (recommend-only on kill/pivot)**, **Chairman (unlimited)**.

### 1a. Known inconsistency in the baseline (flag, do not resolve here)
The diagram (`:79-85`) and the authority matrix (`:128-134`) **label the tiers differently**: the diagram puts *Venture CEOs at L3* and *VPs→Crews at L4*, while the matrix places *CEO at L2*, *VP at L3*, *Crew at L4*, with EVA as a separate row above CEO. This document adopts the SD-grounding's collapsed reading — **L1 Chairman · L2 EVA + Venture CEOs · L3 VPs · L4 Crews** — and treats reconciling the diagram-vs-matrix labeling as an open item for the manifesto owner (noted, not fixed here).

### 1b. Naming collision (must be flagged)
"L1–L4" in this document refers to the **manifesto chain of command** (org authority tiers). It is **NOT** the same as the constitution **enforcement** "Layer 1–4" — `Layer 1: Constitution Validator`, `Layer 2: RLS Policies`, `Layer 3: AI Quality Judge`, `Layer 4: CLI` — documented at `protocol-constitution-guide.md:632-731`. The two "Layer N" schemes are unrelated (org tier vs. enforcement pipeline stage); any consumer of this design must not conflate them.

---

## 2. Oversight-ownership matrix (the formalization)

For each obligation, the table names the **accountable owner** (single throat to choke) and **contributing** roles. L4 crews are **ephemeral executors with no governance authority** (Oath II: agents cannot grant themselves authority) — their outputs are always *subject to* L3/L2 oversight, so L4 owns no obligation and appears only as the supervised party.

| Obligation | L1 — Chairman | L2 — EVA + Venture CEOs | L3 — VPs | L4 — Crews |
|---|---|---|---|---|
| **Art.14 human-oversight sign-off** (`CONST-001/002/009/013`, `FR_DELIVERY_VERIFICATION`) | **Accountable** for GOVERNED/IMMUTABLE changes (constitution amendments, gate config) and sole holder of the **FREEZE** authority (`CONST-009`) and kill/pivot rights. | **EVA:** grooms + synthesizes the decision queue, presents Art.14 decisions to L1; **recommend-only**, cannot self-approve (`CONST-002`). **Venture CEOs:** accountable for venture-scoped GOVERNED approvals within the $500 authority bound. | Accountable for functional-scope sign-off within the $50 bound; own FR-delivery-evidence review (`CONST-012`) for their function; escalate beyond authority. | None — supervised. Cannot approve, cannot self-authorize. |
| **Art.50 transparency disclosures** (`CONST-010`, Oath I) | Owns the **disclosure policy** (what must be labeled as AI-generated / AI-interaction), not per-item disclosure. | **EVA:** every briefing/synthesis must disclose AI provenance + confidence and carry no manipulative framing (`CONST-010`). **Venture CEOs:** accountable for user-facing transparency on their venture's deployed AI surfaces (Art.50 deployer duty). | Accountable for functional transparency (e.g., a marketing VP ensures AI-generated marketing output is labeled). | None — produces content under L3/L2 disclosure rules. |
| **Audit duties** (`CONST-003/008`, `governance_audit_log`, `agent_audit_log`) | Owns the **immutability policy** for constitution/audit tables (RLS no-update/no-delete) and the requirement itself. | **EVA:** accountable for audit-completeness monitoring — every governed action logged (`CONST-003`), surfaces missing-log conditions. | Own the functional-domain audit trail for their area. | None — actions are logged *about* them, not *by* their authority. |
| **Retention duties** (`lib/retention/policies.js`) | **Approves** retention `hotDays` values (chairman-approved SD deliverable per `policies.js:18`) and any table drop. | **EVA:** accountable for surfacing retention-coverage gaps (see `GAP-RET-01/02`) into the decision queue for L1 approval. | Flag domain tables that need a policy. | None. |

**Design principle:** the accountable owner for any Art.14 sign-off is always **human or human-delegated with a hard authority ceiling** — EVA and CEOs operate under recommend-only / bounded-spend limits, and anything above their ceiling escalates to L1. This keeps "AI scores inform but never decide" (`CONST-001`) true at every tier.

---

## 3. How this closes the mapped obligations

- **Art.14 (human oversight):** the matrix gives every `Art.14`-flagged crosswalk row a named human-or-bounded owner and preserves the `CONST-002` no-self-approval separation across tiers. The FREEZE control (`CONST-009`) is pinned to L1 exclusively.
- **Art.50 (transparency):** `CONST-010`'s anti-manipulation / factual-only requirement is assigned as a standing L2 duty (EVA briefings, CEO product surfaces) with L1 owning the disclosure *policy*.
- **Audit + retention:** the audit-completeness duty (`CONST-003`) and the retention-coverage-gap duty (`GAP-RET-01/02`) are given explicit L2 (EVA) accountability, with L1 owning immutability and `hotDays` approval — turning the reactive retention pattern into an owned monitoring responsibility rather than an unassigned one.

---

## 4. Implementation OUT (all deferred to follow-on SDs)

The following are **explicitly out of scope** for this DESIGN-ONLY SD and are named here only so the follow-on triage is unambiguous:

| Deferred build | Follow-on SD (STUB) |
|---|---|
| **SD-0 emission build** — the event-emission mechanism that fires a governance sign-off / disclosure event when an owner acts. | `SD-LEO-INFRA-GOV-SIGNOFF-EMISSION-001` |
| **L1 build** — Chairman glass-cockpit oversight surfaces (Art.14 decision queue, FREEZE control UI, disclosure-policy console). | `SD-LEO-INFRA-L1-OVERSIGHT-SURFACES-001` |
| **L3 build** — VP functional-oversight tooling (functional sign-off + domain audit-trail views). | `SD-LEO-INFRA-L3-FUNCTIONAL-OVERSIGHT-001` |
| **Automated Art.14/Art.50 compliance gate** — a gate that verifies an owner sign-off / disclosure occurred before release. | `SD-LEO-INFRA-ART14-ART50-GATE-001` |
| **Diagram-vs-matrix reconciliation** in the manifesto (§1a inconsistency). | (manifesto owner; not a code SD) |

No mechanism, gate, UI, or emitter is created by the present SD. Ownership is assigned; enforcement is future work.

---

## 5. Cross-references

- Crosswalk of every `CONST-*` rule and `gate_key` to NIST AI RMF + Art.14/50: `governance-mapping-nist-euaiact.md`.
- Gaps this ownership design must cover (retention, exec-path, CONST-015): `governance-gap-list.md`.
- Baseline chain of command + authority matrix: `docs/reference/eva-manifesto-v1.md:76-85`, `:128-134`.
- Constitution enforcement "Layer 1–4" (the colliding term): `protocol-constitution-guide.md:632-731`.
