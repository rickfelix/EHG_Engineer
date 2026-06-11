<!-- Archived from: scripts/temp/completion-flags-plan.md -->
<!-- SD Key: SD-LEO-INFRA-COMPLETION-FLAGS-DURABLE-001 -->
<!-- Archived at: 2026-06-04T17:03:06.690Z -->

## Type
infrastructure

# Completion Flags: durable capture and visible routing of incidental findings at SD completion

Incidental findings discovered DURING an SD — harness quirks, data discrepancies, deferred
housekeeping, things noticed in passing — currently have no schema and no home. They live only
in the agent's prose completion message, which is ephemeral AND often buried in a long message
the user reasonably skims. When the user closes a session believing the SD is complete, these
flagged follow-ups are silently lost. This SD builds a "Completion Flags" step into the
post-completion tail so every incidental finding is captured into a durable, queryable channel,
surfaced compactly, and enforced so it cannot be silently skipped. User-reported recurring pain
(2026-06-04): "embedded in there are things worth following up on, but I close the session and
they get lost."

## Scope
- FR-1: A standardized "Completion Flags" output block — a documented format (item | type |
  routed-to | id) emitted as the LAST section of every SD completion message. "0 flags" is shown
  explicitly, never silently omitted, so the user can scan follow-ups in seconds.
- FR-2: A flag-capture helper (scripts/capture-completion-flags.js) that takes a structured flag
  list and writes each flag to its routed destination, returning durable IDs. Routing rules:
  harness bug/quirk/friction -> feedback category=harness_backlog (reuse log-harness-bug path);
  needs a human decision -> feedback inbox queue; tied to a specific SD -> that SD's metadata (or
  a follow-on SD if large); already has a home -> link only, never duplicate. Every captured flag
  carries metadata.origin=completion_flag + metadata.source_sd=<sd_key>. The helper ALWAYS writes
  a record per completed SD — either N flag rows or a single "no flags" marker — which is both the
  durable artifact and the enforcement witness.
- FR-3: Codify the flag-capture step in the canonical post-completion sequence — CLAUDE.md (the
  non-pause tail) and the /leo complete sequence — so it runs on BOTH the /leo complete path and
  the raw LEAD-FINAL-APPROVAL path.
- FR-4: Extend the post-completion-tail-enforcement Stop hook to verify a completion-flags record
  exists for a just-completed SD (reminder-first, matching the existing /document //heal //learn
  enforcement). A silent skip is caught.
- FR-5: Make flagged items reviewable — confirm completion-flag rows surface in /leo inbox and the
  harness-backlog sweep, tagged with their source SD (add an origin filter/badge if needed), so
  the user has one review point across all SDs.

## Success Criteria
- On SD completion, incidental findings are written to a durable channel (harness_backlog / inbox
  / owning-SD metadata) with IDs that survive a session close, and a compact standardized
  Completion Flags block lists them at the end of the completion message.
- The post-completion Stop hook flags a completion that produced no completion-flags record (even
  "0 flags" must be explicit).
- A user reviewing /leo inbox or the harness-backlog sweep sees flagged items from completed SDs,
  each tagged with its source SD.

## Notes
[MODE: campaign] harness enhancement. Reuses existing feedback / harness_backlog /
log-harness-bug.js + the post-completion-tail-enforcement hook; no new tables. Self-dogfood:
the SD that builds this should itself emit a Completion Flags block at its own completion.
