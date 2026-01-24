/**
 * POST /api/aegis/validate
 * SD-AEGIS-GOVERNANCE-001: AEGIS Validation API
 * SD-LEO-GEN-REMEDIATE-CRITICAL-SECURITY-001: Added authentication
 * SD-SEC-AUTHORIZATION-RBAC-001: Added RBAC authorization
 *
 * Validate an operation context against governance rules
 *
 * SECURITY:
 * - Authentication: Requires valid JWT token
 * - Authorization: Requires 'compliance:write' permission (editor+) since can record violations
 * - Uses user-scoped Supabase client that respects RLS policies
 */

import { NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../lib/middleware/api-auth';
import { withPermission } from '../../../lib/middleware/rbac';

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  const { supabase } = req;

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      allowed: ['POST']
    });
  }

  const { context, constitution, record_violations = false } = req.body;

  if (!context || typeof context !== 'object') {
    return res.status(400).json({
      error: 'Missing or invalid context object'
    });
  }

  try {
    // Load rules
    let query = supabase
      .from('aegis_rules')
      .select(`
        id,
        rule_code,
        rule_name,
        severity,
        enforcement_action,
        validation_type,
        validation_config,
        constitution:aegis_constitutions(code, enforcement_mode)
      `)
      .eq('is_active', true);

    if (constitution) {
      const { data: constData } = await supabase
        .from('aegis_constitutions')
        .select('id')
        .eq('code', constitution)
        .single();

      if (constData) {
        query = query.eq('constitution_id', constData.id);
      } else {
        return res.status(404).json({
          error: 'Constitution not found',
          constitution
        });
      }
    }

    const { data: rules, error: rulesError } = await query;

    if (rulesError) {
      console.error('Failed to fetch rules:', rulesError);
      return res.status(500).json({
        error: 'Failed to fetch rules',
        message: rulesError.message
      });
    }

    // Validate context against each rule
    const violations: {
      rule_code: string;
      rule_name: string;
      severity: string;
      enforcement_action: string;
      message: string;
    }[] = [];

    const warnings: typeof violations = [];
    const passed: { rule_code: string; rule_name: string }[] = [];

    for (const rule of rules || []) {
      const config = rule.validation_config || {};
      let isValid = true;
      let message = '';

      switch (rule.validation_type) {
        case 'field_check':
          for (const field of config.required_fields || []) {
            if (context[field] === undefined || context[field] === null || context[field] === '') {
              isValid = false;
              message = `Missing required field: ${field}`;
              break;
            }
          }
          break;

        case 'threshold':
          const fieldValue = context[config.field];
          if (fieldValue !== undefined) {
            const threshold = config.value;
            switch (config.operator) {
              case 'lt': isValid = fieldValue < threshold; break;
              case 'lte': isValid = fieldValue <= threshold; break;
              case 'gt': isValid = fieldValue > threshold; break;
              case 'gte': isValid = fieldValue >= threshold; break;
              case 'eq': isValid = fieldValue === threshold; break;
              case 'neq': isValid = fieldValue !== threshold; break;
            }
            if (!isValid) {
              message = `${config.field} (${fieldValue}) failed ${config.operator} ${threshold}`;
            }
          }
          break;

        case 'role_forbidden':
          const actorRole = context.actor_role || context.actorRole;
          if (config.forbidden_roles?.includes(actorRole)) {
            isValid = false;
            message = `Role ${actorRole} is forbidden from this operation`;
          }
          if (config.allowed_roles && actorRole && !config.allowed_roles.includes(actorRole)) {
            isValid = false;
            message = `Role ${actorRole} is not authorized for this operation`;
          }
          break;

        case 'custom':
          // Custom validations based on check type
          switch (config.check) {
            case 'prd_required_unless_meta':
              const metaOps = config.meta_operations || [];
              if (!context.prd_id && !metaOps.includes(context.operation_type)) {
                isValid = false;
                message = 'PRD ID required for non-meta operations';
              }
              break;

            case 'pii_handling':
              if (context.has_pii && !context.encrypted && !context.masked) {
                isValid = false;
                message = 'PII detected without proper handling (encryption/masking)';
              }
              break;

            case 'semantic_validation':
              // Would need external service - for now pass if context indicates validated
              if (context.semantic_validated === false) {
                isValid = false;
                message = 'Semantic validation failed';
              }
              break;
          }
          break;
      }

      if (!isValid) {
        const result = {
          rule_code: rule.rule_code,
          rule_name: rule.rule_name,
          severity: rule.severity,
          enforcement_action: rule.enforcement_action,
          message
        };

        if (rule.enforcement_action === 'WARN_AND_LOG' || rule.enforcement_action === 'AUDIT_ONLY') {
          warnings.push(result);
        } else {
          violations.push(result);
        }
      } else {
        passed.push({
          rule_code: rule.rule_code,
          rule_name: rule.rule_name
        });
      }
    }

    // Record violations if requested
    if (record_violations && violations.length > 0) {
      for (const v of violations) {
        await supabase
          .from('aegis_violations')
          .insert({
            rule_id: rules?.find(r => r.rule_code === v.rule_code)?.id,
            constitution_id: rules?.find(r => r.rule_code === v.rule_code)?.constitution,
            severity: v.severity,
            message: v.message,
            status: 'open',
            actor_role: context.actor_role || context.actorRole,
            actor_id: context.actor_id || context.actorId,
            operation_type: context.operation_type || context.operationType,
            target_table: context.target_table || context.targetTable,
            payload: context
          })
          .then(({ error }) => {
            if (error) console.error('Failed to record violation:', error.message);
          })
          // SD-SEC-ERROR-HANDLING-001: Handle promise rejection to prevent unhandled rejections
          .catch((err: Error) => {
            console.error('Unexpected error recording violation:', err.message);
          });
      }
    }

    const overallPassed = violations.length === 0;

    return res.status(200).json({
      passed: overallPassed,
      rulesChecked: rules?.length || 0,
      violations,
      violationCount: violations.length,
      warnings,
      warningCount: warnings.length,
      passedRules: passed.length,
      details: {
        critical: violations.filter(v => v.severity === 'CRITICAL').length,
        high: violations.filter(v => v.severity === 'HIGH').length,
        medium: violations.filter(v => v.severity === 'MEDIUM').length,
        low: violations.filter(v => v.severity === 'LOW').length
      }
    });

  } catch (error) {
    console.error('AEGIS validation error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// SECURITY: Wrap handler with authentication and authorization middleware
// SD-SEC-AUTHORIZATION-RBAC-001: Requires compliance:write permission
export default withAuth(withPermission('compliance:write')(handler));
