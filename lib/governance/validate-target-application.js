/**
 * Intake validator: rejects SDs whose target_application contradicts venture context.
 *
 * SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B / PA-4
 *
 * COMPOSES with — does NOT replace — the existing
 *   scripts/modules/sd-validation/target-application-crosscheck.js
 * Per validation condition C4 (orthogonal scope: this validator catches
 * venture-vs-target mismatches; existing validator catches scope-text-vs-target
 * mismatches).
 *
 * Two rejection rules:
 *   RULE-1 (FR-B3): venture_id IS NOT NULL AND target_application='EHG'
 *                   AND normalizeVentureName(venture.name) !== normalizeVentureName('EHG')
 *                   → invalid (defect: venture-routed SD mis-stamped)
 *
 *   RULE-2 (C-SEC-7B): venture_id IS NULL AND target_application NOT IN
 *                      ('EHG', 'EHG_Engineer')
 *                      → invalid (inverse smuggling: null-venture SD targeting
 *                                  non-EHG application)
 *
 * Why NFKD normalization on both sides of the EHG comparison (C-SEC-1B):
 *   Without normalization, an attacker registering a venture as 'E​HG'
 *   (zero-width-space) bypasses the validator. Reuses the canonical
 *   normalizeVentureName from Child A.
 *
 * @module lib/governance/validate-target-application
 */

import { normalizeVentureName } from '../eva/bridge/venture-routing-error.js';

const EHG_LEGITIMATE_TARGETS = new Set(['EHG', 'EHG_Engineer']);
const EHG_NORMALIZED = normalizeVentureName('EHG');

/**
 * Validate an SD's target_application against its venture_id context.
 *
 * @param {Object} args
 * @param {Object} args.sd - SD row with at least { id, venture_id, target_application }
 * @param {Object} args.supabase - Supabase client (used to fetch venture.name when venture_id is set)
 * @returns {Promise<{ valid: boolean, error?: { code: string, rule: string, message: string, sd_id: string, venture_id?: string|null, venture_name?: string|null, target_application: string } }>}
 */
export async function validateTargetApplication({ sd, supabase }) {
  if (!sd) throw new Error('validateTargetApplication: sd is required');
  if (!supabase) throw new Error('validateTargetApplication: supabase client is required');

  const { venture_id, target_application, id: sd_id } = sd;

  // RULE-2 (C-SEC-7B): null-venture SD must target EHG or EHG_Engineer
  if (!venture_id) {
    if (!EHG_LEGITIMATE_TARGETS.has(target_application)) {
      return {
        valid: false,
        error: {
          code: 'TARGET_APPLICATION_INVERSE_SMUGGLING',
          rule: 'RULE-2',
          message:
            `SD has venture_id=NULL but target_application="${target_application}". ` +
            `Null-venture SDs must target EHG or EHG_Engineer (LEO governance work).`,
          sd_id,
          venture_id: null,
          venture_name: null,
          target_application,
        },
      };
    }
    return { valid: true };
  }

  // RULE-1 (FR-B3): venture-routed SD with target_application=EHG and venture.name != EHG
  if (target_application === 'EHG') {
    const { data: venture, error: ventureErr } = await supabase
      .from('ventures')
      .select('id, name')
      .eq('id', venture_id)
      .maybeSingle();

    if (ventureErr) {
      throw new Error(
        `validateTargetApplication: failed to load venture ${venture_id}: ${ventureErr.message}`
      );
    }
    if (!venture) {
      return {
        valid: false,
        error: {
          code: 'TARGET_APPLICATION_VENTURE_NOT_FOUND',
          rule: 'RULE-1',
          message: `SD references venture_id=${venture_id} but no ventures row found.`,
          sd_id,
          venture_id,
          venture_name: null,
          target_application,
        },
      };
    }

    const ventureNameNormalized = normalizeVentureName(venture.name);
    if (ventureNameNormalized !== EHG_NORMALIZED) {
      return {
        valid: false,
        error: {
          code: 'TARGET_APPLICATION_VENTURE_MISMATCH',
          rule: 'RULE-1',
          message:
            `SD has venture_id=${venture_id} (venture.name="${venture.name}") ` +
            `but target_application="EHG". Venture-routed SDs cannot target EHG host application.`,
          sd_id,
          venture_id,
          venture_name: venture.name,
          target_application,
        },
      };
    }
  }

  return { valid: true };
}
