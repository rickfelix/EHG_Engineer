<!-- POCOCK-ADR-RPC-SIGNED: f4be18d7f84f3c79811cebdc104f3f0d2cdf6e18fcd58ad1ee3162a4aa168500 -->

# ADR-0012: Skill bodies follow progressive-disclosure (median 30-100 LOC + supporting docs)

Pocock progressive-disclosure pattern: skill body is the discipline; supporting docs (CONVERGENCE-PROTOCOL.md style) live in the skill subdir. Agent reads body first; dives into supporting docs only when needed. CI rule warns at >200 LOC body. /brainstorm currently >3000 LOC body — refactor deferred to separate SD.

---
Status: accepted
Accepted at: 2026-05-14T16:29:02.484557+00:00
Approved by: chairman-backfill-2026-05-14
