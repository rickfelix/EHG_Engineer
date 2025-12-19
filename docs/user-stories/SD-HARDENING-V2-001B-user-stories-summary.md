# User Stories Summary: SD-HARDENING-V2-001B

**SD ID**: SD-HARDENING-V2-001B
**Title**: WebSocket Authentication Enforcement
**PRD ID**: PRD-SD-HARDENING-V2-001B
**Security Finding**: GOV-03 (Unauthenticated WebSocket mutates SDs)
**Priority**: CRITICAL
**Total Stories**: 6
**Total Story Points**: 20
**Created**: 2025-12-18

---

## Overview

This SD addresses a critical security vulnerability where unauthenticated WebSocket clients can mutate strategic directives via the websocket-updates endpoint. The user stories implement comprehensive authentication, authorization, rate limiting, and audit logging for WebSocket connections.

---

## Functional Requirements Coverage

| FR ID | Functional Requirement | User Story | Status |
|-------|----------------------|------------|--------|
| FR-001 | JWT Token Extraction from WebSocket Handshake | US-001 | draft |
| FR-002 | JWT Token Validation via Supabase | US-002 | draft |
| FR-003 | Mutation Authorization Enforcement | US-003 | draft |
| FR-004 | Rate Limiting for Authenticated Connections | US-004 | draft |
| FR-005 | Audit Logging for Security Compliance | US-005 | draft |
| FR-006 | Client-Side Token Injection | US-006 | draft |

**Coverage**: 6/6 functional requirements (100%)

---

## User Stories

### US-001: Extract JWT token from WebSocket handshake headers
**Story Key**: SD-HARDENING-V2-001B:US-001
**Priority**: Critical
**Story Points**: 3
**Status**: draft

**User Story**:
As a **System**, I want to **extract and parse JWT authentication tokens from WebSocket connection handshake**, so that **WebSocket server can identify and authenticate users before accepting connections**.

**Acceptance Criteria** (5 scenarios):
1. Token extraction from Authorization header (happy path)
2. Token extraction from query parameter fallback
3. Missing token rejection with 401 Unauthorized
4. Malformed token rejection with 400 Bad Request
5. Bearer prefix handling

**E2E Test Path**: `tests/e2e/websocket-auth/US-001-jwt-extraction.spec.ts`

**Implementation Focus**:
- Extract JWT from `Authorization: Bearer <token>` header
- Fallback to `?token=<jwt>` query parameter
- Validate JWT format before accepting connection
- Reject unauthenticated connections immediately

---

### US-002: Validate JWT token via Supabase authentication
**Story Key**: SD-HARDENING-V2-001B:US-002
**Priority**: Critical
**Story Points**: 3
**Status**: draft

**User Story**:
As a **System**, I want to **validate JWT tokens using Supabase auth to verify user identity and permissions**, so that **only authenticated users with valid Supabase sessions can establish WebSocket connections**.

**Acceptance Criteria** (6 scenarios):
1. Valid token validation succeeds with user extraction
2. Expired token rejection with 401
3. Invalid signature rejection with 401
4. Revoked token rejection with 401
5. User metadata extraction (uid, email, role)
6. Connection metadata updated with authenticated status

**E2E Test Path**: `tests/e2e/websocket-auth/US-002-jwt-validation.spec.ts`

**Implementation Focus**:
- Call `supabase.auth.getUser(token)` for validation
- Extract user object (uid, email, role)
- Store user metadata in WebSocket connection
- Handle expired, invalid, and revoked tokens

---

### US-003: Enforce authorization for WebSocket mutation operations
**Story Key**: SD-HARDENING-V2-001B:US-003
**Priority**: Critical
**Story Points**: 5
**Status**: draft

**User Story**:
As an **Authenticated User**, I want to **only perform mutation operations that I am authorized to execute**, so that **strategic directive mutations are protected from unauthorized modifications**.

**Acceptance Criteria** (6 scenarios):
1. Authenticated user can mutate owned SD (happy path)
2. Unauthenticated connection blocked from mutations
3. Unauthorized user blocked from mutating others' SDs
4. Chairman override - full access to all SDs
5. Invalid mutation message rejection
6. Read-only operations allowed without ownership check

**E2E Test Path**: `tests/e2e/websocket-auth/US-003-mutation-authorization.spec.ts`

**Implementation Focus**:
- Check `ws.metadata.authenticated` before processing mutations
- Verify user owns SD or is chairman (via `fn_is_chairman()`)
- Align with Supabase RLS policies
- Allow read operations without ownership check
- Create audit logs for authorization failures

---

### US-004: Implement rate limiting for authenticated WebSocket connections
**Story Key**: SD-HARDENING-V2-001B:US-004
**Priority**: High
**Story Points**: 3
**Status**: draft

**User Story**:
As an **Authenticated User**, I want **rate limits that prevent abuse while allowing normal usage**, so that **system is protected from mutation spam and DoS attacks**.

**Acceptance Criteria** (6 scenarios):
1. Normal usage under rate limit succeeds
2. Rate limit exceeded blocks mutation (10/min per user)
3. Rate limit window resets after 60 seconds
4. Per-user rate limiting (not global)
5. Chairman exempt from rate limits
6. Read operations not rate limited

**E2E Test Path**: `tests/e2e/websocket-auth/US-004-rate-limiting.spec.ts`

**Implementation Focus**:
- Implement in-memory rate limiter (10 mutations/min per user)
- Sliding or fixed 60-second window
- Return 429 error with retry-after header
- Exempt chairman from limits
- Only apply to mutations, not reads

---

### US-005: Implement audit logging for WebSocket authentication and mutations
**Story Key**: SD-HARDENING-V2-001B:US-005
**Priority**: High
**Story Points**: 3
**Status**: draft

**User Story**:
As a **Security Administrator**, I want **complete audit trail of all authentication events and mutation operations**, so that **security incidents can be investigated and compliance requirements met**.

**Acceptance Criteria** (6 scenarios):
1. Authentication success logged
2. Authentication failure logged
3. Mutation success logged
4. Unauthorized mutation attempt logged
5. Rate limit violation logged
6. Audit logs queryable by admin with RLS enforcement

**E2E Test Path**: `tests/e2e/websocket-auth/US-005-audit-logging.spec.ts`

**Implementation Focus**:
- Create `websocket_audit_logs` table
- Log all authentication events (success/failure)
- Log all mutation events (success/unauthorized/rate-limited)
- Capture IP address, user agent, event data
- Apply RLS (users see own logs, chairman sees all)

---

### US-006: Implement client-side JWT token injection for WebSocket connections
**Story Key**: SD-HARDENING-V2-001B:US-006
**Priority**: High
**Story Points**: 3
**Status**: draft

**User Story**:
As a **Frontend Developer**, I want **automatic injection of JWT tokens into WebSocket connections from authenticated sessions**, so that **authenticated users can seamlessly use WebSocket features without manual token management**.

**Acceptance Criteria** (6 scenarios):
1. Token injection from Supabase session (authenticated user)
2. Token refresh triggers WebSocket reconnection
3. Unauthenticated user handling with error message
4. Token expiration handling with auto-refresh
5. Connection status indicator in UI
6. Automatic reconnection on network failures

**E2E Test Path**: `tests/e2e/websocket-auth/US-006-client-token-injection.spec.ts`

**Implementation Focus**:
- Create `useWebSocket` React hook
- Extract `session.access_token` from Supabase
- Inject via `?token=<jwt>` query parameter
- Listen to `onAuthStateChange` for session updates
- Implement exponential backoff for reconnection
- Display connection status indicator

---

## Implementation Order

### Phase 1: Server Authentication (Critical)
**Duration**: 2-3 days | **Points**: 6
- US-001: JWT Token Extraction
- US-002: JWT Token Validation

**Deliverables**:
- WebSocket server extracts JWT from handshake
- Supabase validates tokens server-side
- Unauthenticated connections rejected

**Blockers**: None (foundational work)

---

### Phase 2: Authorization Enforcement (Critical)
**Duration**: 3-4 days | **Points**: 5
- US-003: Mutation Authorization

**Deliverables**:
- Mutation messages require authentication
- User can only mutate owned SDs
- Chairman has full access
- Read operations allowed without ownership check

**Blockers**: Depends on US-001, US-002

---

### Phase 3: Protection Mechanisms (High)
**Duration**: 3-4 days | **Points**: 6
- US-004: Rate Limiting
- US-005: Audit Logging

**Deliverables**:
- Rate limiter prevents abuse (10/min per user)
- Complete audit trail in database
- RLS policies for audit log visibility

**Blockers**: Depends on US-003

---

### Phase 4: Client Integration (High)
**Duration**: 2-3 days | **Points**: 3
- US-006: Client-Side Token Injection

**Deliverables**:
- React hook for WebSocket connections
- Automatic token injection from session
- Reconnection logic with exponential backoff
- Connection status indicator

**Blockers**: Depends on US-001, US-002, US-003

---

## Testing Strategy

### Unit Tests
- JWT extraction logic (US-001)
- JWT validation logic (US-002)
- Rate limiter logic (US-004)
- Audit logger utility (US-005)

### Integration Tests
- Supabase token validation (US-002)
- Authorization check against database (US-003)
- Rate limit enforcement (US-004)
- Audit log insertion (US-005)

### E2E Tests
- Full WebSocket authentication flow (US-001 + US-002)
- Authenticated mutation scenarios (US-003)
- Unauthenticated rejection scenarios (US-003)
- Rate limit blocking (US-004)
- Client reconnection logic (US-006)

**Total E2E Test Files**: 6
**Test Coverage Goal**: 100% of acceptance criteria

---

## Security Considerations

### Critical Security Controls
1. **Authentication Required**: All WebSocket connections must have valid JWT
2. **Authorization Enforced**: Users can only mutate owned resources (or chairman sees all)
3. **Rate Limiting**: Prevents abuse and DoS attacks
4. **Audit Logging**: Complete trail for incident investigation
5. **Token Validation**: Server-side validation via Supabase (no client trust)

### Attack Vectors Mitigated
- **GOV-03**: Unauthenticated mutations blocked by US-001, US-002
- **Authorization Bypass**: Prevented by US-003 ownership checks
- **Mutation Spam**: Blocked by US-004 rate limiting
- **Privilege Escalation**: Prevented by RLS alignment in US-003
- **Token Forgery**: Mitigated by Supabase server-side validation in US-002

---

## Database Schema Requirements

### New Tables
1. **websocket_audit_logs** (US-005)
   - Columns: id, event_type, user_id, resource_id, ip_address, user_agent, event_data (jsonb), created_at
   - RLS: Users see own logs, chairman sees all
   - Indexes: user_id, event_type, created_at

### Modified Tables
- None (existing tables: strategic_directives_v2, user_stories)

---

## Architecture References

### Server Components
- `server/websocket-updates.ts` - Main WebSocket server (US-001, US-002, US-003)
- `server/lib/rate-limiter.ts` - Rate limiting logic (US-004)
- `server/lib/audit-logger.ts` - Audit logging utility (US-005)

### Client Components
- `src/hooks/useWebSocket.ts` - WebSocket client hook (US-006)
- `src/components/WebSocketStatus.tsx` - Connection indicator (US-006)

### Database
- `database/migrations/YYYYMMDD_create_websocket_audit_logs.sql` (US-005)
- Existing RLS policies for strategic_directives_v2 (US-003)

---

## Success Metrics

### Security Metrics
- 100% WebSocket connections authenticated
- 0 unauthorized mutation attempts succeed
- 100% audit coverage for authentication and mutations
- Rate limit violations logged and blocked

### Quality Metrics
- 100% acceptance criteria coverage in E2E tests
- All 6 user stories marked as "validated"
- Zero RLS policy violations in testing
- Chairman override works for all SDs

### Performance Metrics
- JWT validation < 100ms (per connection)
- Authorization check < 50ms (per mutation)
- Rate limit check < 10ms (in-memory)
- Audit log insertion async (non-blocking)

---

## Next Steps

1. Review user stories for INVEST criteria compliance
2. Create PRD (PRD-SD-HARDENING-V2-001B) if not exists
3. Begin EXEC phase implementation (Phase 1: US-001, US-002)
4. Create E2E test files for each user story
5. Set up CI pipeline for WebSocket authentication tests

---

## Notes

- All user stories follow Given-When-Then acceptance criteria format
- Each story includes implementation context, architecture references, and code examples
- Stories map 1:1 to functional requirements (FR-001 through FR-006)
- Total effort: 20 story points (estimated 10-14 days for full implementation)
- Security priority: CRITICAL - addresses GOV-03 finding
- Dependencies: Requires Supabase auth, existing RLS policies, WebSocket server infrastructure

---

**Document Created**: 2025-12-18
**Created By**: STORIES Agent
**LEO Protocol Phase**: PLAN
**Status**: User stories inserted into database, ready for EXEC phase
