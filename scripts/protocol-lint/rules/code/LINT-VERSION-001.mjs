/**
 * LINT-VERSION-001 — Protocol version drift.
 *
 * Flags sections whose content claims "Added in vX.Y.Z" or "Since vX.Y.Z" at
 * a version HIGHER than the active protocol version on record. Indicates
 * content that was updated after the header was refreshed, or vice versa.
 * Mirrors class #6 of the 2026-04-22 drift audit.
 *
 * Requires ctx.protocol.protocol_version (or ctx.protocol.version).
 * No-op if protocol metadata is missing.
 *
 * SD-PROTOCOL-LINTER-001, slice 5/n.
 */

const VERSION_CLAIM_RE = /(?:Added|Introduced|Since|New)[^.\n]*?v(\d+)\.(\d+)(?:\.(\d+))?/gi;

function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
}

function parseSemver(str) {
  const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(str || '');
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
}

export default {
  id: 'LINT-VERSION-001',
  severity: 'warn',
  description: 'In-content "Added in vX.Y.Z" claims must not exceed the active protocol version declared by the header. Detects class #6 of the 2026-04-22 audit.',
  enabled: true,

  check(ctx) {
    const active = parseSemver(ctx?.protocol?.protocol_version ?? ctx?.protocol?.version);
    if (!active) return []; // no-op when protocol metadata is unavailable

    const violations = [];
    for (const section of ctx.sections || []) {
      const content = section.content || '';
      VERSION_CLAIM_RE.lastIndex = 0;
      let m;
      while ((m = VERSION_CLAIM_RE.exec(content)) !== null) {
        const claimed = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
        if (compareSemver(claimed, active) > 0) {
          violations.push({
            section_id: section.id,
            message: `Claims "v${claimed.join('.')}" but active protocol is v${active.join('.')}. Either header is stale or content anticipates a future version.`,
            context: { claimed_version: claimed.join('.'), active_version: active.join('.'), matched_text: m[0] }
          });
        }
      }
    }
    return violations;
  }
};
