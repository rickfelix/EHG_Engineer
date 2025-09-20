# Execution Sequence Items for PRD-2025-001

**PRD Reference**: PRD-2025-001  
**Total Estimated Hours**: 18  
**EXEC Agent**: Implementation Virtuoso v4.1  

## Execution Sequences

### EES-001: Infrastructure Setup
**Status**: pending  
**Priority**: 1 (Critical Path)  
**Dependencies**: None  
**Estimated Hours**: 3  
**Sub-Agents**: Security, Database  

**Tasks**:
1. Create `/supabase/functions/openai-session-token/`
   - Implement JWT validation
   - OpenAI token minting
   - Deploy with `--no-verify-jwt` flag
   
2. Create `/supabase/functions/eva-state-relay/`
   - WebSocket upgrade handling
   - Function execution management
   - Context summarization triggers
   
3. Database schema setup
   - Create eva_conversations table
   - Create eva_usage_metrics table
   - Set up indexes

**Acceptance Criteria**:
- [ ] Token endpoint returns valid ephemeral token
- [ ] WebSocket relay connects successfully
- [ ] Database tables created with indexes

---

### EES-002: WebRTC Client Implementation
**Status**: pending  
**Priority**: 1 (Critical Path)  
**Dependencies**: EES-001  
**Estimated Hours**: 4  
**Sub-Agents**: Performance  

**Tasks**:
1. Create `EVAVoiceAssistant.tsx` component
   - WebRTC peer connection management
   - Data channel for events
   - Audio stream handling
   
2. Implement connection lifecycle
   - Token fetching
   - SDP negotiation
   - ICE candidate handling
   
3. Audio processing
   - getUserMedia configuration
   - Audio buffering (200ms)
   - Playback queue management

**Acceptance Criteria**:
- [ ] Component connects to OpenAI
- [ ] Audio streams bidirectionally
- [ ] Events process correctly

---

### EES-003: Function Calling Integration
**Status**: pending  
**Priority**: 2 (Core Features)  
**Dependencies**: EES-002  
**Estimated Hours**: 3  
**Sub-Agents**: None  

**Tasks**:
1. Define tool schemas
   - query_portfolio function
   - strategic_analysis function
   - executive_briefing function
   
2. Implement execution framework
   - Async function handling
   - State management for long-running ops
   - Result injection protocol
   
3. Database integration
   - Supabase query builders
   - Response formatting
   - Error handling

**Acceptance Criteria**:
- [ ] Functions execute on voice command
- [ ] >95% accuracy in function selection
- [ ] Results integrate into conversation

---

### EES-004: Context & Cost Management
**Status**: pending  
**Priority**: 2 (Core Features)  
**Dependencies**: EES-003  
**Estimated Hours**: 2  
**Sub-Agents**: Performance  

**Tasks**:
1. Rolling summarization
   - Monitor token usage
   - Trigger at 20,000 tokens
   - Use gpt-4o-mini for summaries
   
2. Cost tracking
   - Parse usage objects
   - Calculate costs per minute
   - Store in eva_usage_metrics
   
3. Optimization strategies
   - Aggressive VAD settings
   - Cached common responses
   - Context pruning

**Acceptance Criteria**:
- [ ] Context stays under 20K tokens
- [ ] Cost <$0.50/minute average
- [ ] Usage tracked accurately

---

### EES-005: Security Hardening
**Status**: pending  
**Priority**: 2 (Core Features)  
**Dependencies**: EES-004  
**Estimated Hours**: 2  
**Sub-Agents**: Security  

**Tasks**:
1. Voice prompt injection defense
   - Input classification with gpt-4o-mini
   - Suspicious input handling
   - Logging and alerts
   
2. System prompt hardening
   - Immutable security rules
   - Role limitations
   - Instruction override prevention
   
3. Output filtering
   - Remove sensitive patterns
   - API key detection
   - PII scrubbing

**Acceptance Criteria**:
- [ ] 50/50 injection tests blocked
- [ ] No sensitive data in outputs
- [ ] Security logs comprehensive

---

### EES-006: Legacy Code Removal
**Status**: pending  
**Priority**: 3 (Cleanup)  
**Dependencies**: EES-005  
**Estimated Hours**: 1  
**Sub-Agents**: None  

**Tasks**:
1. Remove 11Labs components
   - Delete ElevenLabsVoice.tsx
   - Delete EVASetup.tsx
   - Remove eleven-sign-url function
   
2. Remove broken implementations
   - Delete old EVARealtimeVoice.tsx
   - Delete realtime-voice function
   - Delete EVATextToSpeechChat.tsx
   
3. Clean dependencies
   - Uninstall @11labs/react
   - Uninstall @elevenlabs/client
   - Update package.json

**Acceptance Criteria**:
- [ ] Zero 11Labs references
- [ ] No broken code remains
- [ ] Dependencies cleaned

---

### EES-007: Testing & Verification
**Status**: pending  
**Priority**: 3 (Validation)  
**Dependencies**: EES-006  
**Estimated Hours**: 3  
**Sub-Agents**: Testing  

**Tasks**:
1. Unit tests
   - Token generation tests
   - WebRTC connection tests
   - Function execution tests
   - >80% code coverage
   
2. Integration tests
   - End-to-end flows
   - Function round-trips
   - Database operations
   
3. Performance validation
   - Latency measurements
   - Load testing (50 sessions)
   - Cost verification

**Acceptance Criteria**:
- [ ] All tests passing
- [ ] >80% coverage achieved
- [ ] Performance targets met
- [ ] Security tests pass

---

## Execution Timeline

### Day 1 (6 hours)
- **Morning**: EES-001 Infrastructure (3h)
- **Afternoon**: EES-002 WebRTC Client start (3h)

### Day 2 (7 hours)
- **Morning**: EES-002 WebRTC Client complete (1h)
- **Midday**: EES-003 Function Calling (3h)
- **Afternoon**: EES-004 Context Management (2h)
- **Evening**: EES-005 Security start (1h)

### Day 3 (5 hours)
- **Morning**: EES-005 Security complete (1h)
- **Midday**: EES-006 Legacy Removal (1h)
- **Afternoon**: EES-007 Testing (3h)

**Total: 18 hours**

---

## Sub-Agent Activation Schedule

### Immediate Activation (EES-001)
- **Security Sub-Agent**: Token security, authentication
- **Database Sub-Agent**: Schema creation, optimization

### Phase 2 Activation (EES-002)
- **Performance Sub-Agent**: WebRTC optimization, latency

### Phase 4 Activation (EES-004)
- **Performance Sub-Agent**: Cost optimization

### Phase 5 Activation (EES-005)
- **Security Sub-Agent**: Injection defense, filtering

### Phase 7 Activation (EES-007)
- **Testing Sub-Agent**: Test suite creation

---

## Risk Tracking

| EES | Risk | Mitigation | Owner |
|-----|------|------------|-------|
| 001 | Token generation fails | Fallback to mock token for testing | EXEC |
| 002 | WebRTC connection issues | Test with simple peer first | EXEC |
| 003 | Function timeout | Implement 30s timeout with retry | EXEC |
| 004 | Context grows too fast | Summarize at 15K instead of 20K | EXEC |
| 005 | Injection tests fail | Add more classification layers | Security |
| 006 | Breaking changes | Feature flag for gradual rollout | EXEC |
| 007 | Tests don't meet coverage | Focus on critical paths only | Testing |

---

**Ready for EXEC Implementation Phase**