import { describe, it, expect } from 'vitest';
import {
  SECURITY_DOMAINS,
  FINDING_SUMMARY,
  SECURITY_REPORT_ID,
  SD_KEY
} from '../../../lib/ventures/cronread/security-verification-report.js';

describe('CronRead Security Verification Report', () => {
  describe('Report Structure', () => {
    it('should have all 6 security domains', () => {
      const domains = Object.keys(SECURITY_DOMAINS);
      expect(domains).toContain('input_validation');
      expect(domains).toContain('api_key_security');
      expect(domains).toContain('authentication');
      expect(domains).toContain('rls_policies');
      expect(domains).toContain('rate_limiting');
      expect(domains).toContain('owasp_compliance');
      expect(domains).toHaveLength(6);
    });

    it('should have valid report ID and SD key', () => {
      expect(SECURITY_REPORT_ID).toMatch(/^[0-9a-f-]{36}$/);
      expect(SD_KEY).toBe('SD-CRONREAD-LEO-GEN-SECURITY-VERIFICATION-CRONREAD-001');
    });
  });

  describe('Finding Summary', () => {
    it('should have correct severity counts', () => {
      expect(FINDING_SUMMARY.critical).toBe(3);
      expect(FINDING_SUMMARY.high).toBe(6);
      expect(FINDING_SUMMARY.medium).toBe(12);
      expect(FINDING_SUMMARY.total).toBe(29);
    });

    it('should have overall risk and verdict', () => {
      expect(FINDING_SUMMARY.overall_risk).toBe('HIGH');
      expect(FINDING_SUMMARY.verdict).toBe('WARNING');
      expect(FINDING_SUMMARY.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('Domain: Input Validation', () => {
    const domain = SECURITY_DOMAINS.input_validation;

    it('should identify ReDoS risk as HIGH', () => {
      expect(domain.risk_level).toBe('HIGH');
    });

    it('should have findings about ReDoS', () => {
      const redosFinding = domain.critical_findings.find(f =>
        f.toLowerCase().includes('redos') || f.toLowerCase().includes('backtracking')
      );
      expect(redosFinding).toBeTruthy();
    });

    it('should recommend input length limits', () => {
      const lengthRec = domain.recommendations.find(r =>
        r.toLowerCase().includes('length') || r.toLowerCase().includes('character')
      );
      expect(lengthRec).toBeTruthy();
    });

    it('should recommend timeout guards', () => {
      const timeoutRec = domain.recommendations.find(r =>
        r.toLowerCase().includes('timeout')
      );
      expect(timeoutRec).toBeTruthy();
    });
  });

  describe('Domain: API Key Security', () => {
    const domain = SECURITY_DOMAINS.api_key_security;

    it('should identify key storage risk as HIGH', () => {
      expect(domain.risk_level).toBe('HIGH');
    });

    it('should recommend hashing keys at rest', () => {
      const hashRec = domain.recommendations.find(r =>
        r.toLowerCase().includes('hash') || r.toLowerCase().includes('bcrypt') || r.toLowerCase().includes('argon2')
      );
      expect(hashRec).toBeTruthy();
    });

    it('should recommend CSPRNG for generation', () => {
      const csprngRec = domain.recommendations.find(r =>
        r.toLowerCase().includes('csprng') || r.toLowerCase().includes('randombytes')
      );
      expect(csprngRec).toBeTruthy();
    });

    it('should cover full key lifecycle', () => {
      const hasRotation = domain.recommendations.some(r => r.toLowerCase().includes('rotation'));
      const hasRevocation = domain.recommendations.some(r => r.toLowerCase().includes('revocation'));
      const hasExpiration = domain.recommendations.some(r => r.toLowerCase().includes('expir'));
      expect(hasRotation).toBe(true);
      expect(hasRevocation).toBe(true);
      expect(hasExpiration).toBe(true);
    });
  });

  describe('Domain: Authentication', () => {
    it('should assess auth flow risk', () => {
      expect(SECURITY_DOMAINS.authentication.risk_level).toBe('MEDIUM');
    });

    it('should address session management', () => {
      const sessionRec = SECURITY_DOMAINS.authentication.recommendations.find(r =>
        r.toLowerCase().includes('session')
      );
      expect(sessionRec).toBeTruthy();
    });
  });

  describe('Domain: RLS Policies', () => {
    it('should flag missing RLS as HIGH risk', () => {
      expect(SECURITY_DOMAINS.rls_policies.risk_level).toBe('HIGH');
    });

    it('should recommend enabling RLS on all tables', () => {
      const rlsRec = SECURITY_DOMAINS.rls_policies.recommendations.find(r =>
        r.includes('ENABLE ROW LEVEL SECURITY')
      );
      expect(rlsRec).toBeTruthy();
    });
  });

  describe('Domain: Rate Limiting', () => {
    it('should recommend limits for both auth states', () => {
      const recs = SECURITY_DOMAINS.rate_limiting.recommendations;
      const hasUnauth = recs.some(r => r.toLowerCase().includes('unauthenticated'));
      const hasAuth = recs.some(r => r.toLowerCase().includes('authenticated'));
      expect(hasUnauth).toBe(true);
      expect(hasAuth).toBe(true);
    });
  });

  describe('Domain: OWASP Top 10', () => {
    const owasp = SECURITY_DOMAINS.owasp_compliance.categories;

    it('should cover all 10 OWASP categories', () => {
      expect(Object.keys(owasp)).toHaveLength(10);
    });

    it('should mark A01 (Broken Access Control) as HIGH', () => {
      expect(owasp.A01_broken_access_control.severity).toBe('HIGH');
    });

    it('should mark A10 (SSRF) as NOT_APPLICABLE', () => {
      expect(owasp.A10_ssrf.status).toBe('NOT_APPLICABLE');
    });

    it('should have remediation status for each category', () => {
      Object.values(owasp).forEach(cat => {
        expect(cat.status).toBeTruthy();
        expect(cat.note).toBeTruthy();
      });
    });
  });
});
