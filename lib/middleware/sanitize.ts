/**
 * XSS Input Sanitization Middleware
 * SD-MANUAL-INFRA-XSS-SANITIZE-001
 *
 * Strips HTML tags, script elements, and event handlers from all string
 * fields in request bodies. Defense-in-depth at the API boundary.
 */

import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';

/**
 * Strip HTML tags and dangerous content from a string.
 * Preserves legitimate text content (ampersands, quotes, etc).
 */
export function sanitizeString(input: string): string {
  let result = input;

  // Decode HTML entities that could hide script content
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  result = result.replace(/&#(\d+);/g, (_match, dec) =>
    String.fromCharCode(parseInt(dec, 10))
  );

  // Strip script tags and their content
  result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Strip event handlers (onerror, onload, onclick, etc.)
  result = result.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '');
  result = result.replace(/\bon\w+\s*=\s*[^\s>]*/gi, '');

  // Strip all HTML tags
  result = result.replace(/<[^>]*>/g, '');

  // Strip javascript: and data: URI schemes
  result = result.replace(/javascript\s*:/gi, '');
  result = result.replace(/data\s*:\s*text\/html/gi, '');

  return result.trim();
}

/**
 * Recursively sanitize all string values in an object or array.
 */
export function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      sanitized[key] = sanitizeValue(val);
    }
    return sanitized;
  }
  return value;
}

/**
 * Middleware that sanitizes all string fields in POST/PUT/PATCH request bodies.
 * Composes with existing middleware (withAuth, rate limiter, etc).
 *
 * Usage:
 *   export default withAuth(withSanitization(handler));
 */
export function withSanitization(handler: NextApiHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method || '') && req.body) {
      req.body = sanitizeValue(req.body);
    }
    return handler(req, res);
  };
}
