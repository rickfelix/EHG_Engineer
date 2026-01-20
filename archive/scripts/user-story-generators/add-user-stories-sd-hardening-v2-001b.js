#!/usr/bin/env node
/**
 * Add User Stories for SD-HARDENING-V2-001B
 * WebSocket Authentication Enforcement
 *
 * Creates user stories for enforcing JWT authentication on WebSocket connections
 * to prevent unauthenticated users from mutating strategic directives.
 *
 * Functional Requirements Mapping:
 * - FR-001: JWT Token Extraction from WebSocket Handshake → US-001
 * - FR-002: JWT Token Validation via Supabase → US-002
 * - FR-003: Mutation Authorization Enforcement → US-003
 * - FR-004: Rate Limiting for Authenticated Connections → US-004
 * - FR-005: Audit Logging for Security Compliance → US-005
 * - FR-006: Client-Side Token Injection → US-006
 *
 * Security Context:
 * CRITICAL FINDING (GOV-03): Unauthenticated WebSocket clients can mutate
 * strategic directives via websocket-updates endpoint. No JWT validation occurs
 * during WebSocket handshake or message processing.
 *
 * Issues:
 * 1. WebSocket endpoint accepts connections without authentication
 * 2. No JWT token extraction from handshake headers
 * 3. No Supabase JWT validation before processing mutations
 * 4. No rate limiting to prevent abuse
 * 5. No audit logging for security events
 *
 * Expected Outcome:
 * - WebSocket connections require valid JWT token in handshake
 * - Supabase validates JWT before allowing mutations
 * - Unauthenticated connections rejected with 401 Unauthorized
 * - Rate limiting prevents abuse (10 mutations/min per user)
 * - Audit logs capture all authentication and mutation events
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-HARDENING-V2-001B';
const PRD_ID = 'PRD-SD-HARDENING-V2-001B';

// User stories following INVEST criteria with Given-When-Then acceptance criteria
const userStories = [
  {
    story_key: 'SD-HARDENING-V2-001B:US-001',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Extract JWT token from WebSocket handshake headers',
    user_role: 'System',
    user_want: 'Extract and parse JWT authentication tokens from WebSocket connection handshake',
    user_benefit: 'WebSocket server can identify and authenticate users before accepting connections',
    priority: 'critical',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Token extraction - Happy path (Authorization header)',
        given: 'Client sends WebSocket handshake with Authorization: Bearer <jwt_token> header',
        when: 'WebSocket server receives connection request',
        then: 'JWT token is extracted from Authorization header AND stored in connection metadata'
      },
      {
        id: 'AC-001-2',
        scenario: 'Token extraction - Query parameter fallback',
        given: 'Client sends WebSocket handshake with ?token=<jwt_token> query parameter',
        when: 'WebSocket server receives connection request',
        then: 'JWT token is extracted from query parameter AND stored in connection metadata'
      },
      {
        id: 'AC-001-3',
        scenario: 'Missing token - Connection rejected',
        given: 'Client sends WebSocket handshake WITHOUT Authorization header or token parameter',
        when: 'WebSocket server receives connection request',
        then: 'Connection rejected with 401 Unauthorized error AND error message specifies "Missing authentication token"'
      },
      {
        id: 'AC-001-4',
        scenario: 'Malformed token - Connection rejected',
        given: 'Client sends WebSocket handshake with malformed JWT token',
        when: 'WebSocket server receives connection request',
        then: 'Connection rejected with 400 Bad Request AND error message specifies "Invalid token format"'
      },
      {
        id: 'AC-001-5',
        scenario: 'Bearer prefix handling',
        given: 'Client sends Authorization header with "Bearer " prefix',
        when: 'Token is extracted',
        then: 'Bearer prefix is stripped AND only JWT token is stored'
      }
    ],
    definition_of_done: [
      'WebSocket server extracts JWT from Authorization header',
      'Fallback to ?token= query parameter implemented',
      'Bearer prefix handling implemented',
      'Missing token rejection with 401 Unauthorized',
      'Malformed token rejection with 400 Bad Request',
      'Token stored in WebSocket connection metadata',
      'Unit tests for all extraction scenarios',
      'Error messages are clear and actionable'
    ],
    technical_notes: 'Use ws library upgrade event to access HTTP headers. Extract Authorization header or token query param. Strip "Bearer " prefix if present. Store token in ws.metadata for later validation.',
    implementation_approach: 'Modify WebSocket server upgrade handler. Check req.headers.authorization first. If not found, parse req.url for ?token= param. Validate token format (JWT structure). Store token in connection object. Reject connection if token missing or malformed.',
    implementation_context: 'This is the foundation for WebSocket authentication. Must happen during handshake before connection is established. Critical for security - unauthenticated connections must never be accepted.',
    architecture_references: [
      'server/websocket-updates.ts - WebSocket server implementation',
      'docs/api/websocket-protocol.md - WebSocket protocol specification',
      'server/middleware/auth.ts - Existing auth patterns for HTTP endpoints'
    ],
    example_code_patterns: {
      server_implementation: `// server/websocket-updates.ts
import { WebSocketServer } from 'ws';
import { parse as parseUrl } from 'url';

const wss = new WebSocketServer({ noServer: true });

// Handle upgrade request (HTTP → WebSocket)
server.on('upgrade', (req, socket, head) => {
  try {
    // Extract JWT token from Authorization header
    let token = req.headers.authorization?.replace('Bearer ', '');

    // Fallback: Extract from query parameter
    if (!token) {
      const { query } = parseUrl(req.url, true);
      token = query.token as string;
    }

    // Reject if no token provided
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\\r\\n\\r\\n');
      socket.destroy();
      console.error('WebSocket connection rejected: Missing authentication token');
      return;
    }

    // Validate JWT format (basic check before Supabase validation)
    const jwtPattern = /^[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]+$/;
    if (!jwtPattern.test(token)) {
      socket.write('HTTP/1.1 400 Bad Request\\r\\n\\r\\n');
      socket.destroy();
      console.error('WebSocket connection rejected: Invalid token format');
      return;
    }

    // Store token in connection metadata for validation in next step
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.metadata = { token, authenticated: false };
      wss.emit('connection', ws, req);
    });
  } catch (error) {
    console.error('WebSocket upgrade error:', error);
    socket.write('HTTP/1.1 500 Internal Server Error\\r\\n\\r\\n');
    socket.destroy();
  }
});`,
      client_implementation: `// Client-side token injection (for US-006)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function connectWebSocket() {
  // Get current session token
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  // Option 1: Authorization header (requires custom headers support)
  const ws = new WebSocket('wss://example.com/websocket-updates', {
    headers: {
      'Authorization': \`Bearer \${session.access_token}\`
    }
  });

  // Option 2: Query parameter (universal browser support)
  const wsWithToken = new WebSocket(\`wss://example.com/websocket-updates?token=\${session.access_token}\`);

  return wsWithToken;
}`
    },
    testing_scenarios: [
      { scenario: 'Token extraction from Authorization header', type: 'unit', priority: 'P0' },
      { scenario: 'Token extraction from query parameter', type: 'unit', priority: 'P0' },
      { scenario: 'Missing token rejection', type: 'integration', priority: 'P0' },
      { scenario: 'Malformed token rejection', type: 'integration', priority: 'P0' },
      { scenario: 'Bearer prefix stripped correctly', type: 'unit', priority: 'P1' }
    ],
    e2e_test_path: 'tests/e2e/websocket-auth/US-001-jwt-extraction.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-HARDENING-V2-001B:US-002',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Validate JWT token via Supabase authentication',
    user_role: 'System',
    user_want: 'Validate JWT tokens using Supabase auth to verify user identity and permissions',
    user_benefit: 'Only authenticated users with valid Supabase sessions can establish WebSocket connections',
    priority: 'critical',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Valid token - Connection accepted',
        given: 'Client provides valid Supabase JWT token AND token is not expired',
        when: 'WebSocket server validates token via Supabase',
        then: 'Token validation succeeds AND user object extracted from token AND connection marked as authenticated'
      },
      {
        id: 'AC-002-2',
        scenario: 'Expired token - Connection rejected',
        given: 'Client provides expired JWT token',
        when: 'WebSocket server validates token',
        then: 'Validation fails AND connection rejected with 401 Unauthorized AND error message specifies "Token expired"'
      },
      {
        id: 'AC-002-3',
        scenario: 'Invalid signature - Connection rejected',
        given: 'Client provides JWT token with invalid signature',
        when: 'WebSocket server validates token',
        then: 'Validation fails AND connection rejected with 401 Unauthorized AND error message specifies "Invalid token signature"'
      },
      {
        id: 'AC-002-4',
        scenario: 'Revoked token - Connection rejected',
        given: 'Client provides JWT token that has been revoked in Supabase',
        when: 'WebSocket server validates token',
        then: 'Validation fails AND connection rejected with 401 Unauthorized AND error message specifies "Token revoked"'
      },
      {
        id: 'AC-002-5',
        scenario: 'User metadata extraction',
        given: 'Valid JWT token is validated',
        when: 'User object is extracted',
        then: 'User ID (uid) is stored AND user email is stored AND user role is stored AND metadata available for authorization checks'
      },
      {
        id: 'AC-002-6',
        scenario: 'Connection metadata updated',
        given: 'Token validation succeeds',
        when: 'User object is extracted',
        then: 'WebSocket connection metadata updated with authenticated: true AND userId stored AND user object stored'
      }
    ],
    definition_of_done: [
      'Supabase client initialized with service role key',
      'JWT validation via supabase.auth.getUser(token) implemented',
      'Valid token acceptance with user extraction',
      'Expired token rejection with 401',
      'Invalid signature rejection with 401',
      'Revoked token rejection with 401',
      'User metadata (uid, email, role) stored in connection',
      'Connection marked as authenticated on success',
      'Integration tests with real Supabase tokens',
      'Error handling for network failures during validation'
    ],
    technical_notes: 'Use Supabase service role key for server-side validation. Call supabase.auth.getUser(token) to validate. Extract user object on success. Store uid, email, and role in ws.metadata. Mark ws.metadata.authenticated = true.',
    implementation_approach: 'Import Supabase client with service role key. After token extraction (US-001), call getUser(token). Handle success: store user in connection metadata. Handle failure: close connection with appropriate error code. Implement retry logic for transient errors.',
    implementation_context: 'This enforces Supabase authentication on WebSocket connections. Must use service role key to validate tokens server-side. Critical for preventing token forgery. User metadata needed for authorization in US-003.',
    architecture_references: [
      'server/websocket-updates.ts - WebSocket server implementation',
      'server/lib/supabase-server.ts - Supabase server client initialization',
      'US-001 - JWT extraction dependency',
      'US-003 - Authorization enforcement dependency'
    ],
    example_code_patterns: {
      validation_implementation: `// server/websocket-updates.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

wss.on('connection', async (ws, req) => {
  try {
    const token = ws.metadata.token;

    // Validate JWT token via Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('WebSocket authentication failed:', error?.message);

      // Send error message to client before closing
      ws.send(JSON.stringify({
        type: 'error',
        code: 'AUTHENTICATION_FAILED',
        message: error?.message || 'Invalid authentication token'
      }));

      ws.close(1008, error?.message || 'Authentication failed');
      return;
    }

    // Token valid - update connection metadata
    ws.metadata.authenticated = true;
    ws.metadata.userId = user.id;
    ws.metadata.userEmail = user.email;
    ws.metadata.userRole = user.role || 'authenticated';

    console.log(\`WebSocket authenticated: \${user.email} (\${user.id})\`);

    // Send authentication success message
    ws.send(JSON.stringify({
      type: 'authenticated',
      userId: user.id,
      email: user.email
    }));

    // Setup message handler (see US-003 for authorization)
    ws.on('message', (data) => handleMessage(ws, data));

  } catch (error) {
    console.error('WebSocket connection error:', error);
    ws.close(1011, 'Internal server error');
  }
});`,
      error_handling: `// Detailed error handling for different failure modes
async function validateToken(token: string) {
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) {
      // Categorize error types
      if (error.message.includes('expired')) {
        return { success: false, error: 'Token expired', code: 1008 };
      } else if (error.message.includes('invalid')) {
        return { success: false, error: 'Invalid token signature', code: 1008 };
      } else if (error.message.includes('revoked')) {
        return { success: false, error: 'Token revoked', code: 1008 };
      } else {
        return { success: false, error: 'Authentication failed', code: 1008 };
      }
    }

    if (!user) {
      return { success: false, error: 'User not found', code: 1008 };
    }

    return { success: true, user };
  } catch (error) {
    console.error('Supabase validation error:', error);
    return { success: false, error: 'Validation service unavailable', code: 1011 };
  }
}`
    },
    testing_scenarios: [
      { scenario: 'Valid token validation succeeds', type: 'integration', priority: 'P0' },
      { scenario: 'Expired token rejected', type: 'integration', priority: 'P0' },
      { scenario: 'Invalid signature rejected', type: 'integration', priority: 'P0' },
      { scenario: 'User metadata extracted correctly', type: 'integration', priority: 'P0' },
      { scenario: 'Connection metadata updated on success', type: 'unit', priority: 'P1' },
      { scenario: 'Network failure handling during validation', type: 'integration', priority: 'P2' }
    ],
    e2e_test_path: 'tests/e2e/websocket-auth/US-002-jwt-validation.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-HARDENING-V2-001B:US-003',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Enforce authorization for WebSocket mutation operations',
    user_role: 'Authenticated User',
    user_want: 'Only perform mutation operations that I am authorized to execute',
    user_benefit: 'Strategic directive mutations are protected from unauthorized modifications',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Authenticated user mutation - Happy path',
        given: 'User is authenticated via WebSocket AND user has permission to mutate SD',
        when: 'User sends mutation message for owned strategic directive',
        then: 'Mutation processed successfully AND database updated AND confirmation message sent to client'
      },
      {
        id: 'AC-003-2',
        scenario: 'Unauthenticated connection blocked',
        given: 'WebSocket connection is not authenticated (ws.metadata.authenticated = false)',
        when: 'Client sends mutation message',
        then: 'Message rejected AND error sent to client: "Authentication required" AND mutation NOT processed'
      },
      {
        id: 'AC-003-3',
        scenario: 'Unauthorized mutation blocked',
        given: 'User is authenticated BUT does not have permission to mutate target SD',
        when: 'User sends mutation message for SD owned by another user',
        then: 'Message rejected AND error sent: "Unauthorized to modify this resource" AND mutation NOT processed'
      },
      {
        id: 'AC-003-4',
        scenario: 'Chairman override - Full access',
        given: 'User is authenticated as chairman (Rick)',
        when: 'Chairman sends mutation message for any SD',
        then: 'Mutation processed successfully (chairman can modify all SDs)'
      },
      {
        id: 'AC-003-5',
        scenario: 'Invalid mutation message',
        given: 'User is authenticated',
        when: 'User sends malformed mutation message (missing required fields)',
        then: 'Message rejected AND error sent: "Invalid mutation format" AND mutation NOT processed'
      },
      {
        id: 'AC-003-6',
        scenario: 'Read-only operations allowed',
        given: 'User is authenticated',
        when: 'User sends read-only message (subscribe, query)',
        then: 'Message processed successfully AND no authorization check required for reads'
      }
    ],
    definition_of_done: [
      'Message handler checks ws.metadata.authenticated before processing',
      'Unauthenticated connections rejected with error',
      'Authorization check for mutation operations implemented',
      'User can only mutate their own SDs (or chairman sees all)',
      'Chairman override implemented (fn_is_chairman check)',
      'Read-only operations bypass authorization',
      'Error messages are clear and actionable',
      'Audit log entry created for all mutations (see US-005)',
      'Integration tests for authenticated and unauthorized scenarios',
      'E2E tests with real Supabase permissions'
    ],
    technical_notes: 'Check ws.metadata.authenticated before processing any mutation. For mutations, verify user owns the SD or is chairman. Use Supabase RLS policies as source of truth. Allow read operations without ownership check. Log all authorization failures.',
    implementation_approach: 'Implement message handler with authentication gate. Parse message to determine operation type (read vs mutation). For mutations, query SD ownership via Supabase. Check user ID matches SD owner OR user is chairman. Reject unauthorized requests with clear error. Process authorized mutations and send confirmation.',
    implementation_context: 'This is the core authorization enforcement. Must align with Supabase RLS policies (chairman_decisions, venture_decisions). Critical for preventing GOV-03 vulnerability. Must be performant - authorization check on every mutation.',
    architecture_references: [
      'server/websocket-updates.ts - WebSocket message handler',
      'database/schema/strategic_directives_v2.md - SD ownership model',
      'supabase/migrations/RLS policies - Authorization source of truth',
      'US-002 - JWT validation dependency',
      'US-005 - Audit logging integration'
    ],
    example_code_patterns: {
      message_handler: `// server/websocket-updates.ts
async function handleMessage(ws: WebSocket, data: Buffer) {
  try {
    const message = JSON.parse(data.toString());

    // Check authentication
    if (!ws.metadata.authenticated) {
      ws.send(JSON.stringify({
        type: 'error',
        code: 'UNAUTHENTICATED',
        message: 'Authentication required for this operation'
      }));
      return;
    }

    // Handle different message types
    if (message.type === 'mutation') {
      await handleMutation(ws, message);
    } else if (message.type === 'subscribe' || message.type === 'query') {
      await handleReadOperation(ws, message);
    } else {
      ws.send(JSON.stringify({
        type: 'error',
        code: 'INVALID_MESSAGE_TYPE',
        message: 'Unknown message type'
      }));
    }
  } catch (error) {
    console.error('Message handling error:', error);
    ws.send(JSON.stringify({
      type: 'error',
      code: 'MESSAGE_PROCESSING_ERROR',
      message: 'Failed to process message'
    }));
  }
}

async function handleMutation(ws: WebSocket, message: any) {
  const { sdId, operation, data } = message;

  // Validate message structure
  if (!sdId || !operation || !data) {
    ws.send(JSON.stringify({
      type: 'error',
      code: 'INVALID_MUTATION',
      message: 'Mutation must include sdId, operation, and data'
    }));
    return;
  }

  // Check authorization
  const isAuthorized = await checkMutationAuthorization(
    ws.metadata.userId,
    sdId
  );

  if (!isAuthorized) {
    // Log unauthorized attempt (US-005)
    await logSecurityEvent({
      event_type: 'UNAUTHORIZED_MUTATION_ATTEMPT',
      user_id: ws.metadata.userId,
      resource_id: sdId,
      ip_address: ws.metadata.ipAddress
    });

    ws.send(JSON.stringify({
      type: 'error',
      code: 'UNAUTHORIZED',
      message: 'You are not authorized to modify this resource'
    }));
    return;
  }

  // Process authorized mutation
  const result = await processMutation(sdId, operation, data);

  // Log successful mutation (US-005)
  await logSecurityEvent({
    event_type: 'MUTATION_PROCESSED',
    user_id: ws.metadata.userId,
    resource_id: sdId,
    operation
  });

  ws.send(JSON.stringify({
    type: 'mutation_success',
    sdId,
    operation,
    result
  }));
}

async function checkMutationAuthorization(
  userId: string,
  sdId: string
): Promise<boolean> {
  // Check if user is chairman (can modify anything)
  const { data: isChairman } = await supabase.rpc('fn_is_chairman');
  if (isChairman) {
    return true;
  }

  // Check if user owns the SD
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('created_by')
    .eq('id', sdId)
    .single();

  if (error || !sd) {
    return false;
  }

  return sd.created_by === userId;
}`,
      read_operations: `// Read operations don't require ownership check
async function handleReadOperation(ws: WebSocket, message: any) {
  // Authenticated users can read any SD (RLS handles visibility)
  if (message.type === 'subscribe') {
    // Setup real-time subscription
    const { sdId } = message;
    subscribeToSD(ws, sdId);
  } else if (message.type === 'query') {
    // Execute query
    const result = await querySD(message.query);
    ws.send(JSON.stringify({
      type: 'query_result',
      data: result
    }));
  }
}`
    },
    testing_scenarios: [
      { scenario: 'Authenticated user can mutate owned SD', type: 'e2e', priority: 'P0' },
      { scenario: 'Unauthenticated connection blocked from mutations', type: 'e2e', priority: 'P0' },
      { scenario: 'Unauthorized user blocked from mutating others SD', type: 'e2e', priority: 'P0' },
      { scenario: 'Chairman can mutate any SD', type: 'e2e', priority: 'P0' },
      { scenario: 'Invalid mutation message rejected', type: 'integration', priority: 'P1' },
      { scenario: 'Read operations allowed without ownership check', type: 'e2e', priority: 'P1' }
    ],
    e2e_test_path: 'tests/e2e/websocket-auth/US-003-mutation-authorization.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-HARDENING-V2-001B:US-004',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement rate limiting for authenticated WebSocket connections',
    user_role: 'Authenticated User',
    user_want: 'Rate limits that prevent abuse while allowing normal usage',
    user_benefit: 'System protected from mutation spam and DoS attacks',
    priority: 'high',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Normal usage - Under rate limit',
        given: 'User is authenticated AND has sent fewer than 10 mutations in last minute',
        when: 'User sends mutation message',
        then: 'Mutation processed successfully AND rate limit counter incremented'
      },
      {
        id: 'AC-004-2',
        scenario: 'Rate limit exceeded - Mutation blocked',
        given: 'User has sent 10 mutations in last minute',
        when: 'User attempts 11th mutation within same minute',
        then: 'Mutation rejected AND error sent: "Rate limit exceeded" AND retry-after header indicates when to retry'
      },
      {
        id: 'AC-004-3',
        scenario: 'Rate limit window reset',
        given: 'User hit rate limit 61 seconds ago',
        when: 'User sends new mutation',
        then: 'Mutation processed successfully (window has reset) AND counter resets to 1'
      },
      {
        id: 'AC-004-4',
        scenario: 'Per-user rate limiting',
        given: 'User A has hit rate limit',
        when: 'User B sends mutation',
        then: 'User B mutation processed successfully (rate limits are per-user, not global)'
      },
      {
        id: 'AC-004-5',
        scenario: 'Chairman exemption from rate limits',
        given: 'Chairman has sent 15 mutations in last minute',
        when: 'Chairman sends another mutation',
        then: 'Mutation processed successfully (chairman exempt from rate limits)'
      },
      {
        id: 'AC-004-6',
        scenario: 'Read operations not rate limited',
        given: 'User has sent 20 read operations (subscribe, query) in last minute',
        when: 'User sends another read operation',
        then: 'Operation processed successfully (only mutations are rate limited)'
      }
    ],
    definition_of_done: [
      'Rate limiter implemented using in-memory store (Map or similar)',
      'Rate limit: 10 mutations per minute per user',
      'Rate limit window: 60 seconds (sliding or fixed)',
      'Rate limit exceeded returns error with retry-after',
      'Per-user tracking (not global)',
      'Chairman exempt from rate limits',
      'Read operations exempt from rate limits',
      'Rate limit counters cleaned up for disconnected users',
      'Unit tests for rate limit logic',
      'E2E tests for rate limit enforcement'
    ],
    technical_notes: 'Use Map<userId, {count, windowStart}> for in-memory tracking. Check count before processing mutation. Reset window after 60 seconds. Chairman check via fn_is_chairman(). Read operations bypass rate limiter. Clean up entries on disconnect.',
    implementation_approach: 'Create RateLimiter class with checkLimit(userId) method. Store counters in Map. Before processing mutation, call checkLimit. If exceeded, reject with 429 rate limit error. Reset counters every 60 seconds. Exempt chairman from limits. Add cleanup on WebSocket close.',
    implementation_context: 'Rate limiting prevents abuse of WebSocket mutations. 10/min limit balances security and usability. Must be performant (check on every mutation). Chairman needs bypass for admin operations. In-memory is sufficient (stateless, per-server).',
    architecture_references: [
      'server/websocket-updates.ts - Message handler integration',
      'server/lib/rate-limiter.ts - Rate limiter implementation',
      'US-003 - Mutation authorization dependency'
    ],
    example_code_patterns: {
      rate_limiter_class: `// server/lib/rate-limiter.ts
export class RateLimiter {
  private limits = new Map<string, { count: number; windowStart: number }>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Cleanup old entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  checkLimit(userId: string, isChairman = false): { allowed: boolean; retryAfter?: number } {
    // Chairman exempt from rate limits
    if (isChairman) {
      return { allowed: true };
    }

    const now = Date.now();
    const userLimit = this.limits.get(userId);

    // First request or window expired
    if (!userLimit || now - userLimit.windowStart > this.windowMs) {
      this.limits.set(userId, { count: 1, windowStart: now });
      return { allowed: true };
    }

    // Within window, check count
    if (userLimit.count >= this.maxRequests) {
      const retryAfter = Math.ceil((userLimit.windowStart + this.windowMs - now) / 1000);
      return { allowed: false, retryAfter };
    }

    // Increment count
    userLimit.count++;
    return { allowed: true };
  }

  cleanup() {
    const now = Date.now();
    for (const [userId, limit] of this.limits.entries()) {
      if (now - limit.windowStart > this.windowMs) {
        this.limits.delete(userId);
      }
    }
  }

  reset(userId: string) {
    this.limits.delete(userId);
  }
}`,
      integration: `// server/websocket-updates.ts
import { RateLimiter } from './lib/rate-limiter';

const rateLimiter = new RateLimiter(10, 60000); // 10 req/min

async function handleMutation(ws: WebSocket, message: any) {
  // Check rate limit
  const isChairman = await checkIsChairman(ws.metadata.userId);
  const rateCheck = rateLimiter.checkLimit(ws.metadata.userId, isChairman);

  if (!rateCheck.allowed) {
    // Log rate limit violation (US-005)
    await logSecurityEvent({
      event_type: 'RATE_LIMIT_EXCEEDED',
      user_id: ws.metadata.userId,
      retry_after: rateCheck.retryAfter
    });

    ws.send(JSON.stringify({
      type: 'error',
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many mutations. Please slow down.',
      retryAfter: rateCheck.retryAfter
    }));
    return;
  }

  // Continue with authorization and mutation processing...
}

// Cleanup on disconnect
ws.on('close', () => {
  rateLimiter.reset(ws.metadata.userId);
});`
    },
    testing_scenarios: [
      { scenario: 'Normal usage under rate limit succeeds', type: 'integration', priority: 'P0' },
      { scenario: 'Rate limit exceeded blocks mutation', type: 'integration', priority: 'P0' },
      { scenario: 'Rate limit window resets after 60 seconds', type: 'integration', priority: 'P0' },
      { scenario: 'Per-user rate limiting enforced', type: 'integration', priority: 'P0' },
      { scenario: 'Chairman exempt from rate limits', type: 'integration', priority: 'P1' },
      { scenario: 'Read operations not rate limited', type: 'integration', priority: 'P1' }
    ],
    e2e_test_path: 'tests/e2e/websocket-auth/US-004-rate-limiting.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-HARDENING-V2-001B:US-005',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement audit logging for WebSocket authentication and mutations',
    user_role: 'Security Administrator',
    user_want: 'Complete audit trail of all authentication events and mutation operations',
    user_benefit: 'Security incidents can be investigated and compliance requirements met',
    priority: 'high',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'Authentication success logged',
        given: 'User successfully authenticates via WebSocket',
        when: 'JWT validation succeeds',
        then: 'Audit log entry created with event_type: WEBSOCKET_AUTH_SUCCESS AND user_id, email, timestamp, ip_address logged'
      },
      {
        id: 'AC-005-2',
        scenario: 'Authentication failure logged',
        given: 'User attempts authentication with invalid token',
        when: 'JWT validation fails',
        then: 'Audit log entry created with event_type: WEBSOCKET_AUTH_FAILURE AND failure reason, ip_address, timestamp logged'
      },
      {
        id: 'AC-005-3',
        scenario: 'Mutation success logged',
        given: 'Authorized user executes mutation',
        when: 'Mutation completes successfully',
        then: 'Audit log entry created with event_type: WEBSOCKET_MUTATION AND user_id, sd_id, operation, timestamp logged'
      },
      {
        id: 'AC-005-4',
        scenario: 'Unauthorized mutation attempt logged',
        given: 'User attempts unauthorized mutation',
        when: 'Authorization check fails',
        then: 'Audit log entry created with event_type: UNAUTHORIZED_MUTATION_ATTEMPT AND user_id, sd_id, timestamp logged'
      },
      {
        id: 'AC-005-5',
        scenario: 'Rate limit violation logged',
        given: 'User exceeds rate limit',
        when: 'Rate limiter blocks mutation',
        then: 'Audit log entry created with event_type: RATE_LIMIT_EXCEEDED AND user_id, timestamp, retry_after logged'
      },
      {
        id: 'AC-005-6',
        scenario: 'Audit logs queryable by admin',
        given: 'Audit logs exist in database',
        when: 'Admin queries websocket_audit_logs table',
        then: 'All events returned with filtering by user, date, event_type AND sorted by timestamp descending'
      }
    ],
    definition_of_done: [
      'websocket_audit_logs table created in database',
      'Table schema includes: id, event_type, user_id, resource_id, ip_address, user_agent, event_data (jsonb), created_at',
      'logSecurityEvent() helper function created',
      'Authentication success events logged',
      'Authentication failure events logged',
      'Mutation success events logged',
      'Unauthorized mutation attempts logged',
      'Rate limit violations logged',
      'IP address and user agent captured from WebSocket request',
      'RLS policies prevent users from viewing others audit logs',
      'Chairman can view all audit logs',
      'Integration tests for audit logging'
    ],
    technical_notes: 'Create websocket_audit_logs table with RLS. Log all security events via Supabase insert. Capture IP from req.socket.remoteAddress. Store event-specific data in jsonb column. Use RLS to scope visibility (user sees own logs, chairman sees all).',
    implementation_approach: 'Create migration for websocket_audit_logs table. Implement logSecurityEvent(event) function. Call from authentication handler (US-002), authorization check (US-003), rate limiter (US-004). Store IP, user agent, event data. Apply RLS policies.',
    implementation_context: 'Audit logging is critical for security compliance and incident investigation. Must capture all authentication and authorization events. Should not impact performance (async inserts). RLS ensures privacy while allowing admin visibility.',
    architecture_references: [
      'database/migrations/ - Audit log table creation',
      'server/lib/audit-logger.ts - Logging helper functions',
      'US-002 - Authentication events',
      'US-003 - Authorization events',
      'US-004 - Rate limit events'
    ],
    example_code_patterns: {
      migration: `-- database/migrations/YYYYMMDD_create_websocket_audit_logs.sql
CREATE TABLE IF NOT EXISTS websocket_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  resource_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  event_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_websocket_audit_logs_user_id ON websocket_audit_logs(user_id);
CREATE INDEX idx_websocket_audit_logs_event_type ON websocket_audit_logs(event_type);
CREATE INDEX idx_websocket_audit_logs_created_at ON websocket_audit_logs(created_at DESC);

-- RLS policies
ALTER TABLE websocket_audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own audit logs
CREATE POLICY "websocket_audit_logs_select_own"
  ON websocket_audit_logs
  FOR SELECT
  USING (user_id = auth.uid());

-- Chairman can view all audit logs
CREATE POLICY "websocket_audit_logs_select_chairman"
  ON websocket_audit_logs
  FOR SELECT
  USING (fn_is_chairman());

-- Service role can insert audit logs
CREATE POLICY "websocket_audit_logs_insert_service"
  ON websocket_audit_logs
  FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE websocket_audit_logs IS
  'Audit trail for WebSocket authentication and mutation events. RLS enforced for privacy.';`,
      logger_implementation: `// server/lib/audit-logger.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface AuditEvent {
  event_type: string;
  user_id?: string;
  resource_id?: string;
  ip_address?: string;
  user_agent?: string;
  event_data?: Record<string, any>;
}

export async function logSecurityEvent(event: AuditEvent) {
  try {
    const { error } = await supabase
      .from('websocket_audit_logs')
      .insert({
        event_type: event.event_type,
        user_id: event.user_id || null,
        resource_id: event.resource_id || null,
        ip_address: event.ip_address || null,
        user_agent: event.user_agent || null,
        event_data: event.event_data || {}
      });

    if (error) {
      console.error('Failed to log audit event:', error);
    }
  } catch (error) {
    console.error('Audit logging error:', error);
    // Don't fail the request if audit logging fails
  }
}`,
      usage_examples: `// In US-002 (authentication)
await logSecurityEvent({
  event_type: 'WEBSOCKET_AUTH_SUCCESS',
  user_id: user.id,
  ip_address: req.socket.remoteAddress,
  user_agent: req.headers['user-agent'],
  event_data: { email: user.email }
});

// In US-003 (unauthorized mutation)
await logSecurityEvent({
  event_type: 'UNAUTHORIZED_MUTATION_ATTEMPT',
  user_id: ws.metadata.userId,
  resource_id: sdId,
  ip_address: ws.metadata.ipAddress,
  event_data: { operation: message.operation }
});

// In US-004 (rate limit)
await logSecurityEvent({
  event_type: 'RATE_LIMIT_EXCEEDED',
  user_id: ws.metadata.userId,
  ip_address: ws.metadata.ipAddress,
  event_data: { retry_after: rateCheck.retryAfter }
});`
    },
    testing_scenarios: [
      { scenario: 'Authentication success creates audit log', type: 'integration', priority: 'P0' },
      { scenario: 'Authentication failure creates audit log', type: 'integration', priority: 'P0' },
      { scenario: 'Mutation success creates audit log', type: 'integration', priority: 'P0' },
      { scenario: 'Unauthorized attempt creates audit log', type: 'integration', priority: 'P0' },
      { scenario: 'Rate limit violation creates audit log', type: 'integration', priority: 'P1' },
      { scenario: 'RLS scopes audit logs correctly', type: 'e2e', priority: 'P1' }
    ],
    e2e_test_path: 'tests/e2e/websocket-auth/US-005-audit-logging.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-HARDENING-V2-001B:US-006',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement client-side JWT token injection for WebSocket connections',
    user_role: 'Frontend Developer',
    user_want: 'Automatic injection of JWT tokens into WebSocket connections from authenticated sessions',
    user_benefit: 'Authenticated users can seamlessly use WebSocket features without manual token management',
    priority: 'high',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'Token injection - Authenticated user',
        given: 'User is authenticated in frontend app via Supabase AND has valid session token',
        when: 'WebSocket connection is established',
        then: 'JWT token is automatically extracted from session AND injected into WebSocket connection via query parameter'
      },
      {
        id: 'AC-006-2',
        scenario: 'Token refresh - Session updated',
        given: 'User has established WebSocket connection AND session token refreshes',
        when: 'Token refresh occurs',
        then: 'WebSocket connection is reconnected with new token AND old connection is closed gracefully'
      },
      {
        id: 'AC-006-3',
        scenario: 'Unauthenticated user handling',
        given: 'User is not authenticated (no session)',
        when: 'WebSocket connection is attempted',
        then: 'Connection is not established AND error displayed: "Authentication required for real-time updates"'
      },
      {
        id: 'AC-006-4',
        scenario: 'Token expiration handling',
        given: 'User has WebSocket connection AND session token expires',
        when: 'Server rejects connection due to expired token',
        then: 'Client attempts to refresh session AND reconnects with new token automatically'
      },
      {
        id: 'AC-006-5',
        scenario: 'Connection status indicator',
        given: 'WebSocket connection is established',
        when: 'Connection state changes (connecting, connected, disconnected)',
        then: 'UI displays connection status indicator AND user can see real-time connection state'
      },
      {
        id: 'AC-006-6',
        scenario: 'Reconnection logic',
        given: 'WebSocket connection is lost (network issue)',
        when: 'Network is restored',
        then: 'Client automatically reconnects with fresh token AND resumes real-time updates'
      }
    ],
    definition_of_done: [
      'WebSocket client utility created (useWebSocket hook or similar)',
      'Automatic token extraction from Supabase session',
      'Token injected via ?token= query parameter',
      'Session refresh triggers reconnection',
      'Unauthenticated users cannot connect',
      'Token expiration handled with auto-refresh',
      'Connection status indicator in UI',
      'Automatic reconnection on network failures',
      'Exponential backoff for reconnection attempts',
      'Integration with existing Supabase auth context',
      'TypeScript types for WebSocket messages',
      'E2E tests for token injection and reconnection'
    ],
    technical_notes: 'Use Supabase session.access_token for WebSocket auth. Inject via query param for browser compatibility. Listen to onAuthStateChange for session updates. Implement exponential backoff for reconnection. Handle token expiration gracefully.',
    implementation_approach: 'Create useWebSocket React hook. Get session from Supabase context. Extract access_token. Connect WebSocket with ?token=${access_token}. Listen for auth state changes. Reconnect on token refresh. Display connection status. Handle disconnections with retry logic.',
    implementation_context: 'Client-side token injection completes the authentication flow. Must integrate with existing Supabase auth. Should handle all edge cases (expiration, refresh, network failures). Critical for good UX - users should not notice token management.',
    architecture_references: [
      'src/hooks/useWebSocket.ts - WebSocket client hook',
      'src/contexts/AuthContext.tsx - Supabase auth context',
      'src/components/WebSocketStatus.tsx - Connection indicator UI',
      'US-001 - Server-side token extraction'
    ],
    example_code_patterns: {
      websocket_hook: `// src/hooks/useWebSocket.ts
import { useEffect, useRef, useState } from 'react';
import { useSupabaseClient, useSession } from '@supabase/auth-helpers-react';

export function useWebSocket() {
  const supabase = useSupabaseClient();
  const session = useSession();
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const reconnectAttempts = useRef(0);

  const connect = () => {
    if (!session?.access_token) {
      console.error('Cannot connect WebSocket: No access token');
      setStatus('disconnected');
      return;
    }

    setStatus('connecting');

    // Inject token via query parameter for browser compatibility
    const wsUrl = \`\${process.env.NEXT_PUBLIC_WS_URL}?token=\${session.access_token}\`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setStatus('connected');
      reconnectAttempts.current = 0;
    };

    ws.onclose = (event) => {
      console.log('WebSocket disconnected:', event.code, event.reason);
      setStatus('disconnected');

      // Auto-reconnect with exponential backoff
      if (reconnectAttempts.current < 5) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        console.log(\`Reconnecting in \${delay}ms...\`);

        setTimeout(() => {
          reconnectAttempts.current++;
          connect();
        }, delay);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'error') {
        console.error('WebSocket error:', message.message);

        // Handle authentication errors
        if (message.code === 'AUTHENTICATION_FAILED') {
          ws.close();
          // Trigger session refresh
          supabase.auth.refreshSession();
        }
      }
    };

    wsRef.current = ws;
  };

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const send = (message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.error('Cannot send message: WebSocket not connected');
    }
  };

  // Connect on mount if authenticated
  useEffect(() => {
    if (session?.access_token) {
      connect();
    }

    return () => disconnect();
  }, [session?.access_token]);

  // Reconnect when session refreshes
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        console.log('Session refreshed, reconnecting WebSocket');
        disconnect();
        connect();
      } else if (event === 'SIGNED_OUT') {
        disconnect();
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return { status, send };
}`,
      status_indicator: `// src/components/WebSocketStatus.tsx
import { useWebSocket } from '@/hooks/useWebSocket';

export function WebSocketStatus() {
  const { status } = useWebSocket();

  const statusConfig = {
    connected: { color: 'bg-green-500', text: 'Connected' },
    connecting: { color: 'bg-yellow-500', text: 'Connecting...' },
    disconnected: { color: 'bg-red-500', text: 'Disconnected' }
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className={\`w-2 h-2 rounded-full \${config.color}\`} />
      <span className="text-gray-600">{config.text}</span>
    </div>
  );
}`,
      usage_example: `// Usage in a component
import { useWebSocket } from '@/hooks/useWebSocket';

export function StrategicDirectiveDashboard() {
  const { status, send } = useWebSocket();

  const handleUpdateSD = (sdId: string, data: any) => {
    send({
      type: 'mutation',
      sdId,
      operation: 'update',
      data
    });
  };

  return (
    <div>
      <WebSocketStatus />
      {status === 'connected' && (
        <button onClick={() => handleUpdateSD('sd-123', { status: 'in_progress' })}>
          Update SD
        </button>
      )}
    </div>
  );
}`
    },
    testing_scenarios: [
      { scenario: 'Token injection on authenticated connection', type: 'e2e', priority: 'P0' },
      { scenario: 'Reconnection on token refresh', type: 'e2e', priority: 'P0' },
      { scenario: 'Unauthenticated user cannot connect', type: 'e2e', priority: 'P0' },
      { scenario: 'Token expiration handled gracefully', type: 'e2e', priority: 'P0' },
      { scenario: 'Connection status indicator updates', type: 'e2e', priority: 'P1' },
      { scenario: 'Automatic reconnection on network failure', type: 'e2e', priority: 'P1' }
    ],
    e2e_test_path: 'tests/e2e/websocket-auth/US-006-client-token-injection.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  }
];

async function addUserStories() {
  console.log(`📚 Adding ${userStories.length} user stories for ${SD_ID} to database...\n`);

  try {
    // Verify SD exists (support both UUID and legacy_id)
    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, legacy_id, sd_key, title')
      .or(`id.eq.${SD_ID},legacy_id.eq.${SD_ID},sd_key.eq.${SD_ID}`)
      .single();

    if (sdError || !sdData) {
      console.log(`❌ Strategic Directive ${SD_ID} not found in database`);
      console.log('   Error:', sdError?.message);
      console.log('   Create SD first before adding user stories');
      process.exit(1);
    }

    // Use the UUID for foreign key references
    const sdUuid = sdData.id;

    console.log(`✅ Found SD: ${sdData.title}`);
    console.log(`   UUID: ${sdUuid}`);
    console.log(`   Legacy ID: ${sdData.legacy_id || 'N/A'}\n`);

    // Verify PRD exists
    const { data: prdData, error: prdError } = await supabase
      .from('product_requirement_documents')
      .select('id, title')
      .eq('id', PRD_ID)
      .single();

    if (prdError || !prdData) {
      console.log(`⚠️  PRD ${PRD_ID} not found in database`);
      console.log('   Creating user stories without PRD link (can be linked later)');
    } else {
      console.log(`✅ Found PRD: ${prdData.title}\n`);
    }

    let successCount = 0;
    let errorCount = 0;
    let skipCount = 0;

    for (const story of userStories) {
      try {
        // Check if story already exists in user_stories
        const { data: existing } = await supabase
          .from('user_stories')
          .select('story_key')
          .eq('story_key', story.story_key)
          .single();

        if (existing) {
          console.log(`⚠️  ${story.story_key} already exists, skipping...`);
          skipCount++;
          continue;
        }

        // Use UUID for sd_id foreign key
        const storyWithUuid = {
          ...story,
          sd_id: sdUuid  // Replace string SD_ID with actual UUID
        };

        const { data: _data, error } = await supabase
          .from('user_stories')
          .insert(storyWithUuid)
          .select()
          .single();

        if (error) {
          console.error(`❌ Error adding ${story.story_key}:`, error.message);
          console.error(`   Code: ${error.code}, Details: ${error.details}`);
          errorCount++;
        } else {
          console.log(`✅ Added ${story.story_key}: ${story.title}`);
          successCount++;
        }
      } catch (err) {
        console.error(`❌ Exception adding ${story.story_key}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Success: ${successCount}/${userStories.length}`);
    console.log(`   Skipped: ${skipCount}/${userStories.length}`);
    console.log(`   Errors: ${errorCount}/${userStories.length}`);

    if (errorCount === 0 && successCount > 0) {
      console.log('\n✨ All user stories added successfully for SD-HARDENING-V2-001B!');
      console.log('\n📋 Next Steps:');
      console.log(`   1. Review stories: SELECT * FROM user_stories WHERE sd_id = '${sdUuid}'`);
      console.log('   2. Validate INVEST criteria: npm run stories:validate');
      console.log('   3. Review PRD alignment: Check FR-001 through FR-006 coverage');
      console.log('   4. Begin EXEC implementation');
      console.log('\n📐 Implementation Order:');
      console.log('   Phase 1 (Server Auth): US-001 (JWT extraction), US-002 (JWT validation)');
      console.log('   Phase 2 (Authorization): US-003 (Mutation authorization)');
      console.log('   Phase 3 (Protection): US-004 (Rate limiting), US-005 (Audit logging)');
      console.log('   Phase 4 (Client): US-006 (Client-side token injection)');
      console.log('\n🔒 Security Priority: CRITICAL - Fixes GOV-03 (Unauthenticated WebSocket mutations)');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  addUserStories()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

export { userStories, addUserStories };
