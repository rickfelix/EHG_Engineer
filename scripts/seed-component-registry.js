#!/usr/bin/env node
/**
 * Seed Component Registry with Embeddings
 *
 * Purpose: Populate component_registry_embeddings table with shadcn/ui and related components
 *
 * Features:
 * - 12+ component definitions across 6 registries
 * - OpenAI text-embedding-3-small embeddings for semantic search
 * - Explainability metadata (primary_use_case, bundle_size_kb, alternatives)
 * - Retry logic with exponential backoff
 * - Cost estimation and progress tracking
 * - Idempotent (updates existing, inserts new)
 *
 * Usage:
 *   node scripts/seed-component-registry.js [OPTIONS]
 *
 * Options:
 *   --force          Regenerate embeddings even if they exist
 *   --dry-run        Show what would be inserted without making changes
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dimensions, $0.02/1M tokens
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const RATE_LIMIT_DELAY_MS = 500; // 500ms between OpenAI API calls

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ============================================================================
// Component Definitions
// ============================================================================

const COMPONENTS = [
  // shadcn/ui Components (UI Category)
  {
    component_name: 'table',
    component_category: 'ui',
    registry_source: 'shadcn-ui',
    description: 'A powerful data table component built with TanStack Table. Supports sorting, filtering, pagination, row selection, and column visibility controls. Ideal for displaying structured data with rich interactions.',
    use_cases: [
      'Display user lists with sorting and filtering',
      'Show transaction history with pagination',
      'Create admin dashboards with data grids',
      'Build inventory management tables'
    ],
    trigger_keywords: ['table', 'data table', 'grid', 'data grid', 'list', 'rows', 'columns', 'tabular data', 'spreadsheet'],
    install_command: 'npx shadcn@latest add table',
    dependencies: [
      { name: '@tanstack/react-table', version: '^8.0.0' }
    ],
    registry_dependencies: ['checkbox', 'dropdown-menu'],
    docs_url: 'https://ui.shadcn.com/docs/components/table',
    implementation_notes: 'Requires TanStack Table configuration. Use DataTable wrapper pattern for common features.',
    example_code: `import { DataTable } from "@/components/ui/data-table"

export function UsersTable() {
  return <DataTable columns={columns} data={users} />
}`,
    primary_use_case: 'Display structured data with sorting, filtering, and pagination',
    bundle_size_kb: 45,
    common_alternatives: [
      { component: 'Simple list with Card components', tradeoff: 'Lighter but no built-in sorting/filtering' },
      { component: 'Custom table with native HTML', tradeoff: 'Full control but requires manual feature implementation' }
    ],
    confidence_weight: 1.5 // Popular component
  },

  {
    component_name: 'card',
    component_category: 'ui',
    registry_source: 'shadcn-ui',
    description: 'A flexible container component for grouping related content. Features header, content, and footer sections with consistent styling. Perfect for creating structured layouts and content blocks.',
    use_cases: [
      'Display feature highlights on landing pages',
      'Create settings panels with grouped options',
      'Build dashboard widgets and stats cards',
      'Organize form sections'
    ],
    trigger_keywords: ['card', 'container', 'panel', 'box', 'section', 'widget', 'content block'],
    install_command: 'npx shadcn@latest add card',
    dependencies: [],
    registry_dependencies: [],
    docs_url: 'https://ui.shadcn.com/docs/components/card',
    implementation_notes: 'Compose CardHeader, CardTitle, CardDescription, CardContent, CardFooter as needed.',
    example_code: `<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content here</CardContent>
</Card>`,
    primary_use_case: 'Group and organize related content with consistent styling',
    bundle_size_kb: 8,
    common_alternatives: [
      { component: 'Custom div with Tailwind classes', tradeoff: 'Lighter but less consistent' }
    ],
    confidence_weight: 2.0 // Very popular
  },

  {
    component_name: 'form',
    component_category: 'ui',
    registry_source: 'shadcn-ui',
    description: 'Form component built with react-hook-form and Zod validation. Provides accessible form fields with automatic error handling, field validation, and submission management.',
    use_cases: [
      'User registration and login forms',
      'Settings and preferences forms',
      'Data entry and submission forms',
      'Multi-step wizard forms'
    ],
    trigger_keywords: ['form', 'input', 'validation', 'submit', 'user input', 'data entry', 'fields'],
    install_command: 'npx shadcn@latest add form',
    dependencies: [
      { name: 'react-hook-form', version: '^7.0.0' },
      { name: '@hookform/resolvers', version: '^3.0.0' },
      { name: 'zod', version: '^3.0.0' }
    ],
    registry_dependencies: ['label', 'input', 'button'],
    docs_url: 'https://ui.shadcn.com/docs/components/form',
    implementation_notes: 'Use with Zod schema for type-safe validation. FormField wrapper handles accessibility.',
    example_code: `<Form {...form}>
  <FormField
    control={form.control}
    name="email"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Email</FormLabel>
        <FormControl>
          <Input {...field} />
        </FormControl>
      </FormItem>
    )}
  />
</Form>`,
    primary_use_case: 'Collect user input with validation and error handling',
    bundle_size_kb: 52,
    common_alternatives: [
      { component: 'Manual form with useState', tradeoff: 'Lighter but requires manual validation logic' },
      { component: 'Formik library', tradeoff: 'Different API, similar features' }
    ],
    confidence_weight: 1.8
  },

  {
    component_name: 'dialog',
    component_category: 'ui',
    registry_source: 'shadcn-ui',
    description: 'A modal dialog overlay that appears above page content. Supports accessible focus management, backdrop click handling, and keyboard navigation. Built on Radix UI Dialog primitive.',
    use_cases: [
      'Confirmation modals for destructive actions',
      'Forms that require user focus',
      'Detail views and previews',
      'Multi-step workflows'
    ],
    trigger_keywords: ['modal', 'dialog', 'popup', 'overlay', 'lightbox', 'confirmation', 'alert'],
    install_command: 'npx shadcn@latest add dialog',
    dependencies: [
      { name: '@radix-ui/react-dialog', version: '^1.0.0' }
    ],
    registry_dependencies: [],
    docs_url: 'https://ui.shadcn.com/docs/components/dialog',
    implementation_notes: 'Use DialogTrigger for open button, DialogContent for modal content. Automatically manages focus trap.',
    example_code: `<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    Content here
  </DialogContent>
</Dialog>`,
    primary_use_case: 'Display focused content in modal overlay requiring user interaction',
    bundle_size_kb: 28,
    common_alternatives: [
      { component: 'Sheet (slide-in panel)', tradeoff: 'Less intrusive but takes more screen space' },
      { component: 'Popover', tradeoff: 'Lighter but less prominent' }
    ],
    confidence_weight: 1.7
  },

  {
    component_name: 'select',
    component_category: 'ui',
    registry_source: 'shadcn-ui',
    description: 'A dropdown select component with keyboard navigation, search functionality, and accessibility features. Built on Radix UI Select primitive with customizable styling.',
    use_cases: [
      'Filter controls for data tables',
      'Settings dropdowns',
      'Form select fields',
      'Category selection'
    ],
    trigger_keywords: ['select', 'dropdown', 'picker', 'combobox', 'options', 'choice', 'menu'],
    install_command: 'npx shadcn@latest add select',
    dependencies: [
      { name: '@radix-ui/react-select', version: '^2.0.0' }
    ],
    registry_dependencies: [],
    docs_url: 'https://ui.shadcn.com/docs/components/select',
    implementation_notes: 'Use Select, SelectTrigger, SelectContent, SelectItem composition. For searchable variant, consider Combobox component.',
    example_code: `<Select onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue placeholder="Select..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="1">Option 1</SelectItem>
  </SelectContent>
</Select>`,
    primary_use_case: 'Allow users to choose one option from a dropdown list',
    bundle_size_kb: 24,
    common_alternatives: [
      { component: 'Combobox (with search)', tradeoff: 'Better for large option sets, slightly heavier' },
      { component: 'Radio Group', tradeoff: 'Shows all options at once, better for <5 options' }
    ],
    confidence_weight: 1.6
  },

  {
    component_name: 'calendar',
    component_category: 'ui',
    registry_source: 'shadcn-ui',
    description: 'A date picker calendar component built with react-day-picker. Supports date selection, range selection, disabled dates, and date formatting. Fully accessible with keyboard navigation.',
    use_cases: [
      'Date selection in booking forms',
      'Date range filters for reports',
      'Event scheduling interfaces',
      'Availability calendars'
    ],
    trigger_keywords: ['calendar', 'date picker', 'date', 'schedule', 'datepicker', 'day picker', 'date selection'],
    install_command: 'npx shadcn@latest add calendar',
    dependencies: [
      { name: 'react-day-picker', version: '^8.0.0' },
      { name: 'date-fns', version: '^2.0.0' }
    ],
    registry_dependencies: ['button', 'popover'],
    docs_url: 'https://ui.shadcn.com/docs/components/calendar',
    implementation_notes: 'Often used with Popover component for date picker dropdown. Supports range selection mode.',
    example_code: `<Calendar
  mode="single"
  selected={date}
  onSelect={setDate}
  className="rounded-md border"
/>`,
    primary_use_case: 'Enable date selection with visual calendar interface',
    bundle_size_kb: 38,
    common_alternatives: [
      { component: 'Native date input', tradeoff: 'Much lighter but limited styling and UX control' },
      { component: 'Text input with date parsing', tradeoff: 'Lighter but worse UX' }
    ],
    confidence_weight: 1.4
  },

  // AI Elements Components (AI Category)
  {
    component_name: 'message',
    component_category: 'ai',
    registry_source: 'ai-elements',
    description: 'AI chat message component from Vercel AI SDK Elements. Displays individual messages with role-based styling (user/assistant), markdown rendering, and streaming support.',
    use_cases: [
      'AI chatbot message display',
      'Customer support chat interfaces',
      'AI assistant conversations',
      'Q&A interfaces'
    ],
    trigger_keywords: ['message', 'chat message', 'ai message', 'conversation', 'chat bubble', 'assistant response'],
    install_command: 'npm install @ai-sdk/react',
    dependencies: [
      { name: '@ai-sdk/react', version: '^0.0.0' },
      { name: 'ai', version: '^3.0.0' }
    ],
    registry_dependencies: [],
    docs_url: 'https://sdk.vercel.ai/docs/ai-sdk-ui/message',
    implementation_notes: 'Part of AI SDK UI. Handles streaming text updates automatically. Use with useChat hook.',
    example_code: `import { Message } from '@ai-sdk/react'

messages.map(m => (
  <Message key={m.id} role={m.role} content={m.content} />
))`,
    primary_use_case: 'Display AI chat messages with streaming support',
    bundle_size_kb: 18,
    common_alternatives: [
      { component: 'Custom chat bubble div', tradeoff: 'Lighter but no streaming support' }
    ],
    confidence_weight: 1.3
  },

  {
    component_name: 'conversation',
    component_category: 'ai',
    registry_source: 'ai-elements',
    description: 'Full conversation UI component from Vercel AI SDK. Combines message list, input field, and submission handling. Manages scroll position and auto-scrolling for new messages.',
    use_cases: [
      'Complete AI chat interfaces',
      'Customer support widgets',
      'AI-powered help systems',
      'Interactive tutorials'
    ],
    trigger_keywords: ['conversation', 'chat interface', 'chat ui', 'messages', 'chat thread', 'dialogue'],
    install_command: 'npm install @ai-sdk/react',
    dependencies: [
      { name: '@ai-sdk/react', version: '^0.0.0' },
      { name: 'ai', version: '^3.0.0' }
    ],
    registry_dependencies: [],
    docs_url: 'https://sdk.vercel.ai/docs/ai-sdk-ui/conversation',
    implementation_notes: 'Higher-level component than Message. Integrates with useChat hook for full chat functionality.',
    example_code: `import { useChat } from 'ai/react'

const { messages, input, handleSubmit } = useChat()
return <Conversation messages={messages} onSubmit={handleSubmit} />`,
    primary_use_case: 'Build complete AI chat interface with minimal setup',
    bundle_size_kb: 32,
    common_alternatives: [
      { component: 'Custom chat with Message components', tradeoff: 'More control but more code' }
    ],
    confidence_weight: 1.2
  },

  {
    component_name: 'code-block',
    component_category: 'ai',
    registry_source: 'ai-elements',
    description: 'Syntax-highlighted code block component from Vercel AI SDK. Supports multiple languages, line numbers, copy button, and theme switching. Ideal for AI code generation responses.',
    use_cases: [
      'Display AI-generated code',
      'Code snippet examples in chat',
      'Technical documentation',
      'Code explanation interfaces'
    ],
    trigger_keywords: ['code', 'code block', 'syntax highlight', 'snippet', 'programming', 'source code'],
    install_command: 'npm install @ai-sdk/react rehype-highlight',
    dependencies: [
      { name: '@ai-sdk/react', version: '^0.0.0' },
      { name: 'rehype-highlight', version: '^7.0.0' }
    ],
    registry_dependencies: [],
    docs_url: 'https://sdk.vercel.ai/docs/ai-sdk-ui/code-block',
    implementation_notes: 'Automatically detects language from code fence. Use with react-markdown for full markdown support.',
    example_code: `<CodeBlock language="typescript">
  {codeString}
</CodeBlock>`,
    primary_use_case: 'Display syntax-highlighted code in AI responses',
    bundle_size_kb: 42,
    common_alternatives: [
      { component: 'react-syntax-highlighter', tradeoff: 'More languages but heavier bundle' },
      { component: 'Pre tag with CSS', tradeoff: 'Much lighter but no syntax highlighting' }
    ],
    confidence_weight: 1.1
  },

  // OpenAI Voice Components (Voice Category) - Custom implementations
  {
    component_name: 'voice-transcription',
    component_category: 'voice',
    registry_source: 'openai-voice',
    description: 'OpenAI Whisper integration for speech-to-text transcription. Records audio from user microphone and converts to text using Whisper API. Supports multiple languages and real-time processing.',
    use_cases: [
      'Voice input for chat interfaces',
      'Accessibility features for text input',
      'Meeting transcription',
      'Voice notes and dictation'
    ],
    trigger_keywords: ['voice', 'speech to text', 'transcription', 'whisper', 'audio input', 'microphone', 'dictation'],
    install_command: 'npm install openai',
    dependencies: [
      { name: 'openai', version: '^4.0.0' }
    ],
    registry_dependencies: [],
    docs_url: 'https://platform.openai.com/docs/guides/speech-to-text',
    implementation_notes: 'Custom component. Use MediaRecorder API to capture audio, send to Whisper API endpoint. Handle permissions and browser compatibility.',
    example_code: `// Custom implementation required
const transcription = await openai.audio.transcriptions.create({
  file: audioFile,
  model: "whisper-1",
})`,
    primary_use_case: 'Convert user speech to text using OpenAI Whisper',
    bundle_size_kb: 15,
    common_alternatives: [
      { component: 'Web Speech API', tradeoff: 'Free but browser-dependent accuracy' },
      { component: 'ElevenLabs voice', tradeoff: 'Different pricing model' }
    ],
    confidence_weight: 1.0
  },

  {
    component_name: 'text-to-speech',
    component_category: 'voice',
    registry_source: 'openai-voice',
    description: 'OpenAI Text-to-Speech (TTS) integration for converting text to natural-sounding audio. Supports multiple voices and audio formats. Stream or download generated audio.',
    use_cases: [
      'AI assistant voice responses',
      'Accessibility features for content',
      'Audio content generation',
      'Narration for tutorials'
    ],
    trigger_keywords: ['text to speech', 'tts', 'voice synthesis', 'audio generation', 'speech', 'narration'],
    install_command: 'npm install openai',
    dependencies: [
      { name: 'openai', version: '^4.0.0' }
    ],
    registry_dependencies: [],
    docs_url: 'https://platform.openai.com/docs/guides/text-to-speech',
    implementation_notes: 'Custom component. Generate audio with TTS API, use Audio element or Web Audio API for playback. Consider caching responses.',
    example_code: `const speech = await openai.audio.speech.create({
  model: "tts-1",
  voice: "alloy",
  input: text,
})`,
    primary_use_case: 'Generate natural speech audio from text using OpenAI TTS',
    bundle_size_kb: 12,
    common_alternatives: [
      { component: 'Web Speech API SpeechSynthesis', tradeoff: 'Free but robotic voices' },
      { component: 'ElevenLabs TTS', tradeoff: 'Higher quality but different pricing' }
    ],
    confidence_weight: 1.0
  },

  {
    component_name: 'realtime-audio',
    component_category: 'voice',
    registry_source: 'openai-voice',
    description: 'OpenAI Realtime API integration for streaming bidirectional voice conversations. Enables natural voice interactions with AI with low latency. Supports interruptions and turn-taking.',
    use_cases: [
      'Voice-based AI assistants',
      'Interactive voice response systems',
      'Real-time language translation',
      'Voice-controlled applications'
    ],
    trigger_keywords: ['realtime', 'streaming audio', 'voice chat', 'live audio', 'bidirectional', 'voice assistant'],
    install_command: 'npm install openai',
    dependencies: [
      { name: 'openai', version: '^4.0.0' }
    ],
    registry_dependencies: [],
    docs_url: 'https://platform.openai.com/docs/guides/realtime',
    implementation_notes: 'Custom component. Use WebSocket for bidirectional streaming. Handle audio encoding/decoding. Complex implementation.',
    example_code: `// Advanced WebSocket implementation required
// See OpenAI Realtime API documentation`,
    primary_use_case: 'Enable real-time streaming voice conversations with AI',
    bundle_size_kb: 25,
    common_alternatives: [
      { component: 'Separate Whisper + TTS', tradeoff: 'Higher latency but simpler implementation' }
    ],
    confidence_weight: 0.8
  }
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate embedding with retry logic
 */
async function generateEmbeddingWithRetry(text, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text
      });

      return response.data[0].embedding;

    } catch (error) {
      if (attempt === retries) {
        throw error;
      }

      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`   ⚠️  Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Estimate cost based on token count
 */
function estimateCost(text) {
  const estimatedTokens = Math.ceil(text.length / 4);
  const costPerMillionTokens = 0.02;
  const cost = (estimatedTokens / 1_000_000) * costPerMillionTokens;
  return { tokens: estimatedTokens, cost };
}

/**
 * Build embedding text from component
 */
function buildComponentEmbeddingText(component) {
  const parts = [
    `Component: ${component.component_name}`,
    `Category: ${component.component_category}`,
    `Description: ${component.description}`,
    component.primary_use_case && `Primary Use Case: ${component.primary_use_case}`,
    component.use_cases && `Use Cases: ${component.use_cases.join('; ')}`,
    component.trigger_keywords && `Keywords: ${component.trigger_keywords.join(', ')}`
  ].filter(Boolean);

  return parts.join('\n\n');
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    force: args.includes('--force'),
    dryRun: args.includes('--dry-run')
  };
}

// ============================================================================
// Main Function
// ============================================================================

async function main() {
  console.log('\n🎨 Component Registry Seed - Starting...\n');
  console.log('='.repeat(70));

  const options = parseArgs();

  // Check OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in environment variables');
    console.error('   Please set OPENAI_API_KEY in your .env file');
    process.exit(1);
  }

  // Check Supabase connection
  const { error: connectionError } = await supabase
    .from('component_registry_embeddings')
    .select('id')
    .limit(1);

  if (connectionError) {
    console.error('❌ Failed to connect to component_registry_embeddings table');
    console.error('   Error:', connectionError.message);
    console.error('\n   Please ensure the migration 013_component_registry_embeddings.sql has been applied');
    process.exit(1);
  }

  console.log(`📋 Processing ${COMPONENTS.length} components`);
  console.log(`   Dry run: ${options.dryRun ? 'Yes' : 'No'}`);
  console.log(`   Force regenerate: ${options.force ? 'Yes' : 'No'}`);
  console.log('='.repeat(70));
  console.log('');

  // Calculate total cost estimate
  let totalTokens = 0;
  let totalCost = 0;

  for (const component of COMPONENTS) {
    const text = buildComponentEmbeddingText(component);
    const estimate = estimateCost(text);
    totalTokens += estimate.tokens;
    totalCost += estimate.cost;
  }

  console.log(`💰 Cost Estimate:`);
  console.log(`   Total tokens: ~${totalTokens.toLocaleString()}`);
  console.log(`   Estimated cost: $${totalCost.toFixed(4)}`);
  console.log('');

  if (options.dryRun) {
    console.log('🏃 DRY RUN - No changes will be made\n');
  }

  // Process components
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < COMPONENTS.length; i++) {
    const component = COMPONENTS[i];
    const progress = `[${i + 1}/${COMPONENTS.length}]`;

    console.log(`\n${progress} Processing: ${component.component_name} (${component.registry_source})`);
    console.log('-'.repeat(70));

    try {
      // Check if component already exists
      const { data: existing, error: checkError } = await supabase
        .from('component_registry_embeddings')
        .select('id, description_embedding')
        .eq('component_name', component.component_name)
        .eq('registry_source', component.registry_source)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw new Error(`Database check failed: ${checkError.message}`);
      }

      const hasEmbedding = existing?.description_embedding != null;

      if (existing && hasEmbedding && !options.force) {
        console.log(`   ⏭️  Already exists with embedding - skipping`);
        skipCount++;
        continue;
      }

      // Build embedding text
      const text = buildComponentEmbeddingText(component);

      if (!text || text.trim().length === 0) {
        console.log(`   ⚠️  No content to embed - skipping`);
        skipCount++;
        continue;
      }

      console.log(`   🧠 Generating embedding...`);

      let embedding = null;
      if (!options.dryRun) {
        embedding = await generateEmbeddingWithRetry(text);
      }

      // Prepare database record
      const record = {
        component_name: component.component_name,
        component_category: component.component_category,
        registry_source: component.registry_source,
        description: component.description,
        use_cases: JSON.stringify(component.use_cases),
        trigger_keywords: component.trigger_keywords,
        install_command: component.install_command,
        dependencies: JSON.stringify(component.dependencies),
        registry_dependencies: JSON.stringify(component.registry_dependencies || []),
        docs_url: component.docs_url,
        implementation_notes: component.implementation_notes,
        example_code: component.example_code,
        primary_use_case: component.primary_use_case,
        bundle_size_kb: component.bundle_size_kb,
        common_alternatives: JSON.stringify(component.common_alternatives),
        description_embedding: embedding,
        confidence_weight: component.confidence_weight,
        updated_at: new Date().toISOString()
      };

      if (!options.dryRun) {
        // Upsert to database
        const { error: upsertError } = await supabase
          .from('component_registry_embeddings')
          .upsert(record, {
            onConflict: 'component_name,registry_source'
          });

        if (upsertError) {
          throw new Error(`Failed to upsert: ${upsertError.message}`);
        }
      }

      const estimate = estimateCost(text);
      console.log(`   ✅ ${options.dryRun ? 'Would insert' : 'Inserted'} successfully`);
      console.log(`   📊 Tokens: ~${estimate.tokens.toLocaleString()}, Cost: $${estimate.cost.toFixed(6)}`);

      successCount++;

      // Rate limiting
      if (i < COMPONENTS.length - 1 && !options.dryRun) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
      }

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      errorCount++;
      continue;
    }
  }

  // Summary
  console.log('');
  console.log('='.repeat(70));
  console.log('📊 Summary');
  console.log('='.repeat(70));
  console.log(`✅ Success: ${successCount}`);
  console.log(`⏭️  Skipped: ${skipCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`💰 Total Cost: $${totalCost.toFixed(4)}`);
  console.log('='.repeat(70));
  console.log('');

  if (successCount > 0 && !options.dryRun) {
    console.log('🎉 Component registry seeded successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Verify components:');
    console.log('   SELECT component_name, registry_source, confidence_weight FROM component_registry_embeddings;');
    console.log('2. Test semantic search:');
    console.log('   -- Generate test embedding and query match_components_semantic()');
    console.log('3. Integrate with PRD creation:');
    console.log('   -- Update scripts/add-prd-to-database.js');
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

main();
