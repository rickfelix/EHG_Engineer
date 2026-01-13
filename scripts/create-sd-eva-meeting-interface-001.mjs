#!/usr/bin/env node

/**
 * Create SD-EVA-MEETING-001: EVA Meeting Interface - Futuristic Screen Sharing
 * Target Application: EHG (business app)
 * Database: liapbndqlqxdcgpwntbv (EHG Supabase)
 *
 * Design a futuristic Microsoft Teams–style meeting with a professional female AI assistant
 * named EVA sharing her screen. EVA appears in a small video window on the left, wearing
 * business attire, speaking confidently. On the right, her shared desktop displays live
 * venture dashboards with charts and KPIs. Interface uses clean enterprise design — blue
 * and white palette, translucent panels, subtle glow around active elements. Include
 * transcript toggle and voice waveform indicators at the bottom.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function createStrategicDirective() {
  console.log('Creating SD-EVA-MEETING-001: EVA Meeting Interface - Futuristic Screen Sharing...\n');

  const sdData = {
    id: 'SD-EVA-MEETING-001',
    sd_key: 'SD-EVA-MEETING-001',
    title: 'EVA Meeting Interface - Futuristic Screen Sharing with Live Dashboard',
    description: `Design and implement a futuristic Microsoft Teams-style meeting interface featuring EVA (Executive Virtual Assistant) as a professional female AI assistant with real-time screen sharing capabilities. EVA appears in a video window (left side) wearing business attire, speaking confidently via OpenAI Real-Time Voice. The shared screen panel (right side) displays live venture dashboards with interactive charts and KPIs using existing EnhancedCharts component. Interface features clean enterprise design with blue/white palette, translucent panels with subtle blur effects, and active element glow animations. Bottom control bar includes transcript toggle, voice waveform indicators, and meeting controls. Leverages existing EVARealtimeVoice, EVAOrchestrationDashboard, and EnhancedCharts components for 70%+ code reuse.`,

    status: 'draft',
    priority: 'critical',
    category: 'EVA Assistant',

    target_application: 'EHG',

    strategic_intent: 'Transform EVA from voice-only assistant into immersive video meeting experience with visual context sharing',

    rationale: `Current EVA assistant provides excellent voice interaction (OpenAI Real-Time) but lacks visual engagement:

1. **Visual Context Gap**: Users can't see what EVA is "looking at" when analyzing ventures
2. **Meeting Experience**: No face-to-face interaction feeling, just voice in void
3. **Dashboard Sharing**: Existing charts (EnhancedCharts) aren't integrated into EVA sessions
4. **Professional Presentation**: No visual representation of EVA's professional persona
5. **Collaboration Feel**: Lacks "meeting room" atmosphere of modern AI assistants

Meeting interface addresses growing expectation for AI assistants to have:
- Visual presence (avatar/video representation)
- Screen sharing capabilities (show insights visually)
- Meeting-like interactions (not just chat bubbles)
- Professional presentation (business attire, confident demeanor)
- Real-time collaboration tools (transcript, controls)

Market examples: ChatGPT Canvas view, Claude Projects, Gemini multimodal chat - all moving toward visual collaboration spaces. EHG can lead with meeting-style interface that feels more human and engaging than competitor chat UIs.`,

    scope: {
      included: [
        'Meeting interface layout (video window left, shared screen right, controls bottom)',
        'EVA video window component (professional female avatar/video representation)',
        'Screen share panel displaying live venture dashboards',
        'Integration with existing EVARealtimeVoice for voice interaction',
        'Integration with existing EnhancedCharts component for KPI visualization',
        'Meeting control bar with transcript toggle, voice waveform, camera/mic controls',
        'Real-time transcript display with speaker labels and timestamps',
        'Futuristic design system: blue/white palette, translucent panels, glow effects',
        'Session management (start/end meeting, session persistence)',
        'Responsive design for desktop (meeting view not optimized for mobile)',
        'Navigation integration (route: /eva-meeting)',
        'WebRTC infrastructure for video streaming',
        'Screen Capture API integration for desktop sharing capability',
        'Accessibility features (keyboard controls, screen reader support)',
        'Meeting session database schema (session tracking, transcript storage)'
      ],
      excluded: [
        'Real EVA video generation (use professional stock avatar or placeholder)',
        'AI-generated facial animations (phase 2 - use static/loop video)',
        'Multi-participant meetings (EVA 1-on-1 only)',
        'Screen recording/playback (live only)',
        'Calendar integration for scheduled meetings',
        'Meeting invitations or sharing',
        'Mobile-optimized meeting view (desktop-first)',
        'Virtual backgrounds or effects',
        'Real-time collaboration tools (annotations, pointers)',
        'Meeting analytics dashboard (separate SD)'
      ],
      database_changes: {
        new_tables: ['eva_meeting_sessions', 'eva_meeting_transcripts'],
        new_views: [],
        modified_tables: [],
        leverage_existing: ['voice_conversations', 'ventures', 'companies']
      }
    },

    strategic_objectives: [
      'Create immersive meeting experience with EVA as visual presenter',
      'Integrate existing voice (EVARealtimeVoice) + charts (EnhancedCharts) into unified interface',
      'Establish futuristic design language: translucent panels, subtle glows, enterprise blue/white',
      'Enable real-time screen sharing of venture dashboards during EVA conversations',
      'Provide transcript toggle for accessibility and review',
      'Achieve 70%+ component reuse by leveraging existing EVA and dashboard infrastructure',
      'Meeting interface loads in <2s with smooth transitions and animations'
    ],

    success_criteria: [
      'Meeting interface displays EVA video window (left) + shared screen (right) + controls (bottom)',
      'EVA video shows professional female avatar in business attire (stock video or image)',
      'Shared screen displays live venture dashboards from EnhancedCharts component',
      'Voice interaction uses existing EVARealtimeVoice (no rework needed)',
      'Transcript toggle shows/hides real-time transcription with timestamps',
      'Voice waveform animates in sync with EVA speaking',
      'Meeting controls (start/end, mic/camera toggle) are intuitive and accessible',
      'Futuristic design: translucent panels visible, active elements glow subtly',
      'Session persists to database (start time, duration, transcript)',
      'Responsive layout works on 1920x1080+ desktop screens',
      'Keyboard shortcuts work for all major controls',
      'Screen reader announces major state changes'
    ],

    key_principles: [
      'REUSE-FIRST: Leverage EVARealtimeVoice, EnhancedCharts, EVAOrchestrationDashboard components',
      'MEETING METAPHOR: Interface should feel like professional video meeting, not chat',
      'VISUAL CONTEXT: Screen sharing makes data visible, not just described',
      'PROFESSIONAL PERSONA: EVA representation conveys confidence and expertise',
      'FUTURISTIC AESTHETIC: Translucent panels, glows, smooth animations create modern feel',
      'ACCESSIBILITY: All visual elements have text alternatives and keyboard access'
    ],

    implementation_guidelines: [
      'Phase 1: Layout & Design System (4-5 hours)',
      '  - Analyze existing EVAAssistantPage.tsx layout patterns',
      '  - Create EVAMeetingPage.tsx with 3-panel grid (video, screen share, controls)',
      '  - Define futuristic design tokens (translucent backgrounds, glow effects, animations)',
      '  - Implement TranslucentPanel.tsx component with backdrop blur',
      '  - Add GlowBorder.tsx component for active element highlighting',
      '  - Test responsive grid layout on various desktop resolutions',
      '',
      'Phase 2: EVA Video Window Component (3-4 hours)',
      '  - Create EVAVideoWindow.tsx component (avatar/video display)',
      '  - Source professional female avatar video/image (business attire)',
      '  - Add speaking animation overlay (pulse effect when EVA talks)',
      '  - Integrate with EVARealtimeVoice isSpeaking state',
      '  - Position video window (left side, 320x240px or similar)',
      '  - Add subtle shadow and glow effects',
      '',
      'Phase 3: Screen Share Panel Integration (4-5 hours)',
      '  - Create ScreenSharePanel.tsx component',
      '  - Import and render EnhancedCharts component inside panel',
      '  - Connect to existing orchestrationData from EVAAssistantPage',
      '  - Add panel header (title, controls)',
      '  - Implement Screen Capture API for future desktop sharing (stub for now)',
      '  - Test chart rendering and interactions within panel',
      '',
      'Phase 4: Meeting Controls Bar (4-5 hours)',
      '  - Create MeetingControlsBar.tsx component',
      '  - Implement transcript toggle button (show/hide transcript overlay)',
      '  - Add TranscriptOverlay.tsx component (real-time transcript display)',
      '  - Create VoiceWaveform.tsx component (animated bars synced to audio)',
      '  - Add meeting controls (start/end session, mic/camera toggle placeholders)',
      '  - Connect waveform to EVARealtimeVoice isListening/isSpeaking states',
      '  - Add keyboard shortcuts (Space for transcript toggle, M for mute)',
      '',
      'Phase 5: Session Management & Persistence (3-4 hours)',
      '  - Create eva_meeting_sessions table (session_id, start_time, end_time, metadata)',
      '  - Create eva_meeting_transcripts table (session_id, timestamp, speaker, text)',
      '  - Implement useMeetingSession() hook (start, end, store transcript)',
      '  - Connect to existing EVARealtimeVoice onTranscript callback',
      '  - Add session summary on meeting end (duration, transcript word count)',
      '  - Test database writes and retrieval',
      '',
      'Phase 6: Routing & Navigation (2-3 hours)',
      '  - Add /eva-meeting route to App routing',
      '  - Create navigation menu item in existing nav (AI & Automation category)',
      '  - Add "Start Meeting" button on EVAAssistantPage (link to meeting view)',
      '  - Implement breadcrumb navigation',
      '  - Test route transitions and deep linking',
      '',
      'Phase 7: Polish & Accessibility (3-4 hours)',
      '  - Refine translucent panel blur effects and opacity',
      '  - Add smooth transitions (fade-in, slide animations)',
      '  - Implement glow animations for active elements',
      '  - Test keyboard navigation (tab order, shortcuts)',
      '  - Add ARIA labels and screen reader announcements',
      '  - Test color contrast (WCAG AA compliance)',
      '  - Performance testing (ensure <2s load, 60fps animations)'
    ],

    dependencies: [
      'EXISTING EVARealtimeVoice component (voice interaction)',
      'EXISTING EnhancedCharts component (venture dashboards)',
      'EXISTING EVAOrchestrationDashboard data structures',
      'EXISTING EVAAssistantPage layout patterns',
      'EXISTING Supabase client and authentication',
      'EXISTING Tailwind CSS + design system',
      'React Query hooks pattern (already in use)',
      'Shadcn UI components (Card, Button, Badge, etc.)',
      'Recharts library (already installed)',
      'OpenAI Real-Time Voice API (already configured)',
      'WebRTC libraries (for future video streaming)',
      'Screen Capture API (browser native)'
    ],

    risks: [
      {
        description: 'Video/avatar performance may impact page load time',
        mitigation: 'Use optimized video formats (WebM, MP4), lazy load, and low file size placeholder',
        severity: 'medium',
        probability: 0.3
      },
      {
        description: 'Translucent panel effects may perform poorly on older hardware',
        mitigation: 'Provide fallback solid backgrounds, use CSS contain and will-change properties',
        severity: 'low',
        probability: 0.2
      },
      {
        description: 'Chart rendering in shared screen panel may have layout issues',
        mitigation: 'EnhancedCharts already responsive; test in panel context thoroughly',
        severity: 'low',
        probability: 0.15
      },
      {
        description: 'No real EVA video generation capability initially',
        mitigation: 'Use high-quality stock avatar video; document as phase 2 enhancement',
        severity: 'low',
        probability: 0.5
      }
    ],

    success_metrics: [
      'Meeting interface renders in <2 seconds on standard hardware',
      'EVA video window displays with professional avatar representation',
      'Shared screen panel shows live venture charts from EnhancedCharts',
      'Transcript toggle works instantly (<100ms response)',
      'Voice waveform animates at 60fps',
      'Session data persists to database with 100% reliability',
      '70%+ component code reuse achieved',
      'Accessibility audit passes WCAG 2.1 AA standards',
      'User feedback shows "professional" and "futuristic" impressions'
    ],

    metadata: {
      created_by: 'User request + PLAN Agent - Codebase Analysis',
      sequence_rank: 26,
      sub_agents_required: [
        'Senior Design Sub-Agent (UI/UX for meeting layout, futuristic design system)',
        'Principal Database Architect (meeting session schema, transcript storage)',
        'QA Engineering Director (testing strategy for WebRTC, screen sharing)',
        'Performance Engineering Lead (video/animation performance optimization)',
        'Principal Systems Analyst (component reusability analysis)'
      ],
      acceptance_testing_required: true,
      database_changes: true,
      estimated_effort: '23-30 hours (~4-5 sprints)',
      code_reuse_percentage: 70,

      user_vision_note: 'Futuristic Microsoft Teams-style meeting interface with EVA sharing screen',
      // User's vision
      user_vision: {
        primary_concept: 'Futuristic Microsoft Teams-style meeting with EVA sharing her screen',
        design_philosophy: 'Clean enterprise design, translucent panels, subtle glows, professional AI persona',
        layout: 'Video window (left) + Shared screen (right) + Control bar (bottom)',
        eva_representation: 'Professional female AI assistant, business attire, confident speaking',
        visual_elements: [
          'Translucent panels with backdrop blur',
          'Subtle glow effects on active elements',
          'Blue and white color palette',
          'Voice waveform indicators',
          'Real-time transcript toggle',
          'Live venture dashboard charts'
        ]
      },

      // 5 comprehensive prompts for implementation
      comprehensive_prompts: [
        {
          prompt_id: 1,
          title: 'UI/UX Design & Visual Specification',
          purpose: 'Define complete visual design language and layout structure',
          questions: [
            'Specify exact layout dimensions: video window size, screen share panel size, control bar height',
            'Define color palette: primary blue (hex values), white shades, accent colors for active states',
            'Specify translucent panel properties: backdrop blur radius, opacity values, border styling',
            'Detail glow effect specifications: color, intensity, spread radius, animation timing',
            'Design EVA avatar presentation: video window aspect ratio, professional attire description, speaking indicators',
            'Define responsive breakpoints: min/max widths for desktop optimization',
            'Specify accessibility requirements: color contrast ratios, focus indicators, keyboard navigation',
            'Detail animation specifications: transition durations, easing functions, hover/active state changes'
          ],
          deliverable: 'Complete design specification document with mockups and CSS property values'
        },
        {
          prompt_id: 2,
          title: 'Technical Architecture & Integration',
          purpose: 'Define technical implementation strategy integrating existing components',
          questions: [
            'Map component hierarchy: EVAMeetingPage > VideoWindow + ScreenSharePanel + ControlsBar',
            'Define state management: Which states live where? (session, transcript, speaking, charts)',
            'Specify WebRTC integration approach: libraries, connection flow, error handling',
            'Detail Screen Capture API implementation: browser compatibility, permissions, fallbacks',
            'Define integration with EVARealtimeVoice: event callbacks, state sharing, session coordination',
            'Specify session management: Supabase schema design, CRUD operations, RLS policies',
            'Plan real-time data sync: How charts update, how transcript flows, polling vs. subscriptions',
            'Define API endpoints needed: Any new edge functions? Or pure client-side?',
            'Specify performance optimizations: code splitting, lazy loading, memoization strategies',
            'Detail error handling: connection failures, permission denials, component load errors'
          ],
          deliverable: 'Technical architecture document with component diagrams and integration points'
        },
        {
          prompt_id: 3,
          title: 'Data Visualization & Dashboard Integration',
          purpose: 'Leverage EnhancedCharts for live venture dashboard in shared screen',
          questions: [
            'Identify which chart types to display: portfolio performance, stages, risk, AI metrics',
            'Define data sources: orchestrationData structure, real-time update mechanism',
            'Specify layout within screen share panel: grid structure, chart sizing, responsive behavior',
            'Design KPI card specifications: which metrics, styling, update frequency',
            'Plan interactive features: zoom, filter, drill-down capabilities',
            'Define data refresh intervals: real-time? 5s polling? Manual refresh only?',
            'Create mock data structure for development and testing',
            'Map orchestrationData patterns from EVAAssistantPage to meeting context',
            'Specify chart animation: entrance animations, data update transitions',
            'Define color coding: how different metric types use futuristic color palette'
          ],
          deliverable: 'Dashboard integration specification with data flow diagrams and mock data'
        },
        {
          prompt_id: 4,
          title: 'Voice/Video Controls & Transcript System',
          purpose: 'Design intuitive control interface with transcript and waveform visualization',
          questions: [
            'Specify control bar layout: button spacing, grouping (left/center/right), hierarchy',
            'Design voice waveform indicator: animation type, bar count, responsiveness to audio levels',
            'Define video control buttons: camera on/off, screen share toggle, icons and states',
            'Detail transcript toggle: button design, panel behavior (overlay vs. sidebar)',
            'Specify transcript display format: speaker labels ("You", "EVA"), timestamps, text styling',
            'Define real-time transcript mechanism: WebSocket? Polling? EventSource?',
            'Plan integration with EVARealtimeVoice transcription: onTranscript callback usage',
            'Specify accessibility features: keyboard shortcuts (Space, M, T), ARIA announcements',
            'Design visual feedback: active state indicators, hover effects, disabled states',
            'Define mobile-responsive adjustments: how controls adapt (or if desktop-only)'
          ],
          deliverable: 'Control interface specification with interaction flows and accessibility guidelines'
        },
        {
          prompt_id: 5,
          title: 'Reusability & Codebase Alignment Strategy',
          purpose: 'Maximize code reuse and maintain consistency with existing architecture',
          questions: [
            'Identify existing components to reuse: EVARealtimeVoice, EnhancedCharts, Card, Button, Badge',
            'Document design system elements: color variables, spacing scale, typography',
            'Find utility functions and hooks: useToast, useMeetingSession (create), useVoiceState',
            'Analyze API integration patterns: Supabase client usage, error handling, loading states',
            'Specify database schema extensions: eva_meeting_sessions, eva_meeting_transcripts tables',
            'Plan navigation integration: route definition (/eva-meeting), menu item placement',
            'Define component naming conventions: EVAMeeting* prefix for consistency',
            'Map file structure: /src/pages/EVAMeetingPage.tsx, /src/components/eva-meeting/',
            'Document shared type definitions: MeetingSession, MeetingTranscript, MeetingControls interfaces',
            'Review testing patterns: which tests to write (unit, integration, E2E)'
          ],
          deliverable: 'Component reusability matrix and integration checklist showing 70%+ reuse'
        }
      ],

      target_application_context: {
        implementation_path: '../ehg/',
        database: 'liapbndqlqxdcgpwntbv',
        github_repo: 'rickfelix/ehg.git',
        port: 8080,
        critical_check: 'MUST verify pwd shows ../ehg before ANY code changes!'
      },

      // Codebase alignment analysis
      codebase_alignment: {
        reusable_components: {
          EVARealtimeVoice: {
            location: '../ehg/src/components/eva/EVARealtimeVoice.tsx',
            lines: 760,
            capabilities: [
              'OpenAI Real-Time Voice integration',
              'Audio recording and playback',
              'Transcript generation (onTranscript callback)',
              'Speaking state management (isListening, isSpeaking)',
              'Session management with Supabase',
              'Function calling support'
            ],
            reuse_percentage: '100% - integrate as-is, extend with onTranscript for meeting transcript'
          },
          EVAAssistantPage: {
            location: '../ehg/src/pages/EVAAssistantPage.tsx',
            lines: 528,
            capabilities: [
              '3-column grid layout pattern (main + sidebar)',
              'Session management (start/end session)',
              'Message/conversation display',
              'Context panel patterns',
              'Cost monitoring display'
            ],
            reuse_percentage: '60% - reuse layout grid, session patterns, adapt for meeting view'
          },
          EnhancedCharts: {
            location: '../ehg/src/components/analytics/EnhancedCharts.tsx',
            lines: 455,
            capabilities: [
              'Recharts integration (Bar, Line, Area, Pie, Radial)',
              'Portfolio performance charts',
              'Venture stage distribution',
              'Risk assessment visualization',
              'AI performance metrics',
              'Chart selection dropdown',
              'Export functionality',
              'Responsive design'
            ],
            reuse_percentage: '95% - import and render in ScreenSharePanel with minimal wrapper'
          },
          EVAOrchestrationDashboard: {
            location: '../ehg/src/components/eva/EVAOrchestrationDashboard.tsx',
            lines: 460,
            capabilities: [
              'Session status cards',
              'Active agents display',
              'Communications tracking',
              'Agent icons and status badges',
              'Command interface',
              'Session objective input'
            ],
            reuse_percentage: '40% - reuse status card patterns, adapt for meeting sidebar'
          }
        },
        design_system_patterns: {
          color_palette: {
            primary: 'blue (primary, primary/20 for backgrounds)',
            secondary: 'muted, muted-foreground',
            accents: 'green (success), red (destructive), yellow (warning)',
            enterprise: 'bg-background, bg-card, border-border'
          },
          component_patterns: {
            cards: 'Card, CardHeader, CardTitle, CardContent from shadcn',
            buttons: 'Button with variants (outline, destructive, default)',
            badges: 'Badge with variants (default, secondary, outline)',
            layout: 'container mx-auto px-6 py-6 pattern',
            grid: 'grid grid-cols-1 lg:grid-cols-3 gap-6 pattern'
          },
          spacing_scale: 'gap-2, gap-4, gap-6 (0.5rem, 1rem, 1.5rem)',
          typography: 'text-sm, text-xs, text-2xl, font-bold, font-medium'
        },
        gaps_requiring_new_implementation: [
          'EVA video window component (NEW) - video/avatar display with speaking animation',
          'Screen share panel component (NEW) - wrapper for EnhancedCharts with controls',
          'Meeting controls bar (NEW) - comprehensive control interface',
          'Voice waveform visualization (NEW) - animated bars synced to audio',
          'Transcript overlay component (NEW) - real-time transcript display with toggle',
          'Translucent panel component (NEW) - backdrop blur styling',
          'Glow border effect (NEW) - active element highlighting',
          'Meeting session management (NEW) - database schema and hooks',
          'WebRTC video streaming (NEW) - for future real video capability',
          'Screen Capture API integration (NEW) - for desktop sharing',
          'Meeting route and navigation (NEW) - /eva-meeting route setup'
        ],
        technical_dependencies: [
          'WebRTC libraries: simple-peer or native WebRTC APIs',
          'Screen Capture API: navigator.mediaDevices.getDisplayMedia()',
          'Existing Supabase client (already configured)',
          'Existing OpenAI Real-Time Voice (via EVARealtimeVoice)',
          'Recharts (already installed: ^3.1.2)',
          'Tailwind CSS + shadcn UI (already configured)',
          'React Router (for /eva-meeting route)',
          'React hooks: useState, useEffect, useRef, custom hooks'
        ],
        estimated_file_structure: [
          '/src/pages/EVAMeetingPage.tsx (main page, ~300 lines)',
          '/src/components/eva-meeting/EVAVideoWindow.tsx (~150 lines)',
          '/src/components/eva-meeting/ScreenSharePanel.tsx (~180 lines)',
          '/src/components/eva-meeting/MeetingControlsBar.tsx (~200 lines)',
          '/src/components/eva-meeting/VoiceWaveform.tsx (~100 lines)',
          '/src/components/eva-meeting/TranscriptOverlay.tsx (~150 lines)',
          '/src/components/eva-meeting/TranslucentPanel.tsx (~80 lines)',
          '/src/components/eva-meeting/GlowBorder.tsx (~60 lines)',
          '/src/hooks/useMeetingSession.ts (~120 lines)',
          '/src/types/meeting.ts (type definitions, ~60 lines)',
          'Total estimated new code: ~1,400 lines',
          'Total reused code: ~3,300 lines (EVARealtimeVoice, EnhancedCharts, layout patterns)',
          'Reuse ratio: 70%'
        ]
      }
    }
  };

  // Insert SD into database
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating SD:', error);
    process.exit(1);
  }

  console.log('✅ SD-EVA-MEETING-001 Created Successfully!\n');
  console.log('📋 Strategic Directive Details:');
  console.log('   ID:', data.id);
  console.log('   Title:', data.title);
  console.log('   Status:', data.status);
  console.log('   Priority:', data.priority);
  console.log('   Target Application:', data.target_application);
  console.log('   Estimated Effort:', data.metadata.estimated_effort);
  console.log('   Code Reuse:', data.metadata.code_reuse_percentage + '%');
  console.log('\n🎯 Key Concept: Futuristic Meeting Interface');
  console.log('   Layout: Video Window (left) + Shared Screen (right) + Controls (bottom)');
  console.log('   Design: Translucent panels, subtle glows, blue/white palette');
  console.log('   Features: Real-time transcript, voice waveform, live dashboards');
  console.log('\n📍 Component Reuse Strategy:');
  console.log('   • EVARealtimeVoice: 100% reuse (voice interaction)');
  console.log('   • EnhancedCharts: 95% reuse (dashboard visualization)');
  console.log('   • EVAAssistantPage: 60% reuse (layout patterns)');
  console.log('   • EVAOrchestrationDashboard: 40% reuse (status cards)');
  console.log('\n🔍 5 Comprehensive Implementation Prompts:');
  console.log('   1. UI/UX Design & Visual Specification');
  console.log('   2. Technical Architecture & Integration');
  console.log('   3. Data Visualization & Dashboard Integration');
  console.log('   4. Voice/Video Controls & Transcript System');
  console.log('   5. Reusability & Codebase Alignment Strategy');
  console.log('\n📍 CRITICAL: Implementation Target');
  console.log('   Application: EHG (../ehg/)');
  console.log('   Database: liapbndqlqxdcgpwntbv');
  console.log('   GitHub: rickfelix/ehg.git');
  console.log('   Route: /eva-meeting');
  console.log('\n🎬 Estimated Implementation:');
  console.log('   New Code: ~1,400 lines');
  console.log('   Reused Code: ~3,300 lines');
  console.log('   Total Effort: 23-30 hours (4-5 sprints)');
  console.log('\n🚀 Next Steps:');
  console.log('   1. LEAD reviews strategic alignment and priority');
  console.log('   2. Execute 5 comprehensive prompts for detailed design');
  console.log('   3. PLAN creates comprehensive PRD with mockups');
  console.log('   4. EXEC implements in ../ehg/ (NOT EHG_Engineer!)');
  console.log('   5. Test meeting interface with real EVA voice sessions');
}

createStrategicDirective().catch(console.error);
