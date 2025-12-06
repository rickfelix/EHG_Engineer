/**
 * Brand Variants Input Validation
 * SD-STAGE-12-001: Adaptive Naming - Brand Variants
 *
 * CRITICAL: All user input for brand variants must be validated with these schemas
 * to prevent JSONB injection and ensure data integrity.
 *
 * Key Security Requirements:
 * - Strict regex patterns for all text fields (no special characters except -')
 * - Max length constraints on all strings
 * - Enum validation for all categorical fields
 * - No nested object properties beyond schema definition
 */

import { z } from 'zod';

// ============================================================================
// CORE VALIDATION SCHEMAS
// ============================================================================

/**
 * Name Text Validation
 * CRITICAL: Only alphanumeric, spaces, hyphens, and apostrophes allowed
 * Prevents SQL injection and JSONB payload injection
 */
const NameTextSchema = z.string()
  .min(1, 'Name is required')
  .max(50, 'Name must be 50 characters or less')
  .regex(
    /^[a-zA-Z0-9\s\-']+$/,
    'Name can only contain letters, numbers, spaces, hyphens, and apostrophes'
  )
  .trim();

/**
 * Localized Name Validation
 * Structure: { 'en': 'English Name', 'es': 'Spanish Name', etc }
 */
const LocalizedNameSchema = z.record(
  z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Invalid language code (use ISO 639-1)'),
  NameTextSchema
)
  .optional()
  .describe('Localized variant names by language code (e.g., en, es, fr)');

/**
 * Adaptation Reason Enum
 * Defines why this variant was generated
 */
const AdaptationReasonEnum = z.enum([
  'AVAILABILITY_OPPORTUNITY',
  'MARKET_FEEDBACK_NEGATIVE',
  'COMPETITIVE_COLLISION',
  'CULTURAL_OPTIMIZATION',
  'STRATEGIC_PIVOT',
  'CHAIRMAN_GUIDANCE',
  'PERFORMANCE_OPTIMIZATION'
]);

/**
 * Variant Type Enum
 * Categorizes the type of adaptation performed
 */
const VariantTypeEnum = z.enum([
  'PHONETIC_ADJUSTMENT',
  'SEMANTIC_ENHANCEMENT',
  'LENGTH_OPTIMIZATION',
  'CULTURAL_LOCALIZATION',
  'AVAILABILITY_ALTERNATIVE',
  'STRATEGIC_REALIGNMENT'
]);

/**
 * Improvement Hypothesis Validation
 * CRITICAL: Only alphanumeric, spaces, periods, commas, hyphens, apostrophes, and colons
 */
const ImprovementHypothesisSchema = z.string()
  .min(10, 'Hypothesis must be at least 10 characters')
  .max(500, 'Hypothesis must be 500 characters or less')
  .regex(
    /^[a-zA-Z0-9\s\.\,\-\'\:]+$/,
    'Hypothesis contains invalid characters'
  )
  .trim();

/**
 * Variant Details Schema
 * Main structure for variant information stored in JSONB
 */
export const VariantDetailsSchema = z.object({
  name_text: NameTextSchema,

  localized_name: LocalizedNameSchema,

  generation_cycle: z.number()
    .int('Generation cycle must be a whole number')
    .min(1, 'Generation cycle must be at least 1')
    .max(100, 'Generation cycle cannot exceed 100'),

  adaptation_timestamp: z.string().datetime()
    .transform(val => new Date(val))
    .describe('ISO 8601 timestamp of variant generation'),

  adaptation_reason: AdaptationReasonEnum,

  variant_type: VariantTypeEnum,

  improvement_hypothesis: ImprovementHypothesisSchema
})
  .strict() // Reject unknown properties
  .describe('Core variant details stored in JSONB');

export type VariantDetails = z.infer<typeof VariantDetailsSchema>;

// ============================================================================
// FULL VARIANT SCHEMAS
// ============================================================================

/**
 * Schema for CREATING a new brand variant
 */
export const CreateBrandVariantSchema = z.object({
  venture_id: z.string()
    .uuid('Invalid venture ID format')
    .describe('UUID of the venture this variant belongs to'),

  parent_name_id: z.string()
    .uuid('Invalid parent name ID format')
    .optional()
    .describe('UUID of parent variant if this is derived'),

  variant_details: VariantDetailsSchema,

  notes: z.string()
    .max(1000, 'Notes must be 1000 characters or less')
    .regex(
      /^[a-zA-Z0-9\s\.\,\-\'\:\n]+$/,
      'Notes contains invalid characters'
    )
    .optional()
    .describe('Additional notes about this variant')
})
  .strict()
  .describe('Request body for creating a new brand variant');

export type CreateBrandVariantRequest = z.infer<typeof CreateBrandVariantSchema>;

/**
 * Schema for UPDATING a brand variant (creator only)
 */
export const UpdateBrandVariantSchema = z.object({
  variant_details: VariantDetailsSchema.optional(),
  notes: z.string()
    .max(1000)
    .regex(/^[a-zA-Z0-9\s\.\,\-\'\:\n]+$/)
    .optional()
})
  .strict()
  .refine(
    data => Object.keys(data).length > 0,
    'At least one field must be updated'
  )
  .describe('Request body for updating a brand variant');

export type UpdateBrandVariantRequest = z.infer<typeof UpdateBrandVariantSchema>;

/**
 * Schema for APPROVING a variant (Chairman only)
 */
export const ApproveBrandVariantSchema = z.object({
  variant_id: z.string().uuid('Invalid variant ID format'),
  approval_notes: z.string()
    .max(500, 'Approval notes must be 500 characters or less')
    .optional()
    .describe('Chairman notes on approval')
})
  .strict()
  .describe('Request body for approving a brand variant');

export type ApproveBrandVariantRequest = z.infer<typeof ApproveBrandVariantSchema>;

/**
 * Schema for REJECTING a variant (Chairman only)
 */
export const RejectBrandVariantSchema = z.object({
  variant_id: z.string().uuid('Invalid variant ID format'),
  rejection_reason: z.string()
    .min(10, 'Rejection reason must be at least 10 characters')
    .max(500, 'Rejection reason must be 500 characters or less')
    .regex(/^[a-zA-Z0-9\s\.\,\-\'\:]+$/)
    .describe('Explanation for rejection')
})
  .strict()
  .describe('Request body for rejecting a brand variant');

export type RejectBrandVariantRequest = z.infer<typeof RejectBrandVariantSchema>;

// ============================================================================
// VALIDATION HELPER FUNCTIONS
// ============================================================================

/**
 * Validates a create variant request
 * Throws ZodError if validation fails
 */
export async function validateCreateVariant(
  input: unknown
): Promise<CreateBrandVariantRequest> {
  try {
    return await CreateBrandVariantSchema.parseAsync(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Log the detailed validation error (don't expose to user)
      console.error('Variant validation failed:', {
        path: error.issues.map(i => i.path.join('.')),
        codes: error.issues.map(i => i.code)
      });
      throw new Error('Invalid variant data provided');
    }
    throw error;
  }
}

/**
 * Validates an update variant request
 */
export async function validateUpdateVariant(
  input: unknown
): Promise<UpdateBrandVariantRequest> {
  try {
    return await UpdateBrandVariantSchema.parseAsync(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Variant update validation failed:', {
        path: error.issues.map(i => i.path.join('.')),
        codes: error.issues.map(i => i.code)
      });
      throw new Error('Invalid variant update provided');
    }
    throw error;
  }
}

/**
 * Validates an approval request (Chairman)
 */
export async function validateApproveVariant(
  input: unknown
): Promise<ApproveBrandVariantRequest> {
  try {
    return await ApproveBrandVariantSchema.parseAsync(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Approval validation failed:', {
        path: error.issues.map(i => i.path.join('.'))
      });
      throw new Error('Invalid approval request');
    }
    throw error;
  }
}

/**
 * Validates a rejection request (Chairman)
 */
export async function validateRejectVariant(
  input: unknown
): Promise<RejectBrandVariantRequest> {
  try {
    return await RejectBrandVariantSchema.parseAsync(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Rejection validation failed:', {
        path: error.issues.map(i => i.path.join('.'))
      });
      throw new Error('Invalid rejection request');
    }
    throw error;
  }
}

// ============================================================================
// SAFETY CHECKS
// ============================================================================

/**
 * Additional safety check for JSONB injection attempts
 * Checks for suspicious patterns that might indicate injection attacks
 */
export function detectSuspiciousInput(text: string): boolean {
  const suspiciousPatterns = [
    /\{.*\}/,        // Curly braces (JSON/JSONB)
    /\[.*\]/,        // Square brackets
    /"/g,            // Double quotes
    /`/g,            // Backticks
    /\$/,            // Dollar signs (SQL)
    /;/,             // Semicolons
    /--/,            // SQL comments
    /\/\*/,          // Block comments
  ];

  return suspiciousPatterns.some(pattern => pattern.test(text));
}

/**
 * Sanitizes input by removing or escaping suspicious characters
 * Used as a fallback (primary validation is via Zod)
 */
export function sanitizeInput(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Remove control characters
  let sanitized = text.replace(/[\x00-\x1F\x7F]/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

// ============================================================================
// EXPORTS FOR MIDDLEWARE/ROUTE INTEGRATION
// ============================================================================

export const BrandVariantValidation = {
  createVariant: validateCreateVariant,
  updateVariant: validateUpdateVariant,
  approveVariant: validateApproveVariant,
  rejectVariant: validateRejectVariant,
  detectSuspicious: detectSuspiciousInput,
  sanitize: sanitizeInput
};

export default BrandVariantValidation;

// ============================================================================
// EXAMPLE USAGE IN EXPRESS ROUTES
// ============================================================================

/*
import express from 'express';
import { BrandVariantValidation } from './brand-variants-validation';

const router = express.Router();

// POST /api/ventures/:id/variants
router.post('/ventures/:id/variants', async (req, res) => {
  try {
    // Validate input
    const validatedData = await BrandVariantValidation.createVariant(req.body);

    // Check for suspicious patterns
    if (BrandVariantValidation.detectSuspicious(JSON.stringify(validatedData))) {
      return res.status(400).json({ error: 'Invalid input detected' });
    }

    // Proceed with business logic...
    // RLS policies will enforce authorization at database level

  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Validation failed' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/variants/:id/approve (Chairman only)
router.patch('/variants/:id/approve', requireChairman, async (req, res) => {
  try {
    const validatedData = await BrandVariantValidation.approveVariant({
      variant_id: req.params.id,
      ...req.body
    });

    // RLS policy will enforce chairman-only access
    // Database transaction will log audit trail

  } catch (error) {
    res.status(400).json({ error: 'Invalid approval request' });
  }
});

export default router;
*/
