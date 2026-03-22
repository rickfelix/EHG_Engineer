/**
 * Intake Classifier — 3-Dimension Classification Engine
 * SD: SD-LEO-FEAT-EVA-INTAKE-REDESIGN-003-C
 *
 * Replaces the 2D venture_tag + business_function classifier with
 * a 3D Application × Aspects × Intent classification using AI
 * recommendations and AskUserQuestion interactive flow.
 *
 * Flow:
 *   1. AI recommends classification (all 3 dimensions)
 *   2. If confidence > threshold, offer "Accept AI" shortcut
 *   3. Otherwise, walk user through Application → Aspects → Intent
 *   4. Write results to eva_todoist_intake (classified_at checkpoint)
 */

import {
  APPLICATIONS,
  ASPECTS,
  INTENTS,
  APPLICATION_LABELS,
  INTENT_LABELS,
  getAspectsForApp,
  validateClassification,
} from './intake-taxonomy.js';

/**
 * Build the LLM classification prompt for 3-dimension taxonomy.
 * @param {string} title - Item title
 * @param {string} description - Item description
 * @param {Object} [context] - Optional hierarchy/metadata context
 * @returns {string} Prompt string
 */
export function buildClassificationPrompt(title, description, context = {}) {
  const appList = APPLICATIONS.map(
    (a) => `  - ${a}: ${APPLICATION_LABELS[a] || a}`
  ).join('\n');

  const aspectsByApp = APPLICATIONS.map((a) => {
    const aspects = getAspectsForApp(a);
    return `  ${a}: ${aspects.join(', ')}`;
  }).join('\n');

  const intentList = INTENTS.map(
    (i) => `  - ${i}: ${INTENT_LABELS[i] || i}`
  ).join('\n');

  let contextSection = '';
  if (context.parentTitle) {
    contextSection += `\nParent Task: ${context.parentTitle}`;
  }
  if (context.siblingTitles?.length > 0) {
    contextSection += `\nSibling Tasks: ${context.siblingTitles.join('; ')}`;
  }

  return `Classify this intake item into 3 dimensions: Application, Aspects, and Intent.

Context: The Chairman is a solo entrepreneur building a venture validation platform with two tightly integrated products:
- ehg_engineer: The backend engine — LEO Protocol (AI-orchestrated multi-agent workflow), EVA pipeline (26-stage venture lifecycle management), intake classification, database schema, CLI tooling, sub-agents, CI/CD, and all orchestration logic.
- ehg_app: The unified web frontend — Chairman Glass Cockpit (daily briefing, decision queue, vision alignment), venture management UI, admin panel, analytics dashboards, Asset Factory, Content Forge, GTM dashboards, and all user-facing interfaces.
Items were saved by the Chairman as reference material, ideas, or insights relevant to building these products. Videos about AI tools, engineering practices, product design, automation, or workflow optimization almost always relate to ehg_engineer or ehg_app. Only classify as "new_venture" if the item is clearly about starting a separate, unrelated business venture — NOT if it's about technology, patterns, or trends that could inform the existing platform.

Title: ${title}
Description: ${description || 'No description'}${contextSection}

Dimension 1 — Application (pick exactly one):
${appList}

Dimension 2 — Aspects (pick 1-3, must be valid for the chosen application):
${aspectsByApp}

Dimension 3 — Intent (pick exactly one):
${intentList}

Respond with ONLY valid JSON (no markdown, no explanation):
{"target_application": "<app>", "target_aspects": ["<aspect1>"], "chairman_intent": "<intent>", "confidence": <0.0-1.0>, "reasoning": "<one sentence>"}`;
}

/**
 * Parse the AI classification response.
 * @param {string} response - Raw LLM text
 * @returns {{ target_application: string, target_aspects: string[], chairman_intent: string, confidence: number, reasoning: string } | null}
 */
export function parseAIClassification(response) {
  try {
    const cleaned = response
      .replace(/```json?\n?/g, '')
      .replace(/```/g, '')
      .trim();
    const parsed = JSON.parse(cleaned);

    if (
      parsed.target_application &&
      Array.isArray(parsed.target_aspects) &&
      parsed.chairman_intent &&
      typeof parsed.confidence === 'number'
    ) {
      const { valid } = validateClassification(
        parsed.target_application,
        parsed.target_aspects,
        parsed.chairman_intent
      );
      if (valid) {
        return {
          target_application: parsed.target_application,
          target_aspects: parsed.target_aspects,
          chairman_intent: parsed.chairman_intent,
          confidence: Math.min(1, Math.max(0, parsed.confidence)),
          reasoning: parsed.reasoning || '',
        };
      }
    }
  } catch {
    // Fall through
  }
  return null;
}

/**
 * Get AI classification recommendation for an item.
 * @param {string} title
 * @param {string} description
 * @param {Object} [context] - Hierarchy context
 * @returns {Promise<Object|null>} Classification or null if AI unavailable
 */
export async function getAIRecommendation(title, description, context = {}) {
  try {
    const { getClassificationClient } = await import('../llm/client-factory.js');
    const client = await getClassificationClient();
    const prompt = buildClassificationPrompt(title, description, context);
    const response = await client.complete(
      'You are a precise classification system for a strategic management platform. Respond with only valid JSON.',
      prompt,
      { maxTokens: 1024 }
    );
    // Adapters return { content: string, ... } — extract the text
    const text = typeof response === 'string' ? response : response?.content;
    return parseAIClassification(text);
  } catch {
    return null;
  }
}

/**
 * Keyword-based fallback classification for the 3D taxonomy.
 * @param {string} text - Combined title + description
 * @returns {{ target_application: string, target_aspects: string[], chairman_intent: string, confidence: number }}
 */
export function keywordClassify(text) {
  const lower = text.toLowerCase();

  // Application detection
  const appKeywords = {
    ehg_engineer: ['protocol', 'leo', 'sd ', 'pipeline', 'eva', 'script', 'tooling', 'cli', 'database', 'migration', 'ci/cd', 'sub-agent', 'handoff', 'gate'],
    ehg_app: ['ui', 'dashboard', 'frontend', 'component', 'page', 'navigation', 'chairman', 'chart', 'react', 'button', 'modal', 'inbox'],
    new_venture: ['venture', 'startup', 'business', 'market', 'product', 'customer', 'pricing', 'launch', 'saas', 'revenue'],
  };

  let bestApp = 'ehg_engineer';
  let bestAppScore = 0;
  for (const [app, keywords] of Object.entries(appKeywords)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestAppScore) {
      bestApp = app;
      bestAppScore = score;
    }
  }

  // Aspect detection (pick top match for the chosen app)
  const validAspects = getAspectsForApp(bestApp);
  const matchedAspects = validAspects.filter((a) =>
    lower.includes(a.replace(/_/g, ' '))
  );
  const aspects = matchedAspects.length > 0 ? matchedAspects.slice(0, 2) : [validAspects[0]];

  // Intent detection
  const intentKeywords = {
    idea: ['idea', 'build', 'create', 'add', 'implement', 'feature', 'new'],
    insight: ['insight', 'pattern', 'realize', 'learn', 'notice', 'observe'],
    reference: ['reference', 'study', 'read', 'video', 'article', 'link', 'resource', 'book'],
    question: ['question', 'how', 'why', 'what if', 'research', 'investigate', '?'],
    value: ['value', 'principle', 'standard', 'always', 'never', 'rule', 'quality'],
  };

  let bestIntent = 'idea';
  let bestIntentScore = 0;
  for (const [intent, keywords] of Object.entries(intentKeywords)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestIntentScore) {
      bestIntent = intent;
      bestIntentScore = score;
    }
  }

  return {
    target_application: bestApp,
    target_aspects: aspects,
    chairman_intent: bestIntent,
    confidence: 0.4,
  };
}

/**
 * Build AskUserQuestion payloads for the 3-step interactive classification.
 */
export const askUserQuestions = {
  /**
   * Step 1: Choose Application
   * @param {Object|null} aiRec - AI recommendation (if available)
   * @returns {Object} AskUserQuestion payload
   */
  application(aiRec) {
    const options = APPLICATIONS.map((app) => ({
      label: APPLICATION_LABELS[app] || app,
      description: aiRec?.target_application === app
        ? `AI recommended (${Math.round((aiRec.confidence || 0) * 100)}% confidence)`
        : `Aspects: ${getAspectsForApp(app).slice(0, 4).join(', ')}...`,
    }));

    if (aiRec && aiRec.confidence >= 0.8) {
      options.unshift({
        label: `Accept AI: ${APPLICATION_LABELS[aiRec.target_application]} → [${aiRec.target_aspects.join(', ')}] → ${aiRec.chairman_intent}`,
        description: `${Math.round(aiRec.confidence * 100)}% confidence — ${aiRec.reasoning || 'AI classification'}`,
      });
    }

    return {
      question: 'Which application does this item target?',
      header: 'Application',
      multiSelect: false,
      options,
    };
  },

  /**
   * Step 2: Choose Aspects (context-sensitive for chosen app)
   * @param {string} app - Chosen application
   * @param {Object|null} aiRec - AI recommendation
   * @returns {Object} AskUserQuestion payload
   */
  aspects(app, aiRec) {
    const validAspects = getAspectsForApp(app);
    const options = validAspects.map((aspect) => ({
      label: aspect.replace(/_/g, ' '),
      description: aiRec?.target_aspects?.includes(aspect)
        ? 'AI recommended'
        : '',
    }));

    return {
      question: `Select 1-3 aspects for ${APPLICATION_LABELS[app] || app}:`,
      header: 'Aspects',
      multiSelect: true,
      options,
    };
  },

  /**
   * Step 3: Choose Intent
   * @param {Object|null} aiRec - AI recommendation
   * @returns {Object} AskUserQuestion payload
   */
  intent(aiRec) {
    const options = INTENTS.map((intent) => ({
      label: INTENT_LABELS[intent] || intent,
      description: aiRec?.chairman_intent === intent ? 'AI recommended' : '',
    }));

    return {
      question: "What is the Chairman's intent for this item?",
      header: 'Intent',
      multiSelect: false,
      options,
    };
  },
};

/**
 * Map a user's AskUserQuestion response back to taxonomy values.
 * @param {'application'|'aspects'|'intent'} dimension
 * @param {string|string[]} selection - User's selected label(s)
 * @param {Object|null} aiRec - AI recommendation (for Accept AI detection)
 * @returns {{ value: any, acceptedAI: boolean }}
 */
export function mapSelectionToValue(dimension, selection, aiRec) {
  const sel = Array.isArray(selection) ? selection : [selection];

  if (dimension === 'application') {
    // Check for "Accept AI" option
    if (sel[0]?.startsWith('Accept AI:') && aiRec) {
      return {
        value: {
          target_application: aiRec.target_application,
          target_aspects: aiRec.target_aspects,
          chairman_intent: aiRec.chairman_intent,
        },
        acceptedAI: true,
      };
    }
    // Match by label
    for (const app of APPLICATIONS) {
      if (sel[0] === (APPLICATION_LABELS[app] || app)) {
        return { value: app, acceptedAI: false };
      }
    }
    return { value: APPLICATIONS[0], acceptedAI: false };
  }

  if (dimension === 'aspects') {
    const mapped = sel
      .map((s) => s.replace(/ /g, '_'))
      .filter((a) => Object.values(ASPECTS).flat().includes(a));
    return { value: mapped.length > 0 ? mapped : [Object.values(ASPECTS).flat()[0]], acceptedAI: false };
  }

  if (dimension === 'intent') {
    for (const intent of INTENTS) {
      if (sel[0] === (INTENT_LABELS[intent] || intent)) {
        return { value: intent, acceptedAI: false };
      }
    }
    return { value: INTENTS[0], acceptedAI: false };
  }

  return { value: sel[0], acceptedAI: false };
}

/**
 * Save classification result to the database.
 * Supports both eva_todoist_intake and eva_youtube_intake tables.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} itemId - Item UUID
 * @param {Object} classification
 * @param {string} classification.target_application
 * @param {string[]} classification.target_aspects
 * @param {string} classification.chairman_intent
 * @param {number} classification.confidence
 * @param {string} [source='todoist'] - 'todoist' or 'youtube'
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function saveClassification(supabase, itemId, classification, source = 'todoist') {
  const table = source === 'youtube' ? 'eva_youtube_intake' : 'eva_todoist_intake';
  const { error } = await supabase
    .from(table)
    .update({
      target_application: classification.target_application,
      target_aspects: classification.target_aspects,
      chairman_intent: classification.chairman_intent,
      classification_confidence: classification.confidence,
      classified_at: new Date().toISOString(),
    })
    .eq('id', itemId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Get unclassified items from intake tables.
 * Supports both eva_todoist_intake and eva_youtube_intake.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} [options]
 * @param {number} [options.limit=50] - Max items to return
 * @param {string[]} [options.sources] - ['todoist', 'youtube'] or subset
 * @returns {Promise<Array<{id: string, title: string, description: string|null, source: string}>>}
 */
export async function getUnclassifiedItems(supabase, options = {}) {
  const limit = options.limit || 50;
  const sources = options.sources || ['todoist'];
  const items = [];

  if (sources.includes('todoist')) {
    const { data } = await supabase
      .from('eva_todoist_intake')
      .select('id, title, description, venture_tag, business_function, todoist_parent_id, todoist_task_id, todoist_labels, extracted_youtube_id, created_at')
      .is('classified_at', null)
      .order('created_at', { ascending: true })
      .limit(limit);
    for (const row of data || []) {
      items.push({ ...row, source: 'todoist' });
    }
  }

  if (sources.includes('youtube')) {
    const { data } = await supabase
      .from('eva_youtube_intake')
      .select('id, title, description, channel_name, tags, published_at, created_at')
      .is('classified_at', null)
      .order('created_at', { ascending: true })
      .limit(limit);
    for (const row of data || []) {
      items.push({ ...row, source: 'youtube' });
    }
  }

  // Sort by created_at to interleave sources chronologically
  items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  return items.slice(0, limit);
}

/**
 * Classify a single item end-to-end (AI + fallback, no interactive).
 * Used for batch/automated classification.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} item - Row from eva_todoist_intake
 * @returns {Promise<Object>} Classification result
 */
export async function classifyItem(supabase, item) {
  const aiResult = await getAIRecommendation(item.title, item.description || '');

  if (aiResult) {
    return {
      ...aiResult,
      method: 'ai',
    };
  }

  const fallback = keywordClassify(`${item.title} ${item.description || ''}`);
  return {
    ...fallback,
    method: 'keyword_fallback',
  };
}
