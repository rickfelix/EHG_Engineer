/**
 * Synthetic persona + AltifyAI thesis content authoring — SD-LEO-INFRA-DEMAND-ENGINE-PART-001
 * FR-6. A mock run's inputs (who it pretends to reach, what it would say) must be reproducible
 * and auditable: every persona and every piece of content is stamped with the mock_run_id and
 * persona_template that produced it.
 */

/** The AltifyAI thesis channel-portfolio persona templates a mock run can author from. */
export const ALTIFYAI_PERSONA_TEMPLATES = Object.freeze([
  'altifyai_technical_founder',
  'altifyai_growth_marketer',
  'altifyai_portfolio_operator',
]);

/**
 * FR-6: author a synthetic persona, stamped with provenance.
 * @param {object} params
 * @param {{from: Function}} params.supabase
 * @param {string} params.mockRunId
 * @param {string|null} [params.ventureId]
 * @param {string} params.personaTemplate - one of ALTIFYAI_PERSONA_TEMPLATES (or a test-supplied template)
 * @param {string} params.displayName
 * @param {object} [params.attributes]
 * @returns {Promise<{ok:boolean, persona?:object, error?:string}>}
 */
export async function authorSyntheticPersona({ supabase, mockRunId, ventureId = null, personaTemplate, displayName, attributes = {} }) {
  if (!mockRunId) return { ok: false, error: 'MOCK_RUN_ID_REQUIRED' };
  if (!personaTemplate) return { ok: false, error: 'PERSONA_TEMPLATE_REQUIRED' };

  const { data, error } = await supabase
    .from('mock_outreach_personas')
    .insert({
      mock_run_id: mockRunId,
      venture_id: ventureId,
      persona_template: personaTemplate,
      display_name: displayName,
      attributes,
    })
    .select('id, mock_run_id, persona_template, display_name, attributes, created_at')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, persona: data };
}

/**
 * FR-6: author AltifyAI thesis channel-portfolio content for a mock run, stamped with the
 * SAME provenance (mock_run_id + persona_template) in marketing_content.metadata -- reuses the
 * existing marketing_content table (Part A's autonomy-gate.js already reads its lifecycle_state)
 * rather than a parallel content store.
 * @param {object} params
 * @param {{from: Function}} params.supabase
 * @param {string} params.ventureId
 * @param {string} params.mockRunId
 * @param {string} params.personaTemplate
 * @param {string} [params.contentType]
 * @param {string} [params.channelFamily]
 * @param {string} params.body - the AltifyAI thesis copy this mock run would send
 * @returns {Promise<{ok:boolean, content?:object, error?:string}>}
 */
export async function authorMockContent({ supabase, ventureId, mockRunId, personaTemplate, contentType = 'social_post', channelFamily = 'social', body }) {
  if (!mockRunId) return { ok: false, error: 'MOCK_RUN_ID_REQUIRED' };
  if (!personaTemplate) return { ok: false, error: 'PERSONA_TEMPLATE_REQUIRED' };
  if (!body || typeof body !== 'string' || body.trim() === '') return { ok: false, error: 'BODY_REQUIRED' };

  const { data, error } = await supabase
    .from('marketing_content')
    .insert({
      venture_id: ventureId,
      content_type: contentType,
      channel_family: channelFamily,
      lifecycle_state: 'IDEATE',
      metadata: {
        mock_run_id: mockRunId,
        persona_template: personaTemplate,
        source: 'mock-first-stranger-run',
        body,
      },
    })
    .select('id, metadata, created_at')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, content: data };
}

export default { ALTIFYAI_PERSONA_TEMPLATES, authorSyntheticPersona, authorMockContent };
