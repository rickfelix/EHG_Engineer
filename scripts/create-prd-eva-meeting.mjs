import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const prdContent = {
  title: "EVA Meeting Interface - Product Requirements Document",
  directive_id: "SD-EVA-MEETING-001",
  version: "1.0",
  
  executive_summary: `
# Executive Summary

Create a futuristic Microsoft Teams-style meeting interface featuring EVA (Executive Virtual Assistant) as a professional AI presenter. The interface integrates existing EVA voice capabilities with live venture dashboards to enable immersive, data-driven meetings guided by EVA.

**Key Innovation:** Unified meeting experience combining voice interaction, visual presentation, and real-time data visualization in an enterprise-grade futuristic design.

**Strategic Value:** Enables chairman and executives to conduct EVA-guided venture reviews with professional visual presentation, elevating EVA from voice-only assistant to full meeting presenter.

**Implementation Strategy:** 70% code reuse leveraging existing EVARealtimeVoice, EVAOrchestrationDashboard, and EnhancedCharts components. Phased delivery: Phase 1 (functional MVP), Phase 2 (futuristic polish).
  `.trim(),
  
  business_objectives: [
    "Create immersive meeting experience with EVA as visual presenter (Teams-style interface)",
    "Integrate existing voice (EVARealtimeVoice) + charts (EnhancedCharts) into unified interface",
    "Enable real-time screen sharing of venture dashboards during EVA conversations",
    "Establish futuristic design language: translucent panels, subtle glows, enterprise blue/white",
    "Provide transcript toggle for accessibility and review",
    "Achieve 70%+ component reuse by leveraging existing EVA infrastructure",
    "Meeting interface loads in <2s with smooth transitions and 60fps animations"
  ],
  
  success_metrics: [
    "Meeting interface renders in <2 seconds on standard hardware",
    "EVA video window displays with professional avatar representation",
    "Shared screen panel shows live venture charts from EnhancedCharts",
    "Transcript toggle works instantly (<100ms response)",
    "Voice waveform animates at 60fps",
    "Session preferences persist to database with 100% reliability",
    "70%+ component code reuse achieved",
    "Accessibility audit passes WCAG 2.1 AA standards",
    "User feedback shows 'professional' and 'futuristic' impressions"
  ],
  
  target_users: [
    "Chairman (primary) - Conducts EVA-guided venture reviews",
    "Executives - Participate in data-driven meetings with EVA",
    "Venture Partners - Review portfolio companies with EVA insights"
  ],
  
  user_stories: [
    {
      "id": "US-EVA-MEETING-001",
      "as_a": "Chairman",
      "i_want": "to start an EVA meeting with a single click",
      "so_that": "I can quickly begin a venture review session",
      "acceptance_criteria": [
        "Meeting page accessible from main navigation",
        "Protected route (requires authentication)",
        "Meeting interface loads in <2 seconds",
        "EVA voice activates automatically on page load",
        "Dashboard data loads concurrently with voice"
      ]
    },
    {
      "id": "US-EVA-MEETING-002",
      "as_a": "Executive",
      "i_want": "to see EVA's avatar while she speaks",
      "so_that": "I have a visual representation of the AI assistant",
      "acceptance_criteria": [
        "Left panel displays EVA avatar window",
        "Avatar styled as professional female business presenter",
        "Voice waveform animation syncs with audio",
        "Avatar maintains consistent styling throughout session"
      ]
    },
    {
      "id": "US-EVA-MEETING-003",
      "as_a": "Chairman",
      "i_want": "to view live venture dashboards while EVA speaks",
      "so_that": "I can follow along with data as EVA presents",
      "acceptance_criteria": [
        "Right panel displays EVAOrchestrationDashboard",
        "Charts update in real-time (EnhancedCharts integration)",
        "Dashboard responds to voice commands (existing EVA capability)",
        "Screen remains synchronized with EVA's narration"
      ]
    },
    {
      "id": "US-EVA-MEETING-004",
      "as_a": "Executive",
      "i_want": "to toggle transcript visibility during meeting",
      "so_that": "I can read along or review what EVA has said",
      "acceptance_criteria": [
        "Transcript toggle button in control bar",
        "Toggle responds in <100ms",
        "Transcript auto-scrolls to latest content",
        "Transcript saved if user enabled 'save_transcripts' preference"
      ]
    },
    {
      "id": "US-EVA-MEETING-005",
      "as_a": "Chairman",
      "i_want": "to configure meeting preferences",
      "so_that": "my settings persist across sessions",
      "acceptance_criteria": [
        "Settings accessible from ChairmanSettingsPage",
        "Video quality options: low, medium, high, auto",
        "Transcription options: enable/disable, save/don't save",
        "Voice settings: volume (0.0-1.0), speed (0.5-2.0)",
        "Preferences stored in user_eva_meeting_preferences table",
        "Preferences load on meeting start"
      ]
    },
    {
      "id": "US-EVA-MEETING-006",
      "as_a": "Executive",
      "i_want": "the meeting interface to look futuristic and professional",
      "so_that": "it reflects the advanced nature of EVA technology",
      "acceptance_criteria": [
        "Translucent panels with backdrop-blur effect",
        "Enterprise blue/white color palette",
        "Active elements have subtle glow animations",
        "Smooth transitions between states",
        "60fps animations (waveform, glows, transitions)"
      ]
    }
  ],
  
  features: [
    {
      "name": "Meeting Interface Container",
      "description": "Main component orchestrating video, screen sharing, and controls",
      "priority": "must_have",
      "phase": 1,
      "components": [
        "EVAMeetingInterface (main container)",
        "VideoPanel (left panel)",
        "ScreenSharePanel (right panel)",
        "ControlBar (bottom)"
      ]
    },
    {
      "name": "EVA Video Window",
      "description": "Left panel displaying EVA avatar with voice waveform",
      "priority": "must_have",
      "phase": 1,
      "components": [
        "EVAAvatarWindow (professional female avatar)",
        "VoiceWaveform (real-time animation at 60fps)"
      ],
      "reuses": ["EVARealtimeVoice (voice state management)"]
    },
    {
      "name": "Screen Sharing Panel",
      "description": "Right panel displaying live venture dashboards",
      "priority": "must_have",
      "phase": 1,
      "components": [
        "ScreenSharePanel (container)"
      ],
      "reuses": [
        "EVAOrchestrationDashboard (394 LOC)",
        "EnhancedCharts (457 LOC)"
      ]
    },
    {
      "name": "Meeting Controls",
      "description": "Bottom control bar with transcript toggle and meeting actions",
      "priority": "must_have",
      "phase": 1,
      "components": [
        "TranscriptToggle",
        "VoiceIndicator",
        "MeetingControls (mute, end meeting)"
      ]
    },
    {
      "name": "Settings Integration",
      "description": "Meeting preferences in ChairmanSettingsPage",
      "priority": "must_have",
      "phase": 1,
      "components": [
        "EVAMeetingPreferencesSection"
      ],
      "database": ["user_eva_meeting_preferences table"]
    },
    {
      "name": "Futuristic Styling",
      "description": "Translucent panels, glows, animations",
      "priority": "nice_to_have",
      "phase": 2,
      "styling": [
        "Glass morphism (backdrop-filter: blur)",
        "Glow animations (box-shadow with transitions)",
        "Enterprise blue/white palette",
        "Smooth state transitions"
      ]
    }
  ],
  
  technical_specifications: {
    "architecture": {
      "pattern": "Component orchestration with existing building blocks",
      "main_component": "EVAMeetingInterface (~500 LOC)",
      "reused_components": [
        "EVARealtimeVoice (148 LOC) - Voice management",
        "EVAOrchestrationDashboard (394 LOC) - Dashboard display",
        "EnhancedCharts (457 LOC) - Chart rendering"
      ],
      "code_reuse_percentage": "66.6% (target: 70%)"
    },
    "tech_stack": {
      "framework": "React 18",
      "styling": "Tailwind CSS + Shadcn UI components",
      "state_management": "React hooks (useState, useEffect, useContext)",
      "voice": "OpenAI Real-Time Voice API (via EVARealtimeVoice)",
      "database": "Supabase PostgreSQL",
      "charts": "Recharts (via EnhancedCharts)"
    },
    "database_schema": {
      "table": "user_eva_meeting_preferences",
      "migration": "supabase/migrations/20250110000001_create_eva_meeting_preferences.sql",
      "rls_policies": [
        "Users can view own preferences",
        "Users can insert own preferences",
        "Users can update own preferences",
        "Users can delete own preferences"
      ]
    },
    "routing": {
      "path": "/eva-meeting",
      "component": "EVAMeetingPage",
      "protection": "ProtectedRoute (Supabase Auth)"
    },
    "performance_targets": {
      "initial_load": "<2 seconds",
      "waveform_fps": "60fps",
      "transcript_toggle": "<100ms",
      "dashboard_updates": "real-time (<500ms)"
    }
  },
  
  acceptance_criteria: [
    "Meeting interface accessible at /eva-meeting route (protected)",
    "EVA voice activates on page load with waveform visualization",
    "Dashboard displays live venture data in screen sharing panel",
    "Transcript toggle works with <100ms response time",
    "Preferences persist to database and load on session start",
    "Settings page includes EVA Meeting Preferences section",
    "Component code reuse achieves 70% target",
    "Initial load completes in <2 seconds",
    "All animations run at 60fps (waveform, transitions)",
    "WCAG 2.1 AA accessibility standards met",
    "E2E tests pass for all 6 user stories",
    "Database migration applies without errors"
  ],
  
  test_plan: {
    "unit_tests": [
      "EVAMeetingInterface component rendering",
      "Preferences save/load from database",
      "Transcript toggle state management",
      "Voice waveform animation logic",
      "Settings form validation"
    ],
    "e2e_tests": [
      {
        "test": "US-EVA-MEETING-001: Start meeting",
        "scenario": "User clicks EVA Meeting nav link, meeting interface loads in <2s, voice activates"
      },
      {
        "test": "US-EVA-MEETING-002: EVA avatar display",
        "scenario": "Avatar window visible in left panel, waveform animates when EVA speaks"
      },
      {
        "test": "US-EVA-MEETING-003: Live dashboard",
        "scenario": "Dashboard displays in right panel, charts update in real-time"
      },
      {
        "test": "US-EVA-MEETING-004: Transcript toggle",
        "scenario": "Click transcript toggle, transcript appears/disappears in <100ms"
      },
      {
        "test": "US-EVA-MEETING-005: Preferences persist",
        "scenario": "Change settings, reload page, settings still applied"
      },
      {
        "test": "US-EVA-MEETING-006: Futuristic styling",
        "scenario": "Verify translucent panels, glow effects, smooth animations"
      }
    ],
    "accessibility_tests": [
      "Keyboard navigation for all controls",
      "ARIA labels for voice waveform",
      "Screen reader announcements for transcript updates",
      "High contrast mode support"
    ],
    "performance_tests": [
      "Page load time <2 seconds",
      "Waveform animation FPS measurement (target 60fps)",
      "Transcript toggle response time (target <100ms)",
      "Database query performance (<100ms)"
    ]
  },
  
  dependencies: [
    "EVARealtimeVoice component (existing)",
    "EVAOrchestrationDashboard component (existing)",
    "EnhancedCharts component (existing)",
    "ChairmanSettingsPage (existing)",
    "Supabase Auth (existing)",
    "OpenAI Real-Time Voice API (existing integration)",
    "Shadcn UI components (existing)",
    "Database migration must be applied before implementation"
  ],
  
  risks_and_mitigation: [
    {
      "risk": "OpenAI API cost overruns",
      "severity": "medium",
      "mitigation": "Implement 1-hour session time limit, track API usage per user"
    },
    {
      "risk": "Animation performance on low-end devices",
      "severity": "low",
      "mitigation": "Use CSS GPU acceleration, provide 'low quality' video setting"
    },
    {
      "risk": "Database migration conflicts",
      "severity": "low",
      "mitigation": "Test migration in dev environment first, rollback script included"
    }
  ],
  
  phased_delivery: {
    "phase_1": {
      "name": "Functional MVP",
      "duration": "8 hours",
      "priority": "must_have",
      "deliverables": [
        "Meeting interface layout (2-panel: video + dashboard)",
        "Voice integration (reuse EVARealtimeVoice)",
        "Dashboard integration (reuse EVAOrchestrationDashboard)",
        "Basic controls (transcript toggle, mute, end meeting)",
        "Settings integration (preferences storage)",
        "Database migration applied",
        "E2E tests for core functionality"
      ]
    },
    "phase_2": {
      "name": "Futuristic Polish",
      "duration": "5 hours",
      "priority": "nice_to_have",
      "deliverables": [
        "Futuristic styling (translucent panels, glows)",
        "Voice waveform animation (60fps)",
        "EVA avatar visual (professional representation)",
        "Advanced animations and transitions",
        "Performance optimization"
      ]
    }
  },
  
  out_of_scope: [
    "Meeting history tracking (deferred to SD-EVA-MEETING-HISTORY)",
    "Meeting recording functionality (deferred to SD-EVA-MEETING-RECORDING)",
    "Meeting analytics dashboard (deferred to SD-EVA-MEETING-ANALYTICS)",
    "Multi-participant meetings (single user only)",
    "Video streaming (avatar only, not webcam)",
    "Screen recording or screenshot capture"
  ]
};

async function createPRD() {
  console.log('Creating PRD for SD-EVA-MEETING-001...\n');
  
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert([{
      directive_id: prdContent.directive_id,
      title: prdContent.title,
      version: prdContent.version,
      executive_summary: prdContent.executive_summary,
      business_objectives: prdContent.business_objectives,
      success_metrics: prdContent.success_metrics,
      target_users: prdContent.target_users,
      features: prdContent.features,
      technical_specifications: prdContent.technical_specifications,
      acceptance_criteria: prdContent.acceptance_criteria,
      test_plan: prdContent.test_plan,
      dependencies: prdContent.dependencies,
      risks_and_mitigation: prdContent.risks_and_mitigation,
      story_points: 13,
      estimated_hours: 13,
      status: 'approved'
    }])
    .select();
  
  if (error) {
    console.error('Error creating PRD:', error.message);
    process.exit(1);
  }
  
  if (data && data.length > 0) {
    console.log('✅ PRD Created Successfully');
    console.log('PRD ID:', data[0].id);
    console.log('Title:', data[0].title);
    console.log('Directive ID:', data[0].directive_id);
    console.log('Story Points:', data[0].story_points);
    console.log('Status:', data[0].status);
  }
}

createPRD().catch(console.error);
