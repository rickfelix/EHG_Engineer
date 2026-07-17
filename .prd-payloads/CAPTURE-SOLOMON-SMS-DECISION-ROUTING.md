# Solomon verdict — SMS decision-class routing (SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001)

Source: Solomon consult reply id=1a809123 (ref row 4e1a7094), b1f789ea, 2026-07-16. Confidence: high.
Status of the SD: HELD at PLAN boundary until 10DLC (A2P campaign) lands. Fold this into the PLAN/spec when it unfences. escalate_to_chairman=false (rides the decision-with-default packet).

## Verdict
1. **NOTIFY-vs-DECIDE is the RIGHT primary cut.** One sharpening: the three admission conditions are DESIGN-TIME admission criteria, NOT the runtime predicate. Runtime = an ENUMERATED WHITELIST checked server-side at the bridge; unknown/unclassified → console; fail-closed; never trust the asking agent's self-label. An agent evaluating "is this reversible?" per-message is the rationalization hole; membership in a chairman-ratified class list is not.
2. **NOTIFY may cover anything, with two guards:** (a) content-sensitivity axis governs EVERY body incl. notify (no venture financials on a lock screen — "decision waiting: console"); (b) deep-links carry NO auth (no magic links) — a token-bearing link makes SMS an auth surface and breaks L6 composition; plain console URL, normal login.
3. **THRESHOLD:** default **$250/decision AND $500/day CUMULATIVE** across all SMS-approved spend, chairman-tunable. Cumulative cap matters more than per-decision (a spoofer must not clear N×$250 in a burst). Bounds the fully-compromised-channel worst case (SIM-swap answering genuinely-pending questions — the one attack nonce binding does NOT stop). "Reversible" for money = refundable/cancellable within the undo window.
4. **ADD:** (a) UNDO WINDOW — SMS-decided spend executes after ~15min delay; confirm SMS says "reply UNDO by HH:MM" (converts reversible-in-principle to reversible-by-mechanism); (b) NO BATCHING — one decision per SMS question ("YES approves all 5" rebuilds high consequence from low pieces); (c) RATCHET — widening the whitelist IS a governance change → console-only, chairman-ratified (the routing policy can never be edited over the channel it governs); (d) AUDIT PARITY — SMS decisions land on the same `chairman_decisions` row with `channel='sms'`; (e) AUTO-SUSPEND — N consecutive invalid/unmatched inbound → suspend SMS-DECIDE to notify-only + console alert (degrade closed); (f) free-text replies are UNTRUSTED content relayed to the asker, never executed — SMS selects among presented options (affirms FR-2).
5. **REJECT:** re-auth/confirmation-challenge as a third tier — a challenge over the same spoofable channel is fat-finger UX not auth. Two tiers only (whitelist-SMS, console); if a class tempts re-auth, that IS the console signal. Time-of-day: reuse FR-5 quiet window + TTL-fallback to email/console on unanswered (fire-once lesson). Self-reference explicit: kill-switch, autonomy grants, and THIS policy = console.
6. **COUNTERFACTUAL:** a real cryptographic factor on the wrist (signed replies via app, not bare SMS) lifts the ceiling/caps — but that's a NEW channel decision, not a tweak. If notify volume breeds rubber-stamping, tighten notify eligibility before touching decide.

## Next steps (owner: PLAN)
1. Encode classes as a DB-backed whitelist keyed to the SAME L6 taxonomy.
2. Thresholds as chairman-tunable config.
3. Undo-window on spend classes.
4. Auto-suspend counter on the webhook.
5. Acceptance: unknown-class→console, batch rejected, whitelist-edit-over-SMS rejected, no magic links.
6. VERIFICATION: red-team the webhook (spoofed/unmatched/batch replies) before trusting the pilot.
