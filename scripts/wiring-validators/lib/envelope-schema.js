/**
 * Wiring Validator Envelope Schema (Shared)
 *
 * SD-LEO-WIRING-VERIFICATION-FRAMEWORK-ORCH-001-E (FR-4, TR-3)
 *
 * Single source of truth for the JSON envelope shape emitted by every wiring
 * validator detector (orphan, spec-code-drift, vision-traceability, e2e-demo).
 * Imported by:
 *  - This SD's e2e-demo-recorder.js (emit-side validation)
 *  - Sibling D's wiring-validation-runner.js (ingest-side validation)
 *
 * Schema bumps require a coordinated PR pair with D and a bump to
 * envelope_schema_version. D's runner asserts version compatibility before parse.
 *
 * Mitigates Risk R-2 (schema drift between detector and ingester).
 */

import { z } from 'zod';

/**
 * Current envelope schema version. Bump on breaking changes ONLY.
 * Additive changes (new optional fields) do NOT require a bump.
 */
export const ENVELOPE_SCHEMA_VERSION = 1;

/**
 * Per-step evidence captured by detectors that execute discrete steps
 * (currently only e2e_demo, but spec-code-drift may adopt later).
 */
export const StepEvidenceSchema = z.object({
  step_number: z.number().int().positive(),
  instruction: z.string(),
  exit_code: z.number().int().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  match_result: z.enum(['passed', 'failed', 'partial', 'skipped']),
  match_method: z.enum(['SUBSTRING', 'REGEX', 'STRUCTURAL', 'NONE']),
  duration_ms: z.number().int().nonnegative(),
  delta: z.string().optional(),
  warnings: z.array(z.string()).optional()
});

/**
 * Top-level envelope. All detectors emit this shape on stdout.
 * D's wiring-validation-runner.js parses this then INSERTs into
 * leo_wiring_validations (D-owned table).
 */
export const EnvelopeSchema = z.object({
  envelope_schema_version: z.literal(ENVELOPE_SCHEMA_VERSION),
  sd_key: z.string().min(1),
  check_type: z.enum([
    'orphan_detection',
    'spec_code_drift',
    'vision_traceability',
    'e2e_demo'
  ]),
  status: z.enum(['passed', 'failed', 'partial', 'skipped']),
  signals_detected: z.array(z.union([z.number(), z.string()])),
  evidence: z.object({
    steps: z.array(StepEvidenceSchema).optional(),
    total_duration_ms: z.number().int().nonnegative().optional(),
    started_at: z.string().datetime().optional(),
    completed_at: z.string().datetime().optional(),
    note: z.string().optional()
  }).passthrough()  // detectors may add detector-specific fields under evidence
});

/**
 * Parse an envelope JSON object, throwing on schema violations.
 * Used by detectors before emit (catches authoring bugs early)
 * and by D's runner before persist (catches schema drift).
 */
export function parseEnvelope(data) {
  return EnvelopeSchema.parse(data);
}

/**
 * Safe parse — returns { success, data | error } without throwing.
 * Useful when ingesting envelopes from older detectors that may not
 * include envelope_schema_version (legacy / pre-FR-4 detectors).
 */
export function safeParseEnvelope(data) {
  return EnvelopeSchema.safeParse(data);
}
