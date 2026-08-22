/**
 * SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001 (FR-5 AC#5, TS-7).
 *
 * The single, pinned, machine-readable source of truth for the CI secret
 * name the chairman's keystrokes document instructs them to create, and
 * that altifyai's deploy.yml consumes. EHG_Engineer is the source of truth
 * (FR-5's keystrokes document is authored here) -- this constant is what
 * scripts/uat-secret-name-drift-check.mjs compares BOTH the live keystrokes
 * document (strategic_directives_v2.metadata.fr5_keystrokes_draft.secret_name)
 * and altifyai's live deploy.yml against.
 *
 * @module lib/eva/synthetic-actor-constants
 */
export const CHAIRMAN_UAT_SECRET_NAME = 'CHAIRMAN_UAT_SESSION_TOKEN';
