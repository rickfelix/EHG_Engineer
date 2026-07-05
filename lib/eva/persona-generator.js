/**
 * Persona Generator — produces an executable, journey-scriptable persona
 * descriptor from the existing identity_persona_brand planning artifact.
 *
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-E. identity_persona_brand is a
 * descriptive-only artifact (Stage 10 output, artifact_data.personas[]) — it
 * has never been executed. This module is the first thing that turns one of
 * its personas into a scripted set of per-journey-step intents, WITHOUT
 * re-deriving persona traits independently (reuses goals/painPoints as-is).
 *
 * @module lib/eva/persona-generator
 */

/** The 5 journey steps this SD's proof case walks (MarketLens). */
export const JOURNEY_STEPS = Object.freeze(['land', 'signup', 'submit', 'results', 'feedback']);

/**
 * Read the venture's current identity_persona_brand artifact.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ventureId: string}} opts
 * @returns {Promise<{personas: Array}|null>} artifact_data, or null if absent
 */
export async function readIdentityPersonaBrand(supabase, { ventureId }) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('artifact_data')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'identity_persona_brand')
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[persona-generator] readIdentityPersonaBrand failed: ${error.message}`);
  }
  return data?.artifact_data || null;
}

/**
 * Script one journey step's intent from a persona's goals/painPoints — a short,
 * human-readable description of what this persona would do/type at this step,
 * derived from their actual goals rather than generic filler.
 * @param {string} step - one of JOURNEY_STEPS
 * @param {{name: string, goals: string[], painPoints: string[]}} persona
 * @returns {string}
 */
function scriptStepIntent(step, persona) {
  const primaryGoal = persona.goals?.[0] || 'accomplish their goal';
  const primaryPain = persona.painPoints?.[0] || 'a pain point';
  switch (step) {
    case 'land':
      return `${persona.name} arrives looking to solve: ${primaryPain}`;
    case 'signup':
      return `${persona.name} signs up, motivated by wanting to ${primaryGoal}`;
    case 'submit':
      return `${persona.name} submits a persona/WTP analysis reflecting their goal: ${primaryGoal}`;
    case 'results':
      return `${persona.name} reviews results looking for confirmation their pain point (${primaryPain}) is addressed`;
    case 'feedback':
      return `${persona.name} leaves feedback framed around whether ${primaryGoal} was achieved`;
    default:
      throw new Error(`[persona-generator] scriptStepIntent: unknown step "${step}"`);
  }
}

/**
 * Produce an executable persona descriptor from a raw identity_persona_brand
 * artifact_data payload: the first persona in artifact_data.personas[], plus a
 * scripted intent for every journey step. Fails loud (never fabricates) if the
 * artifact is missing or has no personas — matches Child B's honesty rule
 * (could-not-verify != built).
 *
 * @param {{personas: Array<{name: string, demographics?: object, goals?: string[], painPoints?: string[], behaviors?: string[], motivations?: string[]}>}|null} artifactData
 * @returns {{name: string, demographics: object, goals: string[], painPoints: string[], stepIntents: Record<string, string>}}
 */
export function generatePersonaFromArtifact(artifactData) {
  const personas = artifactData?.personas;
  if (!Array.isArray(personas) || personas.length === 0) {
    throw new Error('[persona-generator] generatePersonaFromArtifact requires a non-empty identity_persona_brand artifact (artifact_data.personas[]) — refusing to fabricate a persona from nothing');
  }

  const source = personas[0];
  if (!source?.name) {
    throw new Error('[persona-generator] generatePersonaFromArtifact: persona is missing a name — cannot script a journey');
  }

  const persona = {
    name: source.name,
    demographics: source.demographics || {},
    goals: source.goals || [],
    painPoints: source.painPoints || [],
  };

  const stepIntents = {};
  for (const step of JOURNEY_STEPS) {
    stepIntents[step] = scriptStepIntent(step, persona);
  }

  return { ...persona, stepIntents };
}

export default { JOURNEY_STEPS, readIdentityPersonaBrand, generatePersonaFromArtifact };
