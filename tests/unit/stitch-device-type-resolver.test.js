import { describe, it, expect } from 'vitest';
import { inferDeviceType } from '../../lib/eva/bridge/stitch-device-type-resolver.js';

describe('inferDeviceType', () => {
  describe('DESKTOP mapping', () => {
    it('maps "dashboard" to DESKTOP', () => {
      expect(inferDeviceType({ name: 'Admin Dashboard' })).toBe('DESKTOP');
    });

    it('maps "analytics" to DESKTOP', () => {
      expect(inferDeviceType({ purpose: 'Analytics Overview' })).toBe('DESKTOP');
    });

    it('maps "management" to DESKTOP', () => {
      expect(inferDeviceType({ name: 'User Management Console' })).toBe('DESKTOP');
    });

    it('maps "portal" to DESKTOP', () => {
      expect(inferDeviceType({ name: 'Customer Portal' })).toBe('DESKTOP');
    });
  });

  describe('MOBILE mapping', () => {
    it('maps "mobile" to MOBILE', () => {
      expect(inferDeviceType({ name: 'Mobile Home Screen' })).toBe('MOBILE');
    });

    it('maps "app home" to MOBILE', () => {
      expect(inferDeviceType({ purpose: 'App Home' })).toBe('MOBILE');
    });

    it('maps "ios" to MOBILE', () => {
      expect(inferDeviceType({ name: 'iOS Settings' })).toBe('MOBILE');
    });
  });

  describe('TABLET mapping', () => {
    it('maps "tablet" to TABLET', () => {
      expect(inferDeviceType({ name: 'Tablet View' })).toBe('TABLET');
    });

    it('maps "ipad" to TABLET', () => {
      expect(inferDeviceType({ purpose: 'iPad Layout' })).toBe('TABLET');
    });
  });

  describe('AGNOSTIC fallback', () => {
    it('returns AGNOSTIC for unknown purpose', () => {
      expect(inferDeviceType({ name: 'Settings Page' })).toBe('AGNOSTIC');
    });

    it('returns AGNOSTIC for null input', () => {
      expect(inferDeviceType(null)).toBe('AGNOSTIC');
    });

    it('returns AGNOSTIC for undefined input', () => {
      expect(inferDeviceType(undefined)).toBe('AGNOSTIC');
    });

    it('returns AGNOSTIC for empty object', () => {
      expect(inferDeviceType({})).toBe('AGNOSTIC');
    });

    it('returns AGNOSTIC for empty string', () => {
      expect(inferDeviceType('')).toBe('AGNOSTIC');
    });
  });

  describe('string input', () => {
    it('handles plain string with dashboard keyword', () => {
      expect(inferDeviceType('Dashboard Overview')).toBe('DESKTOP');
    });

    it('handles plain string with mobile keyword', () => {
      expect(inferDeviceType('Mobile App Login')).toBe('MOBILE');
    });
  });

  describe('priority (tablet > mobile > desktop)', () => {
    it('tablet wins over mobile', () => {
      expect(inferDeviceType({ name: 'Mobile Tablet View' })).toBe('TABLET');
    });

    it('mobile wins over desktop', () => {
      expect(inferDeviceType({ name: 'Mobile Dashboard' })).toBe('MOBILE');
    });
  });
});
