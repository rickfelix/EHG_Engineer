import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const phase3SD = {
  id: 'SD-VWC-PHASE3-001',
  sd_key: 'VWC-PHASE3-001',
  title: 'Phase 3: Advanced Intelligence & UX Polish',
  version: '1.0',
  status: 'draft',
  category: 'product_feature',
  priority: 'high',
  target_application: 'EHG',
  current_phase: 'PLAN',
  description: 'Add portfolio impact analysis during venture creation, implement paradigm-shift prompts to challenge assumptions, create follow-up question system for post-research clarification, configure internationalization framework (i18n) with multi-language support. Advanced UX features for strategic decision support (~750 LOC).',
  strategic_intent: 'Provide deep strategic context during venture creation by showing portfolio impact (balance, concentration risk), challenging blind spots with paradigm prompts (Jevons Paradox, Goodhart\'s Law), improving intelligence quality through clarifying questions, and enabling global team usage via multi-language support.',
  rationale: 'Chairman benefits from portfolio context to avoid concentration risk and maintain balance. Paradigm-shift prompts prevent groupthink and challenge assumptions. Follow-up questions after research improve intelligence quality and fill gaps. Internationalization enables global EHG team to use wizard in their preferred language.',
  scope: 'PortfolioImpactCard component for real-time balance analysis, ParadigmPrompt component with mental model frameworks, FollowUpQuestions component for post-research clarification, i18next configuration with 3-language support (EN, ES, ZH), LanguageSelector component for preference management.',
  strategic_objectives: [
    'Display portfolio impact during venture creation (balance score, sector concentration, risk profile)',
    'Fetch and refresh portfolio data as venture details change',
    'Add paradigm-shift prompts at tier selection and Step 2 (challenge assumptions)',
    'Implement specific mental model frameworks (Jevons Paradox, Goodhart\'s Law, Cobra Effect)',
    'Create follow-up question system that appears after intelligence results',
    'Questions improve intelligence quality on next iteration if answered',
    'Configure i18next framework with language detection and fallback',
    'Translate core wizard text to 3 languages (English, Spanish, Chinese)',
    'Add language selector to wizard header with preference persistence',
    'Ensure all new components support i18n from day one'
  ],
  success_criteria: [
    'Portfolio impact card shows: balance score (0-100), top 3 sector concentrations, risk profile',
    'Impact data refreshes automatically as venture archetype/tier changes',
    'Paradigm prompts trigger at: tier selection step, Step 2 (research initiation)',
    'Prompts reference specific frameworks with examples relevant to venture context',
    'Follow-up questions appear after STA/GCIA results display',
    'Questions are contextual and specific to intelligence gaps',
    'Answered questions improve next research iteration quality',
    'i18n framework configured with react-i18next',
    'Three languages fully supported: English (EN), Spanish (ES), Chinese (ZH)',
    'Language selector in header persists preference to localStorage',
    'All wizard text translatable via t() function',
    'E2E tests verify all features in multiple languages',
    'Language switching works without page reload'
  ],
  key_changes: [
    'Create PortfolioImpactCard.tsx component (~150 LOC) with balance metrics',
    'Create ParadigmPrompt.tsx component (~100 LOC) with framework library',
    'Create FollowUpQuestions.tsx component (~150 LOC) with question generation',
    'Configure i18next with language detection and 3 translation files',
    'Create en.json, es.json, zh.json translation files (~200 LOC total)',
    'Create LanguageSelector.tsx component (~50 LOC) with dropdown UI',
    'Wire portfolio data fetch to VentureCreationPage (useEffect hook)',
    'Add paradigm prompt triggers to tier selection and Step 2 workflows',
    'Integrate follow-up questions into IntelligenceDrawer result display',
    'Add i18n initialization to App.tsx root component'
  ],
  key_principles: [
    'Portfolio impact: Real-time calculation, non-blocking fetch, show loading states',
    'Paradigm prompts: Specific frameworks over generic warnings, contextual examples',
    'Follow-up questions: Contextual to intelligence gaps, improve quality iteratively',
    'i18n: Framework-ready now, full translations added iteratively over time',
    'Language support: Start with 3 core languages, expand based on usage patterns',
    'Performance: Translation loading optimized, lazy-load language packs'
  ],
  metadata: {
    parent_sd_id: 'SD-VWC-PARENT-001',
    sequence_order: 3,
    layer: 'advanced_features',
    estimated_effort_hours: '10-12',
    estimated_loc: 750,
    components_to_create: [
      'PortfolioImpactCard.tsx (150 LOC) - Balance and concentration display',
      'ParadigmPrompt.tsx (100 LOC) - Mental model framework prompts',
      'FollowUpQuestions.tsx (150 LOC) - Post-research clarification system',
      'i18n configuration and translations (200 LOC total)',
      'LanguageSelector.tsx (50 LOC) - Language preference selector'
    ],
    components_to_modify: [
      'VentureCreationPage.tsx (+100 LOC for portfolio fetch and component integration)',
      'IntelligenceDrawer.tsx (+50 LOC for follow-up question integration)',
      'App.tsx (+50 LOC for i18n initialization)'
    ],
    database_changes: ['None - reuse existing portfolio and ventures tables'],
    testing_requirements: {
      e2e: 'Portfolio display, paradigm prompts, follow-up questions, language switching',
      unit: 'PortfolioImpactCard, ParadigmPrompt, FollowUpQuestions, LanguageSelector',
      integration: 'i18n framework with language switching and translation loading',
      i18n: 'Translation completeness verification across 3 languages'
    },
    i18n_configuration: {
      framework: 'react-i18next',
      languages: ['en', 'es', 'zh'],
      fallback_language: 'en',
      detection_order: ['localStorage', 'navigator', 'htmlTag'],
      lazy_loading: true
    },
    mental_model_frameworks: [
      'Jevons Paradox (efficiency increases consumption)',
      'Goodhart\'s Law (metrics become targets, lose meaning)',
      'Cobra Effect (solution worsens problem)',
      'Second-order effects (unintended consequences)',
      'Network effects and lock-in risks'
    ]
  },
  created_by: 'PLAN',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

async function main() {
  console.log('📋 Creating Phase 3 SD:', phase3SD.id);
  console.log('   Sequence: 3 of 4 phases');
  console.log('   Layer:', phase3SD.metadata.layer);
  console.log('   Focus: Advanced intelligence and internationalization');
  
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(phase3SD)
    .select()
    .single();
  
  if (error) {
    console.error('❌ Error:', error.message);
    console.error('   Details:', error);
    process.exit(1);
  }
  
  console.log('✅ Phase 3 SD created successfully!');
  console.log('   ID:', data.id);
  console.log('   Title:', data.title);
  console.log('   Priority:', data.priority);
  console.log('   Status:', data.status);
  console.log('   Parent:', phase3SD.metadata.parent_sd_id);
  console.log('   Estimated effort:', phase3SD.metadata.estimated_effort_hours, 'hours');
  console.log('   Estimated LOC:', phase3SD.metadata.estimated_loc);
  console.log('   Languages:', phase3SD.metadata.i18n_configuration.languages.join(', '));
}

main();
