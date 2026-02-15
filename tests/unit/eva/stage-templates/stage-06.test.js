/**
 * Unit tests for Stage 06 - Risk Matrix template
 * Part of SD-LEO-FEAT-TMPL-ENGINE-001
 *
 * Test Scenario TS-1: Stage 06 valid payload normalizes and computes score (severity*probability*impact)
 *
 * @module tests/unit/eva/stage-templates/stage-06.test
 */

import { describe, it, expect } from 'vitest';
import stage06, { RISK_CATEGORIES, RISK_STATUSES } from '../../../../lib/eva/stage-templates/stage-06.js';

describe('stage-06.js - Risk Matrix template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage06.id).toBe('stage-06');
      expect(stage06.slug).toBe('risk-matrix');
      expect(stage06.title).toBe('Risk Matrix');
      expect(stage06.version).toBe('2.0.0');
    });

    it('should export RISK_CATEGORIES', () => {
      expect(RISK_CATEGORIES).toEqual([
        'Market',
        'Product',
        'Technical',
        'Legal/Compliance',
        'Financial',
        'Operational',
      ]);
    });

    it('should export RISK_STATUSES', () => {
      expect(RISK_STATUSES).toEqual(['open', 'mitigated', 'accepted', 'closed']);
    });

    it('should have defaultData', () => {
      expect(stage06.defaultData).toEqual({
        risks: [],
        aggregate_risk_score: 0,
        normalized_risk_score: 0,
        highest_risk_factor: null,
        mitigation_coverage_pct: 0,
      });
    });

    it('should have validate function', () => {
      expect(typeof stage06.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage06.computeDerived).toBe('function');
    });
  });

  describe('validate() - Risk validation', () => {
    const validRisk = {
      id: 'RISK-001',
      category: 'Market',
      description: 'Market adoption risk - competitors may copy feature',
      severity: 4,
      probability: 3,
      impact: 4,
      mitigation: 'File patent, build network effects',
      owner: 'Product Lead',
      status: 'open',
      review_date: '2026-03-01',
    };

    const validData = { risks: [validRisk] };

    it('should pass for valid data with single risk', () => {
      const result = stage06.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should pass for valid data with multiple risks', () => {
      const data = {
        risks: [
          validRisk,
          {
            ...validRisk,
            id: 'RISK-002',
            category: 'Technical',
            description: 'Technical scalability risk - database bottleneck',
          },
        ],
      };
      const result = stage06.validate(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for empty risks array', () => {
      const data = { risks: [] };
      const result = stage06.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('risks');
      expect(result.errors[0]).toContain('must have at least 1 item(s)');
    });

    it('should fail for missing risks field', () => {
      const data = {};
      const result = stage06.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('risks');
    });

    it('should fail for missing risk id', () => {
      const data = { risks: [{ ...validRisk }] };
      delete data.risks[0].id;
      const result = stage06.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('risks[0].id');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for invalid category', () => {
      const data = { risks: [{ ...validRisk, category: 'InvalidCategory' }] };
      const result = stage06.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('risks[0].category');
      expect(result.errors[0]).toContain('must be one of');
    });

    it('should fail for description below minimum length', () => {
      const data = { risks: [{ ...validRisk, description: 'Too short' }] };
      const result = stage06.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('risks[0].description');
      expect(result.errors[0]).toContain('must be at least 10 characters');
    });

    it('should fail for severity below minimum (1)', () => {
      const data = { risks: [{ ...validRisk, severity: 0 }] };
      const result = stage06.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('risks[0].severity');
      expect(result.errors[0]).toContain('must be between 1 and 5');
    });

    it('should fail for severity above maximum (5)', () => {
      const data = { risks: [{ ...validRisk, severity: 6 }] };
      const result = stage06.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('risks[0].severity');
      expect(result.errors[0]).toContain('must be between 1 and 5');
    });

    it('should pass for severity at boundaries (1 and 5)', () => {
      const data1 = { risks: [{ ...validRisk, severity: 1 }] };
      const data5 = { risks: [{ ...validRisk, severity: 5 }] };
      expect(stage06.validate(data1).valid).toBe(true);
      expect(stage06.validate(data5).valid).toBe(true);
    });

    it('should fail for probability out of bounds', () => {
      const data0 = { risks: [{ ...validRisk, probability: 0 }] };
      const data6 = { risks: [{ ...validRisk, probability: 6 }] };
      expect(stage06.validate(data0).valid).toBe(false);
      expect(stage06.validate(data6).valid).toBe(false);
    });

    it('should fail for impact out of bounds', () => {
      const data0 = { risks: [{ ...validRisk, impact: 0 }] };
      const data6 = { risks: [{ ...validRisk, impact: 6 }] };
      expect(stage06.validate(data0).valid).toBe(false);
      expect(stage06.validate(data6).valid).toBe(false);
    });

    it('should fail for missing mitigation', () => {
      const data = { risks: [{ ...validRisk }] };
      delete data.risks[0].mitigation;
      const result = stage06.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('risks[0].mitigation');
    });

    it('should fail for invalid status', () => {
      const data = { risks: [{ ...validRisk, status: 'invalid_status' }] };
      const result = stage06.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('risks[0].status');
      expect(result.errors[0]).toContain('must be one of');
    });

    it('should pass for all valid statuses', () => {
      for (const status of RISK_STATUSES) {
        const data = { risks: [{ ...validRisk, status }] };
        const result = stage06.validate(data);
        expect(result.valid).toBe(true);
      }
    });

    it('should validate optional residual fields when present', () => {
      const data = {
        risks: [
          {
            ...validRisk,
            residual_severity: 2,
            residual_probability: 2,
            residual_impact: 2,
          },
        ],
      };
      const result = stage06.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail for residual_severity out of bounds', () => {
      const data = {
        risks: [
          {
            ...validRisk,
            residual_severity: 6,
            residual_probability: 2,
            residual_impact: 2,
          },
        ],
      };
      const result = stage06.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('residual_severity');
    });

    it('should collect multiple validation errors across risks', () => {
      const data = {
        risks: [
          { ...validRisk, severity: 0 },
          { ...validRisk, id: 'RISK-002', category: 'InvalidCat' },
          { ...validRisk, id: 'RISK-003', description: 'Short' },
        ],
      };
      const result = stage06.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('computeDerived() - TS-1: Score computation', () => {
    it('should compute score = severity * probability * impact', () => {
      const data = {
        risks: [
          {
            id: 'RISK-001',
            category: 'Market',
            description: 'Market adoption risk',
            severity: 4,
            probability: 3,
            impact: 5,
            mitigation: 'File patent',
            owner: 'Product Lead',
            status: 'open',
            review_date: '2026-03-01',
          },
        ],
      };
      const result = stage06.computeDerived(data);
      expect(result.risks[0].score).toBe(60); // 4 * 3 * 5 = 60
    });

    it('should compute score for minimum values (1*1*1=1)', () => {
      const data = {
        risks: [
          {
            id: 'RISK-001',
            category: 'Market',
            description: 'Low risk item',
            severity: 1,
            probability: 1,
            impact: 1,
            mitigation: 'Monitor only',
            owner: 'Product Lead',
            status: 'accepted',
            review_date: '2026-03-01',
          },
        ],
      };
      const result = stage06.computeDerived(data);
      expect(result.risks[0].score).toBe(1);
    });

    it('should compute score for maximum values (5*5*5=125)', () => {
      const data = {
        risks: [
          {
            id: 'RISK-001',
            category: 'Financial',
            description: 'Critical financial risk',
            severity: 5,
            probability: 5,
            impact: 5,
            mitigation: 'Immediate action',
            owner: 'CFO',
            status: 'open',
            review_date: '2026-02-15',
          },
        ],
      };
      const result = stage06.computeDerived(data);
      expect(result.risks[0].score).toBe(125);
    });

    it('should compute scores for multiple risks', () => {
      const data = {
        risks: [
          {
            id: 'RISK-001',
            category: 'Market',
            description: 'Market risk',
            severity: 3,
            probability: 2,
            impact: 4,
            mitigation: 'Mitigate',
            owner: 'PM',
            status: 'open',
            review_date: '2026-03-01',
          },
          {
            id: 'RISK-002',
            category: 'Technical',
            description: 'Tech risk',
            severity: 2,
            probability: 3,
            impact: 3,
            mitigation: 'Refactor',
            owner: 'CTO',
            status: 'open',
            review_date: '2026-03-01',
          },
        ],
      };
      const result = stage06.computeDerived(data);
      expect(result.risks[0].score).toBe(24); // 3 * 2 * 4
      expect(result.risks[1].score).toBe(18); // 2 * 3 * 3
    });

    it('should compute residual_score when residual fields present', () => {
      const data = {
        risks: [
          {
            id: 'RISK-001',
            category: 'Market',
            description: 'Market risk',
            severity: 5,
            probability: 4,
            impact: 5,
            mitigation: 'Mitigate',
            owner: 'PM',
            status: 'mitigated',
            review_date: '2026-03-01',
            residual_severity: 2,
            residual_probability: 2,
            residual_impact: 3,
          },
        ],
      };
      const result = stage06.computeDerived(data);
      expect(result.risks[0].score).toBe(100); // 5 * 4 * 5
      expect(result.risks[0].residual_score).toBe(12); // 2 * 2 * 3
    });

    it('should not compute residual_score when residual fields missing', () => {
      const data = {
        risks: [
          {
            id: 'RISK-001',
            category: 'Market',
            description: 'Market risk',
            severity: 5,
            probability: 4,
            impact: 5,
            mitigation: 'Mitigate',
            owner: 'PM',
            status: 'open',
            review_date: '2026-03-01',
          },
        ],
      };
      const result = stage06.computeDerived(data);
      expect(result.risks[0].score).toBe(100);
      expect(result.risks[0].residual_score).toBeUndefined();
    });

    it('should preserve all original fields in output', () => {
      const data = {
        risks: [
          {
            id: 'RISK-001',
            category: 'Market',
            description: 'Market risk',
            severity: 3,
            probability: 2,
            impact: 4,
            mitigation: 'Mitigate',
            owner: 'PM',
            status: 'open',
            review_date: '2026-03-01',
          },
        ],
      };
      const result = stage06.computeDerived(data);
      const risk = result.risks[0];
      expect(risk.id).toBe('RISK-001');
      expect(risk.category).toBe('Market');
      expect(risk.description).toBe('Market risk');
      expect(risk.severity).toBe(3);
      expect(risk.probability).toBe(2);
      expect(risk.impact).toBe(4);
      expect(risk.mitigation).toBe('Mitigate');
      expect(risk.owner).toBe('PM');
      expect(risk.status).toBe('open');
      expect(risk.review_date).toBe('2026-03-01');
    });

    it('should not mutate original data', () => {
      const data = {
        risks: [
          {
            id: 'RISK-001',
            category: 'Market',
            description: 'Market risk',
            severity: 3,
            probability: 2,
            impact: 4,
            mitigation: 'Mitigate',
            owner: 'PM',
            status: 'open',
            review_date: '2026-03-01',
          },
        ],
      };
      const original = JSON.parse(JSON.stringify(data));
      stage06.computeDerived(data);
      expect(data).toEqual(original);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        risks: [
          {
            id: 'RISK-001',
            category: 'Market',
            description: 'Market adoption risk',
            severity: 4,
            probability: 3,
            impact: 5,
            mitigation: 'File patent',
            owner: 'Product Lead',
            status: 'open',
            review_date: '2026-03-01',
          },
        ],
      };
      const validation = stage06.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage06.computeDerived(data);
      expect(computed.risks[0].score).toBe(60);
    });

    it('should compute derived fields even for invalid data (decoupled)', () => {
      const data = {
        risks: [
          {
            id: 'R1',
            category: 'Market',
            description: 'Short', // Invalid - too short
            severity: 3,
            probability: 2,
            impact: 4,
            mitigation: 'Mitigate',
            owner: 'PM',
            status: 'open',
            review_date: '2026-03-01',
          },
        ],
      };
      const validation = stage06.validate(data);
      expect(validation.valid).toBe(false);

      const computed = stage06.computeDerived(data);
      expect(computed.risks[0].score).toBe(24); // Still computes
    });
  });
});
