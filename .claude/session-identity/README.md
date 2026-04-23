# Session Identity — Single Source of Truth

Owned by **SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-B (Phase 2)**.

This directory holds the three filesystem artifacts that identify a running Claude Code conversation to the LEO Protocol. Only one of them is canonical; the other two are *derived* and may be rewritten by `scripts/sd-start.js` during boot reconciliation.

## The three identity sources

| Source | Location | Role | Written by |
| --- | --- | --- | --- |
| Canonical marker | `.claude/session-identity/<sessionId>.json` | **Single source of truth.** Created once per CC conversation at `SessionStart`. | `scripts/hooks/capture-session-id.cjs` |
| Derived env var | `process.env.CLAUDE_SESSION_ID` (plus `CLAUDE_ENV_FILE` export line) | Makes the session id available to Bash-tool subprocesses. | `scripts/hooks/capture-session-id.cjs` (SessionStart), rewritten by `scripts/sd-start.js` during reconciliation. |
| Derived pointer | `.claude/session-identity/current` | Fast-path lookup for tools that don't need the full marker. | `scripts/hooks/capture-session-id.cjs` when the flag is on; rewritten by `scripts/sd-start.js` during reconciliation. |

`lib/claim-validity-gate.js` reads all three at the start of every claim-authoritative operation. If they all agree (or only one is present), the gate passes. If two or more are present and disagree, the gate fails closed with `no_deterministic_identity` and a remediation banner that names each disagreeing source.

## Canonical marker schema

Each `<sessionId>.json` file is an atomically-written UTF-8 JSON object.

```jsonc
{
  "session_id": "487c6af6-a8cc-45f2-9dfb-6c45eed8934e",   // CC conversation UUID
  "sse_port":   17981,                                      // CLAUDE_CODE_SSE_PORT at capture time (nullable)
  "cc_pid":     34968,                                      // claude.exe ancestor PID discovered by the hook
  "source":     "startup",                                  // SessionStart source: startup | resume | compact | reconnect | unknown
  "model":      "claude-opus-4-7",                          // Nullable; set when Claude Code advertises it
  "captured_at": "2026-04-23T10:14:08.576Z"                // ISO 8601 UTC
}
```

Field contract:

- `session_id` — REQUIRED. Matches the UUID Claude Code emits in its `SessionStart` stdin payload. Used as the filename stem.
- `cc_pid` — REQUIRED. The claude.exe node ancestor PID, not `process.ppid`. Tooling like `lib/terminal-identity.js::findClaudeCodePid()` uses this to disambiguate sibling CC windows on the same SSE port.
- `source`, `sse_port`, `model` — OPTIONAL; nulls are valid.
- `captured_at` — REQUIRED. Set by the hook on first write. Used for stale-marker cleanup.

## Pointer file schema

`.claude/session-identity/current` holds the session id of the most recently reconciled conversation. Two forms are accepted so the pointer is both grep-friendly and programmatically parseable:

1. Plain text — a bare UUID, optionally trailed by a newline (written by `sd-start.js` via `sotAtomicWrite`).
2. JSON — an object `{"session_id": "<uuid>", ...}`. Reserved for future expansion; any non-UUID `session_id` value causes downstream consumers to treat the pointer as absent.

The pointer is *derived* and may be rewritten at any time.

## Lock file

`.claude/session-identity/.lock` is an exclusive advisory lock used by `reconcileAtBoot()` in `lib/session-identity-sot.js`. Its presence means another process is mid-reconciliation. Locks older than 30 seconds are considered stale and may be broken. The file contents are JSON `{"pid": <number>, "at": <iso>}` for diagnostic purposes only.

Never delete this file manually while `sd-start.js` is running — the owning process will not detect the loss and may produce inconsistent state.

## Ordering invariant (FR-4)

At SessionStart, when `SESSION_IDENTITY_SOT_ENABLED` is on, the hook writes the files in this exact order:

1. `pid-<ccPid>.json` — PID-keyed marker (atomic)
2. `<sessionId>.json` — canonical marker (atomic)
3. `current` — pointer (atomic)
4. `CLAUDE_ENV_FILE` — `export CLAUDE_SESSION_ID=<sessionId>` appended

The env var line is always written last so that any consumer observing the env var can immediately read the canonical marker back. Reversing this ordering (the legacy path, flag OFF) produces the race that this SD was created to fix.

## Atomic write contract (TR-1)

Every write in this directory uses tmp + fsync + rename:

1. Open `<target>.tmp.<pid>.<epochMs>` with `O_WRONLY | O_CREAT | O_EXCL`-style semantics via `fs.openSync(path, 'w')`.
2. `fs.writeSync` the full payload, then `fs.fsyncSync(fd)` before closing.
3. `fs.renameSync(tmp, target)` — atomic on Windows NTFS and POSIX when source and target share a volume.
4. On any error, the tmp file is unlinked in a `finally`-style cleanup before rethrowing.

A `kill -9` at any point during the above leaves either the old file or the new file intact — never a partial write.

## Feature flag

`SESSION_IDENTITY_SOT_ENABLED` — defaults OFF during burn-in.

| Value | Behavior |
| --- | --- |
| unset / `false` / `0` / `no` / `off` | Legacy order. No pointer written. Claim-validity-gate does not require three-source agreement. |
| `true` / `1` / `yes` / `on` | Ordered writes (marker before env var). Pointer maintained. Gate enforces three-source agreement or single-source fallback. |

## Related files

- `lib/session-identity-sot.js` — core primitives (read, write, lock, agreement check, reconciliation).
- `lib/claim-validity-gate.js` — consumes `validateSourcesAgree()` when the flag is on.
- `scripts/sd-start.js` — invokes `reconcileAtBoot()` after session row materialization and before claim-validity-gate.
- `scripts/hooks/capture-session-id.cjs` — SessionStart hook that writes the canonical marker.
- `tests/unit/session-identity-sot.test.js` — exhaustive coverage of the five divergence scenarios plus the atomic-write interruption case.

## Promotion criteria

This flag remains off until telemetry shows, over one full release window:

- Zero `no_deterministic_identity` fail-closes on sessions where at least one source is valid and all present sources agree (AC-1).
- Zero partial-write artifacts after 100+ induced-failure iterations (AC-3).
- Dual-read agreement rate ≥ 99.5% between the canonical marker and the env var (success metric from the SD).

Promotion to default-on flips `SESSION_IDENTITY_SOT_ENABLED=true` in `.env.example` and removes the `sotOrdering` branches from `capture-session-id.cjs` and the legacy path from `claim-validity-gate.js` in a follow-up SD.
