# AltifyAI First Customer Outreach — Demand-Test PASS/FAIL Criteria (FR-6)

**SD-LEO-GEN-ALTIFYAI-FIRST-CUSTOMER-001** | venture `50763b6a-1fad-4e1e-b2fc-296a1d66ebf9`

## Scope and honest framing

This is a single, manual, 1:1 outreach message (n=1) -- a qualitative signal, not a statistically
powered test. It is NOT the same instrument as the venture's existing aggregate demand-test kill
criteria (K1/K2/K3 in `ventures.metadata.demand_test_plan`, which require a met sample floor of
>=300 visitors or >=30 manual touches before any kill/proceed verdict fires). This single outreach
feeds directional evidence toward that larger test; it cannot substitute for it, and no PROCEED/KILL
decision should be drawn from this one data point alone.

## Recording the outcome

Once the chairman approves the staged message (FR-4) and it is actually sent by a human, and a
real-world outcome is observed, record it via the venture's existing `venture_demand_verdicts`
mechanism -- no new recording table or flow is needed for this SD.

## PASS / FAIL / NO-DATA criteria for this single outreach

| Outcome | Criterion | What it means |
|---|---|---|
| **PASS (strong signal)** | Prospect replies within 5 business days AND expresses either explicit interest in trying the product, asks a pricing/trial question, or forwards it to someone else who would use it. | Genuine engagement -- the zero-config/no-plugin-install wedge resonated enough to prompt a real response. |
| **PASS (weak signal)** | Prospect replies within 5 business days with a polite but noncommittal response (e.g. "interesting, I'll take a look") and does not opt out. | Some engagement, not a strong buy signal -- worth a qualitative read, not a quantitative one. |
| **FAIL** | Prospect explicitly declines, asks to be removed/unsubscribed, or replies negatively about the approach or the product. | A real, direct negative signal on this specific wedge/message -- should inform whether the wedge itself (not just this one recipient) needs revision before further outreach. |
| **NO-DATA** | No reply within 10 business days. | Absence of a reply is NOT evidence of disinterest at n=1 -- record as NO-DATA, not as an implicit FAIL, consistent with the venture's own "a gauge whose floor is unmet renders NO-DATA, never a manufactured number" doctrine (`ventures.metadata.demand_test_plan.floors.honest_gauge_rule`). |

## What this single outreach cannot answer

- Statistical conversion rate (needs the full sample floor, not n=1).
- Whether the human-upload market (M1) beats the AI-agent/API market (M2) in aggregate --
  already separately addressed by QF-20260817-982's PBN re-evaluation
  (`docs/recommendations/QF-20260817-982-altifyai-dual-market-pbn-evaluation.md`).
- Pricing sensitivity (this outreach does not include a price point per FR-3's scope).

## Next step once an outcome is observed

Whoever observes the real-world reply (or its absence past the 10-business-day window) should:
1. Classify it against the table above.
2. Record it in `venture_demand_verdicts` for AltifyAI, referencing this SD and the specific
   `chairman_decisions` row (decision_type='outbound_publish_approval') this outreach was staged
   under.
3. If FAIL or a second consecutive NO-DATA occurs on a future single outreach, flag to the
   chairman/Adam before continuing further 1:1 outreach on the same wedge -- this SD does not
   itself decide when to stop, only documents the criteria for whoever does.
