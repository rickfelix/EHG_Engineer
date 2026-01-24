#!/usr/bin/env node
/**
 * Create Security Remediation SDs
 * Generated from security audit findings
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sds = [
  {
    id: 'SD-SEC-CREDENTIAL-ROTATION-001',
    sd_key: 'SD-SEC-CREDENTIAL-ROTATION-001',
    title: 'URGENT: Credential Rotation and Git History Cleanup',
    description: 'CRITICAL security issue: Production secrets (SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, RESEND_API_KEY, GEMINI_API_KEY) are exposed in .env file committed to git. Immediate credential rotation required, followed by git history cleanup.',
    rationale: 'Exposed credentials in git history allow attackers to access database with service role privileges, make API calls, and send emails. Discovered by security audit.',
    scope: 'Rotate SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, RESEND_API_KEY, GEMINI_API_KEY. Clean git history. Add pre-commit hooks.',
    sd_type: 'security',
    category: 'security',
    priority: 'critical',
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    key_changes: [
      'Rotate all exposed API keys in respective dashboards',
      'Remove .env from git history using BFG or filter-branch',
      'Verify .gitignore prevents future .env commits',
      'Add pre-commit hook to detect secrets'
    ],
    success_criteria: [
      'All old credentials invalidated',
      'New credentials generated and stored securely',
      '.env file removed from entire git history',
      'Pre-commit hook prevents secret commits'
    ]
  },
  {
    id: 'SD-SEC-RLS-POLICIES-001',
    sd_key: 'SD-SEC-RLS-POLICIES-001',
    title: 'Fix Overly Permissive RLS Policies (36+ USING(true))',
    description: 'CRITICAL: 36+ database tables have RLS policies using USING(true) which allows unrestricted access. 40+ policies use WITH CHECK(true). 33+ tables missing RLS entirely.',
    rationale: 'USING(true) policies allow any user to read/write data without authorization checks. This bypasses all access control at the database level. Discovered by database security audit.',
    scope: 'Audit 36+ USING(true) policies, 40+ WITH CHECK(true) policies, 33+ tables missing RLS. Create proper auth.uid() based policies.',
    sd_type: 'security',
    category: 'security',
    priority: 'critical',
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    key_changes: [
      'Audit all 36+ USING(true) policies and replace with auth.uid() checks',
      'Fix 40+ WITH CHECK(true) policies',
      'Enable RLS on 33+ tables missing coverage',
      'Fix broken current_user=service_role checks'
    ],
    success_criteria: [
      'Zero USING(true) policies remain',
      'All tables have proper RLS enabled',
      '100% RLS coverage verified'
    ]
  },
  {
    id: 'SD-SEC-AUTHORIZATION-RBAC-001',
    sd_key: 'SD-SEC-AUTHORIZATION-RBAC-001',
    title: 'Implement Authorization and RBAC for API Endpoints',
    description: 'CRITICAL: All 17 API endpoints have authentication but NO authorization. Any authenticated user can override violations, modify PRDs, and access all data.',
    rationale: 'Authentication without authorization means any logged-in user has full access. Need role-based access control to prevent privilege escalation. Discovered by auth/authz audit.',
    scope: 'Add RBAC middleware, permission checks on violations endpoint, resource ownership verification, fix webhook signature bypass, add CSRF protection.',
    sd_type: 'security',
    category: 'security',
    priority: 'critical',
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    key_changes: [
      'Add permission checks to /api/aegis/violations PUT endpoint',
      'Implement RBAC middleware with role extraction from JWT',
      'Add resource ownership verification',
      'Fix webhook signature verification bypass',
      'Add CSRF protection'
    ],
    success_criteria: [
      'All endpoints verify user permissions',
      'Violation overrides require authorization',
      'Webhook endpoints validate signatures in all environments'
    ]
  },
  {
    id: 'SD-SEC-ERROR-HANDLING-001',
    sd_key: 'SD-SEC-ERROR-HANDLING-001',
    title: 'Fix Error Handling and Memory Leaks',
    description: 'HIGH: Multiple unhandled promise rejections, memory leaks from event listeners, and unbounded setInterval timers causing crashes and memory exhaustion.',
    rationale: 'Unhandled errors crash production servers. Memory leaks cause degraded performance and eventual OOM kills. Reliability is a security concern. Discovered by error handling audit.',
    scope: 'Fix performance-optimizer.js, realtime-manager.js, rca-monitor-bootstrap.js. Add .catch() handlers, cleanup methods, proper shutdown.',
    sd_type: 'bugfix',
    category: 'security',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    key_changes: [
      'Add .catch() handlers to all Promise chains',
      'Store and clear setInterval/setTimeout references',
      'Implement proper unsubscription for realtime channels',
      'Add cleanup methods for event listeners'
    ],
    success_criteria: [
      'Zero unhandled promise rejections',
      'All timers cleared on shutdown',
      'Memory usage stable over 24h'
    ]
  },
  {
    id: 'SD-SEC-DATA-VALIDATION-001',
    sd_key: 'SD-SEC-DATA-VALIDATION-001',
    title: 'Fix Data Validation and Type Safety Issues',
    description: 'HIGH: z.record(z.any()) bypasses validation. Unsafe type assertions, Number() conversions without bounds, missing query parameter validation.',
    rationale: 'Missing validation allows injection attacks and data corruption. Type safety bypasses can cause runtime crashes. Discovered by data validation audit.',
    scope: 'Fix leo-schemas.ts z.any() usage. Add Zod validation to aegis/* endpoints. Fix unsafe type assertions and Number() conversions.',
    sd_type: 'bugfix',
    category: 'security',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    key_changes: [
      'Replace z.any() with specific schemas',
      'Add Zod validation to all API endpoints',
      'Add bounds checking before array access',
      'Fix unsafe type assertions'
    ],
    success_criteria: [
      'Zero z.any() usage in schemas',
      'All API endpoints use Zod validation',
      'TypeScript strict mode passes'
    ]
  },
  {
    id: 'SD-SEC-CONFIG-SECURITY-001',
    sd_key: 'SD-SEC-CONFIG-SECURITY-001',
    title: 'Fix Configuration and Deployment Security',
    description: 'HIGH: SSL verification disabled in 84 files, sensitive data logged to stdout, missing env var validation, deprecated axios.',
    rationale: 'Disabled SSL allows MITM attacks. Logged secrets can be exposed in monitoring. Deprecated deps have known vulnerabilities. Discovered by config security audit.',
    scope: 'Enable SSL verification in 84 files. Remove sensitive console.log statements. Add startup env validation. Update axios. Add security headers.',
    sd_type: 'bugfix',
    category: 'security',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    key_changes: [
      'Enable SSL certificate verification',
      'Remove console.log exposing env vars',
      'Implement startup env var validation',
      'Update axios to latest version',
      'Add security headers middleware'
    ],
    success_criteria: [
      'SSL verification enabled',
      'No sensitive data in logs',
      'npm audit shows zero high vulnerabilities'
    ]
  }
];

async function createSDs() {
  console.log('Creating Security Remediation SDs...\n');

  for (const sd of sds) {
    const record = {
      ...sd,
      key_changes: JSON.stringify(sd.key_changes),
      success_criteria: JSON.stringify(sd.success_criteria)
    };

    const { error } = await supabase
      .from('strategic_directives_v2')
      .upsert(record, { onConflict: 'id' });

    if (error) {
      console.error(`❌ Failed: ${sd.id} - ${error.message}`);
    } else {
      console.log(`✅ Created: ${sd.id}`);
      console.log(`   Title: ${sd.title}`);
      console.log(`   Priority: ${sd.priority}`);
      console.log('');
    }
  }

  console.log('\n📋 Summary: Created 6 Security SDs');
  console.log('   Run: npm run sd:next to see the queue');
}

createSDs().catch(console.error);
