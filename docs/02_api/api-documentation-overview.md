# EHG Engineer API Documentation

## Overview

The EHG Engineer system provides REST API endpoints for managing Strategic Directives (SDs), Product Requirements Documents (PRDs), and monitoring agent activities.

## Base URL

```
http://localhost:3456/api
```

## Authentication

Currently, the API is designed for development use and does not require authentication. In production, implement appropriate authentication mechanisms.

## Endpoints

### Strategic Directives

#### GET /api/sds
Retrieve all Strategic Directives

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "SD-2025-001",
      "title": "Strategic Directive Title",
      "status": "active",
      "priority": "high",
      "created_at": "2025-01-01T00:00:00Z",
      "metadata": {}
    }
  ]
}
```

#### GET /api/sds/:id
Retrieve a specific Strategic Directive

**Parameters:**
- `id` (string): Strategic Directive ID (e.g., SD-2025-001)

**Response:**
```json
{
  "status": "success",
  "data": {
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
}
```

#### POST /api/sds
Create a new Strategic Directive

**Request Body:**
```json
{
  "title": "New Strategic Directive",
  "description": "Description of the directive",
  "priority": "high",
  "objectives": [
    "Objective 1",
    "Objective 2"
  ]
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "SD-2025-002",
    "message": "Strategic Directive created successfully"
  }
}
```

### Product Requirements Documents

#### GET /api/prds
Retrieve all PRDs

**Query Parameters:**
- `directive_id` (optional): Filter by Strategic Directive ID
- `status` (optional): Filter by status (draft, approved, in_progress)

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "PRD-2025-001",
      "directive_id": "SD-2025-001",
      "title": "Product Requirements",
      "status": "draft",
      "phase": "PLAN",
      "progress": 20
    }
  ]
}
```

#### GET /api/prds/:id
Retrieve a specific PRD

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "PRD-2025-001",
    "directive_id": "SD-2025-001",
    "title": "Product Requirements",
    "status": "approved",
    "phase": "EXEC",
    "progress": 45,
    "requirements": {
      "functional": [],
      "non_functional": [],
      "acceptance_criteria": []
    },
    "metadata": {}
  }
}
```

### Agent Management

#### GET /api/agents/status
Get status of all sub-agents

**Response:**
```json
{
  "status": "success",
  "data": {
    "agents": {
      "security": {
        "status": "idle",
        "last_run": "2025-01-01T00:00:00Z",
        "findings": 0
      },
      "performance": {
        "status": "running",
        "last_run": "2025-01-01T00:00:00Z",
        "findings": 5
      },
      "testing": {
        "status": "idle",
        "last_run": null,
        "findings": 0
      }
    }
  }
}
```

#### POST /api/agents/run
Trigger a sub-agent analysis

**Request Body:**
```json
{
  "agent": "security",
  "target": "/path/to/analyze",
  "options": {
    "timeout": 60000,
    "depth": "full"
  }
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "agent": "security",
    "job_id": "job-123456",
    "status": "running"
  }
}
```

### Dashboard Control

#### POST /api/refresh
Trigger dashboard data refresh

**Request Body:**
```json
{
  "type": "full",
  "entities": ["sds", "prds", "agents"]
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Refresh triggered",
  "timestamp": "2025-01-01T00:00:00Z"
}
```

### Monitoring

#### GET /api/health
Health check endpoint

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600,
  "database": "connected",
  "agents": "ready",
  "timestamp": "2025-01-01T00:00:00Z"
}
```

#### GET /api/metrics
System metrics

**Response:**
```json
{
  "status": "success",
  "data": {
    "sds": {
      "total": 10,
      "active": 5,
      "completed": 3,
      "archived": 2
    },
    "prds": {
      "total": 8,
      "approved": 4,
      "draft": 3,
      "rejected": 1
    },
    "agents": {
      "total_runs": 156,
      "successful": 150,
      "failed": 6
    }
  }
}
```

## WebSocket API

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3456');
```

### Events

#### Client → Server

**subscribe**
```json
{
  "type": "subscribe",
  "channels": ["sds", "prds", "agents"]
}
```

**unsubscribe**
```json
{
  "type": "unsubscribe",
  "channels": ["agents"]
}
```

#### Server → Client

**update**
```json
{
  "type": "update",
  "entity": "sd",
  "id": "SD-2025-001",
  "data": {
    "status": "completed"
  }
}
```

**refresh**
```json
{
  "type": "refresh",
  "reason": "Data sync required"
}
```

## Error Handling

All endpoints follow a consistent error response format:

```json
{
  "status": "error",
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Strategic Directive not found",
    "details": {
      "id": "SD-2025-999"
    }
  }
}
```

### Common Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `RESOURCE_NOT_FOUND` | Requested resource doesn't exist | 404 |
| `VALIDATION_ERROR` | Request validation failed | 400 |
| `UNAUTHORIZED` | Authentication required | 401 |
| `FORBIDDEN` | Access denied | 403 |
| `INTERNAL_ERROR` | Server error | 500 |
| `RATE_LIMITED` | Too many requests | 429 |

## Rate Limiting

Development mode: No rate limiting
Production: 100 requests per minute per IP

## Examples

### cURL Examples

```bash
# Get all Strategic Directives
curl http://localhost:3456/api/sds

# Get specific PRD
curl http://localhost:3456/api/prds/PRD-2025-001

# Trigger security agent
curl -X POST http://localhost:3456/api/agents/run \
  -H "Content-Type: application/json" \
  -d '{"agent":"security","target":"."}'

# Health check
curl http://localhost:3456/api/health
```

### JavaScript Examples

```javascript
// Fetch Strategic Directives
async function getStrategicDirectives() {
  const response = await fetch('http://localhost:3456/api/sds');
  const data = await response.json();
  return data.data;
}

// WebSocket connection
const ws = new WebSocket('ws://localhost:3456');

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    channels: ['sds', 'prds']
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('Update received:', message);
});
```

## Development Notes

- All endpoints return JSON
- Use appropriate HTTP status codes
- Include request ID in responses for debugging
- Log all API calls in development mode
- Implement caching for frequently accessed data
- Use connection pooling for database queries

---

*API Version: 1.0.0 | LEO Protocol v4.1.2*