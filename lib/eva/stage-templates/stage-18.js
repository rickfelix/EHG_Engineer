/**
 * Stage 18 Template — Marketing Copy Studio
 * Phase: BUILD & MARKET (Stages 18-22)
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-B
 *
 * Persona-targeted marketing copy generation from 12 upstream artifacts.
 * Produces 9 copy sections: tagline, app store description, landing page hero,
 * 3 email sequences, social posts, SEO meta, and blog draft.
 *
 * Worker Interaction (stage-execution-worker.js):
 *   - Auto-advances when chairman approves advisory decision
 *   - Promotion gate enrichment runs at stages 18-23 (evaluatePromotionGate)
 *   - Writes 9 artifact types: marketing_tagline, marketing_app_store_desc, etc.
 *   - 2026-04-22: SD-MAN-INFRA-LEO-GATE-IMPROVEMENTS-001 added this section
 *
 * @module lib/eva/stage-templates/stage-18
 */

import { validateString, validateArray, collectErrors } from './validation.js';
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage18MarketingCopy, COPY_SECTIONS } from './analysis-steps/stage-18-marketing-copy.js';

const TEMPLATE = {
  id: 'stage-18',
  slug: 'marketing-copy-studio',
  title: 'Marketing Copy Studio',
  version: '3.0.0',
  schema: {
    tagline: { type: 'object', required: true, properties: { text: { type: 'string', required: true }, persona_target: { type: 'string' } } },
    app_store_desc: { type: 'object', required: true, properties: { text: { type: 'string', required: true }, persona_target: { type: 'string' } } },
    landing_hero: { type: 'object', required: true, properties: { headline: { type: 'string', required: true }, subheadline: { type: 'string' }, cta_text: { type: 'string' }, persona_target: { type: 'string' } } },
    email_welcome: { type: 'object', required: true, properties: { subject: { type: 'string', required: true }, body: { type: 'string', required: true }, persona_target: { type: 'string' } } },
    email_onboarding: { type: 'object', required: true, properties: { subject: { type: 'string', required: true }, body: { type: 'string', required: true }, persona_target: { type: 'string' } } },
    email_reengagement: { type: 'object', required: true, properties: { subject: { type: 'string', required: true }, body: { type: 'string', required: true }, persona_target: { type: 'string' } } },
    social_posts: { type: 'object', required: true, properties: { twitter: { type: 'string' }, linkedin: { type: 'string' }, instagram: { type: 'string' }, facebook: { type: 'string' }, product_hunt: { type: 'string' }, persona_target: { type: 'string' } } },
    seo_meta: { type: 'object', required: true, properties: { title: { type: 'string', required: true }, description: { type: 'string', required: true }, keywords: { type: 'array' }, persona_target: { type: 'string' } } },
    blog_draft: { type: 'object', required: true, properties: { title: { type: 'string', required: true }, intro: { type: 'string' }, sections: { type: 'array' }, conclusion: { type: 'string' }, persona_target: { type: 'string' } } },
    // Derived
    metadata: { type: 'object', derived: true },
    totalSections: { type: 'number', derived: true },
    completedSections: { type: 'number', derived: true },
    personaCoveragePct: { type: 'number', derived: true },
  },
  defaultData: {
    tagline: null,
    app_store_desc: null,
    landing_hero: null,
    email_welcome: null,
    email_onboarding: null,
    email_reengagement: null,
    social_posts: null,
    seo_meta: null,
    blog_draft: null,
    metadata: {},
    totalSections: 0,
    completedSections: 0,
    personaCoveragePct: 0,
  },

  validate(data, { logger = console } = {}) {
    const errors = [];

    for (const section of COPY_SECTIONS) {
      if (!data?.[section]) {
        errors.push(`${section} is required`);
        continue;
      }
      const sectionData = data[section];
      // Validate required text fields per section
      if (section === 'tagline' || section === 'app_store_desc') {
        const textCheck = validateString(sectionData?.text, `${section}.text`, 1);
        if (!textCheck.valid) errors.push(textCheck.error);
      } else if (section === 'landing_hero') {
        const headlineCheck = validateString(sectionData?.headline, `${section}.headline`, 1);
        if (!headlineCheck.valid) errors.push(headlineCheck.error);
      } else if (section.startsWith('email_')) {
        const subjectCheck = validateString(sectionData?.subject, `${section}.subject`, 1);
        const bodyCheck = validateString(sectionData?.body, `${section}.body`, 1);
        if (!subjectCheck.valid) errors.push(subjectCheck.error);
        if (!bodyCheck.valid) errors.push(bodyCheck.error);
      } else if (section === 'seo_meta') {
        const titleCheck = validateString(sectionData?.title, `${section}.title`, 1);
        const descCheck = validateString(sectionData?.description, `${section}.description`, 1);
        if (!titleCheck.valid) errors.push(titleCheck.error);
        if (!descCheck.valid) errors.push(descCheck.error);
      } else if (section === 'blog_draft') {
        const titleCheck = validateString(sectionData?.title, `${section}.title`, 1);
        if (!titleCheck.valid) errors.push(titleCheck.error);
      }
    }

    if (errors.length > 0) { logger.warn('[Stage18-MarketingCopy] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  computeDerived(data, { logger: _logger = console } = {}) {
    return { ...data };
  },
};

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage18MarketingCopy;
ensureOutputSchema(TEMPLATE);

export { COPY_SECTIONS };
export default TEMPLATE;
