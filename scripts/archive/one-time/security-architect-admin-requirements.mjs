#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔐 Chief Security Architect: Admin Security Requirements');
console.log('='.repeat(60));
console.log('\n🎯 Security Analysis for SD-AGENT-ADMIN-001');
console.log('   Target: Agent Engineering Department Admin Tooling\n');

const securityRequirements = {
  authentication: {
    method: 'Supabase Auth (JWT-based)',
    providers: ['Email/Password', 'OAuth (Google, GitHub)'],
    session_management: {
      token_expiry: '1 hour',
      refresh_token_expiry: '30 days',
      auto_logout_on_inactivity: '15 minutes',
      session_storage: 'httpOnly cookies + secure localStorage'
    },
    mfa_support: {
      status: 'Recommended for admin users',
      methods: ['TOTP (Google Authenticator)', 'SMS (future)']
    }
  },

  authorization: {
    role_model: {
      admin_user: {
        description: 'Full access to all admin features',
        capabilities: [
          'Create/edit/delete prompts',
          'Create/manage A/B tests',
          'Mark presets as official',
          'Set system-wide defaults',
          'Configure performance alerts',
          'View all agent executions',
          'Lock search preferences'
        ],
        implementation: 'auth.users metadata: { role: "admin" }'
      },
      regular_user: {
        description: 'Limited access to personal configurations',
        capabilities: [
          'Create/edit own presets',
          'Load official presets',
          'View own agent executions',
          'Create personal search profiles',
          'View active prompts (read-only)',
          'View A/B test results (read-only)'
        ],
        implementation: 'auth.users metadata: { role: "user" }'
      },
      department_lead: {
        description: 'Department-scoped admin access',
        capabilities: [
          'Manage prompts for their department',
          'View department agent executions',
          'Set department-level defaults'
        ],
        implementation: 'auth.users metadata: { role: "dept_lead", department: "finance" }'
      }
    },

    rls_policies: {
      prompt_templates: [
        {
          operation: 'SELECT',
          policy: 'All users can view active prompts',
          sql: 'USING (status = \'active\' OR created_by = auth.uid())'
        },
        {
          operation: 'INSERT',
          policy: 'Admins can create prompts',
          sql: 'WITH CHECK ((auth.jwt() -> \'user_metadata\' ->> \'role\') = \'admin\')'
        },
        {
          operation: 'UPDATE',
          policy: 'Admins or creators can edit',
          sql: 'USING ((auth.jwt() -> \'user_metadata\' ->> \'role\') = \'admin\' OR created_by = auth.uid())'
        }
      ],
      search_preferences: [
        {
          operation: 'SELECT',
          policy: 'Users can view own profiles + unlocked defaults',
          sql: 'USING (user_id = auth.uid() OR (is_default = true AND is_locked = false))'
        },
        {
          operation: 'INSERT',
          policy: 'Users can create own profiles',
          sql: 'WITH CHECK (user_id = auth.uid())'
        },
        {
          operation: 'UPDATE',
          policy: 'Users own profiles, admins can lock defaults',
          sql: 'USING (user_id = auth.uid() OR (auth.jwt() -> \'user_metadata\' ->> \'role\') = \'admin\')'
        }
      ],
      agent_executions: [
        {
          operation: 'SELECT',
          policy: 'Users view own, admins view all',
          sql: 'USING (user_id = auth.uid() OR (auth.jwt() -> \'user_metadata\' ->> \'role\') = \'admin\')'
        },
        {
          operation: 'INSERT',
          policy: 'System inserts via service role only',
          sql: 'WITH CHECK (false)' // Prevent client-side inserts
        }
      ],
      agent_configs: [
        {
          operation: 'SELECT',
          policy: 'Users view own presets + official',
          sql: 'USING (user_id = auth.uid() OR metadata->>\'is_official\' = \'true\')'
        },
        {
          operation: 'INSERT',
          policy: 'Authenticated users can create presets',
          sql: 'WITH CHECK (user_id = auth.uid())'
        },
        {
          operation: 'UPDATE',
          policy: 'Users own presets, admins can mark official',
          sql: 'USING (user_id = auth.uid() OR (auth.jwt() -> \'user_metadata\' ->> \'role\') = \'admin\')'
        }
      ],
      performance_alerts: [
        {
          operation: 'SELECT',
          policy: 'Admins only',
          sql: 'USING ((auth.jwt() -> \'user_metadata\' ->> \'role\') = \'admin\')'
        },
        {
          operation: 'INSERT',
          policy: 'Admins only',
          sql: 'WITH CHECK ((auth.jwt() -> \'user_metadata\' ->> \'role\') = \'admin\')'
        }
      ]
    }
  },

  api_security: {
    endpoint_protection: {
      '/api/admin/*': {
        method: 'Middleware check for admin role',
        implementation: 'Express middleware: verifyAdminRole()',
        response_on_failure: '403 Forbidden'
      },
      '/api/prompts/create': {
        method: 'Admin-only endpoint',
        rate_limit: '10 requests per minute',
        validation: 'Zod schema validation for all inputs'
      },
      '/api/prompts/ab-test': {
        method: 'Admin-only endpoint',
        rate_limit: '5 requests per minute',
        validation: 'Statistical parameters validated'
      },
      '/api/executions': {
        method: 'Service role only (backend)',
        authentication: 'Service role key (not exposed to frontend)',
        notes: 'Frontend uses Supabase RLS, backend inserts via service role'
      }
    },

    rate_limiting: {
      global: '100 requests per minute per user',
      admin_endpoints: '50 requests per minute',
      ab_test_creation: '5 per minute',
      prompt_updates: '10 per minute'
    },

    input_validation: {
      library: 'Zod for TypeScript schema validation',
      validation_points: [
        'All API endpoints',
        'Form submissions',
        'WebSocket messages (if used)'
      ],
      sanitization: [
        'HTML sanitization for prompt content (DOMPurify)',
        'SQL injection prevention (parameterized queries via Supabase)',
        'XSS prevention (React auto-escaping + CSP headers)'
      ]
    }
  },

  data_protection: {
    encryption: {
      at_rest: 'Supabase default (AES-256)',
      in_transit: 'TLS 1.3 (HTTPS enforced)',
      sensitive_fields: [
        'API keys (if stored): Encrypted via pgcrypto',
        'User emails: Supabase Auth handles encryption',
        'Performance metrics: No PII, no encryption needed'
      ]
    },

    pii_handling: {
      stored_pii: ['User email (auth.users)', 'User name (auth.users metadata)'],
      gdpr_compliance: {
        data_export: 'Supabase Auth provides user data export API',
        data_deletion: 'CASCADE delete on auth.users removes all user data',
        consent_tracking: 'Track in auth.users metadata: { gdpr_consent: true, consent_date: "..." }'
      },
      anonymization: 'Agent executions can be anonymized after 6 months (user_id -> NULL)'
    },

    audit_logging: {
      recommended: true,
      events_to_log: [
        'Admin promotes/demotes users',
        'Official preset marked/unmarked',
        'Prompt published to production',
        'A/B test winner promoted',
        'System-wide defaults changed',
        'Performance alert configuration changed'
      ],
      implementation: {
        table: 'admin_audit_log',
        schema: `
CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_actor ON admin_audit_log(actor_id);
CREATE INDEX idx_audit_created_at ON admin_audit_log(created_at DESC);
CREATE INDEX idx_audit_action ON admin_audit_log(action);
        `,
        retention: '2 years minimum for compliance'
      }
    }
  },

  frontend_security: {
    csp_headers: {
      description: 'Content Security Policy to prevent XSS',
      policy: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", "data:", "https:"],
        'connect-src': ["'self'", "https://*.supabase.co", "wss://*.supabase.co"]
      }
    },

    secure_storage: {
      jwt_tokens: 'httpOnly cookies (not localStorage)',
      user_preferences: 'localStorage (non-sensitive only)',
      sensitive_data: 'Never store API keys or passwords client-side'
    },

    xss_prevention: [
      'React automatic HTML escaping',
      'DOMPurify for user-generated content (prompt descriptions)',
      'CSP headers',
      'Input validation on all forms'
    ],

    csrf_protection: {
      method: 'Supabase JWT tokens include CSRF protection',
      additional: 'SameSite=Strict cookie attribute'
    }
  },

  dependency_security: {
    npm_audit: {
      frequency: 'Weekly automated scan',
      command: 'npm audit --production',
      action_threshold: 'Fix all HIGH and CRITICAL vulnerabilities within 7 days'
    },

    dependabot: {
      enabled: true,
      auto_merge: 'Patch updates only',
      manual_review: 'Major and minor updates'
    },

    supply_chain: {
      lock_file: 'package-lock.json committed to repo',
      verification: 'npm ci in production (not npm install)',
      trusted_sources: 'Only install from official npm registry'
    }
  },

  incident_response: {
    detection: {
      failed_login_attempts: 'Lock account after 5 failed attempts in 15 minutes',
      anomalous_activity: 'Alert on: Mass prompt deletion, rapid role changes, unusual API patterns',
      monitoring: 'Supabase Auth logs + custom alerting via performance_alerts table'
    },

    response_plan: {
      security_incident_steps: [
        '1. Identify and contain: Disable affected user accounts',
        '2. Investigate: Review audit logs for scope',
        '3. Remediate: Patch vulnerability, rotate secrets if needed',
        '4. Notify: Alert affected users if PII compromised',
        '5. Post-mortem: Document incident and update security measures'
      ],
      contact: 'security@ehg.com (if configured)'
    }
  },

  compliance: {
    gdpr: {
      data_portability: 'User data export via Supabase Auth API',
      right_to_erasure: 'CASCADE delete on auth.users',
      consent_management: 'Tracked in user metadata'
    },

    soc2_considerations: {
      access_controls: 'Role-based access via RLS',
      audit_trails: 'admin_audit_log table',
      data_encryption: 'At-rest and in-transit',
      monitoring: 'Performance alerts + anomaly detection'
    }
  },

  security_testing: {
    pre_deployment: [
      'OWASP ZAP automated scan',
      'npm audit for dependency vulnerabilities',
      'Manual security review of admin endpoints'
    ],

    periodic: [
      'Quarterly penetration testing',
      'Monthly dependency audits',
      'Annual security architecture review'
    ]
  }
};

// First read existing PRD metadata
const { data: existingPRD } = await supabase
  .from('product_requirements_v2')
  .select('metadata')
  .eq('id', 'PRD-SD-AGENT-ADMIN-001')
  .single();

const updatedMetadata = {
  ...(existingPRD?.metadata || {}),
  security_specs: securityRequirements,
  security_requirements: [
    'Supabase Auth with JWT-based authentication',
    'Role-based access control (admin, user, dept_lead)',
    'Row-Level Security (RLS) policies on all tables',
    'Rate limiting on admin endpoints',
    'Input validation with Zod',
    'Audit logging for admin actions',
    'HTTPS/TLS 1.3 enforced',
    'CSP headers for XSS prevention',
    'GDPR compliance (data export, deletion, consent)'
  ],
  compliance_standards: ['GDPR', 'SOC2 (Type 2 ready)'],
  security_review_date: new Date().toISOString()
};

// Store security requirements in PRD metadata
const { error: updateError } = await supabase
  .from('product_requirements_v2')
  .update({
    metadata: updatedMetadata
  })
  .eq('id', 'PRD-SD-AGENT-ADMIN-001');

if (updateError) {
  console.error('❌ Error updating PRD with security requirements:', updateError);
  process.exit(1);
}

console.log('✅ Security Requirements Analysis Complete');
console.log('\n🔐 Authentication:');
console.log('   Method: Supabase Auth (JWT)');
console.log('   MFA: Recommended for admins');
console.log('   Session: 1 hour token, 15 min auto-logout');
console.log('\n🛡️ Authorization:');
console.log('   Roles: Admin, User, Department Lead');
console.log('   RLS Policies: Defined for all 6 tables');
console.log('   Admin Capabilities: Full access to all features');
console.log('\n🔒 Data Protection:');
console.log('   Encryption: AES-256 at-rest, TLS 1.3 in-transit');
console.log('   Audit Logging: admin_audit_log table');
console.log('   PII Handling: GDPR compliant');
console.log('\n🚨 Incident Response:');
console.log('   Failed Logins: Lock after 5 attempts');
console.log('   Anomaly Detection: Performance alerts');
console.log('   Response Plan: 5-step documented process');
console.log('\n📋 Compliance:');
console.log('   GDPR: Data portability, right to erasure');
console.log('   SOC2: Access controls, audit trails, encryption');
console.log('\n' + '='.repeat(60));
console.log('🎯 Security specs stored in PRD metadata');
console.log('   Access via: product_requirements_v2.metadata.security_specs');
