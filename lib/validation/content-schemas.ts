/**
 * Content Validation Schemas
 * SD-MANUAL-INFRA-XSS-SANITIZE-001
 *
 * Zod transforms that strip HTML/script content from user-supplied strings.
 * Provides schema-level defense-in-depth alongside API middleware sanitization.
 */

import { z } from 'zod';
import { sanitizeString } from '../middleware/sanitize';

/**
 * A string schema that strips HTML tags and script content via transform.
 * Use this for any user-supplied text field that should not contain HTML.
 */
export function sanitizedString(opts?: { min?: number; message?: string }) {
  let schema = z.string();
  if (opts?.min) {
    schema = schema.min(opts.min, opts.message);
  }
  return schema.transform(sanitizeString);
}
