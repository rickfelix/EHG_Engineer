# LEO Protocol API

API documentation for programmatic access to the LEO Protocol system.

## Contents

| Document | Description |
|----------|-------------|
| [api.md](api.md) | Complete API reference |

## API Overview

The LEO Protocol API provides:
- Gate validation endpoints
- Sub-agent coordination
- Real-time WebSocket events
- Status monitoring

## Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/leo/gate-scores` | GET | Get gate scores for a PRD |
| `/api/leo/sub-agent-reports` | POST | Submit sub-agent results |

## Authentication

All endpoints require authentication via:
- API Key: `X-API-Key: your-api-key`
- Bearer Token: `Authorization: Bearer your-token`

## Rate Limits

| Type | Limit | Window |
|------|-------|--------|
| Read (GET) | 100 req | 1 min |
| Write (POST/PUT) | 50 req | 1 min |
| Compute | 10 req | 5 min |

## WebSocket Events

Real-time events available:
- `gate:updated` - Gate score changes
- `subagent:status` - Sub-agent status changes
- `drift:detected` - System drift detection

See [api.md](api.md) for complete documentation.

---

*Back to [LEO Hub](../README.md)*
