/**
 * Deterministic seed generation for design reference pattern selection.
 *
 * Produces a stable numeric seed from a UUID + server-side salt,
 * suitable for seeding a PRNG. The salt prevents external actors
 * from predicting or fingerprinting venture pattern sequences.
 *
 * SD-DYNAMIC-ARCHETYPEMATCHED-DESIGN-REFERENCE-ORCH-001-A
 * @module lib/eva/utils/design-ref-seed
 */

import { createHash } from 'crypto';

const DEFAULT_SALT = 'ehg-design-ref-default-salt-v1';

/**
 * Generate a deterministic numeric seed from a UUID and server-side salt.
 *
 * @param {string} uuid - The venture or reference UUID
 * @param {string} [salt] - Server-side salt (defaults to DESIGN_REF_SALT env var)
 * @returns {number} A 32-bit unsigned integer seed for PRNG
 */
export function generateDesignRefSeed(uuid, salt) {
  if (!uuid) throw new Error('UUID is required for seed generation');

  const effectiveSalt = salt || process.env.DESIGN_REF_SALT || DEFAULT_SALT;

  if (!salt && !process.env.DESIGN_REF_SALT) {
    console.warn('[design-ref-seed] DESIGN_REF_SALT not set, using default salt');
  }

  const hash = createHash('sha256')
    .update(`${effectiveSalt}:${uuid}`)
    .digest();

  // Read first 4 bytes as unsigned 32-bit integer
  return hash.readUInt32BE(0);
}
