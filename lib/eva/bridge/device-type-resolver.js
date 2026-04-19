/**
 * Device Type Resolver
 * Moved from stitch-device-type-resolver.js (SD-LEO-ORCH-REPLACE-GOOGLE-STITCH-001-B)
 *
 * Infers device type (MOBILE, DESKTOP, TABLET, AGNOSTIC) from
 * wireframe screen metadata. Used by stage-19 sprint planning
 * and S15 post-hook for deviceType per screen.
 */

const DESKTOP_KEYWORDS = [
  'dashboard', 'admin', 'analytics', 'reporting', 'management',
  'backoffice', 'back-office', 'cms', 'crm', 'erp', 'portal',
  'editor', 'workspace', 'console', 'monitor',
];

const MOBILE_KEYWORDS = [
  'mobile', 'phone', 'ios', 'android', 'app home', 'app screen',
  'native app', 'smartphone', 'pocket', 'on-the-go',
];

const TABLET_KEYWORDS = [
  'tablet', 'ipad', 'split-view', 'split view',
];

/**
 * Infer device type from a wireframe screen spec.
 * Never throws — returns 'AGNOSTIC' for unknown/malformed input.
 *
 * @param {Object|string} screenSpec - Wireframe screen object or name string
 * @returns {'MOBILE'|'DESKTOP'|'TABLET'|'AGNOSTIC'}
 */
export function inferDeviceType(screenSpec) {
  try {
    const text = extractSearchText(screenSpec).toLowerCase();
    if (!text) return 'AGNOSTIC';

    if (TABLET_KEYWORDS.some(kw => text.includes(kw))) return 'TABLET';
    if (MOBILE_KEYWORDS.some(kw => text.includes(kw))) return 'MOBILE';
    if (DESKTOP_KEYWORDS.some(kw => text.includes(kw))) return 'DESKTOP';

    return 'AGNOSTIC';
  } catch {
    return 'AGNOSTIC';
  }
}

function extractSearchText(spec) {
  if (!spec) return '';
  if (typeof spec === 'string') return spec;
  const parts = [
    spec.name,
    spec.purpose,
    spec.screen_purpose,
    spec.title,
    spec.description,
  ].filter(Boolean);
  return parts.join(' ');
}
