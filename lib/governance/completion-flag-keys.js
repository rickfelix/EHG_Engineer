/**
 * Shared frozen contract for completion-flag metadata keys.
 *
 * SD-LEO-INFRA-COMPLETION-FLAGS-DURABLE-001 / TR-2.
 *
 * Imported by BOTH the writer (scripts/capture-completion-flags.js) and the consumer
 * (scripts/hooks/stop-subagent-enforcement/post-completion-validator.js) so the metadata
 * keys cannot drift across files — a single source of truth defeats
 * PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (writer/consumer key drift makes the
 * enforcement gate a silent permanent no-op).
 *
 * Both consumers are ESM (`import`/`export`), so this is a single ESM module — no
 * CJS mirror is needed and there is exactly ONE literal source for every key.
 *
 * @module lib/governance/completion-flag-keys
 */

export const COMPLETION_FLAG = Object.freeze({
  ORIGIN_KEY: 'origin',
  ORIGIN_VALUE: 'completion_flag',
  SOURCE_SD_KEY: 'source_sd',
});
