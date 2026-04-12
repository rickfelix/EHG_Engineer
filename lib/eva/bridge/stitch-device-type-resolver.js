/**
 * Stitch Device Type Resolver
 * SD: SD-WIREFRAME-FIDELITY-QA-WITH-ORCH-001-D
 *
 * Infers the Stitch deviceType (MOBILE, DESKTOP, TABLET, AGNOSTIC) from
 * wireframe screen metadata. Used by postStage15Hook to pass deviceType
 * per screen to generateScreens().
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
 * Infer Stitch deviceType from a wireframe screen spec.
 * Never throws — returns 'AGNOSTIC' for unknown/malformed input.
 *
 * @param {Object|string} screenSpec - Wireframe screen object or name string
 * @param {string} [screenSpec.name] - Screen name
 * @param {string} [screenSpec.purpose] - Screen purpose/description
 * @param {string} [screenSpec.ascii_layout] - ASCII wireframe content
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

/**
 * Extract searchable text from various screen spec formats.
 * @param {Object|string} spec
 * @returns {string}
 */
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
