/**
 * Stage 01 Shared Constants
 * Single source of truth for archetype values used across the entire pipeline:
 * Stage 1 (classification), Stage 3 (scoring weights), SRIP (design tokens),
 * Awwwards library (design reference matching), wireframe generator (UX patterns).
 *
 * @module lib/eva/stage-templates/stage-01-constants
 */

/**
 * Canonical venture archetype list — business model dimension.
 * Every system that classifies or matches ventures by archetype MUST use this list.
 * Separate from venture_type (ui/backend/mixed/data) which is a technical dimension.
 */
export const ARCHETYPES = [
  'saas',           // B2B subscription tools — dashboards, automation, analytics
  'marketplace',    // Two-sided platforms — buyers and sellers
  'ai_product',     // AI-native tools, agents, copilots, automation
  'e_commerce',     // Direct-to-consumer product sales
  'fintech',        // Financial services and products
  'healthtech',     // Healthcare technology
  'edtech',         // Education technology
  'media',          // Content, publishing, entertainment
  'creator_tools',  // Tools for creators, freelancers, designers
  'services',       // Professional and consulting services
  'deeptech',       // Hardware, R&D, scientific computing
  'real_estate',    // Property technology
];

/**
 * Maps EHG archetypes to Awwwards industry categories for design reference matching.
 * Used by the wireframe generator (Stage 15) and Awwwards curated library.
 */
export const ARCHETYPE_TO_AWWWARDS = {
  saas:           ['technology', 'business-corporate'],
  marketplace:    ['e-commerce', 'mobile-apps'],
  ai_product:     ['technology', 'startups'],
  e_commerce:     ['e-commerce', 'fashion'],
  fintech:        ['business-corporate', 'technology'],
  healthtech:     ['technology', 'institutions'],
  edtech:         ['culture-education', 'technology'],
  media:          ['magazine-newspaper-blog', 'games-entertainment', 'music-sound'],
  creator_tools:  ['portfolio', 'design-agencies', 'photo-video'],
  services:       ['business-corporate'],
  deeptech:       ['technology', 'startups'],
  real_estate:    ['real-estate'],
};
