---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Server Architecture Guide



## Table of Contents

- [Metadata](#metadata)
- [Quick Reference](#quick-reference)
- [1. Server.js Orchestrator & WS Lifecycle](#1-serverjs-orchestrator-ws-lifecycle)
  - [Express Server Setup](#express-server-setup)
  - [WebSocket Lifecycle](#websocket-lifecycle)
- [2. SDIP Route Extraction Module](#2-sdip-route-extraction-module)
  - [Route Organization](#route-organization)
  - [Route Extraction Pattern](#route-extraction-pattern)
- [3. Domain Route Modules](#3-domain-route-modules)
  - [Available Route Modules](#available-route-modules)
  - [Standard Route Patterns](#standard-route-patterns)
- [4. Central Route Registration](#4-central-route-registration)
  - [Registration Pattern](#registration-pattern)
- [5. Backlog Formatter Utility](#5-backlog-formatter-utility)
  - [Purpose](#purpose)
- [6. OpenAI Utilities & Error Norms](#6-openai-utilities-error-norms)
  - [OpenAI Client Setup](#openai-client-setup)
  - [Error Handling Norms](#error-handling-norms)
- [API Response Standards](#api-response-standards)
  - [Success Response](#success-response)
  - [Error Response](#error-response)
- [Best Practices](#best-practices)
  - [DO](#do)
  - [DON'T](#dont)
- [Related Documentation](#related-documentation)

## Metadata
- **Category**: Architecture
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: api, guide, protocol, leo

**SD-REFACTOR-SERVER-001: Server Architecture Documentation**

This guide documents the EHG_Engineer server architecture, API endpoint patterns, and WebSocket integration.

## Quick Reference

| Component | Location | Purpose | LOC |
|-----------|----------|---------|-----|
| Main Server | server.js | Express orchestrator | ~400 |
| Routes | routes/*.js | API endpoints | ~800 |
| WebSocket | lib/websocket/ | Real-time updates | ~300 |
| Middleware | middleware/ | Request processing | ~200 |

---

## 1. Server.js Orchestrator & WS Lifecycle

### Express Server Setup

```javascript
// server.js - Main entry point
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());

// Route registration
registerRoutes(app);

// WebSocket lifecycle
wss.on('connection', handleConnection);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`EHG_Engineer server running on port ${PORT}`);
});
```

### WebSocket Lifecycle

```javascript
// lib/websocket/connection-handler.js

function handleConnection(ws, req) {
  const clientId = generateClientId();

  // Connection established
  console.log(`WebSocket connected: ${clientId}`);
  clients.set(clientId, ws);

  // Message handling
  ws.on('message', (data) => {
    handleMessage(clientId, JSON.parse(data));
  });

  // Heartbeat
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // Cleanup on close
  ws.on('close', () => {
    clients.delete(clientId);
    console.log(`WebSocket closed: ${clientId}`);
  });

  // Error handling
  ws.on('error', (error) => {
    console.error(`WebSocket error: ${clientId}`, error);
    clients.delete(clientId);
  });
}

// Heartbeat interval
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
```

---

## 2. SDIP Route Extraction Module

### Route Organization

```
routes/
├── index.js           # Central registration
├── sd.js              # Strategic Directives
├── prd.js             # Product Requirements
├── handoff.js         # Handoff operations
├── user-stories.js    # User story CRUD
├── sub-agents.js      # Sub-agent execution
├── retrospectives.js  # Retrospective CRUD
├── ventures.js        # Venture management
├── admin.js           # Admin operations
└── health.js          # Health checks
```

### Route Extraction Pattern

```javascript
// routes/sd.js - Strategic Directives route module
import express from 'express';
const router = express.Router();

// GET /api/sd - List SDs
router.get('/', async (req, res) => {
  const { status, category, limit } = req.query;
  // Implementation
});

// GET /api/sd/:id - Get SD by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  // Implementation
});

// POST /api/sd - Create SD
router.post('/', async (req, res) => {
  const sdData = req.body;
  // Implementation
});

// PATCH /api/sd/:id - Update SD
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  // Implementation
});

export default router;
```

---

## 3. Domain Route Modules

### Available Route Modules

| Module | Prefix | Purpose |
|--------|--------|---------|
| sd | /api/sd | Strategic Directive CRUD |
| prd | /api/prd | PRD CRUD |
| handoff | /api/handoff | Handoff execution |
| user-stories | /api/user-stories | User story management |
| sub-agents | /api/sub-agents | Sub-agent execution |
| retrospectives | /api/retrospectives | Retrospective CRUD |
| ventures | /api/ventures | Venture management |
| admin | /api/admin | Admin operations |
| health | /api/health | Health checks |

### Standard Route Patterns

```javascript
// Each route module follows this pattern:

// LIST - GET /api/{resource}
router.get('/', listHandler);

// READ - GET /api/{resource}/:id
router.get('/:id', readHandler);

// CREATE - POST /api/{resource}
router.post('/', createHandler);

// UPDATE - PATCH /api/{resource}/:id
router.patch('/:id', updateHandler);

// DELETE - DELETE /api/{resource}/:id
router.delete('/:id', deleteHandler);

// CUSTOM ACTIONS - POST /api/{resource}/:id/{action}
router.post('/:id/execute', executeHandler);
```

---

## 4. Central Route Registration

### Registration Pattern

```javascript
// routes/index.js - Central route registration

import sdRoutes from './sd.js';
import prdRoutes from './prd.js';
import handoffRoutes from './handoff.js';
import userStoriesRoutes from './user-stories.js';
import subAgentsRoutes from './sub-agents.js';
import retrospectivesRoutes from './retrospectives.js';
import venturesRoutes from './ventures.js';
import adminRoutes from './admin.js';
import healthRoutes from './health.js';

export function registerRoutes(app) {
  // API routes
  app.use('/api/sd', sdRoutes);
  app.use('/api/prd', prdRoutes);
  app.use('/api/handoff', handoffRoutes);
  app.use('/api/user-stories', userStoriesRoutes);
  app.use('/api/sub-agents', subAgentsRoutes);
  app.use('/api/retrospectives', retrospectivesRoutes);
  app.use('/api/ventures', venturesRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/health', healthRoutes);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
  });
}
```

---

## 5. Backlog Formatter Utility

### Purpose

Formats backlog items for consistent API responses.

```javascript
// lib/utils/backlog-formatter.js

export function formatBacklogItem(item) {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    priority: mapPriority(item.priority),
    category: item.category,
    created_at: item.created_at,
    updated_at: item.updated_at,
    metadata: {
      source: item.source_sd_id,
      linked_prd: item.prd_id,
      tags: item.tags || []
    }
  };
}

export function formatBacklogList(items) {
  return {
    items: items.map(formatBacklogItem),
    count: items.length,
    summary: {
      by_status: groupBy(items, 'status'),
      by_priority: groupBy(items, 'priority')
    }
  };
}

function mapPriority(priority) {
  const map = {
    1: 'critical',
    2: 'high',
    3: 'medium',
    4: 'low'
  };
  return map[priority] || 'medium';
}
```

---

## 6. OpenAI Utilities & Error Norms

### OpenAI Client Setup

```javascript
// lib/utils/openai-client.js

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generateCompletion(prompt, options = {}) {
  try {
    const response = await openai.chat.completions.create({
      model: options.model || 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 2000
    });

    return {
      success: true,
      content: response.choices[0].message.content,
      usage: response.usage
    };

  } catch (error) {
    return handleOpenAIError(error);
  }
}
```

### Error Handling Norms

```javascript
// lib/utils/openai-errors.js

export function handleOpenAIError(error) {
  const errorMap = {
    'rate_limit_exceeded': {
      status: 429,
      message: 'Rate limit exceeded. Please try again later.',
      retryable: true,
      retryAfter: 60
    },
    'insufficient_quota': {
      status: 402,
      message: 'OpenAI quota exceeded.',
      retryable: false
    },
    'invalid_api_key': {
      status: 401,
      message: 'Invalid OpenAI API key.',
      retryable: false
    },
    'model_not_found': {
      status: 404,
      message: 'Model not available.',
      retryable: false
    }
  };

  const errorType = error.error?.type || 'unknown';
  const mapped = errorMap[errorType] || {
    status: 500,
    message: 'OpenAI request failed.',
    retryable: true
  };

  return {
    success: false,
    error: mapped,
    originalError: error.message
  };
}
```

---

## API Response Standards

### Success Response

```javascript
{
  success: true,
  data: { /* response data */ },
  metadata: {
    timestamp: '2025-12-28T...',
    duration_ms: 123
  }
}
```

### Error Response

```javascript
{
  success: false,
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Invalid input',
    details: [/* field-level errors */]
  }
}
```

---

## Best Practices

### DO

- Use route modules for organization
- Follow RESTful conventions
- Handle WebSocket lifecycle properly
- Log all API errors
- Use standardized response formats

### DON'T

- Don't put business logic in routes
- Don't forget error handlers
- Don't skip WebSocket cleanup
- Don't hardcode configuration
- Don't ignore rate limits

---

## Related Documentation

- [Handoff System Guide](../leo/handoffs/handoff-system-guide.md) - Handoff API endpoints
- [Sub-Agent Patterns Guide](agent-patterns-guide.md) - Sub-agent execution
- [Agent Patterns Guide](./agent-patterns-guide.md) - Agent architecture

---

*Generated for SD-REFACTOR-SERVER-001 | LEO Protocol v4.3.3*
