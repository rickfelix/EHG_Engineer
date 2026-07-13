/**
 * Legal-doc producer — SD-FDBK-FIX-BUILD-LEGAL-DOC-001 (V5, chairman-ratified 2026-07-12)
 *
 * Generates Privacy Policy + Terms of Service for a venture via deterministic
 * {{TOKEN}}-style substitution against the active legal_templates rows. NOT an
 * LLM generator -- the prior triangulation research (2026-01-04) concluded SKIP
 * on freeform LLM legal-doc generation (DoNotPay FTC precedent); this producer
 * is deliberately scoped to fixed template substitution instead.
 *
 * Modeled on the stage-22-distribution-setup.js architecture: dependency-
 * injected supabase client, structured result objects (never throws to the
 * caller), and a visible failure path (eva_orchestration_events) instead of a
 * silent no-op.
 */

const REQUIRED_TEMPLATE_TYPES = ['terms_of_service', 'privacy_policy'];

const NOT_LEGAL_ADVICE_DISCLAIMER =
  'THIS DOCUMENT IS A TEMPLATE GENERATED FROM FIXED, PRE-APPROVED LANGUAGE AND ' +
  'VENTURE-SPECIFIC SUBSTITUTIONS. IT IS NOT LEGAL ADVICE.';

/**
 * Reads venture + company context needed to fill template substitution markers.
 * @returns {Promise<{ok: boolean, context?: object, missingFields?: string[]}>}
 */
async function readVentureContext({ supabase, ventureId, logger }) {
  const { data: venture, error: ventureErr } = await supabase
    .from('ventures')
    .select('id, name, description, value_proposition, solution_approach, company_id')
    .eq('id', ventureId)
    .maybeSingle();
  if (ventureErr || !venture) {
    logger?.warn?.(`[LegalDocProducer] venture read error: ${ventureErr?.message || 'not found'}`);
    return { ok: false, missingFields: ['venture'] };
  }

  let company = null;
  if (venture.company_id) {
    const { data: companyRow, error: companyErr } = await supabase
      .from('companies')
      .select('id, name, description, website')
      .eq('id', venture.company_id)
      .maybeSingle();
    if (companyErr) {
      logger?.warn?.(`[LegalDocProducer] company read error: ${companyErr.message}`);
    } else {
      company = companyRow;
    }
  }

  const companyName = company?.name || venture.name;
  // Strip any protocol/path so the domain marker (and the derived contact
  // email) never renders a full URL where a bare domain is expected --
  // `companies.website` is typically stored as a full https:// URL.
  const rawDomain = company?.website || null;
  const companyDomain = rawDomain ? rawDomain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '') : null;
  const serviceDescription = venture.value_proposition || venture.solution_approach || venture.description;

  const missingFields = [];
  if (!companyName) missingFields.push('COMPANY_NAME');
  if (!companyDomain) missingFields.push('COMPANY_DOMAIN');
  if (!serviceDescription) missingFields.push('SERVICE_DESCRIPTION');

  if (missingFields.length > 0) {
    return { ok: false, missingFields };
  }

  return {
    ok: true,
    context: {
      '{{COMPANY_NAME}}': companyName,
      '{{COMPANY_DOMAIN}}': companyDomain,
      '{{SERVICE_DESCRIPTION}}': serviceDescription,
      '{{CONTACT_EMAIL}}': `legal@${companyDomain}`,
      '{{EFFECTIVE_DATE}}': new Date().toISOString().slice(0, 10),
    },
  };
}

/**
 * Deterministic string substitution -- no LLM call, no randomness.
 *
 * Single-pass regex replace (not sequential split/join): venture-controlled
 * values (company name, description) are only known at substitution time and
 * must never be re-scanned for marker-like tokens once inserted, or a value
 * containing e.g. "{{CONTACT_EMAIL}}" could get re-substituted on a later
 * pass, injecting content into an attacker-chosen location of the generated
 * document. String.replace's replacement text is never re-matched within the
 * same call, which closes that class of issue by construction.
 */
function substituteMarkers(templateContent, substitutionValues) {
  const markers = Object.keys(substitutionValues);
  if (markers.length === 0) return templateContent;
  const pattern = new RegExp(markers.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  return templateContent.replace(pattern, (matched) => substitutionValues[matched]);
}

/**
 * Records a chairman-visible event when the producer cannot generate docs for
 * a venture (FR-4). Non-blocking on failure (best-effort, matches the
 * emitStageSkippedEvent pattern in stage-23-launch-readiness.js).
 */
async function emitProducerFailedEvent({ supabase, ventureId, reason, missingFields, logger }) {
  try {
    const { error } = await supabase.from('eva_orchestration_events').insert({
      event_type: 'custom',
      event_source: 'legal-doc-producer',
      venture_id: ventureId,
      event_data: {
        subtype: 'legal_producer_failed',
        reason,
        missing_fields: missingFields || [],
        sd_origin: 'SD-FDBK-FIX-BUILD-LEGAL-DOC-001',
        emitted_at: new Date().toISOString(),
      },
      chairman_flagged: true,
    });
    if (error) logger?.warn?.(`[LegalDocProducer] failure-event emit failed: ${error.message}`);
  } catch (err) {
    logger?.warn?.(`[LegalDocProducer] failure-event emit threw: ${err.message}`);
  }
}

/**
 * Generates (or regenerates) Privacy Policy + Terms of Service for a venture.
 * @returns {Promise<{ok: boolean, generated?: Array<{templateType: string, overrideId: string}>, reason?: string}>}
 */
export async function generateLegalDocsForVenture({ supabase, ventureId, logger = console }) {
  if (!supabase || !ventureId) {
    return { ok: false, reason: 'missing_supabase_or_ventureId' };
  }

  const { data: templates, error: templatesErr } = await supabase
    .from('legal_templates')
    .select('id, template_type, content')
    .eq('is_active', true)
    .eq('status', 'active')
    .in('template_type', REQUIRED_TEMPLATE_TYPES);
  if (templatesErr) {
    logger?.warn?.(`[LegalDocProducer] templates read error: ${templatesErr.message}`);
    return { ok: false, reason: 'templates_read_error' };
  }
  const foundTypes = new Set((templates || []).map((t) => t.template_type));
  const missingTemplates = REQUIRED_TEMPLATE_TYPES.filter((t) => !foundTypes.has(t));
  if (missingTemplates.length > 0) {
    logger?.warn?.(`[LegalDocProducer] missing active templates: ${missingTemplates.join(', ')}`);
    await emitProducerFailedEvent({ supabase, ventureId, reason: 'missing_templates', missingFields: missingTemplates, logger });
    return { ok: false, reason: 'missing_templates', missingTemplates };
  }

  const contextResult = await readVentureContext({ supabase, ventureId, logger });
  if (!contextResult.ok) {
    logger?.warn?.(`[LegalDocProducer] insufficient venture context: ${(contextResult.missingFields || []).join(', ')}`);
    await emitProducerFailedEvent({
      supabase, ventureId, reason: 'insufficient_context', missingFields: contextResult.missingFields, logger,
    });
    return { ok: false, reason: 'insufficient_context', missingFields: contextResult.missingFields };
  }

  const generated = [];
  for (const template of templates) {
    const generatedContent =
      substituteMarkers(template.content, contextResult.context) + `\n\n---\n\n${NOT_LEGAL_ADVICE_DISCLAIMER}\n`;
    const generatedAt = new Date().toISOString();

    const { data: existing } = await supabase
      .from('venture_legal_overrides')
      .select('id')
      .eq('venture_id', ventureId)
      .eq('template_id', template.id)
      .maybeSingle();

    let overrideId = existing?.id || null;
    if (overrideId) {
      const { error: updateErr } = await supabase
        .from('venture_legal_overrides')
        .update({
          substitution_values: contextResult.context,
          generated_content: generatedContent,
          generated_at: generatedAt,
          is_active: true,
        })
        .eq('id', overrideId);
      if (updateErr) {
        logger?.warn?.(`[LegalDocProducer] update failed for ${template.template_type}: ${updateErr.message}`);
        continue;
      }
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('venture_legal_overrides')
        .insert({
          venture_id: ventureId,
          template_id: template.id,
          substitution_values: contextResult.context,
          generated_content: generatedContent,
          generated_at: generatedAt,
          is_active: true,
        })
        .select('id')
        .single();
      if (insertErr) {
        // 23505 = unique_violation on unique_venture_template: a concurrent call
        // for the same venture won the race and inserted first. This is not a
        // real failure -- fall through to the row it created (deterministic
        // substitution means the content would be identical anyway) instead of
        // reporting a false partial_write_failure + spurious chairman alert.
        if (insertErr.code === '23505') {
          const { data: raced } = await supabase
            .from('venture_legal_overrides')
            .select('id')
            .eq('venture_id', ventureId)
            .eq('template_id', template.id)
            .maybeSingle();
          if (raced?.id) {
            const { error: updateErr } = await supabase
              .from('venture_legal_overrides')
              .update({
                substitution_values: contextResult.context,
                generated_content: generatedContent,
                generated_at: generatedAt,
                is_active: true,
              })
              .eq('id', raced.id);
            if (!updateErr) {
              generated.push({ templateType: template.template_type, overrideId: raced.id });
              continue;
            }
            logger?.warn?.(`[LegalDocProducer] post-race update failed for ${template.template_type}: ${updateErr.message}`);
          }
        }
        logger?.warn?.(`[LegalDocProducer] insert failed for ${template.template_type}: ${insertErr.message}`);
        continue;
      }
      overrideId = inserted.id;
    }

    generated.push({ templateType: template.template_type, overrideId });
  }

  if (generated.length !== REQUIRED_TEMPLATE_TYPES.length) {
    await emitProducerFailedEvent({
      supabase, ventureId, reason: 'partial_write_failure',
      missingFields: REQUIRED_TEMPLATE_TYPES.filter((t) => !generated.some((g) => g.templateType === t)),
      logger,
    });
    return { ok: false, reason: 'partial_write_failure', generated };
  }

  return { ok: true, generated };
}

export { REQUIRED_TEMPLATE_TYPES, NOT_LEGAL_ADVICE_DISCLAIMER, substituteMarkers, readVentureContext };

// Standalone CLI usage: node lib/eva/legal-doc-producer.js <venture_id>
if (process.argv[1] && process.argv[1].endsWith('legal-doc-producer.js')) {
  const ventureId = process.argv[2];
  if (!ventureId) {
    console.error('Usage: node lib/eva/legal-doc-producer.js <venture_id>');
    process.exit(1);
  }
  const { createClient } = await import('@supabase/supabase-js');
  const dotenv = await import('dotenv');
  dotenv.config();
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const result = await generateLegalDocsForVenture({ supabase, ventureId });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
