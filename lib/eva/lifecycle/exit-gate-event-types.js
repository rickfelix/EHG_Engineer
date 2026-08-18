/**
 * Shared system_events.event_type constants for the exit-gate machinery.
 *
 * SD-FDBK-FIX-EXIT-GATE-CONFORMANCE-001 (FR-3 AC-1, testing-agent finding F2):
 * system_events.event_type is UNCONSTRAINED FREE TEXT in the live schema (no
 * enum/CHECK constraint) and logObserveOnlyEvent/logAnomalyEvent are FAIL-SOFT
 * BY DESIGN (a logging failure must never affect the already-fail-closed
 * blocking verdict) -- a failed insert is console.warn'd and swallowed, never
 * surfaced to the caller. (SECURITY finding F2, same SD: the insert's `error`
 * return value is now explicitly bound and checked in both helpers -- prior to
 * that fix, supabase-js's non-throwing error-return meant the try/catch never
 * even fired, so a failed insert produced NO warning at all.) A producer/
 * consumer event_type STRING typo would therefore be structurally invisible
 * regardless of the insert's own success/failure handling. This module is the
 * SINGLE SOURCE for the event_type strings the exit-gate enforcer (producer)
 * writes and any would-block-rate consumer (FR-4) filters on — never
 * independently re-typed as a string literal on either side.
 *
 * @module lib/eva/lifecycle/exit-gate-event-types
 */

/** Written by artifact-persistence-service.js's advanceStage() / exit-gate-enforcer.js's
 * binding-gate branch when a BINDING gate string has no registered verifier, or the
 * venture_stages config row is missing. Pre-existing (SD-LEO-INFRA-EXIT-GATE-FAIL-CLOSED-POLARITY-001). */
export const EXIT_GATE_ANOMALY = 'EXIT_GATE_ANOMALY';

/** Written for every OBSERVE-mode gate string that DOES resolve to a verifier, recording
 * whether it would have satisfied. Pre-existing (SD-LEO-INFRA-ACTIVATE-DORMANT-EXIT-001). */
export const EXIT_GATE_OBSERVE_ONLY = 'EXIT_GATE_OBSERVE_ONLY';

/** NEW (this SD, FR-3): written when an OBSERVE-mode gate string does NOT resolve to any
 * verifier. Distinct from both EXIT_GATE_ANOMALY (binding-gate anomaly) and
 * EXIT_GATE_OBSERVE_ONLY (a resolvable observe gate's evaluation) so a drifted/typo'd
 * observe-mode string is visible in telemetry instead of silently reading as satisfied. */
export const EXIT_GATE_OBSERVE_UNRESOLVED = 'EXIT_GATE_OBSERVE_UNRESOLVED';
