/**
 * Build-context design instruction block, mechanically derived from the audit rubric.
 * SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001 (FR-3, TR-3).
 *
 * shared-design-prompts.json (Prompts 2/3/4) is phrased as AUDIT/REVIEW instructions
 * ("you are a senior typography reviewer... evaluate..."). This is a MECHANICAL,
 * VERBATIM wrap of that text as a pre-finish verification checklist -- NOT a semantic
 * rewrite into new build-directive prose. Keeping the audit JSON as the single source
 * of truth for both audit-form and build-form means they cannot drift apart (VALIDATION
 * R3b decision).
 *
 * @module lib/eva/bridge/design-input-instructions
 */
import { createRequire } from 'module';

const BUILD_PROMPT_IDS = [2, 3, 4];
let cachedSharedDesignPrompts = null;

/**
 * Vendored require (dependency-free JSON read, matches design-prompts-writer.js's pattern) --
 * the single source of truth for shared-design-prompts.json, shared by every caller of
 * buildDesignInstructionBlock so the vendored require path is never duplicated.
 * @returns {Array<{id:number,label?:string,summary?:string,text:string}>}
 */
export function loadSharedDesignPrompts() {
  if (!cachedSharedDesignPrompts) {
    cachedSharedDesignPrompts = createRequire(import.meta.url)('./shared-design-prompts.json');
  }
  return cachedSharedDesignPrompts;
}

/**
 * @param {Array<{id:number,label?:string,summary?:string,text:string}>} prompts - shared-design-prompts.json content
 * @returns {string} imperative build-context instruction block, verbatim per-prompt text preserved
 */
export function buildDesignInstructionBlock(prompts) {
  const list = Array.isArray(prompts) ? prompts : [];
  const applicable = list.filter((p) => BUILD_PROMPT_IDS.includes(p?.id));
  if (!applicable.length) return '';

  const sections = applicable.map((p) => {
    const heading = p.summary ? `${p.label || `Prompt ${p.id}`} — ${p.summary}` : (p.label || `Prompt ${p.id}`);
    return `Before finishing, verify your output against ${heading}:\n${p.text}`;
  });

  return [
    'DESIGN VERIFICATION CHECKLIST (derived verbatim from the design-audit rubric -- satisfy every item before finishing):',
    ...sections,
  ].join('\n\n---\n\n');
}

export { BUILD_PROMPT_IDS };
