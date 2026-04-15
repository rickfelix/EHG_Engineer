/**
 * Friday Meeting Conversational Chat Mode
 * SD-EVA-FRIDAY-MEETING-ENHANCEMENT-ORCH-001-E
 *
 * Manages per-section agenda state for Friday governance meetings stored in
 * eva_chat_conversations.metadata.friday_state. Exposes three functions:
 *
 * - startFridayMeeting(conversationId)   Initialize agenda, present Section 0 briefing card
 * - advanceToNextSection(conversationId) Advance to next agenda section, gather section data
 * - getCurrentSectionData(conversationId) Ad-hoc read of current section data (no mutation)
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import { FRIDAY_SECTION_COUNT } from './friday-chat-prompt.js';

const supabase = createSupabaseServiceClient();

// Graceful degradation for Child B/C/D services (already merged in PR #3078)
let generateBriefingCard;
try {
  ({ generateBriefingCard } = await import('./services/friday-briefing-card.js'));
} catch {
  console.warn('[friday-chat-mode] WARN: friday-briefing-card.js unavailable — using stub');
  generateBriefingCard = () => ({ type: 'briefing_card', version: 1, agenda_preview: [], pending_decisions_count: 0, risk_flags: [], stale_krs_count: 0 });
}

let getConsolidatedContext;
try {
  ({ getConsolidatedContext } = await import('./services/finding-consolidator.js'));
} catch {
  console.warn('[friday-chat-mode] WARN: finding-consolidator.js unavailable — using stub');
  getConsolidatedContext = async () => [];
}

let getKnowledgeSummary;
try {
  ({ getKnowledgeSummary } = await import('./services/eva-knowledge-view.js'));
} catch {
  console.warn('[friday-chat-mode] WARN: eva-knowledge-view.js unavailable — using stub');
  getKnowledgeSummary = async () => [];
}

let aggregateFridayData;
try {
  ({ aggregateFridayData } = await import('./friday-data-aggregator.js'));
} catch {
  console.warn('[friday-chat-mode] WARN: friday-data-aggregator.js unavailable — using stub');
  aggregateFridayData = async () => ({});
}

// ─── Section Data Fetchers ────────────────────────────────────────────────────

/**
 * Fetch data appropriate for the given section index.
 * Returns a plain object; callers should handle empty/null gracefully.
 *
 * @param {number} section - Section index (0–9)
 * @returns {Promise<Object>}
 */
async function fetchSectionData(section) {
  try {
    switch (section) {
      case 0: {
        // Pre-flight: briefing card from aggregate friday data
        const fridayData = await aggregateFridayData();
        return { briefing_card: generateBriefingCard(fridayData), friday_data: fridayData };
      }
      case 1:
      case 2: {
        // Portfolio velocity and venture progress from friday aggregator
        const data = await aggregateFridayData();
        return { friday_data: data };
      }
      case 3: {
        // Pending decisions
        const { data: decisions } = await supabase
          .from('eva_friday_decisions')
          .select('id, title, description, decision_type, status, consequences')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(20);
        return { decisions: decisions || [] };
      }
      case 4: {
        // Recommendations
        const cards = await getConsolidatedContext(supabase);
        return { recommendation_cards: cards };
      }
      case 5: {
        // Risk and pattern review
        const { data: patterns } = await supabase
          .from('issue_patterns')
          .select('pattern_key, description, frequency, status, category')
          .eq('status', 'open')
          .order('frequency', { ascending: false })
          .limit(15);
        return { patterns: patterns || [] };
      }
      case 6: {
        // Knowledge synthesis
        const items = await getKnowledgeSummary({ limit: 20 });
        return { knowledge_items: items };
      }
      case 7: {
        // OKR / KR check — use friday data
        const data = await aggregateFridayData();
        return { friday_data: data };
      }
      case 8:
      case 9: {
        // Next week priorities and wrap-up — return summary of state
        return { section_summary: `Section ${section} — no specific data fetch required` };
      }
      default:
        return {};
    }
  } catch (err) {
    console.error(`[friday-chat-mode] fetchSectionData(${section}) error:`, err.message);
    return {};
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize a Friday meeting for the given conversation.
 * Sets friday_state in conversation metadata and returns the Section 0 briefing card.
 *
 * @param {string} conversationId - UUID of the conversation
 * @returns {Promise<{ friday_state: Object, briefing_card: Object }>}
 */
export async function startFridayMeeting(conversationId) {
  // Fetch conversation
  const { data: conv, error: convErr } = await supabase
    .from('eva_chat_conversations')
    .select('id, metadata')
    .eq('id', conversationId)
    .single();

  if (convErr || !conv) {
    throw new Error(`[friday-chat-mode] Conversation not found: ${conversationId}`);
  }

  // Idempotency guard: do not overwrite an in-progress meeting
  if (conv.metadata?.friday_state) {
    const existing = conv.metadata.friday_state;
    console.log(`[friday-chat-mode] Meeting already started for conversation ${conversationId} (section ${existing.current_section})`);
    return { friday_state: existing, briefing_card: existing.briefing_card || {} };
  }

  // Fetch Section 0 data (briefing card)
  const sectionData = await fetchSectionData(0);

  const fridayState = {
    current_section: 0,
    sections_completed: [],
    started_at: new Date().toISOString(),
    briefing_card: sectionData.briefing_card || { type: 'briefing_card', version: 1 }
  };

  // Persist to metadata
  const updatedMetadata = { ...(conv.metadata || {}), friday_state: fridayState };
  const { error: updateErr } = await supabase
    .from('eva_chat_conversations')
    .update({ metadata: updatedMetadata })
    .eq('id', conversationId);

  if (updateErr) {
    throw new Error(`[friday-chat-mode] Failed to persist friday_state: ${updateErr.message}`);
  }

  console.log(`[friday-chat-mode] Started Friday meeting for conversation ${conversationId}`);
  return { friday_state: fridayState, briefing_card: fridayState.briefing_card };
}

/**
 * Advance the Friday meeting to the next agenda section.
 * Records the completed section and returns data for the new section.
 *
 * @param {string} conversationId - UUID of the conversation
 * @returns {Promise<{ section: number, data: Object } | null>} null when all sections complete
 */
export async function advanceToNextSection(conversationId) {
  const { data: conv, error: convErr } = await supabase
    .from('eva_chat_conversations')
    .select('id, metadata')
    .eq('id', conversationId)
    .single();

  if (convErr || !conv) {
    throw new Error(`[friday-chat-mode] Conversation not found: ${conversationId}`);
  }

  const fridayState = conv.metadata?.friday_state;
  if (!fridayState) {
    throw new Error(`[friday-chat-mode] No friday_state on conversation ${conversationId}. Call startFridayMeeting() first.`);
  }

  const currentSection = fridayState.current_section;
  const nextSection = currentSection + 1;

  // All sections complete
  if (nextSection >= FRIDAY_SECTION_COUNT) {
    console.log(`[friday-chat-mode] All sections complete for conversation ${conversationId}`);
    return null;
  }

  // Update state
  const updatedState = {
    ...fridayState,
    current_section: nextSection,
    sections_completed: [...(fridayState.sections_completed || []), currentSection]
  };

  const updatedMetadata = { ...(conv.metadata || {}), friday_state: updatedState };
  const { error: updateErr } = await supabase
    .from('eva_chat_conversations')
    .update({ metadata: updatedMetadata })
    .eq('id', conversationId);

  if (updateErr) {
    throw new Error(`[friday-chat-mode] Failed to update friday_state: ${updateErr.message}`);
  }

  const sectionData = await fetchSectionData(nextSection);
  console.log(`[friday-chat-mode] Advanced to section ${nextSection} for conversation ${conversationId}`);
  return { section: nextSection, data: sectionData };
}

/**
 * Get current section data without mutating state.
 * Safe for ad-hoc queries within a section.
 *
 * @param {string} conversationId - UUID of the conversation
 * @returns {Promise<{ section: number, data: Object } | null>} null if no friday_state
 */
export async function getCurrentSectionData(conversationId) {
  const { data: conv, error: convErr } = await supabase
    .from('eva_chat_conversations')
    .select('id, metadata')
    .eq('id', conversationId)
    .single();

  if (convErr || !conv) {
    throw new Error(`[friday-chat-mode] Conversation not found: ${conversationId}`);
  }

  const fridayState = conv.metadata?.friday_state;
  if (!fridayState) {
    return null;
  }

  const section = fridayState.current_section;
  const data = await fetchSectionData(section);
  return { section, data };
}
