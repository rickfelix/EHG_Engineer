# 02_architecture_boundaries.md

## Why This Matters
Clear architectural boundaries and explicit separation of concerns are critical for maintaining system integrity, preventing scope creep, and enabling independent evolution of components. This document defines the technical architecture, application boundaries, and integration contracts that govern the EHG ecosystem.

---

## System Separation

### Application Boundaries

#### EHG Application (`/mnt/c/_EHG/ehg`)
**Purpose**: Main portfolio management and venture operations

**Responsibilities**:
- Chairman Dashboard and Command Center
- Venture workflow stages (40-stage implementation)
- Portfolio visualization and monitoring
- User interface and experience
- Business logic and rules engine
- External integrations (markets, competitors)

**Key Components**:
- `/src/app/` - Next.js application routes
- `/src/components/` - React UI components
- `/enhanced_prds/` - Product requirement documents
- `/docs/workflow/` - Stage definitions and SOPs
- `/database/` - Schema and migrations

**NOT Responsible For**:
- LEO Protocol implementation details
- Agent orchestration logic
- SDIP processing
- Database administration tools

#### EHG_Engineer Application (`/mnt/c/_EHG/EHG_Engineer`)
**Purpose**: Engineering infrastructure and agent orchestration

**Responsibilities**:
- LEO Protocol implementation and enforcement
- Agent coordination (LEAD, PLAN, EXEC)
- SDIP (Strategic Directive Intelligent Processing)
- Database management and migrations
- Development tools and utilities
- Testing and validation frameworks

**Key Components**:
- `/scripts/` - Operational and management scripts
- `/src/services/` - Core services (DatabaseManager, etc.)
- `/lib/` - Shared libraries and utilities
- `/docs/03_protocols_and_standards/` - LEO Protocol specs
- `/database/schema/` - Database schema definitions

**NOT Responsible For**:
- End-user interfaces
- Venture-specific business logic
- Portfolio visualizations
- Market analysis

### Integration Points

#### Shared Database
Both applications connect to the same Supabase instance:
- **Project URL**: `https://dedlbzhpgkmetvhbkyzq.supabase.co`
- **Shared Tables**: strategic_directives_v2, sd_backlog_map, directive_submissions
- **Access Pattern**: EHG reads/writes business data, EHG_Engineer manages schema

#### API Contracts
- **REST APIs**: Standard HTTP/JSON interfaces
- **WebSocket**: Real-time updates via Supabase subscriptions
- **Event Bus**: Loosely coupled event-driven communication
- **File System**: Shared access to `/mnt/c/_EHG/` for specific resources

---

## Database Architecture

### Multi-Database Strategy

#### Primary Database (Supabase)
**Instance**: dedlbzhpgkmetvhbkyzq.supabase.co

**Core Tables**:
```sql
-- Strategic Directives (Base Table)
strategic_directives_v2
├── id (VARCHAR(50) PRIMARY KEY)
├── title (VARCHAR(500))
├── description (TEXT)
├── status (VARCHAR(50))
├── priority (INTEGER)
└── metadata (JSONB)

-- Backlog Mapping (Base Table)
sd_backlog_map
├── sd_id (VARCHAR(50) FK)
├── backlog_id (VARCHAR(100))
├── backlog_title (VARCHAR(500))
├── priority (VARCHAR(20))
└── extras (JSONB)
    ├── acceptance_criteria[]
    ├── kpis[]
    ├── dependencies[]
    └── estimated_hours

-- Directive Submissions (Intake)
directive_submissions
├── id (UUID PRIMARY KEY)
├── chairman_input (TEXT)
├── intent_summary (TEXT)
├── status (VARCHAR(50))
├── gate_status (JSONB)
└── screenshot_url (TEXT)
```

**Views**:
```sql
-- READ-ONLY Joined View
strategic_directives_backlog
├── Joins strategic_directives_v2 + sd_backlog_map
├── Provides unified view for queries
└── NEVER insert/update directly
```

### Connection Management

#### Administrative Mode
For DDL operations (CREATE, ALTER, DROP):
```javascript
// Direct PostgreSQL connection
const pgConfig = {
  host: "db.dedlbzhpgkmetvhbkyzq.supabase.co",
  user: "postgres",
  password: process.env.DB_PASSWORD,
  database: "postgres",
  port: 5432
};
```

#### Data Access Mode
For DML operations (SELECT, INSERT, UPDATE, DELETE):
```javascript
// Supabase client with RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
```

### Data Contracts

#### v_prd_sd_payload View
Unified view for PRD and SD relationships:
```sql
CREATE VIEW v_prd_sd_payload AS
SELECT
  sd.id as sd_id,
  sd.title as sd_title,
  sd.status as sd_status,
  prd.id as prd_id,
  prd.title as prd_title,
  prd.technical_specs,
  prd.acceptance_criteria
FROM strategic_directives_v2 sd
LEFT JOIN prds prd ON prd.sd_id = sd.id;
```

#### Handoff Template Structure
Standardized format for agent handoffs:
```json
{
  "from_agent": "LEAD",
  "to_agent": "PLAN",
  "template_structure": {
    "sections": [
      "Executive Summary",
      "Completeness Report",
      "Deliverables Manifest",
      "Key Decisions & Rationale",
      "Known Issues & Risks",
      "Resource Utilization",
      "Action Items for Receiver"
    ]
  },
  "required_validations": 7
}
```

---

## UI Components & Design System

### Component Architecture

#### Core Components Location
- **EHG App**: `/mnt/c/_EHG/ehg/src/components/`
- **EHG_Engineer**: `/mnt/c/_EHG/EHG_Engineer/src/client/src/components/`

#### Design System Principles
1. **Consistency**: Uniform patterns across applications
2. **Accessibility**: WCAG 2.1 AA compliance
3. **Responsiveness**: Mobile-first design
4. **Performance**: Optimized rendering and loading
5. **Themability**: Support for light/dark modes

### Key UI Components

#### Dashboard Components
```typescript
// Chairman Dashboard
<Dashboard>
  <PortfolioOverview />
  <VentureCards />
  <KPIMetrics />
  <ExceptionAlerts />
</Dashboard>

// Strategic Directives
<StrategicDirectives>
  <SDList />
  <SDDetails />
  <BacklogItems />
  <ProgressTracking />
</StrategicDirectives>
```

#### Common Components
```typescript
// Shared across applications
<NavigationHeader />
<DataTable />
<MetricCard />
<ProgressBar />
<StatusBadge />
<ActionButton />
<FormInput />
<Modal />
```

### Accessibility Baseline

#### WCAG 2.1 AA Requirements

**Perceivable**:
- Text contrast ratio: 4.5:1 (normal), 3:1 (large)
- Alt text for all images
- Captions for video content
- Clear visual hierarchy

**Operable**:
- Keyboard navigation for all interactions
- Focus indicators visible
- Skip navigation links
- No keyboard traps
- Sufficient time limits

**Understandable**:
- Clear labels and instructions
- Error identification and suggestions
- Consistent navigation
- Predictable functionality

**Robust**:
- Valid HTML markup
- ARIA labels where needed
- Compatible with screen readers
- Progressive enhancement

#### Implementation Checklist
```markdown
- [ ] Color contrast validated
- [ ] Keyboard navigation tested
- [ ] Screen reader compatibility verified
- [ ] Focus management implemented
- [ ] Error messages descriptive
- [ ] Form labels associated
- [ ] Heading hierarchy logical
- [ ] Language declared
- [ ] Viewport configured
- [ ] Touch targets adequate (44x44px)
```

---

## Service Architecture

### Microservices

#### Core Services

**DatabaseManager Service**
- Connection pooling
- Multi-database support
- Migration management
- Query optimization
- Transaction handling

**SDIP Service**
- Submission intake
- Intent analysis
- Gate validation
- SD creation
- Status tracking

**LEO Orchestrator**
- Agent coordination
- Handoff management
- Quality gate enforcement
- Context management
- Exception handling

**EVA Service**
- Natural language processing
- Workflow orchestration
- Learning engine
- Recommendation system
- Notification manager

### API Endpoints

#### Strategic Directives API
```
GET  /api/sds                 # List all SDs
GET  /api/sds/:id             # Get specific SD
POST /api/sds                 # Create new SD
PUT  /api/sds/:id             # Update SD
GET  /api/sds/:id/backlog     # Get SD backlog items
```

#### LEO Protocol API
```
GET  /api/leo/current         # Current protocol version
GET  /api/leo/agents          # Agent definitions
GET  /api/leo/handoffs        # Handoff templates
POST /api/leo/validate        # Validate against rules
```

#### SDIP Processing API
```
POST /api/sdip/submit         # Submit new directive
GET  /api/sdip/status/:id     # Check processing status
GET  /api/sdip/gates/:id      # Gate progression
POST /api/sdip/approve/:id    # Approve submission
```

### Event Architecture

#### Event Types
```javascript
// Venture Events
VENTURE_CREATED
VENTURE_STAGE_ADVANCED
VENTURE_BLOCKED
VENTURE_COMPLETED

// SD Events
SD_CREATED
SD_UPDATED
SD_COMPLETED
SD_ARCHIVED

// Agent Events
HANDOFF_INITIATED
HANDOFF_VALIDATED
HANDOFF_BLOCKED
AGENT_ACTIVATED

// System Events
QUALITY_GATE_PASSED
QUALITY_GATE_FAILED
EXCEPTION_RAISED
LEARNING_CAPTURED
```

#### Event Flow
```
Producer → Event Bus → Consumer(s)
    ↓          ↓           ↓
  Audit    Analytics   Notifications
```

---

## Security Architecture

### Authentication & Authorization

#### Authentication Flow
1. User login via Supabase Auth
2. JWT token generation
3. Token validation on each request
4. Refresh token rotation
5. Session management

#### Authorization Model
```javascript
// Role-Based Access Control (RBAC)
roles: {
  chairman: ["*"],  // Full access
  admin: ["read", "write", "delete"],
  operator: ["read", "write"],
  viewer: ["read"]
}

// Resource-Based Permissions
permissions: {
  strategic_directives: ["chairman", "admin"],
  ventures: ["chairman", "admin", "operator"],
  reports: ["chairman", "admin", "operator", "viewer"]
}
```

### Data Protection

#### Encryption
- **At Rest**: AES-256 database encryption
- **In Transit**: TLS 1.3 for all connections
- **Secrets**: Environment variables, never in code
- **Keys**: Managed via secure key vault

#### Privacy
- **PII Handling**: Minimized and encrypted
- **Data Retention**: Automated cleanup policies
- **Audit Logging**: All access tracked
- **GDPR Compliance**: Right to deletion supported

---

## Integration Patterns

### External Integrations

#### Market Data
- **APIs**: Financial markets, competitor analysis
- **Webhooks**: Real-time updates
- **Batch**: Nightly data synchronization
- **Caching**: Redis for frequently accessed data

#### AI Services
- **OpenAI**: GPT-4 for text generation
- **Anthropic**: Claude for analysis
- **Custom Models**: Specialized ML models
- **Vector Database**: Embedding storage

#### Third-Party Tools
- **GitHub**: Code repository and CI/CD
- **Slack**: Notifications and alerts
- **Google Workspace**: Document collaboration
- **Analytics**: Mixpanel, Segment

### Internal Communication

#### Service-to-Service
```javascript
// RESTful HTTP
await fetch('http://service/api/resource', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Message Queue
await queue.publish('topic', { event: 'DATA_UPDATED' });

// gRPC (future)
const response = await client.callMethod(request);
```

#### Database Events
```javascript
// Supabase Realtime
const subscription = supabase
  .from('strategic_directives_v2')
  .on('INSERT', handleInsert)
  .on('UPDATE', handleUpdate)
  .subscribe();
```

---

## Deployment Architecture

### Infrastructure

#### Kubernetes Deployment
```yaml
Services:
  - ehg-app (3 replicas)
  - ehg-engineer (2 replicas)
  - eva-service (2 replicas)
  - sdip-processor (1 replica)

Resources:
  - PostgreSQL (Supabase managed)
  - Redis (caching)
  - RabbitMQ (messaging)
  - MinIO (object storage)
```

#### Environment Separation
- **Development**: Local Docker Compose
- **Staging**: Kubernetes namespace
- **Production**: Dedicated cluster
- **DR Site**: Hot standby

### Monitoring & Observability

#### Metrics
- Application performance (APM)
- Database query performance
- API response times
- Error rates and exceptions
- Resource utilization

#### Logging
- Centralized log aggregation
- Structured JSON logging
- Log levels (DEBUG, INFO, WARN, ERROR)
- Correlation IDs for tracing

#### Alerting
- Critical: Immediate page
- High: Email + Slack
- Medium: Daily digest
- Low: Weekly report

---

## Sources of Truth
- **Architecture Diagrams**: `/docs/01_architecture/`
- **Database Schema**: `database/schema/` in both repos
- **API Documentation**: `/docs/02_api/`
- **Component Library**: Storybook instances
- **Security Policies**: Compliance documentation

**Last updated**: 2025-01-14