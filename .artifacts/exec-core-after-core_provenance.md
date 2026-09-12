The incident narratives and measurements behind the always-read CORE rules. Every rule in CLAUDE_CORE.md is in force regardless of whether its history is read here; this file explains, it does not govern.

---

### G3 definition-of-done amendment — the problem it closes (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-3/FR-4 carve)

**The problem this closes**: SDs/QFs whose deliverable is event-processing machinery (a worker, watcher, router, gate, cron, or hook) have repeatedly reached "completed" status while the machinery never processed a single real production event — cold-recovery never wired, a quarantined test, dormant verifiers, an eva-scheduler watcher dead 13 days, a frozen capture gauge, a remediation router with writers never injected at the call site. Each was individually root-caused; this amendment closes the shared root: the protocol's own Definition-of-Done never asked "did it run?"
