# EHG Engineer API Documentation

## Overview

The EHG Engineer system provides REST API endpoints for managing Strategic Directives (SDs), Product Requirements Documents (PRDs), Ventures, and various AI-powered features.

## Base URL

```
http://localhost:3000/api
```

> **Note**: Port 3000 is the default. EHG_Engineer serves as the backend API for the EHG unified frontend at port 8080.

## Authentication

Currently, the API is designed for development use. In production, implement appropriate authentication mechanisms via Supabase Auth.

---

## Table of Contents

1. [Strategic Directives](#strategic-directives)
2. [Product Requirements Documents](#product-requirements-documents)
3. [SDIP (Strategic Directive Input Process)](#sdip-strategic-directive-input-process)
4. [Backlog Management](#backlog-management)
5. [Ventures API](#ventures-api)
6. [Story API](#story-api)
7. [Discovery API](#discovery-api)
8. [Blueprints API](#blueprints-api)
9. [Calibration API](#calibration-api-sovereign-pipe-v370)
10. [Testing Campaign API](#testing-campaign-api)
11. [PR Review System](#pr-review-system)
12. [Dashboard & Status](#dashboard--status)
13. [Venture-Scoped API (v2)](#venture-scoped-api-v2)
14. [WebSocket API](#websocket-api)
15. [Error Handling](#error-handling)

---

## Strategic Directives

### GET /api/sd
Retrieve all Strategic Directives from the dashboard state.

**Response:**
```json
[
  {
    "id": "SD-2025-001",
    "title": "Strategic Directive Title",
    "status": "active",
    "priority": "high",
    "is_working_on": false,
    "created_at": "2025-01-01T00:00:00Z",
    "metadata": {}
  }
]
```

### GET /api/sd/:id
Retrieve a specific Strategic Directive.

**Parameters:**
- `id` (string): Strategic Directive ID (e.g., SD-2025-001)

**Response:**
```json
{
  "id": "SD-2025-001",
  "title": "Strategic Directive Title",
  "description": "Detailed description",
  "status": "active",
  "priority": "high",
  "objectives": [],
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-01T00:00:00Z",
  "metadata": {
    "lead_agent": "LEAD",
    "phase": "planning"
  }
}
```

**Error Response (404):**
```json
{ "error": "Strategic Directive not found" }
```

---

## Product Requirements Documents

### GET /api/prd
Retrieve all PRDs from the dashboard state.

**Response:**
```json
[
  {
    "id": "PRD-2025-001",
    "sd_id": "SD-2025-001",
    "title": "Product Requirements",
    "status": "draft",
    "phase": "PLAN",
    "progress": 20
  }
]
```

### GET /api/prd/:id
Retrieve a specific PRD by ID.

**Response:**
```json
{
  "id": "PRD-2025-001",
  "sd_id": "SD-2025-001",
  "title": "Product Requirements",
  "status": "approved",
  "phase": "EXEC",
  "progress": 45,
  "requirements": {
    "functional": [],
    "non_functional": [],
    "acceptance_criteria": []
  }
}
```

### GET /api/prd/:sd_id
Retrieve PRD by Strategic Directive ID (from `product_requirements_v3` table).

**Query Parameters:**
- `format` (optional): `json` (default) or `md` for markdown content

**Response (JSON):**
```json
{
  "prd_id": "uuid",
  "sd_id": "SD-2025-001",
  "version": 1,
  "status": "approved",
  "content_json": {},
  "generated_at": "2025-01-01T00:00:00Z",
  "metadata": {
    "import_run_id": "uuid",
    "notes": "..."
  }
}
```

**Response (Markdown, format=md):**
Returns raw markdown content with `Content-Type: text/markdown`.

---

## SDIP (Strategic Directive Input Process)

The SDIP API powers the Directive Lab wizard for creating new Strategic Directives.

### POST /api/sdip/submit
Submit a new directive intake (Step 1).

**Request Body:**
```json
{
  "chairman_input": "User's initial input describing the directive",
  "submission_title": "Optional title",
  "current_step": 1
}
```

**Response:**
```json
{
  "success": true,
  "submission": {
    "id": "uuid",
    "chairman_input": "...",
    "current_step": 1,
    "created_at": "2025-01-01T00:00:00Z"
  }
}
```

**Background Enhancement:**
If OpenAI is configured, background enhancement generates:
- Intent summary (80 words)
- Decision-shaping questions
- Comprehensive description (200-300 words)
- Codebase findings

### PUT /api/sdip/submissions/:id/step/:stepNumber
Update submission with step-specific data.

**Parameters:**
- `id` (string): Submission UUID
- `stepNumber` (integer): Step number (1-7)

**Request Body:**
```json
{
  "feedback": "User feedback for this step",
  "intent_summary": "Generated intent"
}
```

**Response:**
```json
{
  "success": true,
  "submission": { ... },
  "message": "Step 2 data updated successfully"
}
```

### GET /api/sdip/submissions
List recent SDIP submissions.

**Response:**
```json
[
  {
    "id": "uuid",
    "submission_title": "My Directive",
    "current_step": 3,
    "gate_status": {},
    "created_at": "2025-01-01T00:00:00Z"
  }
]
```

### DELETE /api/sdip/submissions/:id
Delete a submission.

**Response:**
```json
{ "success": true, "id": "uuid" }
```

### POST /api/sdip/screenshot
Upload screenshot for a submission.

**Request Body:**
```json
{
  "submissionId": "uuid",
  "screenshot": "base64-encoded-data"
}
```

### GET /api/sdip/progress/:id
Get submission progress.

**Response:**
```json
{
  "current_step": 3,
  "total_steps": 7,
  "completion_percentage": 42.8
}
```

### POST /api/sdip/create-strategic-directive
Create Strategic Directive from completed SDIP submission.

**Request Body:**
```json
{
  "submission_id": "uuid",
  "priority": "high"
}
```

**Response:**
```json
{
  "success": true,
  "sd_id": "SD-2026-0103-ABC",
  "redirect_url": "/strategic-directives/SD-2026-0103-ABC",
  "message": "Strategic Directive created successfully"
}
```

---

## Backlog Management

### GET /api/backlog/strategic-directives
Get strategic directives from backlog view.

**Query Parameters:**
- `tier` (optional): Filter by triage tier (e.g., "MVP", "Nice-to-Have")
- `page` (optional): Filter by page title
- `minMustHave` (optional): Minimum must-have percentage (0-100)
- `sort` (optional): `sequence` (default) or `priority`

**Response:**
```json
[
  {
    "sd_id": "SD-2025-001",
    "rolled_triage": "MVP",
    "must_have_pct": 85.5,
    "sequence_rank": 1,
    "page_title": "Core Features"
  }
]
```

### GET /api/backlog/strategic-directives/:sd_id
Get SD detail with backlog items.

**Response:**
```json
{
  "sd_id": "SD-2025-001",
  "rolled_triage": "MVP",
  "must_have_pct": 85.5,
  "backlog_items": [
    {
      "id": "uuid",
      "backlog_title": "Feature X",
      "stage_number": 1,
      "priority": "high"
    }
  ]
}
```

### GET /api/backlog/strategic-directives-with-items
Get all SDs with their backlog items in a single optimized query.

**Query Parameters:** Same as `/api/backlog/strategic-directives`

**Response:**
```json
[
  {
    "sd_id": "SD-2025-001",
    "rolled_triage": "MVP",
    "backlog_items": [ ... ]
  }
]
```

### GET /api/strategic-directives/:sd_id/backlog-summary
Generate AI-powered summary of SD backlog items.

**Query Parameters:**
- `force_refresh` (optional): Set to `true` to regenerate summary

**Response:**
```json
{
  "summary": "7-sentence AI-generated summary of backlog items...",
  "itemCount": 15,
  "generated_at": "2025-01-01T00:00:00Z",
  "from_database": false
}
```

**Error Response (503):**
```json
{
  "error": "AI service not available",
  "fallback": "OpenAI API key not configured"
}
```

---

## Ventures API

### GET /api/ventures
Get all ventures.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Venture Name",
    "description": "Description",
    "stage": 3,
    "current_stage": 3,
    "status": "active",
    "created_at": "2025-01-01T00:00:00Z"
  }
]
```

### GET /api/ventures/:id
Get single venture by ID.

**Response:**
```json
{
  "id": "uuid",
  "name": "Venture Name",
  "description": "Description",
  "problem_statement": "Problem being solved",
  "solution": "Proposed solution",
  "target_market": "Target market",
  "stage": 3,
  "status": "active"
}
```

### POST /api/ventures
Create new venture.

**Request Body:**
```json
{
  "name": "New Venture",
  "description": "Venture description",
  "problem_statement": "Problem statement (becomes immutable raw_chairman_intent)",
  "solution": "Proposed solution",
  "target_market": "Target market",
  "origin_type": "manual",
  "competitor_ref": null
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "New Venture",
  "stage": 1,
  "status": "active"
}
```

### GET /api/ventures/:id/artifacts
Get artifacts for a venture.

**Query Parameters:**
- `stage` (optional): Filter by lifecycle stage (1-25)

**Response:**
```json
[
  {
    "id": "uuid",
    "venture_id": "uuid",
    "stage": 3,
    "type": "market_analysis",
    "title": "Market Analysis v2",
    "content": "...",
    "version": 2,
    "created_at": "2025-01-01T00:00:00Z"
  }
]
```

### POST /api/ventures/:id/artifacts
Create or update artifact for a venture stage.

**Request Body:**
```json
{
  "stage": 3,
  "artifact_type": "market_analysis",
  "title": "Market Analysis",
  "content": "Content here...",
  "metadata": {}
}
```

**Response:**
```json
{
  "id": "uuid",
  "venture_id": "uuid",
  "stage": 3,
  "type": "market_analysis",
  "title": "Market Analysis",
  "version": 1
}
```

### PATCH /api/ventures/:id/stage
Update venture stage (1-25).

**Request Body:**
```json
{ "stage": 5 }
```

**Response:** Updated venture object.

### POST /api/competitor-analysis
Analyze competitor URL for venture creation.

**Request Body:**
```json
{
  "url": "https://competitor.com",
  "include_full_analysis": false
}
```

**Response:**
```json
{
  "success": true,
  "venture": {
    "name": "COMPETITOR Alternative",
    "problem_statement": "Extracted problem statement",
    "solution": "Proposed solution",
    "target_market": "Target market",
    "competitor_reference": "https://competitor.com"
  },
  "four_buckets_summary": {
    "facts_count": 5,
    "assumptions_count": 3,
    "simulations_count": 2,
    "unknowns_count": 4
  },
  "quality": {
    "confidence_score": 75,
    "data_quality": "good"
  }
}
```

---

## Story API

### POST /api/stories/generate
Generate user stories from PRD acceptance criteria.

**Request Body:**
```json
{
  "sd_key": "SD-2025-001",
  "prd_id": "uuid",
  "mode": "dry_run"
}
```

**Response:**
```json
{
  "status": "success",
  "mode": "dry_run",
  "sd_key": "SD-2025-001",
  "story_count": 3,
  "stories": [
    {
      "action": "would_insert",
      "story_key": "SD-2025-001:US-a3b4c5d6",
      "sequence_no": 1,
      "title": "User can submit directive"
    }
  ]
}
```

### GET /api/stories
List stories for an SD.

**Query Parameters:**
- `sd_key` (required): Strategic Directive key
- `status` (optional): Filter by status (passing, failing, not_run)
- `limit` (optional): Max results (default 50)

**Response:**
```json
[
  {
    "story_key": "SD-2025-001:US-a3b4c5d6",
    "title": "User can submit directive",
    "verification_status": "passing",
    "sequence_no": 1
  }
]
```

### POST /api/stories/verify
Verify stories (CI webhook integration).

**Request Body:**
```json
{
  "story_keys": ["SD-2025-001:US-a3b4c5d6"],
  "test_run_id": "tr-2025-001",
  "build_id": "ci-4567",
  "status": "passing",
  "coverage_pct": 95.0,
  "artifacts": ["s3://bucket/test.log"]
}
```

### GET /api/stories/gate
Get release gate status for stories.

**Query Parameters:**
- `sd_key` (required): Strategic Directive key

**Response:**
```json
{
  "sd_key": "SD-2025-001",
  "ready": true,
  "passing_pct": 95.5,
  "total_stories": 10,
  "passing_stories": 9
}
```

### GET /api/stories/health
Story API health check.

**Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "feature_flags": {
    "auto_stories": false,
    "story_agent": false
  }
}
```

---

## Discovery API

AI-powered opportunity discovery for new ventures.

### POST /api/discovery/scan
Trigger a new opportunity discovery scan.

**Request Body:**
```json
{
  "scan_type": "competitor",
  "target_url": "https://example.com",
  "target_market": "fintech"
}
```

**Response:**
```json
{
  "scan_id": "uuid",
  "status": "running",
  "scan_type": "competitor"
}
```

### GET /api/discovery/opportunities
Get AI-generated opportunities.

**Query Parameters:**
- `box` (optional): green, yellow, or red
- `status` (optional): pending, approved, rejected
- `minScore` (optional): Minimum confidence score (0-100)
- `scanId` (optional): Filter by scan ID

**Response:**
```json
{
  "opportunities": [
    {
      "id": "uuid",
      "name": "Opportunity Name",
      "confidence_score": 85,
      "opportunity_box": "green"
    }
  ],
  "count": 5
}
```

### GET /api/discovery/scans
Get recent discovery scans.

**Query Parameters:**
- `limit` (optional): Max results (default 10)

**Response:**
```json
{
  "scans": [
    {
      "id": "uuid",
      "scan_type": "competitor",
      "status": "completed",
      "created_at": "2025-01-01T00:00:00Z"
    }
  ],
  "count": 5
}
```

### POST /api/discovery/decision
Chairman approve/reject an AI-generated blueprint.

**Request Body:**
```json
{
  "blueprint_id": "uuid",
  "decision": "approved",
  "feedback": "Optional feedback"
}
```

**Response:**
```json
{
  "success": true,
  "blueprint": { ... }
}
```

---

## Blueprints API

### GET /api/blueprints
Get opportunity blueprints.

**Query Parameters:**
- `source` (optional): ai_generated, manual, or all
- `box` (optional): green, yellow, red
- `status` (optional): pending, approved, rejected
- `limit` (optional): Max results (default 50)

**Response:**
```json
{
  "blueprints": [
    {
      "id": "uuid",
      "name": "Blueprint Name",
      "source_type": "ai_generated",
      "opportunity_box": "green",
      "chairman_status": "pending",
      "confidence_score": 85
    }
  ],
  "count": 10
}
```

### GET /api/blueprints/:id
Get single blueprint by ID.

**Response:** Full blueprint object.

---

## Calibration API (Sovereign Pipe v3.7.0)

### GET /api/calibration/venture/:venture_id
Get calibration score for a specific venture.

**Response:**
```json
{
  "success": true,
  "venture_id": "uuid",
  "calibration_score": 0.85,
  "truth_delta": 0.12
}
```

### GET /api/calibration/threshold/:sd_id
Get adaptive threshold for a strategic directive.

**Query Parameters:**
- `gate_number` (optional): Gate number (default 1)

**Response:**
```json
{
  "sd_id": "SD-2025-001",
  "gate_number": 1,
  "threshold": 85,
  "breakdown": {
    "base": 80,
    "adjustments": []
  },
  "reasoning": "Threshold calculation explanation"
}
```

### POST /api/calibration/compute
Compute 60/40 Truth Delta.

**Request Body:**
```json
{
  "business_accuracy": 0.85,
  "technical_accuracy": 0.90,
  "vertical": "fintech"
}
```

**Response:**
```json
{
  "truth_delta": {
    "business_weight": 0.6,
    "technical_weight": 0.4,
    "truth_delta": 0.87
  },
  "normalized": { ... }
}
```

### GET /api/calibration/portfolio
Calibrate entire portfolio (Chairman only).

**Response:**
```json
{
  "success": true,
  "ventures_calibrated": 5,
  "average_calibration": 0.82
}
```

---

## Testing Campaign API

Manage automated testing campaigns across applications.

### GET /api/testing/campaign/status
Get current campaign status.

**Response:**
```json
{
  "running": true,
  "status": "running",
  "targetApplication": "EHG",
  "progress": "5/20",
  "percent": 25,
  "currentSD": "SD-2025-001",
  "lastUpdate": "2025-01-01T00:00:00Z",
  "pid": 12345
}
```

### GET /api/testing/campaign/health
Get health report with heartbeat, checkpoint, and alerts.

**Response:**
```json
{
  "heartbeat": { ... },
  "checkpoint": { ... },
  "status": { ... },
  "alerts": ["Alert 1", "Alert 2"],
  "processAlive": true,
  "lastCheck": "2025-01-01T00:00:00Z"
}
```

### GET /api/testing/campaign/apps
Get SD counts by application.

**Response:**
```json
{
  "EHG": {
    "total": 50,
    "tested": 30,
    "untested": 15,
    "completed": 45
  },
  "EHG_Engineer": {
    "total": 25,
    "tested": 20,
    "untested": 3,
    "completed": 22
  }
}
```

### POST /api/testing/campaign/start
Start a testing campaign.

**Request Body:**
```json
{
  "targetApplication": "EHG",
  "smokeOnly": false
}
```

**Response:**
```json
{
  "started": true,
  "pid": 12345,
  "targetApplication": "EHG"
}
```

### POST /api/testing/campaign/stop
Stop the running campaign.

**Response:**
```json
{
  "stopped": true,
  "pid": 12345,
  "cleaned": true
}
```

### GET /api/testing/campaign/logs/:type
Get campaign logs.

**Parameters:**
- `type`: progress, errors, or alerts

**Query Parameters:**
- `limit` (optional): Max lines (default 100)

**Response:**
```json
{
  "lines": [
    "[2025-01-01 10:00:00] Testing SD-2025-001...",
    "[2025-01-01 10:01:00] Completed SD-2025-001"
  ]
}
```

---

## PR Review System

Agentic PR review integration.

### GET /api/pr-reviews
Get all PR reviews.

**Response:**
```json
[
  {
    "id": "uuid",
    "pr_number": 123,
    "status": "approved",
    "reviewer": "security-agent",
    "created_at": "2025-01-01T00:00:00Z"
  }
]
```

### GET /api/pr-reviews/metrics
Get PR review metrics.

**Response:**
```json
{
  "totalToday": 15,
  "passRate": 92.5,
  "avgTime": 45,
  "falsePositiveRate": 2.1,
  "complianceRate": 98.5
}
```

### POST /api/github/pr-review-webhook
GitHub webhook for PR review updates.

**Request Body:**
```json
{
  "pr_number": 123,
  "status": "approved",
  "reviewer": "security-agent",
  "comments": []
}
```

---

## Dashboard & Status

### GET /api/status
Get LEO Protocol status.

**Response:**
```json
{
  "leoProtocol": {
    "version": "v4.3.3",
    "activeRole": "EXEC",
    "currentSD": "SD-2025-001",
    "phase": "execution"
  },
  "context": {
    "usage": 45000,
    "total": 180000,
    "breakdown": {}
  },
  "progress": {
    "overall": 65,
    "byPhase": {}
  },
  "application": {
    "name": "EHG_Engineer",
    "version": "1.0.0"
  }
}
```

### GET /api/state
Get complete dashboard state.

**Response:** Full dashboard state object including SDs, PRDs, execution sequences, context, and progress.

### GET /api/ees
Get execution sequences.

**Response:**
```json
[
  {
    "id": "uuid",
    "sd_id": "SD-2025-001",
    "sequence_number": 1,
    "status": "completed"
  }
]
```

### GET /api/context
Get context usage information.

### GET /api/progress
Get progress tracking data.

### GET /api/handoff
Get handoff records.

### GET /api/eva/status
Get EVA Voice Assistant status.

**Response:**
```json
{
  "enabled": false,
  "message": "EVA Voice Assistant will be implemented with OpenAI Realtime API"
}
```

### GET /api/integrity-metrics
Get integrity metrics for backlog and ideation.

**Response:**
```json
{
  "backlog": [...],
  "ideation": [...]
}
```

### GET /api/metrics
Get system metrics (mock endpoint).

**Response:**
```json
{
  "tests": { "total": 0, "passed": 0, "failed": 0 },
  "coverage": { "lines": 0, "branches": 0, "functions": 0, "statements": 0 },
  "git": { "branch": "main", "uncommittedChanges": 0, "lastCommit": "" }
}
```

---

## Venture-Scoped API (v2)

Venture-scoped endpoints for filtered data access.

### GET /api/v2/ventures/:venture_id/strategic-directives
Get SDs scoped to a specific venture.

**Response:**
```json
{
  "venture_id": "uuid",
  "count": 5,
  "strategic_directives": [...]
}
```

### GET /api/v2/ventures/:venture_id/prds
Get PRDs scoped to a specific venture.

**Response:**
```json
{
  "venture_id": "uuid",
  "count": 3,
  "prds": [...]
}
```

### GET /api/v2/ventures/:venture_id/backlog
Get backlog items scoped to a specific venture.

**Response:**
```json
{
  "venture_id": "uuid",
  "sd_count": 5,
  "backlog_count": 25,
  "backlog_items": [...]
}
```

---

## WebSocket API

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3000');
```

### Client Messages

**setActiveSD** - Set the active Strategic Directive:
```json
{
  "type": "setActiveSD",
  "data": { "sdId": "SD-2025-001" }
}
```

**updateSDStatus** - Update SD status:
```json
{
  "type": "updateSDStatus",
  "data": { "sdId": "SD-2025-001", "status": "completed" }
}
```

**updateSDPriority** - Update SD priority:
```json
{
  "type": "updateSDPriority",
  "data": { "sdId": "SD-2025-001", "priority": "high" }
}
```

### Server Messages

**state** - Full dashboard state:
```json
{
  "type": "state",
  "data": { ... }
}
```

**realtime-update** - Database change notification:
```json
{
  "type": "realtime-update",
  "data": { "type": "strategicDirectives", "data": [...] }
}
```

**sdip_submission** - New SDIP submission:
```json
{
  "type": "sdip_submission",
  "data": { ... }
}
```

**sdip_step_update** - SDIP step update:
```json
{
  "type": "sdip_step_update",
  "submissionId": "uuid",
  "stepNumber": 2,
  "data": { ... }
}
```

**error** - Error notification:
```json
{
  "type": "error",
  "message": "Error description"
}
```

---

## Error Handling

All endpoints follow a consistent error response format:

```json
{
  "error": "RESOURCE_NOT_FOUND",
  "message": "Strategic Directive not found",
  "details": {
    "id": "SD-2025-999"
  }
}
```

### EVA Error Format (Sovereign Pipe v3.7.0)

For calibration and venture-scoped endpoints:
```json
{
  "alert": "Venture calibration not found",
  "severity": "MEDIUM",
  "category": "CALIBRATION",
  "diagnosis": ["Check venture_id exists", "Verify calibration has run"]
}
```

### Common HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request / Validation Error |
| 404 | Resource Not Found |
| 500 | Internal Server Error |
| 503 | Service Unavailable (e.g., AI service) |

---

## Rate Limiting

- **Development mode**: No rate limiting
- **Production**: 100 requests per minute per IP

---

## Examples

### cURL Examples

```bash
# Get all Strategic Directives
curl http://localhost:3000/api/sd

# Get specific SD
curl http://localhost:3000/api/sd/SD-2025-001

# Get PRD for an SD
curl http://localhost:3000/api/prd/SD-2025-001

# Generate backlog summary
curl http://localhost:3000/api/strategic-directives/SD-2025-001/backlog-summary

# Start testing campaign
curl -X POST http://localhost:3000/api/testing/campaign/start \
  -H "Content-Type: application/json" \
  -d '{"targetApplication":"EHG","smokeOnly":false}'

# Get venture artifacts
curl http://localhost:3000/api/ventures/uuid-here/artifacts?stage=3

# Compute truth delta
curl -X POST http://localhost:3000/api/calibration/compute \
  -H "Content-Type: application/json" \
  -d '{"business_accuracy":0.85,"technical_accuracy":0.90}'
```

### JavaScript Examples

```javascript
// Fetch Strategic Directives
async function getStrategicDirectives() {
  const response = await fetch('http://localhost:3000/api/sd');
  return await response.json();
}

// WebSocket connection
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  console.log('Connected to EHG_Engineer WebSocket');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'state') {
    console.log('Dashboard state:', message.data);
  }
};

// Set active SD via WebSocket
ws.send(JSON.stringify({
  type: 'setActiveSD',
  data: { sdId: 'SD-2025-001' }
}));
```

---

## Development Notes

- All endpoints return JSON unless otherwise specified
- WebSocket provides real-time updates for dashboard state
- OpenAI integration required for AI-powered features (backlog summary, competitor analysis)
- Supabase realtime subscriptions provide automatic state updates
- CORS configured for EHG frontend at port 8080

---

*API Version: 2.0.0 | LEO Protocol v4.3.3*
*Last Updated: 2026-01-03*
