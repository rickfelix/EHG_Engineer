/**
 * Unit tests for resolveAppType in Stage 19 Sprint Planning
 * SD: SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-A-A
 *
 * Tests the majority-vote device type resolution from Stage 15 wireframe data.
 */

import { describe, it, expect } from 'vitest';
import { resolveAppType, APP_TYPE_VALUES } from '../../../../lib/eva/stage-templates/analysis-steps/stage-19-sprint-planning.js';

describe('resolveAppType', () => {
  it('should return agnostic when no stage15Data', () => {
    expect(resolveAppType(null)).toBe('agnostic');
    expect(resolveAppType(undefined)).toBe('agnostic');
  });

  it('should return agnostic when screens array is empty', () => {
    expect(resolveAppType({ screens: [] })).toBe('agnostic');
  });

  it('should return agnostic when no screens property', () => {
    expect(resolveAppType({})).toBe('agnostic');
  });

  it('should return mobile for mobile-dominant screens', () => {
    const stage15Data = {
      screens: [
        { name: 'Mobile App Home', purpose: 'Main app screen for phone' },
        { name: 'Mobile Settings', purpose: 'App settings on phone' },
        { name: 'Dashboard', purpose: 'Admin dashboard' },
      ],
    };
    expect(resolveAppType(stage15Data)).toBe('mobile');
  });

  it('should return web for desktop-dominant screens (desktop maps to web)', () => {
    const stage15Data = {
      screens: [
        { name: 'Admin Dashboard', purpose: 'Admin management panel' },
        { name: 'Analytics Dashboard', purpose: 'Reporting and analytics' },
        { name: 'Mobile App', purpose: 'Mobile app screen' },
      ],
    };
    expect(resolveAppType(stage15Data)).toBe('web');
  });

  it('should return tablet for tablet-dominant screens', () => {
    const stage15Data = {
      screens: [
        { name: 'iPad Main View', purpose: 'Tablet primary view' },
        { name: 'Tablet Split View', purpose: 'Split view for tablet' },
      ],
    };
    expect(resolveAppType(stage15Data)).toBe('tablet');
  });

  it('should return agnostic when all screens are agnostic', () => {
    const stage15Data = {
      screens: [
        { name: 'Page One', purpose: 'Generic page' },
        { name: 'Page Two', purpose: 'Another page' },
      ],
    };
    expect(resolveAppType(stage15Data)).toBe('agnostic');
  });

  it('should handle wireframes key as alternative to screens', () => {
    const stage15Data = {
      wireframes: [
        { name: 'Mobile Login', purpose: 'Phone login screen' },
      ],
    };
    expect(resolveAppType(stage15Data)).toBe('mobile');
  });

  it('should handle string screen specs', () => {
    const stage15Data = {
      screens: ['mobile app home', 'mobile settings'],
    };
    expect(resolveAppType(stage15Data)).toBe('mobile');
  });

  it('should return a valid APP_TYPE_VALUES value', () => {
    const testCases = [
      null,
      {},
      { screens: [] },
      { screens: [{ name: 'Mobile App' }] },
      { screens: [{ name: 'Dashboard' }] },
    ];
    for (const data of testCases) {
      const result = resolveAppType(data);
      expect(APP_TYPE_VALUES).toContain(result);
    }
  });
});
