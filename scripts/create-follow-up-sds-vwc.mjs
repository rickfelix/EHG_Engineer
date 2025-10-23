/**
 * Create follow-up SDs for SD-VWC-A11Y-001 completion
 *
 * SD-VWC-A11Y-002: Phase 2 Accessibility Work (4-5h deferred scope)
 * SD-INFRASTRUCTURE-FIX-001: Critical Infrastructure Issues
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

console.log('\n📋 Creating Follow-Up SDs for SD-VWC-A11Y-001\n');

// SD 1: Phase 2 Accessibility Work
const sd1 = {
  id: 'SD-VWC-A11Y-002',
  title: 'VentureCreationPage: Phase 2 Accessibility Compliance',
  description: `Complete Phase 2 accessibility work deferred from SD-VWC-A11Y-001 (user-approved scope reduction). Implements color contrast audit, focus indicators, screen reader testing, and complete E2E coverage.

**Context**: Phase 1 (SD-VWC-A11Y-001) delivered baseline accessibility infrastructure with comprehensive Phase 2 documentation (83 LOC TODO comments in VentureCreationPage.tsx:81-126). All Phase 2 work scoped, documented, and estimated.

**Phase 2 Scope** (User-Approved Deferral):
- Color Contrast Audit & Fixes (1-1.5h)
- Focus Indicator Implementation (0.5-1h)
- Screen Reader Manual Testing (1-1.5h)
- Complete E2E Test Coverage (1h)
- **Total**: 4-5 hours + WCAG training budget ($100-$300)

**Deliverables**:
1. Color contrast compliance (4.5:1 normal text, 3:1 large text/UI)
2. Visible focus indicators (2px minimum, 3:1 contrast)
3. Screen reader testing results (NVDA, JAWS, VoiceOver)
4. E2E tests for all 5 wizard steps
5. Complete WCAG 2.1 AA compliance

**Predecessor**: SD-VWC-A11Y-001 (Phase 1 baseline)
**Documentation**: src/components/ventures/VentureCreationPage.tsx:81-126`,
  category: 'Accessibility',
  rationale: 'Complete WCAG 2.1 AA compliance deferred from SD-VWC-A11Y-001 Phase 1. User-approved scope split to manage time constraints while maintaining accessibility goals. Phase 2 delivers remaining compliance requirements with comprehensive documentation already in place.',
  priority: 'high', // HIGH - accessibility compliance (user requested high priority)
  status: 'pending_approval',
  progress: 0
};

// SD 2: Infrastructure Fixes
const sd2 = {
  id: 'SD-INFRASTRUCTURE-FIX-001',
  title: 'Critical LEO Protocol Infrastructure Issues',
  description: `Fix 4 critical infrastructure issues discovered during SD-VWC-A11Y-001 execution that block LEO Protocol workflow completion.

**Issues Discovered**:

**1. CI/CD Workflow Configuration Failures**
- **Symptom**: All GitHub Actions workflows fail at 0s execution
- **Impact**: Blocks PLAN verification despite passing local tests (244 unit + 6 E2E)
- **Root Cause**: Workflow file configuration issue (not code defects)
- **Evidence**: gh run view 18699964562 - "workflow file issue"

**2. RLS Policy Blocking Handoff Updates**
- **Symptom**: Cannot update sd_phase_handoffs.status from pending_acceptance → accepted
- **Impact**: Blocks PLAN→LEAD handoff acceptance in Phase 5
- **Root Cause**: RLS policy requires SERVICE_ROLE_KEY, UPDATE operations return 0 rows
- **Evidence**: Scripts/accept-handoff.mjs succeeds but no data returned

**3. Progress Calculation Function Bug**
- **Symptom**: get_progress_breakdown() reports total_progress:40 when all phases complete (100%)
- **Impact**: Blocks SD completion despite 100% LEO Protocol compliance
- **Root Cause**: Database function calculation error
- **Evidence**: All phases show complete:true, progress:100, but can_complete:false

**4. Missing SUPABASE_SERVICE_ROLE_KEY**
- **Symptom**: RLS bypass operations fail
- **Impact**: Blocks database operations requiring elevated permissions
- **Root Cause**: .env missing SERVICE_ROLE_KEY (exists in .env.example)
- **Evidence**: Database-agent reports missing key

**Deliverables**:
1. GitHub Actions workflow configuration repair
2. RLS policy adjustment for handoff updates
3. get_progress_breakdown() function bug fix
4. SERVICE_ROLE_KEY setup documentation
5. Comprehensive testing of LEO Protocol workflow end-to-end

**Discovery Context**: SD-VWC-A11Y-001 Phase 5 (LEAD Final Approval)
**Blocking**: SD-VWC-A11Y-001 completion`,
  category: 'Infrastructure',
  rationale: 'Critical infrastructure failures discovered during SD-VWC-A11Y-001 execution block LEO Protocol workflow completion. These are systemic issues affecting all future SDs: CI/CD pipeline failures, RLS policy blocking database operations, progress calculation bugs, and missing authentication keys. Requires immediate resolution to unblock SD completion workflows.',
  priority: 'critical', // CRITICAL - blocks LEO Protocol (user requested high priority)
  status: 'pending_approval',
  progress: 0
};

// Create SDs
console.log('1️⃣ Creating SD-VWC-A11Y-002 (Phase 2 Accessibility)...');
const { data: sd1Data, error: sd1Error } = await supabase
  .from('strategic_directives_v2')
  .insert(sd1)
  .select()
  .single();

if (sd1Error) {
  console.error('   ❌ Error:', sd1Error.message);
} else {
  console.log('   ✅ Created:', sd1Data.id);
  console.log('      Category:', sd1Data.category);
  console.log('      Priority:', sd1Data.priority.toUpperCase());
  console.log('      Estimated:', '4-5 hours');
}

console.log('\n2️⃣ Creating SD-INFRASTRUCTURE-FIX-001 (Critical Infrastructure)...');
const { data: sd2Data, error: sd2Error } = await supabase
  .from('strategic_directives_v2')
  .insert(sd2)
  .select()
  .single();

if (sd2Error) {
  console.error('   ❌ Error:', sd2Error.message);
} else {
  console.log('   ✅ Created:', sd2Data.id);
  console.log('      Category:', sd2Data.category);
  console.log('      Priority:', sd2Data.priority.toUpperCase());
  console.log('      Issues:', '4 blocking issues');
}

console.log('\n✅ Follow-up SDs created successfully!\n');
