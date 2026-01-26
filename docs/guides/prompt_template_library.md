# Comprehensive Prompt Template Library


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, schema, authentication

## Overview

This library contains sophisticated, production-ready prompt templates for generating high-quality marketing assets across all channels and use cases. Each template is optimized for specific AI models and includes detailed parameters for customization.

## 1.5. Database Schema Integration

**Canonical Schema Reference**: `enhanced_prds/stage_56_database_schema_enhanced.md`

### Core Entity Dependencies

The Prompt Template Library integrates directly with the universal database schema to ensure all content creation data is properly structured and accessible across stages:

- **Venture Entity**: Core venture information for brand consistency and template personalization
- **Chairman Feedback Schema**: Executive creative preferences and content strategy frameworks  
- **Template Library Schema**: Prompt templates, variations, and performance tracking
- **Content Generation Schema**: Generated assets, performance metrics, and optimization data
- **Campaign Management Schema**: Template usage patterns and campaign effectiveness data

```typescript
interface PromptTemplateLibraryDatabaseIntegration {
  ventureEntity: Stage56VentureSchema;
  chairmanFeedback: Stage56ChairmanFeedbackSchema;  
  templateLibrary: Stage56TemplateLibrarySchema;
  contentGeneration: Stage56ContentGenerationSchema;
  campaignManagement: Stage56CampaignManagementSchema;
  auditTrail: Stage56AuditSchema;
}
```

#### Universal Contract Enforcement

- **Template Data Contracts**: All content creation operations conform to Stage 56 template contracts
- **Cross-Stage Template Consistency**: Template library properly coordinated with marketing automation and brand management stages  
- **Audit Trail Compliance**: Complete template documentation for creative governance and performance optimization

## 1.6. Integration Hub Connectivity  

**Integration Hub Reference**: `enhanced_prds/stage_51_integration_hub_enhanced.md`

### Integration Requirements

Prompt Template Library connects to multiple external services via Integration Hub connectors:

- **AI Content Platforms**: Template execution and content generation via AI Hub connectors
- **Creative Asset Platforms**: Design and multimedia integration via Creative Hub connectors  
- **Brand Management Systems**: Asset compliance and approval via Brand Hub connectors
- **Performance Analytics**: Template effectiveness tracking via Analytics Hub connectors
- **Content Distribution**: Multi-channel publishing and optimization via Distribution Hub connectors

All integrations follow the standardized Hub connectivity patterns for authentication, rate limiting, error handling, and data transformation as defined in the Integration Hub specification.

## Template Categories

### 1. Product Reveal Templates

#### Luxury Product Reveal
```typescript
{
  templateId: 'luxury_reveal_001',
  name: 'Cinematic Luxury Product Reveal',
  prompt: `
    Create a cinematic luxury product reveal video:
    - Opening: Dark velvet or silk surface, single dramatic spotlight from above
    - Atmosphere: Mysterious, anticipation-building, premium feel
    - Transformation: Golden threads or particles slowly weaving together to form ${productName}
    - Camera work: Slow dolly in, 360-degree rotation at reveal moment
    - Lighting: Moody with warm golden highlights, dramatic shadows
    - Peak moment: Product fully revealed in perfect lighting, slow motion
    - Materials: Show premium textures - leather, metal, glass with realistic reflections
    - Typography: Elegant serif font, minimal text, gold or silver finish
    - Color palette: Deep blacks, rich golds, warm amber tones
    - Duration: ${duration || '20-30'} seconds
    - Resolution: 4K minimum, 24fps for cinematic feel
    - Audio space: Leave room for orchestral soundtrack
  `,
  negativePrompts: [
    'cheap', 'plastic', 'harsh lighting', 'busy background',
    'oversaturated', 'amateur', 'cluttered', 'cartoon', 'low quality'
  ],
  parameters: {
    aspectRatio: '2.35:1',
    style: 'cinematic, luxury, premium',
    mood: 'mysterious, elegant, sophisticated'
  }
}
```

#### Tech Product Reveal
```typescript
{
  templateId: 'tech_reveal_001',
  name: 'Futuristic Tech Product Reveal',
  prompt: `
    Generate a high-tech product reveal sequence:
    - Environment: Clean, minimalist space with subtle grid floor
    - Opening: Futuristic container with glowing blue seams
    - Build sequence: Holographic blueprints materialize
    - Assembly: Components float in, assembling with precision
    - Effects: Particle systems, data streams, HUD elements
    - Lighting: Clean white with blue accent lights, no shadows
    - Camera: Dynamic movements, quick precise cuts
    - UI overlays: Specs appearing as callouts, feature highlights
    - Color scheme: White, silver, electric blue, cyan accents
    - Materials: Brushed aluminum, glass, carbon fiber textures
    - Typography: Modern sans-serif, thin weight, blue glow
    - Duration: ${duration || '20-25'} seconds
    - Resolution: 4K, 60fps for smooth motion
  `,
  negativePrompts: [
    'old-fashioned', 'rustic', 'warm tones', 'organic',
    'vintage', 'retro', 'cluttered', 'slow'
  ]
}
```

### 2. Tutorial & Demo Templates

#### Quick Feature Tutorial
```typescript
{
  templateId: 'tutorial_quick_001',
  name: 'Quick Feature Tutorial',
  prompt: `
    Create a clear, engaging tutorial video for ${featureName}:
    - Structure: Problem → Solution → Result
    - Visual style: Clean screen recording with smooth zoom-ins
    - Highlights: Yellow circles for clicks, red arrows for direction
    - Callouts: Speech bubbles for tips, modern flat design
    - Transitions: Smooth wipes between steps, no fancy effects
    - Pacing: 1-2 seconds per action, pause on important points
    - Background: Slight blur on non-focus areas
    - Color coding: Green for success, yellow for warnings
    - Typography: Clear sans-serif, high contrast
    - Duration: ${duration || '30-60'} seconds
    - Include: Progress bar showing steps
    - Resolution: 1080p minimum
  `,
  voiceoverGuidance: 'Professional, friendly, clear articulation'
}
```

#### In-Depth Product Demo
```typescript
{
  templateId: 'demo_detailed_001',
  name: 'Comprehensive Product Demo',
  prompt: `
    Generate comprehensive product demonstration:
    - Opening: Problem statement visualization
    - Transition: Elegant morph to solution (your product)
    - Demo sections: Feature-by-feature walkthrough
    - Screen recording: Smooth mouse movements, purposeful clicks
    - Annotations: Highlight boxes, arrows, text callouts
    - Split screens: Before/after comparisons
    - Data viz: Animated charts showing improvements
    - Customer quotes: Testimonial cards with photos
    - Closing: Clear CTA with contact/signup info
    - Style: Professional but approachable
    - Duration: ${duration || '2-3'} minutes
    - Music: Upbeat, professional background track
  `
}
```

### 3. Social Media Templates

#### Instagram Reel
```typescript
{
  templateId: 'instagram_reel_001',
  name: 'Viral Instagram Reel',
  prompt: `
    Create trendy Instagram Reel for ${productName}:
    - Format: Vertical 9:16 aspect ratio
    - Hook: First 3 seconds must grab attention
    - Style: Fast cuts, dynamic transitions
    - Effects: Speed ramps, match cuts, trending filters
    - Text: Bold overlays, animated captions
    - Color: Vibrant, high contrast, Instagram-friendly
    - Music sync: Cuts matching beat drops
    - Trending elements: Current visual trends
    - Product shots: Multiple angles, lifestyle context
    - Human element: Hands, faces showing emotion
    - Duration: ${duration || '15-30'} seconds
    - Call to action: Swipe up or click link
  `,
  negativePrompts: ['boring', 'static', 'corporate', 'old-fashioned']
}
```

#### TikTok Product Demo
```typescript
{
  templateId: 'tiktok_demo_001',
  name: 'TikTok Native Demo',
  prompt: `
    Generate authentic TikTok-style product demo:
    - Opening: Relatable problem or question hook
    - Style: Handheld, slightly shaky for authenticity
    - Transitions: Quick cuts, whip pans, trending effects
    - Text: Large, bold captions synced to speech
    - Demonstration: Fast-paced, get to point quickly
    - Lighting: Natural, not overly produced
    - Background: Real environment, not studio
    - Energy: High enthusiasm, genuine excitement
    - Format: Vertical 9:16
    - Duration: ${duration || '15-60'} seconds
    - Ending: Clear value prop and CTA
  `,
  audioNotes: 'Trending audio or original voiceover with energy'
}
```

#### LinkedIn Professional Post
```typescript
{
  templateId: 'linkedin_post_001',
  name: 'LinkedIn Professional Content',
  prompt: `
    Create professional LinkedIn video content:
    - Tone: Business professional, informative
    - Opening: Industry insight or surprising statistic
    - Visuals: Clean infographics, data visualizations
    - Style: Talking head or elegant animations
    - Graphics: Corporate but modern, not stuffy
    - Color palette: Blues, grays, professional tones
    - Typography: Clean, readable, professional fonts
    - Data: Charts, graphs, comparison tables
    - Format: 16:9 or 1:1 square
    - Duration: ${duration || '30-90'} seconds
    - CTA: Professional networking or B2B focused
  `
}
```

### 4. Lifestyle & Brand Story Templates

#### Brand Story Video
```typescript
{
  templateId: 'brand_story_001',
  name: 'Emotional Brand Story',
  prompt: `
    Create emotional brand story video for ${brandName}:
    - Narrative: Founder story or customer journey
    - Cinematography: Documentary style, handheld feel
    - Lighting: Natural, golden hour when possible
    - People: Real faces, genuine emotions, diversity
    - Settings: Authentic locations, real environments
    - Pace: Slower, allowing emotional moments
    - Music: Emotional, building to inspirational
    - Color grading: Warm, slightly desaturated
    - Typography: Minimal, let story speak
    - Interviews: Intimate, personal testimonials
    - B-roll: Supportive footage of product in use
    - Duration: ${duration || '60-90'} seconds
  `,
  emotionalTone: 'Inspiring, authentic, human'
}
```

#### Lifestyle Product Integration
```typescript
{
  templateId: 'lifestyle_001',
  name: 'Lifestyle Product Placement',
  prompt: `
    Generate lifestyle scene with natural product integration:
    - Setting: Modern home, coffee shop, or office
    - People: Diverse, relatable, age ${targetAge || '25-40'}
    - Activity: Natural use of ${productName}
    - Camera: Observational, not staged feeling
    - Lighting: Natural daylight, soft shadows
    - Focus: Shallow depth of field, cinematic
    - Color: Warm, inviting, Instagram-worthy
    - Props: Lifestyle accessories that fit brand
    - Wardrobe: Casual but stylish, on-brand
    - Mood: Relaxed, aspirational, achievable
    - Duration: ${duration || '15-30'} seconds
  `
}
```

### 5. Comparison & Competitive Templates

#### Feature Comparison Chart
```typescript
{
  templateId: 'comparison_chart_001',
  name: 'Animated Feature Comparison',
  prompt: `
    Create dynamic feature comparison visualization:
    - Layout: Clean table or side-by-side comparison
    - Animation: Features appearing one by one
    - Highlighting: Your product advantages in green
    - Icons: Modern, flat design icons for features
    - Checkmarks: Animated green checks, red X's
    - Data: Real specifications and numbers
    - Transitions: Smooth morphing between data points
    - Color coding: Your brand color vs neutral gray
    - Typography: Clear, readable, good hierarchy
    - Emphasis: Subtle pulse on key differentiators
    - Duration: ${duration || '20-30'} seconds
    - Ending: Clear winner indication
  `
}
```

#### Before/After Transformation
```typescript
{
  templateId: 'before_after_001',
  name: 'Before/After Transformation',
  prompt: `
    Generate compelling before/after comparison:
    - Split screen: Clear dividing line or slider
    - Before state: Problem clearly visualized
    - Transformation: Smooth transition or wipe reveal
    - After state: Solution with ${productName}
    - Data overlay: Metrics showing improvement
    - Time indicator: How fast transformation happens
    - Real examples: Authentic case studies
    - Visual style: Clean, professional, trustworthy
    - Color: Muted before, vibrant after
    - Music: Building from problem to solution
    - Duration: ${duration || '15-20'} seconds
  `
}
```

### 6. Event & Seasonal Templates

#### Holiday Campaign
```typescript
{
  templateId: 'holiday_001',
  name: 'Holiday Season Campaign',
  prompt: `
    Create festive holiday marketing video for ${holiday}:
    - Decorations: Seasonal elements, not overwhelming
    - Color palette: Traditional holiday colors
    - Lighting: Warm, cozy, festive sparkles
    - Product integration: Natural gift-giving context
    - Typography: Festive but readable fonts
    - Music space: Holiday music undertone
    - Emotions: Joy, warmth, togetherness
    - Special effects: Snow, lights, sparkles (subtle)
    - Gift wrapping: Premium presentation
    - CTA: Limited time holiday offer
    - Duration: ${duration || '15-30'} seconds
  `
}
```

#### Product Launch Countdown
```typescript
{
  templateId: 'launch_countdown_001',
  name: 'Product Launch Countdown',
  prompt: `
    Generate exciting launch countdown video:
    - Timer: Prominent countdown display
    - Energy: Building anticipation, excitement
    - Teaser shots: Glimpses of ${productName}
    - Effects: Glitch effects, quick cuts
    - Typography: Bold, urgent, dynamic
    - Color: High contrast, brand colors
    - Music sync: Building to climax at zero
    - Social proof: User excitement, waitlist numbers
    - Exclusive feel: VIP, limited availability
    - CTA: Sign up, be first, exclusive access
    - Duration: ${duration || '10-15'} seconds
  `
}
```

### 7. Testimonial & Social Proof Templates

#### Customer Testimonial
```typescript
{
  templateId: 'testimonial_001',
  name: 'Authentic Customer Testimonial',
  prompt: `
    Create genuine customer testimonial video:
    - Setting: Customer's natural environment
    - Framing: Medium close-up, good eye contact
    - Lighting: Soft, flattering, natural
    - B-roll: Product in use, results achieved
    - Lower thirds: Name, title, company (if B2B)
    - Subtitles: Clear, readable captions
    - Music: Subtle, not overpowering voice
    - Editing: Natural pauses, authentic feel
    - Multiple angles: Variety in shots
    - Results focus: Specific improvements mentioned
    - Duration: ${duration || '30-45'} seconds
  `
}
```

#### Case Study Visualization
```typescript
{
  templateId: 'case_study_001',
  name: 'Data-Driven Case Study',
  prompt: `
    Generate professional case study video:
    - Opening: Client challenge visualization
    - Solution intro: How ${productName} helped
    - Data viz: Animated charts showing results
    - Timeline: Implementation phases
    - Metrics: Before/after KPIs
    - Testimonial: Client spokesperson quote
    - ROI highlight: Specific percentage improvements
    - Visual style: Corporate but engaging
    - Graphics: Clean, modern, data-focused
    - Branding: Subtle, professional
    - Duration: ${duration || '60-90'} seconds
  `
}
```

## Advanced Prompt Modifiers

### Style Modifiers
```typescript
const styleModifiers = {
  cinematic: 'anamorphic lens, shallow DOF, color grading, film grain',
  minimal: 'clean, white space, simple, uncluttered, essential only',
  bold: 'high contrast, saturated colors, strong typography, impactful',
  organic: 'natural textures, earth tones, hand-drawn elements, authentic',
  futuristic: 'sci-fi, holographic, neon, cyberpunk aesthetics',
  vintage: 'retro filters, aged textures, nostalgic color palette',
  playful: 'bright colors, fun animations, casual, approachable'
};
```

### Platform Optimizations
```typescript
const platformOptimizations = {
  instagram: {
    feed: '1:1 square, thumb-stopping first frame',
    stories: '9:16 vertical, quick consumption, tappable',
    reels: '9:16 vertical, trending audio sync, fast paced'
  },
  youtube: {
    standard: '16:9 horizontal, HD/4K, longer form',
    shorts: '9:16 vertical, under 60 seconds, mobile-first'
  },
  tiktok: '9:16 vertical, authentic feel, trend-aware',
  linkedin: '16:9 or 1:1, professional tone, data-driven',
  twitter: '16:9, short and punchy, subtitle-heavy',
  facebook: '4:5 or 1:1, diverse audience, clear CTA'
};
```

### Emotional Tone Presets
```typescript
const emotionalTones = {
  inspiring: 'uplifting music, success stories, achievement focus',
  urgent: 'fast pacing, countdown timers, limited time language',
  trustworthy: 'testimonials, data, professional presentation',
  fun: 'bright colors, playful animations, humor elements',
  luxurious: 'slow pacing, premium materials, exclusive feel',
  educational: 'clear explanations, step-by-step, informative',
  emotional: 'human stories, close-ups on faces, touching moments'
};
```

## Quality Control Prompts

### Brand Compliance Check
```typescript
{
  templateId: 'qc_brand_001',
  prompt: `
    Verify brand compliance for generated asset:
    - Logo usage: Correct size, placement, clear space
    - Colors: Match hex codes ${brandColors}
    - Typography: Approved fonts only
    - Tone: Aligns with brand voice guidelines
    - Imagery: On-brand visual style
    - Messaging: Consistent with brand values
  `
}
```

### Technical Quality Check
```typescript
{
  templateId: 'qc_technical_001',
  prompt: `
    Verify technical specifications:
    - Resolution: Minimum ${minResolution}
    - Frame rate: Consistent ${frameRate}fps
    - Color space: ${colorSpace}
    - Audio levels: Normalized, no clipping
    - File format: ${requiredFormat}
    - Compression: Optimal for platform
  `
}
```

## Usage Guidelines

### Best Practices
1. **Customize variables** - Always replace ${variables} with specific values
2. **Combine modifiers** - Layer style, emotion, and platform optimizations
3. **Test variations** - Generate multiple versions with slight modifications
4. **Monitor performance** - Track which templates perform best
5. **Iterate and improve** - Refine prompts based on results

### Template Selection Logic
```typescript
function selectOptimalTemplate(
  campaign: Campaign,
  venture: Venture
): PromptTemplate {
  // Match campaign objective to template category
  const category = mapObjectiveToCategory(campaign.objective);
  
  // Filter by platform requirements
  const platformTemplates = filterByPlatform(category, campaign.platforms);
  
  // Score by brand alignment
  const scoredTemplates = scoreByBrandAlignment(platformTemplates, venture.brand);
  
  // Return highest scoring template
  return scoredTemplates[0];
}
```

## Continuous Improvement

### Performance Tracking
```typescript
interface TemplatePerformance {
  templateId: string;
  usageCount: number;
  averageEngagement: number;
  conversionRate: number;
  qualityScore: number;
  generationSuccessRate: number;
}
```

### Template Evolution
- Templates are versioned and improved based on performance data
- A/B testing of prompt variations to optimize results
- Machine learning to identify successful prompt patterns
- Regular updates based on AI model improvements

## Conclusion

This comprehensive prompt template library provides the foundation for generating professional marketing assets at scale. By combining sophisticated prompts with intelligent customization, ventures can maintain consistent, high-quality creative output across all channels while reducing production time by 95%.