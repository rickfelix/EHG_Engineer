# LEO Protocol API Documentation


## Metadata
- **Category**: API
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-20
- **Tags**: database, api, testing, security

## Overview

The LEO Protocol API provides programmatic access to gate validation, sub-agent coordination, and real-time status updates. All endpoints require authentication and are rate-limited.

## Base URL

```
https://your-app.com/api/leo
```

## Authentication

Include one of the following in your requests:

- **API Key**: `X-API-Key: your-api-key` header
- **Bearer Token**: `Authorization: Bearer your-token` header

## Rate Limiting

All endpoints are rate-limited using a token bucket algorithm:

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Read (GET) | 100 requests | 1 minute |
| Write (POST/PUT) | 50 requests | 1 minute |
| Compute | 10 requests | 5 minutes |

Rate limit headers are included in all responses:
- `X-RateLimit-Limit`: Maximum requests per window
- `X-RateLimit-Remaining`: Tokens remaining
- `X-RateLimit-Reset`: When the limit resets (ISO 8601)
- `Retry-After`: Seconds to wait when rate limited (429 responses only)

---

## Endpoints

### GET /api/leo/gate-scores

Retrieve gate validation scores for a PRD.

#### Request

```http
GET /api/leo/gate-scores?prd_id=PRD-SD-001
```

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prd_id` | string | Yes | PRD identifier |

#### Response

```json
{
  "prd_id": "PRD-SD-001",
  "gates": {
    "2A": {
      "score": 85.5,
      "passed": true,
      "last_updated": "2025-01-16T10:30:00Z"
    },
    "2B": {
      "score": 92.0,
      "passed": true,
      "last_updated": "2025-01-16T10:35:00Z"
    },
    "2C": {
      "score": 78.0,
      "passed": false,
      "last_updated": "2025-01-16T10:40:00Z"
    },
    "2D": {
      "score": 88.5,
      "passed": true,
      "last_updated": "2025-01-16T10:45:00Z"
    },
    "3": {
      "score": 0,
      "passed": false,
      "last_updated": "2025-01-16T10:50:00Z"
    }
  },
  "history": [
    {
      "gate": "2A",
      "score": 85.5,
      "evidence": {
        "hasADR": true,
        "hasInterfaces": true,
        "hasTechDesign": false
      },
      "created_at": "2025-01-16T10:30:00Z"
    }
  ],
  "last_updated": "2025-01-16T10:50:00Z",
  "total_gates": 5
}
```

**Status Codes**

- `200 OK`: Success
- `400 Bad Request`: Invalid PRD ID format
- `404 Not Found`: PRD does not exist
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

---

### POST /api/leo/sub-agent-reports

Submit sub-agent execution results and trigger gate recomputation.

#### Request

```http
POST /api/leo/sub-agent-reports
Content-Type: application/json
```

```json
{
  "prd_id": "PRD-SD-001",
  "agent": "SECURITY",
  "status": "pass",
  "evidence": {
    "owasp_scan": "clean",
    "csp_configured": true,
    "vulnerabilities": []
  },
  "message": "Security scan completed successfully"
}
```

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prd_id` | string | Yes | PRD identifier |
| `agent` | enum | Yes | Sub-agent code: `SECURITY`, `TESTING`, `PERFORMANCE`, `DATABASE`, `DESIGN` |
| `status` | enum | Yes | Execution status: `pending`, `running`, `pass`, `fail`, `error`, `timeout` |
| `evidence` | object | No | JSON evidence payload (default: `{}`) |
| `message` | string | No | Status message |
| `error_details` | string | No | Error details (for failed states) |

#### Response

**Success (200 OK)**

```json
{
  "accepted": true,
  "recomputed_gates": ["2C", "3"],
  "new_scores": {
    "2C": 85.0,
    "3": 88.5
  },
  "message": "Sub-agent report accepted, 2 gates recomputed"
}
```

**Validation Error (400 Bad Request)**

```json
{
  "accepted": false,
  "reason": "Invalid status transition from pass to running",
  "current_status": "pass",
  "allowed_transitions": []
}
```

**Status Codes**

- `200 OK`: Report accepted and processed
- `400 Bad Request`: Validation failed or invalid status transition
- `404 Not Found`: PRD or sub-agent not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

---

## WebSocket Events

Connect to receive real-time updates:

```javascript
const socket = io('wss://your-app.com', {
  path: '/socket.io',
  transports: ['websocket']
});

// Join LEO namespace
const leo = socket.of('/leo');

leo.on('connect', () => {
  console.log('Connected to LEO events');
});

leo.on('gate:updated', (event) => {
  console.log('Gate updated:', event);
});

leo.on('subagent:status', (event) => {
  console.log('Sub-agent status:', event);
});

leo.on('drift:detected', (event) => {
  console.log('Drift detected:', event);
});
```

### Event Types

#### gate:updated

Emitted when a gate score changes.

```json
{
  "v": 1,
  "ts": "2025-01-16T10:30:00Z",
  "prd_id": "PRD-SD-001",
  "gate": "2C",
  "score": 85.0,
  "passed": true
}
```

#### subagent:status

Emitted when a sub-agent status changes.

```json
{
  "v": 1,
  "ts": "2025-01-16T10:30:00Z",
  "prd_id": "PRD-SD-001",
  "agent": "SECURITY",
  "status": "running",
  "message": "Starting security scan"
}
```

#### drift:detected

Emitted when drift is detected in the system.

```json
{
  "v": 1,
  "ts": "2025-01-16T10:30:00Z",
  "type": "filesystem_drift",
  "count": 3,
  "files": ["/prds/PRD-SD-001.md"],
  "severity": "warning"
}
```

### Event Debouncing

Events are debounced with a 1-second window to prevent flooding. Multiple events of the same type for the same entity are coalesced into a single emission.

---

## Status Machine

Sub-agent status transitions follow strict state machine rules:

```
pending → running
running → pass | fail | error | timeout
```

Terminal states (`pass`, `fail`, `error`, `timeout`) cannot transition further.

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error type",
  "message": "Detailed error message",
  "details": ["Additional", "error", "details"]
}
```

Common error types:
- `Validation failed`: Request body/params invalid
- `Not found`: Resource doesn't exist
- `Method not allowed`: Wrong HTTP method
- `Too Many Requests`: Rate limit exceeded
- `Internal server error`: Server-side error

---

## Examples

### Check if PRD is ready for implementation

```bash
curl -H "X-API-Key: your-key" \
  "https://your-app.com/api/leo/gate-scores?prd_id=PRD-SD-001"
```

Check the response to see if all gates have `passed: true`.

### Submit security sub-agent results

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{
    "prd_id": "PRD-SD-001",
    "agent": "SECURITY",
    "status": "pass",
    "evidence": {
      "owasp_top_10": "clean",
      "csp": "configured",
      "auth": "implemented"
    }
  }' \
  "https://your-app.com/api/leo/sub-agent-reports"
```

### Monitor real-time updates

```javascript
// Node.js example
const io = require('socket.io-client');

const socket = io('wss://your-app.com/leo');

socket.on('gate:updated', ({ prd_id, gate, score, passed }) => {
  if (passed) {
    console.log(`✅ Gate ${gate} passed for ${prd_id} (${score}%)`);
  } else {
    console.log(`❌ Gate ${gate} failed for ${prd_id} (${score}%)`);
  }
});
```

---

## SDK Support

Official SDKs are planned for:
- TypeScript/JavaScript
- Python
- Go

For now, use any HTTP client that supports:
- Custom headers for authentication
- JSON request/response bodies
- WebSocket connections (for real-time events)

---

*Last Updated: 2025-01-16*
*API Version: 1.0.0*
*LEO Protocol Version: v4.1.2*