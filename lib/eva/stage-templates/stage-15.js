/**
 * Stage 15 Template - Resource Planning
 * Phase: THE BLUEPRINT (Stages 13-16)
 * Part of SD-LEO-FEAT-TMPL-BLUEPRINT-001
 *
 * Team structure, resource allocation, and skill gap analysis.
 *
 * @module lib/eva/stage-templates/stage-15
 */

import { validateString, validateNumber, validateArray, collectErrors } from './validation.js';

const MIN_TEAM_MEMBERS = 2;
const MIN_ROLES = 2;

const TEMPLATE = {
  id: 'stage-15',
  slug: 'resource-planning',
  title: 'Resource Planning',
  version: '1.0.0',
  schema: {
    team_members: {
      type: 'array',
      minItems: MIN_TEAM_MEMBERS,
      items: {
        role: { type: 'string', required: true },
        skills: { type: 'array', minItems: 1, required: true },
        allocation_pct: { type: 'number', min: 1, max: 100, required: true },
        cost_monthly: { type: 'number', min: 0 },
      },
    },
    skill_gaps: {
      type: 'array',
      items: {
        skill: { type: 'string', required: true },
        severity: { type: 'string', required: true },
        mitigation: { type: 'string', required: true },
      },
    },
    hiring_plan: {
      type: 'array',
      items: {
        role: { type: 'string', required: true },
        timeline: { type: 'string', required: true },
        priority: { type: 'string', required: true },
      },
    },
    // Derived
    total_headcount: { type: 'number', derived: true },
    total_monthly_cost: { type: 'number', derived: true },
    unique_roles: { type: 'number', derived: true },
    avg_allocation: { type: 'number', derived: true },
  },
  defaultData: {
    team_members: [],
    skill_gaps: [],
    hiring_plan: [],
    total_headcount: 0,
    total_monthly_cost: 0,
    unique_roles: 0,
    avg_allocation: 0,
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data) {
    const errors = [];

    // Team members
    const teamCheck = validateArray(data?.team_members, 'team_members', MIN_TEAM_MEMBERS);
    if (!teamCheck.valid) {
      errors.push(teamCheck.error);
    } else {
      for (let i = 0; i < data.team_members.length; i++) {
        const tm = data.team_members[i];
        const prefix = `team_members[${i}]`;
        const results = [
          validateString(tm?.role, `${prefix}.role`, 1),
          validateNumber(tm?.allocation_pct, `${prefix}.allocation_pct`, 1),
        ];
        errors.push(...collectErrors(results));

        if (tm?.allocation_pct !== undefined && typeof tm.allocation_pct === 'number' && tm.allocation_pct > 100) {
          errors.push(`${prefix}.allocation_pct must be <= 100 (got ${tm.allocation_pct})`);
        }

        const skillsCheck = validateArray(tm?.skills, `${prefix}.skills`, 1);
        if (!skillsCheck.valid) errors.push(skillsCheck.error);
      }

      // Check minimum unique roles
      const roles = new Set(data.team_members.map(tm => tm.role));
      if (roles.size < MIN_ROLES) {
        errors.push(`team_members must define at least ${MIN_ROLES} unique roles (got ${roles.size})`);
      }
    }

    // Skill gaps (optional but validate if present)
    if (data?.skill_gaps && Array.isArray(data.skill_gaps)) {
      for (let i = 0; i < data.skill_gaps.length; i++) {
        const sg = data.skill_gaps[i];
        const prefix = `skill_gaps[${i}]`;
        const results = [
          validateString(sg?.skill, `${prefix}.skill`, 1),
          validateString(sg?.severity, `${prefix}.severity`, 1),
          validateString(sg?.mitigation, `${prefix}.mitigation`, 1),
        ];
        errors.push(...collectErrors(results));
      }
    }

    // Hiring plan (optional but validate if present)
    if (data?.hiring_plan && Array.isArray(data.hiring_plan)) {
      for (let i = 0; i < data.hiring_plan.length; i++) {
        const hp = data.hiring_plan[i];
        const prefix = `hiring_plan[${i}]`;
        const results = [
          validateString(hp?.role, `${prefix}.role`, 1),
          validateString(hp?.timeline, `${prefix}.timeline`, 1),
          validateString(hp?.priority, `${prefix}.priority`, 1),
        ];
        errors.push(...collectErrors(results));
      }
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields.
   * @param {Object} data - Validated input data
   * @returns {Object} Data with derived fields
   */
  computeDerived(data) {
    const total_headcount = data.team_members.length;
    const total_monthly_cost = data.team_members.reduce(
      (sum, tm) => sum + (tm.cost_monthly || 0),
      0,
    );
    const unique_roles = new Set(data.team_members.map(tm => tm.role)).size;
    const avg_allocation = total_headcount > 0
      ? Math.round(data.team_members.reduce((sum, tm) => sum + tm.allocation_pct, 0) / total_headcount * 100) / 100
      : 0;

    return {
      ...data,
      total_headcount,
      total_monthly_cost,
      unique_roles,
      avg_allocation,
    };
  },
};

export { MIN_TEAM_MEMBERS, MIN_ROLES };
export default TEMPLATE;
