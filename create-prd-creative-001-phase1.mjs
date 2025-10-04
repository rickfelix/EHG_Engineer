import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRDPhase1() {
  console.log('📋 PLAN: Creating PRD for SD-CREATIVE-001 Phase 1\n');

  const prdId = `PRD-CREATIVE-001-PHASE1-${Date.now()}`;

  const prd = {
    id: prdId,
    sd_id: 'SD-CREATIVE-001',
    title: 'AI Video Prompt Generator - Phase 1 Implementation',
    version: '1.0.0',
    status: 'approved',
    created_by: 'PLAN Agent',

    // Executive Summary
    overview: `Implement an AI-powered video prompt generator that transforms venture data into optimized prompts for Sora 2, Runway, and Kling video platforms. Phase 1 focuses on prompt generation with manual copy-paste workflow, validating demand before investing in API automation (Phase 2).

**Core Value**: Enable non-technical users to create professional video ad prompts in seconds
**Scope**: 30 development hours over 2-3 weeks
**Success Gate**: >50% usage validates Phase 2 investment`,

    // Business Context
    business_context: {
      problem_statement: "Venture teams need professional video advertisements but lack video production expertise and budget for agencies",
      target_users: ["Venture managers", "Marketing teams", "Founders without video experience"],
      success_criteria: [
        "Generate prompts for 20+ ventures in first 90 days",
        "50%+ of generated prompts actually used on video platforms",
        "Positive user feedback on prompt quality",
        "Clear data for Phase 2 go/no-go decision"
      ],
      out_of_scope: [
        "Direct API integration with video platforms (Phase 2)",
        "Video generation/hosting (use external platforms)",
        "A/B testing framework (Phase 2)",
        "Custom ML models (use GPT-4)"
      ]
    },

    // Technical Specifications
    technical_specs: {
      database_schema: `
-- Video Prompts Table
CREATE TABLE video_prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,

  -- Prompt Configuration
  template_type VARCHAR(50) NOT NULL, -- product_demo, testimonial, feature_highlight, brand_story
  tone VARCHAR(50) NOT NULL, -- professional, casual, inspiring, technical
  duration VARCHAR(10) NOT NULL, -- 30s, 60s, 90s
  style VARCHAR(50) NOT NULL, -- cinematic, realistic, animated

  -- Platform-Specific Prompts
  sora_prompt TEXT,
  runway_prompt TEXT,
  kling_prompt TEXT,

  -- Usage Tracking
  used BOOLEAN DEFAULT false,
  platform_used VARCHAR(50), -- sora, runway, kling, or NULL if not used
  performance_notes TEXT,
  user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  CONSTRAINT valid_template CHECK (template_type IN ('product_demo', 'testimonial', 'feature_highlight', 'brand_story')),
  CONSTRAINT valid_tone CHECK (tone IN ('professional', 'casual', 'inspiring', 'technical')),
  CONSTRAINT valid_duration CHECK (duration IN ('30s', '60s', '90s')),
  CONSTRAINT valid_style CHECK (style IN ('cinematic', 'realistic', 'animated'))
);

-- Indexes for performance
CREATE INDEX idx_video_prompts_venture ON video_prompts(venture_id);
CREATE INDEX idx_video_prompts_used ON video_prompts(used);
CREATE INDEX idx_video_prompts_created ON video_prompts(created_at DESC);

-- RLS Policies
ALTER TABLE video_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view prompts for their ventures" ON video_prompts
  FOR SELECT USING (
    venture_id IN (
      SELECT id FROM ventures WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create prompts for their ventures" ON video_prompts
  FOR INSERT WITH CHECK (
    venture_id IN (
      SELECT id FROM ventures WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own prompts" ON video_prompts
  FOR UPDATE USING (
    venture_id IN (
      SELECT id FROM ventures WHERE user_id = auth.uid()
    )
  );
`,

      edge_function: `
// Supabase Edge Function: generate-video-prompts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const openAIKey = Deno.env.get('OPENAI_API_KEY')

serve(async (req) => {
  try {
    const { ventureId, template, tone, platforms, duration, style } = await req.json()

    // 1. Fetch venture data
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: venture } = await supabase
      .from('ventures')
      .select('name, description, key_features, value_proposition')
      .eq('id', ventureId)
      .single()

    // 2. Build GPT-4 prompt based on template
    const systemPrompt = getSystemPrompt(template, platforms)
    const userPrompt = buildUserPrompt(venture, tone, duration, style)

    // 3. Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${openAIKey}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 800
      })
    })

    const aiResult = await response.json()
    const prompts = JSON.parse(aiResult.choices[0].message.content)

    // 4. Store prompts in database
    const { data: saved } = await supabase
      .from('video_prompts')
      .insert({
        venture_id: ventureId,
        template_type: template,
        tone,
        duration,
        style,
        sora_prompt: prompts.sora,
        runway_prompt: prompts.runway,
        kling_prompt: prompts.kling,
        created_by: req.headers.get('user-id')
      })
      .select()
      .single()

    return new Response(JSON.stringify(saved), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

function getSystemPrompt(template, platforms) {
  const basePrompt = \`You are an expert video prompt engineer. Generate platform-specific video prompts that:\n1. Are optimized for AI video generation\n2. Include specific visual details, camera angles, lighting\n3. Respect platform capabilities and limitations\n4. Return JSON: { "sora": "...", "runway": "...", "kling": "..." }\`

  const templateGuides = {
    product_demo: "Focus on product features in action, benefit demonstration, clear use cases",
    testimonial: "Emphasize authenticity, emotional connection, real-world scenarios",
    feature_highlight: "Zoom into specific feature, show before/after, highlight innovation",
    brand_story: "Build narrative arc, establish brand personality, create emotional resonance"
  }

  const platformSpecs = {
    sora: "Sora 2: Cinematic quality, realistic physics, multi-shot sequences, max 60s",
    runway: "Runway Gen-4: Fast generation, social media optimized, dynamic movement, max 30s",
    kling: "Kling 2.1: Long-form content, smooth transitions, up to 2 minutes"
  }

  return \`\${basePrompt}\n\nTemplate: \${templateGuides[template]}\n\nPlatform specs:\n\${platforms.map(p => platformSpecs[p]).join('\n')}\`
}

function buildUserPrompt(venture, tone, duration, style) {
  return \`Product: \${venture.name}
Description: \${venture.description}
Key Features: \${venture.key_features}
Value Proposition: \${venture.value_proposition}

Tone: \${tone}
Duration: \${duration}
Style: \${style}

Generate 3 variations of prompts optimized for each platform.\`
}
`,

      react_components: {
        VideoPromptStudio: `
// src/components/creative/VideoPromptStudio.tsx
interface Props {
  ventureId?: string // Optional - for standalone use
}

export function VideoPromptStudio({ ventureId }: Props) {
  const [template, setTemplate] = useState('product_demo')
  const [tone, setTone] = useState('professional')
  const [duration, setDuration] = useState('60s')
  const [style, setStyle] = useState('cinematic')
  const [loading, setLoading] = useState(false)
  const [generatedPrompts, setGeneratedPrompts] = useState(null)

  const handleGenerate = async () => {
    setLoading(true)
    const { data } = await supabase.functions.invoke('generate-video-prompts', {
      body: { ventureId, template, tone, duration, style, platforms: ['sora', 'runway', 'kling'] }
    })
    setGeneratedPrompts(data)
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <PromptConfigPanel
        template={template} setTemplate={setTemplate}
        tone={tone} setTone={setTone}
        duration={duration} setDuration={setDuration}
        style={style} setStyle={setStyle}
      />

      <Button onClick={handleGenerate} loading={loading}>
        Generate Prompts
      </Button>

      {generatedPrompts && (
        <PromptResultsGrid prompts={generatedPrompts} />
      )}
    </div>
  )
}
`,

        VenturePromptPanel: `
// src/components/ventures/VenturePromptPanel.tsx
interface Props {
  ventureId: string
}

export function VenturePromptPanel({ ventureId }: Props) {
  const { data: recentPrompts } = useQuery(['prompts', ventureId], () =>
    supabase.from('video_prompts').select('*').eq('venture_id', ventureId).order('created_at', { ascending: false }).limit(3)
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Video Ad Prompts</CardTitle>
        <Button variant="outline" onClick={() => openPromptStudio()}>
          Generate New Prompts
        </Button>
      </CardHeader>

      <CardContent>
        {recentPrompts?.map(prompt => (
          <PromptCard key={prompt.id} prompt={prompt} compact />
        ))}
      </CardContent>
    </Card>
  )
}
`,

        PromptCard: `
// src/components/creative/PromptCard.tsx
interface Props {
  prompt: VideoPrompt
  compact?: boolean
}

export function PromptCard({ prompt, compact }: Props) {
  const [copied, setCopied] = useState<string | null>(null)

  const copyToClipboard = (text: string, platform: string) => {
    navigator.clipboard.writeText(text)
    setCopied(platform)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <Badge>{prompt.template_type}</Badge>
          <Badge variant="outline">{prompt.tone}</Badge>
        </div>
        {prompt.used && <Badge variant="success">Used</Badge>}
      </div>

      <Tabs defaultValue="sora">
        <TabsList>
          <TabsTrigger value="sora">Sora 2</TabsTrigger>
          <TabsTrigger value="runway">Runway</TabsTrigger>
          <TabsTrigger value="kling">Kling</TabsTrigger>
        </TabsList>

        <TabsContent value="sora">
          <PromptDisplay
            text={prompt.sora_prompt}
            onCopy={() => copyToClipboard(prompt.sora_prompt, 'sora')}
            copied={copied === 'sora'}
          />
        </TabsContent>

        {/* Similar for runway and kling */}
      </Tabs>

      {!compact && (
        <FeedbackSection promptId={prompt.id} />
      )}
    </div>
  )
}
`
      }
    },

    // User Stories & Acceptance Criteria
    user_stories: [
      {
        id: 'US-001',
        as_a: 'Venture Manager',
        i_want: 'to generate video prompts from my venture data',
        so_that: 'I can create professional video ads without expertise',
        acceptance_criteria: [
          'Can select venture from dropdown',
          'Can choose from 4 templates: product_demo, testimonial, feature_highlight, brand_story',
          'Can customize tone (4 options), duration (3 options), style (3 options)',
          'Prompts generated in <10 seconds',
          'Receives 3 prompts for each platform (Sora, Runway, Kling)'
        ],
        priority: 'CRITICAL',
        estimate: '8h'
      },
      {
        id: 'US-002',
        as_a: 'User',
        i_want: 'to copy prompts to clipboard',
        so_that: 'I can paste them into Sora/Runway/Kling platforms',
        acceptance_criteria: [
          'One-click copy button for each prompt',
          'Visual confirmation of copy action',
          'Prompts formatted ready for platform use',
          'No manual editing required'
        ],
        priority: 'CRITICAL',
        estimate: '2h'
      },
      {
        id: 'US-003',
        as_a: 'User',
        i_want: 'to access prompt generation from venture details',
        so_that: 'I have contextual access without leaving my workflow',
        acceptance_criteria: [
          '"Generate Ad Prompts" button visible on venture detail page',
          'Quick template selector in side panel',
          'Shows 3 most recent prompts',
          'Link to full prompt studio for advanced features'
        ],
        priority: 'HIGH',
        estimate: '5h'
      },
      {
        id: 'US-004',
        as_a: 'User',
        i_want: 'to track which prompts I used',
        so_that: 'I can remember what worked and provide feedback',
        acceptance_criteria: [
          'Mark prompt as "used" with checkbox',
          'Select which platform it was used on',
          'Add performance notes (optional text field)',
          'Rate prompt quality 1-5 stars (optional)',
          'Usage data visible in prompt library'
        ],
        priority: 'HIGH',
        estimate: '4h'
      },
      {
        id: 'US-005',
        as_a: 'User',
        i_want: 'to see all my generated prompts',
        so_that: 'I can reuse successful patterns',
        acceptance_criteria: [
          'Prompt library shows all prompts for my ventures',
          'Filter by venture, template, platform, used/unused',
          'Sort by date, rating, usage',
          'Search by text content'
        ],
        priority: 'MEDIUM',
        estimate: '6h'
      },
      {
        id: 'US-006',
        as_a: 'Admin',
        i_want: 'to see usage analytics',
        so_that: 'I can make Phase 2 go/no-go decision',
        acceptance_criteria: [
          'Dashboard shows: total prompts generated, % prompts used, platform breakdown',
          'Identifies most popular templates and tones',
          'Shows user engagement trends over time',
          'Clear metric: % ventures using feature'
        ],
        priority: 'MEDIUM',
        estimate: '5h'
      }
    ],

    // Testing & Quality Assurance
    testing_strategy: {
      unit_tests: [
        'Edge Function: GPT-4 API integration with mock responses',
        'Edge Function: Error handling (API failures, invalid inputs)',
        'Database: RLS policies enforce venture ownership',
        'Database: Constraints validate enum values'
      ],
      integration_tests: [
        'End-to-end: Generate prompt → Save to DB → Retrieve in UI',
        'Venture context: Correct venture data passed to GPT-4',
        'Multi-platform: All 3 prompts (Sora, Runway, Kling) generated',
        'Clipboard: Copy function works across browsers'
      ],
      manual_tests: [
        'UX Flow: Standalone page → Select venture → Generate → Copy → Use on Sora.com',
        'UX Flow: Venture detail → Quick generate → Copy to Runway',
        'Prompt Quality: 10 test ventures, verify prompts are usable',
        'Performance: Generate prompts for 20 ventures in one session'
      ],
      performance_targets: [
        'Prompt generation: <10s end-to-end',
        'Page load: <2s for prompt library',
        'Database query: <500ms for prompt history',
        'GPT-4 API: <8s response time (with retries)'
      ]
    },

    // Implementation Phases
    implementation_plan: {
      week_1: {
        title: 'Database & Backend (12h)',
        tasks: [
          'Create video_prompts table with migration',
          'Set up RLS policies and indexes',
          'Create Supabase Edge Function scaffold',
          'Integrate GPT-4 API with template system',
          'Platform-specific prompt optimization logic',
          'Unit tests for Edge Function'
        ]
      },
      week_2: {
        title: 'Frontend Components (13h)',
        tasks: [
          'Build VideoPromptStudio component (standalone)',
          'Create VenturePromptPanel (integrated)',
          'Implement PromptCard with clipboard copy',
          'Add PromptLibrary with filters',
          'Build PromptConfigPanel (template/tone/duration/style selectors)',
          'Integrate with ventures data'
        ]
      },
      week_3: {
        title: 'Testing & Polish (5h)',
        tasks: [
          'Integration testing with real GPT-4',
          'Manual testing with 10 sample ventures',
          'UX refinements based on testing',
          'Analytics dashboard (basic metrics)',
          'Documentation for users',
          'Deploy to staging'
        ]
      }
    },

    // Risks & Mitigations
    risks: [
      {
        risk: 'GPT-4 generates low-quality prompts',
        impact: 'HIGH',
        probability: 'LOW',
        mitigation: 'Template refinement, human review loop, collect user ratings'
      },
      {
        risk: 'Users find manual copy-paste tedious',
        impact: 'MEDIUM',
        probability: 'MEDIUM',
        mitigation: 'Streamline UX, communicate Phase 2 automation roadmap'
      },
      {
        risk: 'Platform prompt formats change',
        impact: 'LOW',
        probability: 'MEDIUM',
        mitigation: 'Template versioning system, easy updates via database'
      }
    ],

    // Dependencies
    dependencies: {
      external: [
        'OpenAI GPT-4 API access (already integrated)',
        'Supabase Edge Functions (already available)',
        'Existing ventures database schema'
      ],
      internal: [
        'Design sub-agent UX review (before implementation)',
        'Database migration approval',
        'Staging environment access'
      ],
      blocking: []
    },

    // Success Metrics
    success_metrics: {
      phase_1_targets: {
        usage: 'Generate prompts for 20+ ventures in 90 days',
        adoption: '50%+ of generated prompts marked as used',
        quality: 'Average rating ≥4/5 stars',
        performance: 'Prompt generation <10s, 95% uptime'
      },
      go_no_go_criteria: {
        proceed_to_phase_2: '>50% usage rate validates API automation investment',
        optimize_and_extend: '20-50% usage - improve templates, extend pilot',
        kill_feature: '<20% usage - abandon feature, save 60h Phase 2'
      }
    },

    metadata: {
      total_hours: 30,
      weeks: 3,
      team: ['PLAN (this PRD)', 'EXEC (implementation)', 'Design sub-agent (UX review)'],
      created_at: new Date().toISOString()
    }
  };

  const { data, error } = await supabase
    .from('product_requirements')
    .insert(prd)
    .select();

  if (error) {
    console.error('❌ Error creating PRD:', error);
    return;
  }

  console.log('✅ PRD Created Successfully\n');
  console.log('PRD ID:', data[0].id);
  console.log('Title:', data[0].title);
  console.log('\n📊 PRD Summary:');
  console.log('  Scope: Phase 1 - AI Video Prompt Generator');
  console.log('  Hours: 30h over 3 weeks');
  console.log('  User Stories: 6 (4 critical, 2 high priority)');
  console.log('  Database: video_prompts table with RLS');
  console.log('  Backend: Supabase Edge Function + GPT-4');
  console.log('  Frontend: 5 React components');
  console.log('  Success Gate: >50% usage validates Phase 2');

  console.log('\n🎯 Next Steps:');
  console.log('  1. Trigger Design sub-agent for UX review');
  console.log('  2. Get database migration approved');
  console.log('  3. Create PLAN→EXEC handoff');
  console.log('  4. Begin implementation in /mnt/c/_EHG/ehg/');

  return data[0];
}

createPRDPhase1();
