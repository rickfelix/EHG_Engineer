# Security Assessment: SD-STAGE-12-001 (Adaptive Naming - Brand Variants)

**Status**: NEEDS HARDENING (Critical Issues Identified)
**Assessment Date**: 2025-12-05
**Security Verdict**: CONDITIONAL APPROVAL - Fix 3 critical vulnerabilities before EXEC phase

---

## Executive Summary

SD-STAGE-12-001 introduces significant attack surface through:
- JSONB input from localized names and external APIs (SQL injection risk)
- Chairman-only authorization (RLS enforcement critical)
- External API integrations (DeepL, Namecheap, GPT-4 keys must be encrypted)
- DNS/Whois lookups (spoofing potential)

**5-Phase Security Check Result**: NEEDS HARDENING

---

## OWASP Top 10 Vulnerability Mapping

| Vulnerability | Risk Level | Location | Mitigation |
|---|---|---|---|
| **A03: Injection (SQL/JSONB)** | CRITICAL | variant_details JSONB storage | Parameterized queries, input sanitization |
| **A01: Broken Authentication** | HIGH | Chairman role check | RLS policies + auth.uid() verification |
| **A04: Insecure Design** | HIGH | External API integration | Secret rotation, rate limiting |
| **A05: Broken Access Control** | CRITICAL | RLS policies missing | Column-level RLS for brand_variants |
| **A06: Vulnerable Components** | MEDIUM | DeepL/GPT-4 API keys | Environment variables, no hardcoding |
| **A09: Logging & Monitoring** | HIGH | Audit trail gaps | Log all approval/rejection actions |

---

## Critical Vulnerabilities

### 1. JSONB Injection Risk (CRITICAL)

**Issue**: `variant_details` and `notes` fields accept user input without sanitization

```typescript
// VULNERABLE
const variant = {
  variant_details: {
    name_text: userInput, // Could contain JSONB payload
    localized_name: { [userLang]: userInput } // Nested injection
  }
};

// Zod should validate structure, not just type
const schema = z.object({
  name_text: z.string().min(1).max(50).regex(/^[a-zA-Z0-9\s\-']+$/), // No special chars
  localized_name: z.record(z.string().max(50).regex(/^[a-zA-Z0-9\s\-']+$/))
});
```

**Impact**: Malicious JSONB payloads could corrupt variant data or expose confidential information

**Mitigation**:
- Use Zod for strict schema validation with regex constraints
- Sanitize all user inputs before storing in JSONB
- Use parameterized queries (Supabase PostgREST enforces this)

---

### 2. Authorization: Chairman-Only Approve/Reject (CRITICAL)

**Issue**: PRD states "Only Chairman can approve/reject" but NO RLS policies defined

```sql
-- MISSING - Must create these RLS policies

-- Table structure needed
CREATE TABLE IF NOT EXISTS public.brand_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  parent_name_id UUID,

  variant_details JSONB NOT NULL, -- {name_text, generation_cycle, adaptation_reason, ...}
  performance_metrics JSONB,
  availability_status JSONB,
  validation_results JSONB,

  status VARCHAR(50) NOT NULL CHECK (status IN ('generated', 'under_evaluation', 'market_testing', 'approved', 'rejected', 'retired', 'promoted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.brand_variants ENABLE ROW LEVEL SECURITY;
```

---

## RLS Policies (MANDATORY)

### Policy 1: Read Access (All Users)

```sql
-- Allow all users to READ variants
CREATE POLICY "Allow all users read variants"
ON public.brand_variants FOR SELECT
TO authenticated
USING (true);

-- Allow anon READ only for active variants
CREATE POLICY "Allow anonymous read active variants"
ON public.brand_variants FOR SELECT
TO anon
USING (status IN ('approved', 'promoted'));
```

### Policy 2: Create (Any Authenticated User)

```sql
-- Only creator can create variants
CREATE POLICY "Allow users create own variants"
ON public.brand_variants FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);
```

### Policy 3: Edit Pending (Creator Only)

```sql
-- Creator can edit ONLY pending variants
CREATE POLICY "Creator edit pending variants"
ON public.brand_variants FOR UPDATE
TO authenticated
USING (
  auth.uid() = created_by
  AND status IN ('generated', 'under_evaluation')
)
WITH CHECK (
  auth.uid() = created_by
  AND status IN ('generated', 'under_evaluation')
);
```

### Policy 4: Approve/Reject (Chairman Only) - CRITICAL

```sql
-- Create chairman role check function
CREATE OR REPLACE FUNCTION public.is_chairman(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if user has chairman role (from auth.users.raw_user_meta_data)
  RETURN (
    SELECT EXISTS(
      SELECT 1 FROM auth.users
      WHERE id = user_id
      AND raw_user_meta_data->>'role' = 'chairman'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ONLY Chairman can approve/reject
CREATE POLICY "Chairman approve reject variants"
ON public.brand_variants FOR UPDATE
TO authenticated
USING (is_chairman(auth.uid()))
WITH CHECK (
  is_chairman(auth.uid())
  AND status IN ('approved', 'rejected')
);
```

---

## Input Validation Requirements

### Zod Schema for brand_variants

```typescript
// ============ STRICT INPUT VALIDATION ============

// Allowed characters: letters, numbers, hyphens, apostrophes, spaces ONLY
const NameTextSchema = z.string()
  .min(1, "Name required")
  .max(50, "Name too long")
  .regex(/^[a-zA-Z0-9\s\-']+$/, "Invalid characters in name")
  .trim();

// Localized names: same strict validation
const LocalizedNameSchema = z.record(
  z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Invalid language code"),
  NameTextSchema
);

// AdaptationReason: enum only
const AdaptationReasonSchema = z.enum([
  'AVAILABILITY_OPPORTUNITY',
  'MARKET_FEEDBACK_NEGATIVE',
  'COMPETITIVE_COLLISION',
  'CULTURAL_OPTIMIZATION',
  'STRATEGIC_PIVOT',
  'CHAIRMAN_GUIDANCE',
  'PERFORMANCE_OPTIMIZATION'
]);

// VariantDetails - Strict JSONB structure
const VariantDetailsSchema = z.object({
  name_text: NameTextSchema,
  localized_name: LocalizedNameSchema.optional(),
  generation_cycle: z.number().int().min(1).max(100),
  adaptation_timestamp: z.date(),
  adaptation_reason: AdaptationReasonSchema,
  variant_type: z.enum([
    'PHONETIC_ADJUSTMENT',
    'SEMANTIC_ENHANCEMENT',
    'LENGTH_OPTIMIZATION',
    'CULTURAL_LOCALIZATION',
    'AVAILABILITY_ALTERNATIVE',
    'STRATEGIC_REALIGNMENT'
  ]),
  improvement_hypothesis: z.string().min(10).max(500).regex(/^[a-zA-Z0-9\s\.\,\-\'\:]+$/)
});

// Full Variant Validation
const CreateBrandVariantSchema = z.object({
  venture_id: z.string().uuid(),
  variant_details: VariantDetailsSchema,
  notes: z.string().max(1000).regex(/^[a-zA-Z0-9\s\.\,\-\'\:\n]+$/).optional()
});

// ============ VALIDATION MIDDLEWARE ============
async function validateBrandVariant(input: unknown) {
  try {
    return await CreateBrandVariantSchema.parseAsync(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Log validation failure (don't expose details to user)
      console.error('Variant validation failed:', error.issues);
      throw new Error('Invalid variant data provided');
    }
    throw error;
  }
}
```

---

## API Security: External Integrations

### Issue: API Keys Management

**Current State**: Likely hardcoded or in .env files (VULNERABLE)

### Solution: Environment Variables + Encryption

```typescript
// ============ SECURE API KEY MANAGEMENT ============

// .env.local (NEVER commit)
DEEPL_API_KEY=sk-xxx
NAMECHEAP_API_KEY=xxx
OPENAI_API_KEY=sk-xxx

// Load with validation
const CONFIG = {
  DEEPL_API_KEY: process.env.DEEPL_API_KEY,
  NAMECHEAP_API_KEY: process.env.NAMECHEAP_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY
};

if (!CONFIG.DEEPL_API_KEY || !CONFIG.NAMECHEAP_API_KEY || !CONFIG.OPENAI_API_KEY) {
  throw new Error('Missing required API keys in environment');
}

// ============ API CALL SECURITY ============

// Implement rate limiting per API
const RateLimitConfig = {
  DEEPL: { rps: 1, daily: 500 }, // 1 request/sec, 500/day
  NAMECHEAP: { rps: 0.5, daily: 100 },
  OPENAI: { rps: 2, daily: 1000 }
};

// Use node-rate-limiter-flexible
import { RateLimiterMemory } from 'rate-limiter-flexible';

const deepLLimiter = new RateLimiterMemory({
  points: 500,
  duration: 86400 // per day
});

async function callDeepL(text: string, targetLang: string) {
  try {
    await deepLLimiter.consume(1);
  } catch {
    throw new Error('Rate limit exceeded for DeepL API');
  }

  // API call...
}

// ============ TIMEOUT & ERROR HANDLING ============

const API_TIMEOUT = 10000; // 10 seconds

async function callExternalAPI(
  apiName: string,
  fn: () => Promise<any>
) {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${apiName} timeout`)), API_TIMEOUT)
    )
  ]);
}
```

---

## Domain/Whois Validation: DNS Spoofing Prevention

### Issue: DNS Spoofing Risk in Availability Checks

```typescript
// ============ SECURE DOMAIN VALIDATION ============

import * as dns from 'dns/promises';

async function validateDomainAvailability(domainName: string): Promise<boolean> {
  // 1. Validate domain format FIRST
  const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

  if (!domainRegex.test(domainName)) {
    throw new Error('Invalid domain format');
  }

  try {
    // 2. Check A record exists (indicates availability)
    const records = await dns.resolve4(domainName, { ttl: true });

    // 3. Verify response comes from authoritative nameserver
    // (Use DNSSEC if available)

    return records.length === 0; // No A record = available
  } catch (error) {
    if (error.code === 'ENOTFOUND') {
      return true; // Domain not registered = available
    }

    // Log unexpected errors (could be DNS poisoning attempt)
    console.error('Domain check failed:', error);
    throw new Error('Could not verify domain availability');
  }
}
```

---

## Rate Limiting: POST/PATCH Endpoints

### Required Rate Limits

```typescript
// ============ ENDPOINT RATE LIMITS ============

const RATE_LIMITS = {
  // Create variant: 10 per minute per user
  'POST /api/ventures/:id/variants': {
    windowMs: 60000, // 1 minute
    max: 10,
    message: 'Too many variants created. Try again later.'
  },

  // Edit variant: 30 per minute per user
  'PATCH /api/variants/:id': {
    windowMs: 60000,
    max: 30,
    message: 'Too many edits. Try again later.'
  },

  // Chairman approve/reject: 50 per minute
  'PATCH /api/variants/:id/approve': {
    windowMs: 60000,
    max: 50,
    message: 'Approval rate limit exceeded.'
  },

  // Check domain availability: 20 per hour per user
  'POST /api/domain-check': {
    windowMs: 3600000, // 1 hour
    max: 20,
    message: 'Domain check limit reached. Try again later.'
  }
};

// Implementation using express-rate-limit
import rateLimit from 'express-rate-limit';

export const variantCreationLimiter = rateLimit({
  windowMs: 60000,
  max: 10,
  keyGenerator: (req) => req.user.id, // Per-user limit
  skip: (req) => req.user?.role === 'admin', // Admins exempt
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests' });
  }
});

// Apply to routes
app.post('/api/ventures/:id/variants', variantCreationLimiter, createVariant);
```

---

## Audit Trail & Compliance Logging

### Actions Requiring Logging

```sql
-- ============ AUDIT TABLE ============
CREATE TABLE IF NOT EXISTS public.brand_variant_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES brand_variants(id),
  action VARCHAR(50) NOT NULL CHECK (action IN (
    'created', 'updated', 'submitted', 'approved', 'rejected', 'promoted', 'retired'
  )),
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  change_details JSONB, -- What changed
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for auditing
CREATE INDEX IF NOT EXISTS idx_brand_variant_audit_variant_id
  ON public.brand_variant_audit(variant_id);
CREATE INDEX IF NOT EXISTS idx_brand_variant_audit_action
  ON public.brand_variant_audit(action);
CREATE INDEX IF NOT EXISTS idx_brand_variant_audit_performer
  ON public.brand_variant_audit(performed_by);

-- ============ AUDIT LOGGING FUNCTION ============
CREATE OR REPLACE FUNCTION log_variant_audit(
  p_variant_id UUID,
  p_action VARCHAR,
  p_previous_status VARCHAR,
  p_new_status VARCHAR,
  p_details JSONB
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.brand_variant_audit (
    variant_id, action, performed_by, previous_status, new_status, change_details
  )
  VALUES (
    p_variant_id,
    p_action,
    auth.uid(),
    p_previous_status,
    p_new_status,
    p_details
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Security Hardening Checklist

### CRITICAL (Must Fix Before EXEC)

- [ ] **RLS Policies**: Implement all 4 RLS policies above (especially chairman approval)
- [ ] **Input Validation**: Apply Zod schemas to all variant inputs
- [ ] **API Key Security**: Move all keys to environment variables, NO hardcoding
- [ ] **Audit Logging**: Create audit table and log all approvals/rejections

### HIGH (Must Fix Before LAUNCH)

- [ ] **Rate Limiting**: Implement per-endpoint rate limits (see above)
- [ ] **Domain Validation**: Use DNSSEC or authoritative checks, prevent DNS spoofing
- [ ] **Error Handling**: Never expose internal API errors to users
- [ ] **Timeout Protection**: Set 10s timeout on all external API calls
- [ ] **HTTPS Only**: Ensure all external API calls use HTTPS with certificate validation

### MEDIUM (Before PRODUCTION)

- [ ] **Secret Rotation**: Rotate API keys monthly
- [ ] **Encryption at Rest**: Consider encrypting sensitive JSONB fields
- [ ] **User Session**: Implement chairman session tracking
- [ ] **Data Retention**: Define retention policy for approval audit trail

---

## Summary

**Security Verdict**: NEEDS HARDENING

**Gate Pass Rate Estimate**: 45% (will fail without fixes)

**Time to Remediate**: 2-3 days (1-2 sprints)

**Critical Path**:
1. RLS policies (4 hours)
2. Input validation schemas (3 hours)
3. API key management (2 hours)
4. Audit logging (4 hours)

**Approval Checklist**:
- [ ] All CRITICAL items completed
- [ ] RLS policies tested with real users
- [ ] Input validation tested with injection attempts
- [ ] API keys in environment (verified via code review)
- [ ] Audit trail working for all actions

---

**Assessment Completed By**: Chief Security Architect (Claude-Haiku)
**Assessment ID**: SEC-SD-STAGE-12-001-20251205
**Next Step**: Run security validation after fixes, then proceed to EXEC phase
