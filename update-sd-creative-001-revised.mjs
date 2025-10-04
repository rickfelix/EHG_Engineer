import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateSDCreative001() {
  console.log('📋 LEAD: Updating SD-CREATIVE-001 with Revised Scope\n');

  const revisedScope = `# AI Video Prompt Generator with Future API Integration

## Executive Summary
REVISED SCOPE: Build intelligent prompt generator for AI video platforms (Sora 2, Runway, Kling) with manual workflow now, API automation later.

**Phase 1 (Immediate):** AI Prompt Generator - 30h
**Phase 2 (Q2 2026):** API Integration when Sora API available - 60h
**Total Effort:** 90h (67% reduction from original 275h)

---

## Phase 1: AI Video Prompt Generator (30 hours)

### Component 1: Venture-to-Prompt Engine (10h)
**Purpose**: Transform venture data into optimized video prompts

**Features**:
- Extract value props, pain points, benefits from venture data
- AI-powered prompt generation using GPT-4
- Multi-platform optimization (Sora 2, Runway, Kling)
- Template system (Product Demo, Testimonial, Feature Highlight, Brand Story)

### Component 2: Multi-Platform Templates (5h)
**Purpose**: Platform-specific prompt optimization

**Templates**:
- Sora 2: Cinematic, realistic physics, multi-shot sequences
- Runway Gen-4: Fast turnaround, social media optimized
- Kling 2.1: Long-form content, up to 2-minute clips

**Customization**:
- Tone selector: Professional | Casual | Inspiring | Technical
- Duration: 30s | 60s | 90s
- Style: Cinematic | Realistic | Animated

### Component 3: Prompt Library & Management (5h)
**Purpose**: Store, version, and track prompts

**Features**:
- Save generated prompts per venture
- A/B test variations (3-5 prompts per venture)
- Copy-to-clipboard functionality
- Usage tracking (which prompts were used)
- Performance notes (manual feedback on video results)

### Component 4: Dual Integration UI (10h)
**Purpose**: Standalone module + venture workflow integration

**Standalone Page** (/creative-media-automation):
- Full prompt studio interface
- Bulk generation for multiple ventures
- Prompt library browser
- Analytics dashboard

**Venture Workflow Integration**:
- "Generate Ad Prompts" button on venture detail page
- Quick template selector in side panel
- Recently generated prompts list
- Link to full prompt studio

---

## Phase 2: API Integration (60 hours) - When APIs Available

### Component 1: API Orchestration (15h)
- Sora 2 API integration (when launched)
- Runway API integration (already available)
- Kling API integration (third-party available)
- Luma Dream Machine API (available now)

### Component 2: Automated Workflow (15h)
- One-click: Generate Prompt → Call API → Download Video
- Queue management for batch processing
- Webhook handling for async completion
- Cost tracking per video

### Component 3: Multi-Provider Logic (15h)
- Fallback: Sora 2 → Runway → Kling → Luma
- Cost optimization (pick cheapest available)
- Quality comparison dashboard
- Provider status monitoring

### Component 4: Video Management (15h)
- Auto-save to Supabase Storage
- Link videos to ventures
- Performance analytics (views, conversions)
- A/B test results tracking

---

## Technical Architecture

### Database Schema
\`\`\`sql
CREATE TABLE video_prompts (
  id UUID PRIMARY KEY,
  venture_id UUID REFERENCES ventures(id),
  template_type VARCHAR, -- product_demo, testimonial, etc.
  tone VARCHAR,
  platform VARCHAR, -- sora, runway, kling
  prompt_text TEXT,
  used BOOLEAN DEFAULT false,
  performance_notes TEXT,
  created_at TIMESTAMPTZ
);

CREATE TABLE generated_videos (
  id UUID PRIMARY KEY,
  prompt_id UUID REFERENCES video_prompts(id),
  venture_id UUID REFERENCES ventures(id),
  video_url TEXT,
  platform VARCHAR,
  duration_seconds INT,
  cost_usd DECIMAL,
  status VARCHAR, -- generating, completed, failed
  metadata JSONB,
  created_at TIMESTAMPTZ
);
\`\`\`

### Supabase Edge Function
\`\`\`typescript
// Phase 1: Prompt Generation
supabase.functions.invoke('generate-video-prompts', {
  body: {
    ventureId: string,
    template: 'product_demo' | 'testimonial' | 'feature' | 'brand_story',
    tone: 'professional' | 'casual' | 'inspiring' | 'technical',
    platforms: ('sora' | 'runway' | 'kling')[]
  }
});

// Returns: Array of optimized prompts
\`\`\`

### React Components
- \`VideoPromptStudio.tsx\` - Standalone prompt generator page
- \`VenturePromptPanel.tsx\` - Integrated panel in venture detail
- \`PromptLibrary.tsx\` - Browse and manage saved prompts
- \`PromptCard.tsx\` - Display individual prompt with copy button

---

## Acceptance Criteria - Phase 1

### Must Have:
1. ✅ Generate prompts from venture data (name, description, features)
2. ✅ Support 4 templates: Product Demo, Testimonial, Feature, Brand Story
3. ✅ Optimize for 3 platforms: Sora 2, Runway, Kling
4. ✅ Save prompts to database with venture linkage
5. ✅ Copy-to-clipboard with one click
6. ✅ Display on standalone page + venture detail integration
7. ✅ Track prompt usage (boolean flag)

### Should Have:
8. ✅ Generate 3-5 variations per request
9. ✅ Tone customization (4 options)
10. ✅ Duration specification (30s/60s/90s)
11. ✅ Performance notes field (manual feedback)

### Could Have:
12. Prompt history timeline
13. Most successful prompts analytics
14. Export prompts to CSV/JSON

---

## Success Metrics

### Phase 1 (First 90 Days):
- Generate prompts for 20+ ventures
- 50%+ of generated prompts actually used
- Collect feedback on which platforms work best
- Validate demand before Phase 2 investment

### Phase 1 Go/No-Go Decision:
- **IF** usage >50% of ventures → Approve Phase 2
- **IF** usage 20-50% → Optimize and extend pilot
- **IF** usage <20% → Kill feature, save 60h Phase 2

### Phase 2 (When APIs Available):
- 80% automation rate (prompt → video without manual steps)
- Average cost per video <$2
- 90% successful generation rate
- 20% improvement in ad conversion vs manual creation

---

## Risks & Mitigations

### Phase 1 Risks:
1. **Low Adoption**: Users don't use prompts
   - *Mitigation*: Pilot with 5-10 ventures, gather feedback early
2. **Poor Prompt Quality**: AI generates bad prompts
   - *Mitigation*: Template refinement, human review loop
3. **Platform Changes**: Sora 2/Runway change prompt formats
   - *Mitigation*: Template versioning, easy updates

### Phase 2 Risks:
1. **API Delays**: Sora 2 API not launched on time
   - *Mitigation*: Start with Runway/Kling (already available)
2. **High Costs**: Video generation too expensive
   - *Mitigation*: Cost limits, budget alerts, provider fallback
3. **API Reliability**: Downtime or quality issues
   - *Mitigation*: Multi-provider architecture, manual fallback

---

## Timeline

### Phase 1: 2-3 Weeks
- Week 1: Prompt engine + database schema
- Week 2: UI components (standalone + integrated)
- Week 3: Testing, refinement, pilot launch

### Phase 2: 4-6 Weeks (When APIs Available)
- Week 1-2: API integrations (Runway, Kling, Luma)
- Week 3-4: Automation workflow + queue system
- Week 5: Multi-provider logic
- Week 6: Video management + analytics

---

## Cost Estimate

### Phase 1:
- Development: 30h (one-time)
- GPT-4 API: ~$0.05 per prompt generation
- Monthly at 100 prompts: $5/month

### Phase 2:
- Development: 60h (one-time, when APIs available)
- Video API costs (per 60s video):
  - Sora 2: ~$1-3 (estimated)
  - Runway: ~$0.75
  - Kling: ~$1.50
  - Luma: ~$1.00
- Monthly at 50 videos: $50-150/month

**Total Phase 1+2:** 90h development + predictable API costs`;

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      scope: revisedScope,
      description: 'AI-powered video prompt generator for Sora 2, Runway, and Kling. Phase 1: Manual workflow (30h). Phase 2: API automation when available (60h).',
      status: 'in_progress',
      current_phase: 'PLAN',
      metadata: {
        ...{ sequence_updated: "2025-10-03T12:19:05.407Z", sequence_rationale: "Creative Media Suite - Can run in parallel (275h, 3 phases)", sequence_updated_by: "PLAN" },
        lead_approval_date: new Date().toISOString(),
        lead_approved_by: 'LEAD',
        scope_revision: 'Reduced from 275h to 90h (67% reduction)',
        scope_revision_reason: 'Simplified to prompt generator with future API integration path',
        phase_1_hours: 30,
        phase_2_hours: 60,
        total_hours: 90,
        integration_type: 'dual', // standalone module + venture workflow
        original_hours: 275,
        hours_saved: 185
      }
    })
    .eq('sd_key', 'SD-CREATIVE-001')
    .select();

  if (error) {
    console.error('❌ Error updating SD:', error);
    return;
  }

  console.log('✅ SD-CREATIVE-001 updated successfully\n');
  console.log('Revised Scope:');
  console.log('  Phase 1: AI Prompt Generator - 30h');
  console.log('  Phase 2: API Integration - 60h (when APIs available)');
  console.log('  Total: 90h (67% reduction from 275h)');
  console.log('  Integration: Standalone module + venture workflow');
  console.log('\nStatus: in_progress');
  console.log('Current Phase: PLAN');
}

updateSDCreative001();
