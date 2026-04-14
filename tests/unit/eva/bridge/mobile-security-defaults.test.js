/**
 * Tests for mobile security defaults shared module
 * SD-MOBILEFIRST-VENTURE-BUILD-STRATEGY-ORCH-001-C
 */
import { describe, it, expect } from 'vitest';
import { getSecurityInstructions, MOBILE_SECURITY_INSTRUCTIONS, WEB_SECURITY_INSTRUCTIONS } from '../../../../lib/eva/bridge/mobile-security-defaults.js';

describe('Mobile security defaults', () => {
  it('returns mobile instructions for mobile platform', () => {
    const result = getSecurityInstructions('mobile');
    expect(result).toBe(MOBILE_SECURITY_INSTRUCTIONS);
    expect(result).toContain('expo-secure-store');
    expect(result).toContain('Certificate Pinning');
    expect(result).toContain('Deep Link Security');
  });

  it('returns mobile instructions for both platform', () => {
    const result = getSecurityInstructions('both');
    expect(result).toBe(MOBILE_SECURITY_INSTRUCTIONS);
  });

  it('returns web instructions for web platform', () => {
    const result = getSecurityInstructions('web');
    expect(result).toBe(WEB_SECURITY_INSTRUCTIONS);
    expect(result).toContain('SUPABASE_ANON_KEY');
    expect(result).not.toContain('expo-secure-store');
  });

  it('mobile instructions include OTA security', () => {
    expect(MOBILE_SECURITY_INSTRUCTIONS).toContain('OTA Update Security');
    expect(MOBILE_SECURITY_INSTRUCTIONS).toContain('code signing');
  });

  it('mobile instructions warn against AsyncStorage for secrets', () => {
    expect(MOBILE_SECURITY_INSTRUCTIONS).toContain('NEVER store secrets in AsyncStorage');
  });
});
