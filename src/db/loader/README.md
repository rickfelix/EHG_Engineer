# Database Loader Module

## Overview

Refactored database loader split into focused, testable modules.
Each module is <300 lines with single responsibility.

## Architecture

```
loader/
├── index.ts         # Main orchestrator (<150 lines)
├── config.ts        # Environment & pool configuration
├── connections.ts   # Client lifecycle management
├── migrations.ts    # Migration application logic
├── seed.ts          # Optional data seeding
├── health.ts        # Readiness/liveness checks
└── telemetry.ts     # Metrics, logging, timing
```

## Migration Plan

### Phase 1: Extract (PR #1)
- [ ] Split existing database-loader.js into modules
- [ ] Keep backward compatibility (same exports)
- [ ] Add unit tests for config and connections
- [ ] No behavior changes

### Phase 2: Enhance (PR #2)
- [ ] Move migration logic to dedicated module
- [ ] Add seed logic separation
- [ ] Wire up telemetry
- [ ] Add --dry-run and --timeout flags
- [ ] Integration tests

### Phase 3: TypeScript (PR #3)
- [ ] Convert modules to TypeScript
- [ ] Add strict types for config/clients
- [ ] Keep JS entrypoint for compatibility
- [ ] Full test coverage

## Module Responsibilities

### config.ts
- Parse environment variables
- Validate connection strings
- Set pool parameters
- Export typed configuration

### connections.ts
- Initialize database clients
- Manage connection lifecycle
- Handle reconnection logic
- Connection pool management

### migrations.ts
- List pending migrations
- Apply migrations in order
- Track applied migrations
- Rollback capability

### seed.ts
- Load seed data
- Environment-specific seeds
- Idempotent operations
- Seed verification

### health.ts
- Database connectivity check
- Schema verification
- Migration status check
- Performance metrics

### telemetry.ts
- Operation timing
- Error tracking
- Success/failure counts
- Performance logging

## Testing Strategy

```bash
# Unit tests (fast, no DB)
npm test src/db/loader/config.test.ts
npm test src/db/loader/telemetry.test.ts

# Integration tests (requires DB)
npm test src/db/loader/migrations.test.ts
npm test src/db/loader/health.test.ts

# E2E test (full flow)
npm test src/db/loader/index.test.ts
```

## Usage

```javascript
// Backward compatible
const loader = require('./src/db/loader');
await loader.initialize();

// New modular approach
import { config, connections, migrations } from './src/db/loader';
const cfg = await config.load();
const client = await connections.create(cfg);
await migrations.apply(client, { dryRun: false });
```

## Success Criteria

- [ ] Each module <300 lines
- [ ] Main orchestrator <150 lines
- [ ] 80% test coverage
- [ ] Zero breaking changes
- [ ] CI stays green
- [ ] RLS checks pass