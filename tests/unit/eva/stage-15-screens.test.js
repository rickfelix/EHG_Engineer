/**
 * SD-LEO-INFRA-S15-WIREFRAME-SCREENS-REGRESSION-001 — shared wireframe_screens normalizer.
 * The producer (stage-15.js typed batch) and the daemon post-hook both call this, so the
 * persisted screen shape can never drift between the two writers.
 */
import { describe, it, expect } from 'vitest';
import { extractRawScreens, normalizeWireframeScreens, buildWireframeScreensPayload } from '../../../lib/eva/stage-templates/stage-15-screens.js';

describe('stage-15 wireframe_screens normalizer', () => {
  it('extractRawScreens accepts the several S15 shapes (screens / wireframes.screens / ia_sitemap.pages)', () => {
    expect(extractRawScreens({ screens: [{ id: 'a' }] })).toEqual([{ id: 'a' }]);
    expect(extractRawScreens({ wireframes: { screens: [{ id: 'b' }] } })).toEqual([{ id: 'b' }]);
    expect(extractRawScreens({ ia_sitemap: { pages: [{ name: 'Home' }] } })).toEqual([{ name: 'Home' }]);
    expect(extractRawScreens(null)).toEqual([]);
    expect(extractRawScreens({})).toEqual([]);
  });

  it('normalizeWireframeScreens fills canonical fields + defaults deviceType, tolerant of aliases', () => {
    const out = normalizeWireframeScreens([{ id: 'x', title: 'Login', purpose: 'auth', device_type: 'MOBILE', pageType: 'auth' }]);
    expect(out[0]).toEqual({ screen_id: 'x', screen_name: 'Login', description: 'auth', deviceType: 'MOBILE', page_type: 'auth' });
    // missing fields get stable defaults
    const def = normalizeWireframeScreens([{}]);
    expect(def[0].screen_id).toBe('screen-0');
    expect(def[0].screen_name).toBe('Screen 1');
    expect(def[0].deviceType).toBe('DESKTOP');
  });

  it('surface passthrough is env-gated (opts override)', () => {
    const withSurface = normalizeWireframeScreens([{ id: 's', surface: 'marketing' }], { surfaceAwareEnabled: true });
    expect(withSurface[0].surface).toBe('marketing');
    const without = normalizeWireframeScreens([{ id: 's', surface: 'marketing' }], { surfaceAwareEnabled: false });
    expect(without[0].surface).toBeUndefined();
  });

  it('buildWireframeScreensPayload returns { screens, screenCount, ia_sitemap }', () => {
    const p = buildWireframeScreensPayload({ screens: [{ id: 'a' }, { id: 'b' }], ia_sitemap: { pages: [] } }, { surfaceAwareEnabled: false });
    expect(p.screenCount).toBe(2);
    expect(p.screens).toHaveLength(2);
    expect(p.ia_sitemap).toEqual({ pages: [] });
    expect(buildWireframeScreensPayload(null).ia_sitemap).toBeNull();
  });
});
