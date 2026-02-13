/**
 * Unit tests for Stage 15 - Resource Planning template
 * Part of SD-LEO-FEAT-TMPL-BLUEPRINT-001
 *
 * Test Scenario: Stage 15 validation enforces minimum team members,
 * unique roles, and validates allocation percentages.
 *
 * @module tests/unit/eva/stage-templates/stage-15.test
 */

import { describe, it, expect } from 'vitest';
import stage15, { MIN_TEAM_MEMBERS, MIN_ROLES } from '../../../../lib/eva/stage-templates/stage-15.js';

describe('stage-15.js - Resource Planning template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage15.id).toBe('stage-15');
      expect(stage15.slug).toBe('resource-planning');
      expect(stage15.title).toBe('Resource Planning');
      expect(stage15.version).toBe('2.0.0');
    });

    it('should have schema definition', () => {
      expect(stage15.schema).toBeDefined();
      expect(stage15.schema.team_members).toBeDefined();
      expect(stage15.schema.skill_gaps).toBeDefined();
      expect(stage15.schema.hiring_plan).toBeDefined();
    });

    it('should have defaultData', () => {
      expect(stage15.defaultData).toEqual({
        team_members: [],
        skill_gaps: [],
        hiring_plan: [],
        total_headcount: 0,
        total_monthly_cost: 0,
        unique_roles: 0,
        avg_allocation: 0,
      });
    });

    it('should have validate function', () => {
      expect(typeof stage15.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage15.computeDerived).toBe('function');
    });

    it('should export constants', () => {
      expect(MIN_TEAM_MEMBERS).toBe(2);
      expect(MIN_ROLES).toBe(2);
    });
  });

  describe('validate() - Team members array', () => {
    it('should pass for valid team_members (>= 2 members, >= 2 roles)', () => {
      const validData = {
        team_members: [
          { role: 'Engineer', skills: ['JavaScript', 'React'], allocation_pct: 100, cost_monthly: 10000 },
          { role: 'Designer', skills: ['Figma', 'UI/UX'], allocation_pct: 50, cost_monthly: 5000 },
        ],
      };
      const result = stage15.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for fewer than 2 team members', () => {
      const invalidData = {
        team_members: [
          { role: 'Engineer', skills: ['JavaScript'], allocation_pct: 100, cost_monthly: 10000 },
        ],
      };
      const result = stage15.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('team_members') && e.includes('at least 2'))).toBe(true);
    });

    it('should fail for team member missing role', () => {
      const invalidData = {
        team_members: [
          { skills: ['JavaScript'], allocation_pct: 100, cost_monthly: 10000 },
          { role: 'Designer', skills: ['Figma'], allocation_pct: 50, cost_monthly: 5000 },
        ],
      };
      const result = stage15.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('team_members[0].role'))).toBe(true);
    });

    it('should fail for team member missing allocation_pct', () => {
      const invalidData = {
        team_members: [
          { role: 'Engineer', skills: ['JavaScript'], cost_monthly: 10000 },
          { role: 'Designer', skills: ['Figma'], allocation_pct: 50, cost_monthly: 5000 },
        ],
      };
      const result = stage15.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('team_members[0].allocation_pct'))).toBe(true);
    });

    it('should fail for allocation_pct > 100', () => {
      const invalidData = {
        team_members: [
          { role: 'Engineer', skills: ['JavaScript'], allocation_pct: 150, cost_monthly: 10000 },
          { role: 'Designer', skills: ['Figma'], allocation_pct: 50, cost_monthly: 5000 },
        ],
      };
      const result = stage15.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('team_members[0].allocation_pct') && e.includes('150'))).toBe(true);
    });

    it('should fail for team member with empty skills array', () => {
      const invalidData = {
        team_members: [
          { role: 'Engineer', skills: [], allocation_pct: 100, cost_monthly: 10000 },
          { role: 'Designer', skills: ['Figma'], allocation_pct: 50, cost_monthly: 5000 },
        ],
      };
      const result = stage15.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('team_members[0].skills'))).toBe(true);
    });

    it('should fail for team member missing skills', () => {
      const invalidData = {
        team_members: [
          { role: 'Engineer', allocation_pct: 100, cost_monthly: 10000 },
          { role: 'Designer', skills: ['Figma'], allocation_pct: 50, cost_monthly: 5000 },
        ],
      };
      const result = stage15.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('team_members[0].skills'))).toBe(true);
    });

    it('should fail for fewer than 2 unique roles', () => {
      const invalidData = {
        team_members: [
          { role: 'Engineer', skills: ['JavaScript'], allocation_pct: 100, cost_monthly: 10000 },
          { role: 'Engineer', skills: ['Python'], allocation_pct: 50, cost_monthly: 5000 },
        ],
      };
      const result = stage15.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('at least 2 unique roles'))).toBe(true);
    });
  });

  describe('validate() - Skill gaps (optional)', () => {
    const validTeamMembers = [
      { role: 'Engineer', skills: ['JavaScript'], allocation_pct: 100, cost_monthly: 10000 },
      { role: 'Designer', skills: ['Figma'], allocation_pct: 50, cost_monthly: 5000 },
    ];

    it('should pass when skill_gaps are omitted', () => {
      const validData = {
        team_members: validTeamMembers,
      };
      const result = stage15.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass when skill_gaps are empty array', () => {
      const validData = {
        team_members: validTeamMembers,
        skill_gaps: [],
      };
      const result = stage15.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass when skill_gaps have valid items', () => {
      const validData = {
        team_members: validTeamMembers,
        skill_gaps: [
          { skill: 'DevOps', severity: 'high', mitigation: 'Hire contractor' },
        ],
      };
      const result = stage15.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should fail for skill gap missing skill', () => {
      const invalidData = {
        team_members: validTeamMembers,
        skill_gaps: [
          { severity: 'high', mitigation: 'Hire contractor' },
        ],
      };
      const result = stage15.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('skill_gaps[0].skill'))).toBe(true);
    });

    it('should fail for skill gap missing severity', () => {
      const invalidData = {
        team_members: validTeamMembers,
        skill_gaps: [
          { skill: 'DevOps', mitigation: 'Hire contractor' },
        ],
      };
      const result = stage15.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('skill_gaps[0].severity'))).toBe(true);
    });

    it('should fail for skill gap missing mitigation', () => {
      const invalidData = {
        team_members: validTeamMembers,
        skill_gaps: [
          { skill: 'DevOps', severity: 'high' },
        ],
      };
      const result = stage15.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('skill_gaps[0].mitigation'))).toBe(true);
    });
  });

  describe('validate() - Hiring plan (optional)', () => {
    const validTeamMembers = [
      { role: 'Engineer', skills: ['JavaScript'], allocation_pct: 100, cost_monthly: 10000 },
      { role: 'Designer', skills: ['Figma'], allocation_pct: 50, cost_monthly: 5000 },
    ];

    it('should pass when hiring_plan is omitted', () => {
      const validData = {
        team_members: validTeamMembers,
      };
      const result = stage15.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass when hiring_plan is empty array', () => {
      const validData = {
        team_members: validTeamMembers,
        hiring_plan: [],
      };
      const result = stage15.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass when hiring_plan has valid items', () => {
      const validData = {
        team_members: validTeamMembers,
        hiring_plan: [
          { role: 'DevOps Engineer', timeline: 'Q2 2026', priority: 'high' },
        ],
      };
      const result = stage15.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should fail for hiring plan missing role', () => {
      const invalidData = {
        team_members: validTeamMembers,
        hiring_plan: [
          { timeline: 'Q2 2026', priority: 'high' },
        ],
      };
      const result = stage15.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('hiring_plan[0].role'))).toBe(true);
    });

    it('should fail for hiring plan missing timeline', () => {
      const invalidData = {
        team_members: validTeamMembers,
        hiring_plan: [
          { role: 'DevOps Engineer', priority: 'high' },
        ],
      };
      const result = stage15.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('hiring_plan[0].timeline'))).toBe(true);
    });

    it('should fail for hiring plan missing priority', () => {
      const invalidData = {
        team_members: validTeamMembers,
        hiring_plan: [
          { role: 'DevOps Engineer', timeline: 'Q2 2026' },
        ],
      };
      const result = stage15.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('hiring_plan[0].priority'))).toBe(true);
    });
  });

  describe('computeDerived() - Team statistics', () => {
    it('should calculate total_headcount correctly', () => {
      const data = {
        team_members: [
          { role: 'Engineer', skills: ['JavaScript'], allocation_pct: 100, cost_monthly: 10000 },
          { role: 'Designer', skills: ['Figma'], allocation_pct: 50, cost_monthly: 5000 },
          { role: 'PM', skills: ['Agile'], allocation_pct: 75, cost_monthly: 8000 },
        ],
      };
      const result = stage15.computeDerived(data);
      expect(result.total_headcount).toBe(3);
    });

    it('should calculate total_monthly_cost correctly', () => {
      const data = {
        team_members: [
          { role: 'Engineer', skills: ['JavaScript'], allocation_pct: 100, cost_monthly: 10000 },
          { role: 'Designer', skills: ['Figma'], allocation_pct: 50, cost_monthly: 5000 },
        ],
      };
      const result = stage15.computeDerived(data);
      expect(result.total_monthly_cost).toBe(15000);
    });

    it('should handle missing cost_monthly (default to 0)', () => {
      const data = {
        team_members: [
          { role: 'Engineer', skills: ['JavaScript'], allocation_pct: 100 },
          { role: 'Designer', skills: ['Figma'], allocation_pct: 50 },
        ],
      };
      const result = stage15.computeDerived(data);
      expect(result.total_monthly_cost).toBe(0);
    });

    it('should calculate unique_roles correctly', () => {
      const data = {
        team_members: [
          { role: 'Engineer', skills: ['JavaScript'], allocation_pct: 100, cost_monthly: 10000 },
          { role: 'Engineer', skills: ['Python'], allocation_pct: 100, cost_monthly: 10000 },
          { role: 'Designer', skills: ['Figma'], allocation_pct: 50, cost_monthly: 5000 },
        ],
      };
      const result = stage15.computeDerived(data);
      expect(result.unique_roles).toBe(2);
    });

    it('should calculate avg_allocation correctly', () => {
      const data = {
        team_members: [
          { role: 'Engineer', skills: ['JavaScript'], allocation_pct: 100, cost_monthly: 10000 },
          { role: 'Designer', skills: ['Figma'], allocation_pct: 50, cost_monthly: 5000 },
        ],
      };
      const result = stage15.computeDerived(data);
      expect(result.avg_allocation).toBe(75);
    });

    it('should round avg_allocation to 2 decimal places', () => {
      const data = {
        team_members: [
          { role: 'Engineer', skills: ['JavaScript'], allocation_pct: 100, cost_monthly: 10000 },
          { role: 'Designer', skills: ['Figma'], allocation_pct: 50, cost_monthly: 5000 },
          { role: 'PM', skills: ['Agile'], allocation_pct: 33, cost_monthly: 3000 },
        ],
      };
      const result = stage15.computeDerived(data);
      expect(result.avg_allocation).toBe(61);
    });

    it('should return 0 avg_allocation for empty team_members', () => {
      const data = {
        team_members: [],
      };
      const result = stage15.computeDerived(data);
      expect(result.avg_allocation).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty team_members array', () => {
      const data = {
        team_members: [],
      };
      const validation = stage15.validate(data);
      expect(validation.valid).toBe(false);

      const derived = stage15.computeDerived(data);
      expect(derived.total_headcount).toBe(0);
      expect(derived.total_monthly_cost).toBe(0);
      expect(derived.unique_roles).toBe(0);
      expect(derived.avg_allocation).toBe(0);
    });

    it('should handle null values', () => {
      const result = stage15.validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle undefined values', () => {
      const result = stage15.validate(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        team_members: [
          { role: 'Engineer', skills: ['JavaScript'], allocation_pct: 100, cost_monthly: 10000 },
          { role: 'Designer', skills: ['Figma'], allocation_pct: 50, cost_monthly: 5000 },
        ],
      };
      const validation = stage15.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage15.computeDerived(data);
      expect(computed.total_headcount).toBe(2);
      expect(computed.unique_roles).toBe(2);
      expect(computed.total_monthly_cost).toBe(15000);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = {
        team_members: [
          { role: 'Engineer', skills: [], allocation_pct: 100, cost_monthly: 10000 },
        ],
      };
      const computed = stage15.computeDerived(data);
      expect(computed.total_headcount).toBe(1);
      expect(computed.unique_roles).toBe(1);
    });
  });
});
