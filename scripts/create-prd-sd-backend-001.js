/**
 * Create PRD: SD-BACKEND-001 - Critical UI Stub Completion
 *
 * PLAN Phase: Technical design and comprehensive test plans
 * Database-first: Store in prds table (NOT as file per LEO Protocol v4.2.0)
 *
 * Approved Scope (LEAD):
 * - EVA Realtime Voice (80-120h) - UD: 8/10, BV: 9/10
 * - Chairman Export PDF (40-60h) - UD: 9/10, BV: 8/10
 * - Architecture & Planning (40-60h)
 * - Testing & Deployment (20-40h)
 * Total: 180-280h
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { createPRDLink } from '../lib/sd-helpers.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY
);

const PRD_CONTENT = {
  title: 'SD-BACKEND-001: Critical UI Stub Completion - EVA Voice & PDF Export',

  executive_summary: `Transform 2 critical non-functional UI stubs into fully operational features. Currently users see functional-looking buttons that do nothing, creating trust issues and competitive disadvantage.

**Features in Scope** (LEAD Approved):
1. EVA Realtime Voice (80-120h) - WebRTC + OpenAI Realtime API
2. Chairman Export PDF (40-60h) - Puppeteer chart rendering

**Business Impact**: Fixes false advertising, restores user trust, achieves competitive parity on voice AI and executive reporting.

**Out of Scope** (Deferred to SD-BACKEND-001A/B):
- Excel Export (UD: 5/10, client-side workaround available)
- Dashboard Customization (UD: 4/10, default layout sufficient)`,

  business_context: // FIX: Renamed from problem_statement `**Current State (Critical UX Failures)**:

**EVA Realtime Voice Stub**:
- Location: src/components/eva/EVARealtimeVoice.tsx (52 LOC)
- UI exists: Button with visual states (listening/stopped)
- Backend: ZERO functionality (comment: "Voice functionality will be implemented here")
- User Experience: Click microphone → "Listening..." displayed → nothing happens
- Business Impact: AI differentiation feature advertised but non-functional

**Chairman Dashboard Export Stub**:
- Location: src/components/venture/ChairmanDashboard.tsx:189-202
- UI exists: "Export Report" button with icon
- Backend: TODO comment "Implement Export Report functionality"
- User Experience: Click Export → nothing happens, no error message
- Business Impact: Executive cannot export reports for board meetings

**Root Causes**:
1. Frontend-first development (UI built before backend requirements)
2. Incomplete sprints (features started but not completed)
3. No integration testing (stubs not caught in QA)

**User Pain Points**:
- Trust erosion (false expectations from non-functional UI)
- Executive frustration (cannot export critical reports)
- Competitive disadvantage (competitors have working voice AI)
- User churn risk (discover features don't work)`,

  target_users: `**Primary Users**:

1. **Executives/Chairman** (High Priority)
   - Need: Export dashboard as PDF for board presentations
   - Frequency: Weekly (board prep), Monthly (stakeholder reports)
   - Technical Skill: Low-Medium (expects click-and-download)
   - Success Metric: <5 seconds to generate professional PDF with charts

2. **Power Users** (Medium Priority)
   - Need: Voice interface for faster interaction with EVA
   - Frequency: Daily (complex queries, hands-free operation)
   - Technical Skill: Medium-High (comfortable with voice AI)
   - Success Metric: >95% STT accuracy, <200ms latency

3. **Mobile Users** (Medium Priority)
   - Need: Voice interface for on-the-go access
   - Frequency: Weekly (travel, remote work)
   - Technical Skill: Medium (familiar with mobile voice assistants)
   - Success Metric: Works on mobile browsers (iOS Safari, Android Chrome)`,

  user_stories: `**Epic 1: EVA Realtime Voice**

**US-001: Start Voice Session**
- As a user, I want to click the microphone icon to start voice input
- So that I can interact with EVA hands-free
- Acceptance Criteria:
  - Click microphone → WebSocket connection established in <1 second
  - Visual feedback (button changes to "Listening...", pulsing animation)
  - Error handling (connection failure shows clear message)
  - HTTPS requirement communicated to user if not met

**US-002: Speak and See Real-time Transcript**
- As a user, I want to see my speech transcribed in real-time
- So that I can verify EVA is understanding me correctly
- Acceptance Criteria:
  - Partial transcripts appear as I speak (<100ms latency)
  - Final transcript displayed when I pause
  - Transcript accuracy >95% (Word Error Rate <5%)
  - Handles background noise gracefully (show "unclear" if needed)

**US-003: Receive EVA Response**
- As a user, I want EVA to process my voice query and respond
- So that I can get answers without typing
- Acceptance Criteria:
  - Transcript sent to EVA backend for processing
  - Response displayed in chat interface
  - Voice response playback (if TTS implemented - future enhancement)
  - Session history persisted (database: voice_sessions table)

**US-004: Stop Voice Session**
- As a user, I want to stop the voice session when done
- So that I can conserve resources and return to text input
- Acceptance Criteria:
  - Click "Stop" button → WebSocket disconnected gracefully
  - Visual feedback (button returns to microphone icon)
  - Session metadata saved (duration, transcript count)
  - Audio stream stopped (no continued recording)

**Epic 2: Chairman Export PDF**

**US-005: Export Dashboard as PDF**
- As a chairman, I want to export the current dashboard view as PDF
- So that I can include it in board presentations
- Acceptance Criteria:
  - Click "Export Report" → PDF generation starts (<5 seconds)
  - Loading indicator shows progress
  - PDF includes: Executive summary, KPIs, charts (rendered from Recharts)
  - Professional formatting (company logo, page numbers, date)

**US-006: Download Generated PDF**
- As a chairman, I want to download the PDF immediately
- So that I can use it in my presentation without delay
- Acceptance Criteria:
  - PDF downloads automatically (Content-Type: application/pdf)
  - Filename includes date/time (chairman-dashboard-2025-10-03.pdf)
  - File size <5MB for standard report
  - Charts are high-resolution (vector or 300dpi raster)

**US-007: Verify PDF Quality**
- As a chairman, I want the PDF to be presentation-ready
- So that I don't need to edit it before sharing
- Acceptance Criteria:
  - Charts match dashboard exactly (colors, labels, data)
  - Text is readable (minimum 10pt font)
  - Multi-page support (auto page break for long reports)
  - Header/footer with company branding`,

  system_architecture: // FIX: Renamed from technical_architecture `**System Architecture Overview**:

┌─────────────────────────────────────────────────────────────┐
│                     Browser (Client)                        │
│  ┌────────────────┐              ┌──────────────────────┐  │
│  │ EVARealtimeVoice│              │ ChairmanDashboard    │  │
│  │   Component     │              │   Component          │  │
│  │   (React)       │              │   (React + Recharts) │  │
│  └────────┬────────┘              └─────────┬────────────┘  │
│           │                                 │               │
│           │ WebSocket                       │ HTTPS POST    │
│           │ (audio stream)                  │ (dashboard data)
│           │                                 │               │
└───────────┼─────────────────────────────────┼───────────────┘
            │                                 │
            ▼                                 ▼
┌───────────────────────────────────────────────────────────┐
│                   EHG Backend (Node.js)                   │
│  ┌─────────────────────┐      ┌──────────────────────┐  │
│  │ WebSocket Server    │      │ PDF Export Service   │  │
│  │ (Socket.io)         │      │ (Puppeteer + React   │  │
│  │ - Audio buffering   │      │  Server-Side         │  │
│  │ - Format conversion │      │  Rendering)          │  │
│  └──────────┬──────────┘      └─────────┬────────────┘  │
│             │                           │               │
│             │ HTTPS POST                │ HTTPS POST    │
│             │ (audio chunks)            │ (HTML/CSS)    │
│             │                           │               │
│             ▼                           ▼               │
│  ┌─────────────────────┐      ┌──────────────────────┐  │
│  │ OpenAI Realtime API │      │ Puppeteer Renderer   │  │
│  │ (Whisper-1 STT)     │      │ (HTML → PDF)         │  │
│  └──────────┬──────────┘      └─────────┬────────────┘  │
│             │                           │               │
└─────────────┼───────────────────────────┼───────────────┘
              │                           │
              ▼                           ▼
     ┌─────────────────┐        ┌──────────────────┐
     │ voice_sessions  │        │  export_logs     │
     │ (Supabase)      │        │  (Supabase)      │
     │ - transcript    │        │  - file_url      │
     │ - timestamps    │        │  - generated_at  │
     └─────────────────┘        └──────────────────┘

**Technology Stack**:

**EVA Voice**:
- Frontend: MediaRecorder API (WebRTC audio capture), WebSocket client
- Transport: WebSocket (Socket.io) for real-time bidirectional communication
- Backend: Node.js WebSocket server, audio buffering
- STT: OpenAI Realtime API (Whisper-1 model)
- Audio Format: Browser WebM → WAV 16kHz mono (OpenAI compatible)
- Database: voice_sessions table (user_id, audio_data, transcript, latency_ms)

**PDF Export**:
- Frontend: Recharts (existing dashboard charts)
- Backend: Puppeteer (headless Chrome for rendering)
- Rendering: React Server-Side Rendering (same components as dashboard)
- Output: Binary PDF (application/pdf), vector charts preferred
- Database: export_logs table (user_id, report_type, file_size, duration_ms)`,

  api_specifications: `**API Endpoints (OpenAPI 3.0)**:

**WebSocket: /ws/voice**
- Protocol: WebSocket (wss:// for HTTPS)
- Authentication: JWT token in initial handshake
- Events:
  - Client → Server: 'audio_chunk' (binary audio data, WebM format)
  - Server → Client: 'partial_transcript' (string, real-time)
  - Server → Client: 'final_transcript' (string, end of utterance)
  - Server → Client: 'error' (object with error message)
- Rate Limiting: 100 requests/minute per user
- Session Timeout: 5 minutes of inactivity

**POST /api/dashboard/export**
- Request Body:
  {
    "dashboard_config": {
      "kpis": ["revenue", "ventures", "roi"],
      "charts": ["revenue_trend", "venture_distribution"],
      "date_range": { "start": "2025-01-01", "end": "2025-10-03" }
    },
    "format": "pdf"  // Only PDF in scope (Excel deferred)
  }
- Response: Binary PDF file
  - Content-Type: application/pdf
  - Content-Disposition: attachment; filename="chairman-dashboard-2025-10-03.pdf"
- Authentication: JWT token in Authorization header
- Rate Limiting: 10 requests/hour per user (PDF generation is expensive)
- Timeout: 30 seconds (fail if exceeds)

**Database Schema**:

**voice_sessions** (Supabase table):
- id: UUID PRIMARY KEY
- user_id: UUID REFERENCES users(id)
- session_start: TIMESTAMPTZ
- session_end: TIMESTAMPTZ
- transcript: TEXT
- audio_duration_seconds: INTEGER
- latency_p50_ms: INTEGER
- latency_p95_ms: INTEGER
- stt_accuracy: DECIMAL(5,2)  // Percentage
- created_at: TIMESTAMPTZ
- RLS Policy: Users can only read/write their own sessions

**export_logs** (Supabase table):
- id: UUID PRIMARY KEY
- user_id: UUID REFERENCES users(id)
- report_type: TEXT  // 'dashboard_pdf'
- file_url: TEXT  // Supabase Storage URL (if stored)
- file_size_bytes: INTEGER
- generation_duration_ms: INTEGER
- num_charts: INTEGER
- num_pages: INTEGER
- created_at: TIMESTAMPTZ
- RLS Policy: Users can only read their own export logs`,

  implementation_plan: `**Phase 1: Architecture & Planning (Week 1) - 40-60h** ✅ PLAN Phase

1. Finalize API specifications (OpenAPI/Swagger documentation)
2. Design database schema (voice_sessions, export_logs)
3. Create architecture diagrams (data flow, component interaction)
4. Set up development environment (WebSocket server, Puppeteer)
5. Define performance targets and testing strategy

**Phase 2: EVA Voice Backend - Audio Streaming (Week 2) - 20-30h**

6. Implement WebSocket server (Socket.io, audio buffering)
7. Add audio format conversion (WebM → WAV 16kHz mono)
8. Test audio capture and transmission (local dev environment)
9. Implement error handling and reconnection logic
10. Load testing (10 concurrent voice sessions)

**Phase 3: EVA Voice Backend - STT Integration (Week 3) - 30-40h**

11. Integrate OpenAI Realtime API (Whisper-1 model)
12. Implement streaming transcription processing
13. Handle partial and final transcripts
14. Optimize for low latency (buffering strategy, WebSocket keepalive)
15. Measure and log performance metrics (latency, accuracy)

**Phase 4: EVA Voice Frontend Integration (Week 4) - 30-50h**

16. Update EVARealtimeVoice component with WebSocket client
17. Implement audio recording with MediaRecorder API
18. Add real-time transcript display (UI update on partial transcripts)
19. Add loading states, error messages, user feedback
20. Remove placeholder comment at line 20
21. E2E testing (record → transcript → verify accuracy)

**Phase 5: Chairman Export - PDF Generation (Week 5) - 40-60h**

22. Implement PDF generation service (Puppeteer, React SSR)
23. Create report templates (executive summary, KPIs, charts)
24. Build POST /api/dashboard/export endpoint
25. Add chart rendering pipeline (Recharts → HTML/CSS → PDF)
26. Implement download delivery (binary PDF stream)
27. Remove TODO comment at ChairmanDashboard.tsx:189

**Phase 6: Testing & Deployment (Week 6) - 20-40h**

28. E2E testing (Playwright tests for both features)
29. Performance testing (voice latency, PDF generation speed)
30. Load testing (k6 scripts: 100 concurrent voice, 50 concurrent exports)
31. Security audit (authentication, data encryption, RLS policies)
32. Production deployment with monitoring (Datadog, Sentry)
33. Feature flags for phased rollout (10% → 50% → 100%)`,

  testing_strategy: `**Test Categories**:

**1. Unit Tests** (Jest):
- Audio buffering logic (correct chunk sizes, format conversion)
- PDF generation functions (template rendering, chart export)
- Database operations (voice_sessions CRUD, export_logs CRUD)
- Target: >80% code coverage for business logic

**2. Integration Tests** (Jest + Supertest):
- WebSocket communication (client ↔ server message flow)
- OpenAI API integration (mock API responses, error handling)
- Puppeteer PDF generation (HTML input → PDF output)
- Database integration (Supabase RLS policy enforcement)
- Target: All API endpoints and WebSocket events tested

**3. End-to-End Tests** (Playwright):

**E2E-001: EVA Voice Complete Flow**
- Navigate to EVA interface
- Click microphone button
- Grant microphone permissions (automated)
- Speak test phrase: "Show me venture performance metrics"
- Verify partial transcript appears in <200ms
- Verify final transcript matches input (>95% accuracy)
- Verify EVA response displayed
- Click stop button
- Verify session saved in voice_sessions table

**E2E-002: Chairman PDF Export Complete Flow**
- Login as chairman user
- Navigate to Chairman Dashboard
- Verify charts loaded (Recharts components rendered)
- Click "Export Report" button
- Verify loading indicator appears
- Wait for PDF download (max 5 seconds)
- Verify PDF file downloaded (check Downloads folder)
- Open PDF, verify:
  - Executive summary present
  - All KPI cards rendered
  - Charts match dashboard exactly (visual regression)
  - Page numbers and company logo present

**E2E-003: Error Handling**
- Test voice with no microphone permission (verify error message)
- Test voice with network disconnection (verify reconnect)
- Test PDF export with timeout (verify error message)
- Test PDF export with large dataset (>100 charts, verify pagination)

**4. Performance Tests** (k6):

**PERF-001: Voice Latency**
- Metric: Time from audio chunk sent → partial transcript received
- Target: p50 <50ms, p95 <200ms, p99 <500ms
- Load: 100 concurrent voice sessions
- Duration: 5 minutes sustained
- Pass Criteria: 95% of requests meet latency targets

**PERF-002: PDF Export Speed**
- Metric: Time from API request → PDF download complete
- Target: <5 seconds for standard report (10 charts, 5 KPIs)
- Load: 50 concurrent export requests
- Duration: 2 minutes
- Pass Criteria: 90% of requests <5 seconds, 100% <15 seconds

**PERF-003: Voice Session Capacity**
- Metric: Maximum concurrent voice sessions before degradation
- Target: >100 concurrent sessions with <200ms p95 latency
- Test: Ramp up from 10 → 200 sessions over 10 minutes
- Pass Criteria: Identify breaking point, ensure >100 sessions supported

**5. Security Tests**:

**SEC-001: WebSocket Authentication**
- Verify JWT token required for WebSocket connection
- Verify invalid token rejected (403 Unauthorized)
- Verify expired token rejected (401 Unauthorized)

**SEC-002: API Endpoint Security**
- Verify HTTPS required (HTTP requests redirected)
- Verify CORS configured (only allowed origins)
- Verify rate limiting enforced (429 Too Many Requests after limit)

**SEC-003: Data Encryption**
- Verify audio data encrypted in transit (TLS 1.2+)
- Verify PDF files encrypted at rest (if stored in Supabase Storage)
- Verify RLS policies prevent unauthorized data access

**SEC-004: Input Validation**
- Verify audio chunk size limits (reject >10MB chunks)
- Verify dashboard_config validation (reject malformed JSON)
- Verify SQL injection prevention (parameterized queries)

**6. Acceptance Testing** (Manual QA):

**UAT-001: Voice Quality with Real Accents**
- Test with diverse accents (US, UK, Indian, Australian)
- Test with background noise (office chatter, traffic)
- Test with different speaking speeds (fast, slow, normal)
- Pass Criteria: >95% accuracy across all test cases

**UAT-002: PDF Visual Quality**
- Print PDF and verify readability
- Test with different chart types (line, bar, pie, scatter)
- Test with large datasets (50+ data points per chart)
- Pass Criteria: Professional quality, no visual artifacts

**7. Regression Tests** (Automated):
- Verify existing dashboard functionality not broken
- Verify other EVA features (text chat) still work
- Verify performance of unmodified features unchanged
- Run full E2E suite on every PR`,

  performance_targets: `**Voice Feature**:
- Latency (p50): <50ms (audio chunk → partial transcript)
- Latency (p95): <200ms
- Latency (p99): <500ms
- STT Accuracy: >95% (Word Error Rate <5%)
- Concurrent Sessions: >100 users simultaneously
- Session Timeout: 5 minutes of inactivity
- Audio Quality: 16kHz mono, <128kbps bitrate

**PDF Export Feature**:
- Standard Report (<10 charts): <5 seconds
- Large Report (50 charts): <15 seconds
- File Size: <5MB for standard report
- Chart Resolution: Vector (preferred) or 300dpi raster
- Concurrent Exports: >50 simultaneous requests
- Success Rate: >99% (exclude user errors)

**Infrastructure**:
- Uptime: >99.9% (SLA)
- Error Rate: <0.1%
- Database Query Time: <100ms p95
- API Response Time: <500ms p95`,

  security_requirements: `**Authentication & Authorization**:
- JWT token required for all API endpoints and WebSocket
- Token expiration: 1 hour (refresh token: 30 days)
- RLS policies enforce user_id foreign key constraints
- Admin users cannot access other users' voice sessions or export logs

**Data Encryption**:
- TLS 1.2+ for all HTTPS/WSS connections
- Audio data encrypted in transit (WebSocket TLS)
- PDF files encrypted at rest (Supabase Storage AES-256)
- Database connections use SSL (Supabase connection pooler)

**Input Validation**:
- Audio chunk size limit: 10MB per chunk
- Rate limiting: 100 voice requests/min, 10 export requests/hour
- SQL injection prevention: Parameterized queries only
- XSS prevention: Sanitize user input (transcript display)

**Audit & Compliance**:
- Log all voice sessions (transcript, duration, user_id)
- Log all export requests (report type, file size, user_id)
- Retain logs for 90 days (compliance requirement)
- GDPR compliance: User can delete own voice_sessions data`,

  dependencies: `**External Services**:
- OpenAI Realtime API (Whisper-1 model) - STT service
- Supabase (Database, Storage, Authentication, RLS)
- Puppeteer (Headless Chrome for PDF rendering)

**NPM Libraries**:
- socket.io (WebSocket server/client)
- puppeteer (PDF generation)
- recharts (charts - already in use)
- @supabase/supabase-js (database client - already in use)

**Browser Requirements**:
- Chrome 80+, Firefox 75+, Safari 14+ (WebRTC MediaRecorder support)
- HTTPS required (WebRTC mandatory)
- Microphone permission required (user prompt)

**Infrastructure**:
- Node.js 18+ (ES modules, WebSocket support)
- WebSocket clustering (Socket.io Redis adapter for horizontal scaling)
- Supabase connection pooler (database connection management)`,

  risks: // FIX: Renamed from risks_and_mitigations `**Technical Risks**:

**HIGH: Voice Latency Exceeds 200ms p95**
- Probability: 40%
- Impact: Poor UX, users prefer typing
- Mitigation:
  - Optimize audio buffering (reduce chunk size to 100ms)
  - Use WebSocket keepalive to prevent reconnects
  - CDN for WebSocket endpoint (reduce network latency)
  - Load test early, identify bottlenecks
- Contingency: Set expectation in UI ("Voice may have delay on slow networks")

**HIGH: STT Accuracy Below 95%**
- Probability: 30%
- Impact: Frustrating UX, incorrect transcripts
- Mitigation:
  - Test with diverse accents and noise profiles
  - Add noise cancellation (Web Audio API)
  - Clear error messages when accuracy low
  - Provide transcript editing option
- Contingency: Add disclaimer ("Voice accuracy may vary")

**MEDIUM: PDF Chart Rendering Complexity**
- Probability: 25%
- Impact: Implementation delays, chart formatting issues
- Mitigation:
  - Use Puppeteer established pattern (headless Chrome)
  - Test with sample charts early
  - Fallback to raster images if vector fails
- Contingency: Limit chart types in MVP (line, bar only)

**MEDIUM: Concurrent Users Scaling**
- Probability: 20%
- Impact: Performance degradation, service outages
- Mitigation:
  - Load testing with k6 (100+ concurrent sessions)
  - Horizontal scaling with WebSocket clustering
  - Rate limiting per user
- Contingency: Queue system for PDF exports if overload

**LOW: Scope Creep**
- Probability: 15%
- Impact: Timeline delays, budget overrun
- Mitigation:
  - Fixed scope per LEAD approval (Voice + PDF only)
  - Document out-of-scope requests (Excel, TTS) for future SDs
  - PLAN enforces boundary management
- Contingency: Defer new features to SD-BACKEND-001A/B`,

  acceptance_criteria: `**Feature Complete Criteria**:

**EVA Realtime Voice**:
- ✅ User can start voice session (click microphone button)
- ✅ User sees real-time partial transcripts (<200ms latency)
- ✅ User sees final transcript when pausing
- ✅ User can stop voice session (click stop button)
- ✅ Session saved in voice_sessions table
- ✅ STT accuracy >95% (tested with diverse accents)
- ✅ Error handling (no mic permission, network failure)
- ✅ E2E test passing (Playwright)
- ✅ Performance test passing (100 concurrent sessions)
- ✅ Security test passing (JWT authentication, TLS encryption)
- ✅ Placeholder comment removed at EVARealtimeVoice.tsx:20

**Chairman Export PDF**:
- ✅ User can export dashboard as PDF (click Export Report button)
- ✅ PDF generated in <5 seconds (standard report)
- ✅ PDF downloads automatically with correct filename
- ✅ PDF includes: Executive summary, KPIs, charts
- ✅ Charts match dashboard exactly (visual regression test)
- ✅ Professional formatting (logo, page numbers, date)
- ✅ Saved in export_logs table
- ✅ E2E test passing (Playwright)
- ✅ Performance test passing (50 concurrent exports)
- ✅ Security test passing (JWT authentication, rate limiting)
- ✅ TODO comment removed at ChairmanDashboard.tsx:189

**General**:
- ✅ All unit tests passing (>80% coverage)
- ✅ All integration tests passing
- ✅ All E2E tests passing
- ✅ Performance targets met (latency, speed)
- ✅ Security audit complete (no critical vulnerabilities)
- ✅ Production deployment successful
- ✅ Monitoring enabled (Datadog, Sentry)
- ✅ Documentation complete (API docs, user guides)`,

  rollout_plan: `**Phased Rollout Strategy**:

**Phase 1: Internal Testing (Week 7)**
- Audience: Development team, QA team (10 users)
- Feature Flag: 0% (manual enable for test users)
- Duration: 1 week
- Success Criteria:
  - No critical bugs
  - Performance targets met
  - Security audit passed

**Phase 2: Beta Release (Week 8)**
- Audience: Power users, early adopters (10% of user base)
- Feature Flag: 10%
- Duration: 1 week
- Success Criteria:
  - User feedback positive (>4/5 rating)
  - Error rate <0.5%
  - No service degradation for other features

**Phase 3: Limited Release (Week 9)**
- Audience: All active users (50% of user base)
- Feature Flag: 50%
- Duration: 1 week
- Success Criteria:
  - Scalability confirmed (>100 concurrent voice sessions)
  - Performance targets maintained
  - User adoption >20% (20% of enabled users try feature)

**Phase 4: General Availability (Week 10)**
- Audience: All users (100%)
- Feature Flag: 100%
- Duration: Ongoing
- Success Criteria:
  - >50% user adoption within 30 days
  - Positive user feedback (>4/5 rating)
  - Becomes "must-have" feature (high usage)

**Rollback Plan**:
- If critical bug: Disable feature flag immediately (100% → 0%)
- If performance degradation: Reduce to 10% while investigating
- If security vulnerability: Disable immediately, patch, redeploy
- Database rollback: NOT NEEDED (additive schema changes only)`,

  // FIX: success_metrics moved to metadata


  // success_metrics: `**Usage Metrics**:
- Voice Session Adoption: >30% of active users try voice within 30 days
- Voice Session Frequency: >10% of users use voice weekly
- PDF Export Adoption: >50% of chairman users export PDF monthly
- PDF Export Frequency: Average 2 exports per chairman per month

**Quality Metrics**:
- Voice STT Accuracy: >95% (Word Error Rate <5%)
- Voice Latency: p95 <200ms (target: 90% of sessions meet this)
- PDF Export Speed: 90% <5 seconds, 100% <15 seconds
- Error Rate: <0.1% (excluding user errors like no mic permission)

**Business Metrics**:
- User Trust Improvement: Survey shows trust score increases by >10%
- Churn Reduction: <2% churn rate (vs 5% baseline from false advertising)
- Competitive Parity: Feature parity with top 3 competitors (voice AI, PDF export)
- Executive Satisfaction: >90% of chairman users rate PDF export as "very useful"

**Technical Metrics**:
- Uptime: >99.9%
- Concurrent Sessions: Peak >100 simultaneous voice sessions
- Database Query Performance: <100ms p95
- API Response Time: <500ms p95`,

  monitoring_and_observability: `**Application Monitoring** (Datadog):
- Voice latency metrics (p50, p95, p99)
- PDF export duration metrics
- WebSocket connection count (real-time)
- API request rate and error rate
- Database query performance

**Error Tracking** (Sentry):
- Frontend errors (React component crashes)
- Backend errors (API endpoint failures)
- WebSocket errors (connection drops)
- OpenAI API errors (rate limits, timeouts)

**Custom Logs**:
- Voice session logs (user_id, duration, transcript length, latency)
- PDF export logs (user_id, file size, chart count, duration)
- Authentication failures (invalid tokens)
- Rate limit hits (user_id, endpoint)

**Alerts**:
- Critical: Error rate >1% (PagerDuty notification)
- Warning: Voice latency p95 >300ms (Slack notification)
- Warning: PDF export duration p95 >10 seconds (Slack notification)
- Info: Concurrent voice sessions >80 (approaching capacity)`,

  documentation_deliverables: `**Technical Documentation**:
- API Documentation (OpenAPI/Swagger): /api/dashboard/export, /ws/voice
- Architecture Diagram: Data flow, component interaction
- Database Schema: voice_sessions, export_logs (ERD diagram)
- Deployment Guide: Production deployment steps, environment variables

**User Documentation**:
- User Guide: How to use EVA Realtime Voice
- User Guide: How to export Chairman Dashboard as PDF
- FAQ: Troubleshooting common issues (no mic permission, network errors)
- Video Tutorial: 2-minute demo of both features

**Developer Documentation**:
- Code Comments: Inline documentation for complex logic
- README Updates: New features, setup instructions
- Testing Guide: How to run tests (unit, integration, E2E)`,

  out_of_scope: `**Deferred to Future SDs**:
- Excel Export → SD-BACKEND-001A (High Priority, deferred due to UD: 5/10)
- Dashboard Customization → SD-BACKEND-001B (High Priority, deferred due to UD: 4/10)
- Voice Response Playback (TTS) → Future enhancement
- Multi-language Voice Support → Future enhancement
- Voice Command Actions (beyond EVA chat) → Future enhancement
- Email PDF Delivery → Future enhancement
- Scheduled PDF Reports → Future enhancement
- Custom PDF Templates → Future enhancement`
};

async function createPRD() {
  console.log('📝 Creating PRD: SD-BACKEND-001\n');

  try {
    const now = new Date().toISOString();

    // Create PRD record (match actual table schema)
    
  // FIX: Get SD uuid_id to populate sd_uuid field (prevents handoff validation failures)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id')
    .eq('id', sdId)
    .single();

  if (sdError || !sdData) {
    console.log(`❌ Strategic Directive ${sdId} not found in database`);
    console.log('   Create SD first before creating PRD');
    process.exit(1);
  }

  const sdUuid = sdData.uuid_id;
  console.log(`   SD uuid_id: ${sdUuid}`);

const prdData = {
      id: 'PRD-BACKEND-001',
      ...await createPRDLink('SD-BACKEND-001'),
      title: PRD_CONTENT.title,
      status: 'approved',
      content: PRD_CONTENT,
      target_url: 'http://localhost:5173',  // EHG app
      component_name: 'EVARealtimeVoice, ChairmanDashboard',
      app_path: '/mnt/c/_EHG/ehg',
      port: 5173,
      metadata: {
        created_by: 'PLAN',
        approved_by: 'PLAN',
        approved_at: now,
        approved_scope: {
          eva_voice: { effort: '80-120h', user_demand: '8/10', business_value: '9/10' },
          pdf_export: { effort: '40-60h', user_demand: '9/10', business_value: '8/10' }
        },
        total_effort: '180-280h',
        user_stories: 7,
        test_cases: {
          unit: 'TBD',
          integration: 'TBD',
          e2e: 3,
          performance: 3,
          security: 4,
          acceptance: 2
        },
        sub_agents_activated: [
          { name: 'Senior Design Sub-Agent', trigger: 'component, UI', status: 'pending' },
          { name: 'Principal Database Architect', trigger: 'schema, migration', status: 'pending' },
          { name: 'Chief Security Architect', trigger: 'authentication, security', status: 'pending' }
        ],
        plan_phase_complete: true
      }
    };

    console.log('💾 Storing PRD in database (prds table)...\n');

    const { data: prd, error } = await supabase
      .from('product_requirements_v2')
      .insert(prdData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create PRD: ${error.message}`);
    }

    console.log('✅ PRD Created Successfully!\n');
    console.log('📊 PRD Details:');
    console.log('   PRD ID:', prd.id);
    console.log('   SD:', prd.strategic_directive_id);
    console.log('   Title:', prd.title);
    console.log('   Status:', prd.status);
    console.log('   Created By: PLAN');
    console.log('   Created At:', prd.created_at);
    console.log('');
    console.log('📋 PRD Contents:');
    console.log('   - Executive Summary ✅');
    console.log('   - Problem Statement ✅');
    console.log('   - User Stories: 7 stories (2 epics)');
    console.log('   - Technical Architecture (diagrams, stack)');
    console.log('   - API Specifications (OpenAPI)');
    console.log('   - Database Schema (voice_sessions, export_logs)');
    console.log('   - Implementation Plan (6 phases)');
    console.log('   - Testing Strategy (Unit, Integration, E2E, Performance, Security)');
    console.log('   - Performance Targets (<50ms voice p50, <5s PDF)');
    console.log('   - Security Requirements (JWT, TLS, RLS)');
    console.log('   - Acceptance Criteria (comprehensive checklist)');
    console.log('   - Rollout Plan (phased 0% → 10% → 50% → 100%)');
    console.log('');
    console.log('🎯 Sub-Agents to Activate:');
    console.log('   1. Senior Design Sub-Agent (EVA Voice UI, PDF Export UI)');
    console.log('   2. Principal Database Architect (voice_sessions, export_logs schema)');
    console.log('   3. Chief Security Architect (WebSocket auth, API security)');
    console.log('');
    console.log('✅ Database-First: PRD stored in database (NOT as file per LEO Protocol v4.2.0)');
    console.log('');
    console.log('📈 Next Steps:');
    console.log('   1. Activate design sub-agent');
    console.log('   2. Create database migration (voice_sessions, export_logs)');
    console.log('   3. Define detailed API specs (OpenAPI YAML)');
    console.log('   4. Create PLAN→EXEC handoff');
    console.log('');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  }
}

createPRD();
