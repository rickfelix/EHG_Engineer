---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Retrospective Signals API Reference


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Public API](#public-api)
  - [Import](#import)
- [Functions](#functions)
  - [captureSignals(text, options)](#capturesignalstext-options)
  - [hasLearningMoments(text)](#haslearningmomentstext)
  - [getAggregatedSignals(sdId, options)](#getaggregatedsignalssdid-options)
  - [enhanceRetrospective(retroData, sdId)](#enhanceretrospectiveretrodata-sdid)
  - [getStats(sdId)](#getstatssdid)
- [Signal Categories](#signal-categories)
  - [Category Definitions](#category-definitions)
  - [Full Pattern List](#full-pattern-list)
- [Submodule Access](#submodule-access)
- [Storage Format](#storage-format)
  - [File-Based Storage](#file-based-storage)
- [Integration Examples](#integration-examples)
  - [During Session (Real-Time Capture)](#during-session-real-time-capture)
  - [At Retrospective Generation](#at-retrospective-generation)
  - [Manual Signal Capture](#manual-signal-capture)
- [Performance Characteristics](#performance-characteristics)
  - [Detection](#detection)
  - [Storage](#storage)
  - [Aggregation](#aggregation)
- [Error Handling](#error-handling)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [Optional Configuration](#optional-configuration)
- [Debugging](#debugging)
  - [Check if signals captured](#check-if-signals-captured)
  - [Get signal stats](#get-signal-stats)
- [Related Documentation](#related-documentation)
- [Changelog](#changelog)
  - [v1.0.0 (2026-01-23)](#v100-2026-01-23)

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Claude Opus 4.5
- **Last Updated**: 2026-01-23
- **Tags**: api-reference, retrospectives, signals, leo-protocol

## Overview

The Retrospective Signals module provides keyword-based signal detection to capture learning moments during sessions and automatically enrich retrospectives.

**Location**: `lib/retrospective-signals/`

**Module Type**: ESM (ES Modules)

## Public API

### Import

```javascript
import * as retrospectiveSignals from './lib/retrospective-signals/index.js';
```

## Functions

### captureSignals(text, options)

Convenience function that combines detection and storage in one call.

#### Parameters
- **text** (string): Text to analyze for signals
- **options** (object): Configuration options
  - **sessionId** (string): Current session ID
  - **sdId** (string): Associated Strategic Directive ID

#### Returns
```typescript
Promise<{
  captured: boolean;
  count: number;
  signalIds?: string[];
  categories?: string[];
}>
```

#### Example
```javascript
const result = await retrospectiveSignals.captureSignals(
  "Found the issue - the module format was wrong",
  {
    sessionId: "session_123",
    sdId: "SD-LEO-001"
  }
);

console.log(result);
// {
//   captured: true,
//   count: 1,
//   signalIds: ["sig_abc123"],
//   categories: ["discovery"]
// }
```

---

### hasLearningMoments(text)

Fast check to see if text contains learning signals without actually capturing them.

#### Parameters
- **text** (string): Text to check

#### Returns
- **boolean**: True if signals detected, false otherwise

#### Example
```javascript
const hasSignals = retrospectiveSignals.hasLearningMoments(
  "Found the root cause"
);
// true

const noSignals = retrospectiveSignals.hasLearningMoments(
  "Regular status update"
);
// false
```

---

### getAggregatedSignals(sdId, options)

Get aggregated signals for retrospective generation.

#### Parameters
- **sdId** (string): Strategic Directive ID
- **options** (object): Optional configuration
  - **includeMetadata** (boolean): Include signal metadata (default: true)

#### Returns
```typescript
Promise<{
  hasSignals: boolean;
  signalCount: number;
  content: {
    key_learnings?: Array<{learning: string, confidence: number}>;
    what_went_well?: Array<{achievement: string, confidence: number}>;
    protocol_improvements?: Array<string>;
    what_needs_improvement?: Array<string>;
    action_items?: Array<{action: string, priority: string}>;
  };
  metadata: {
    totalSignalsCaptured: number;
    signalsByCategory: Record<string, number>;
    averageConfidence: number;
  };
}>
```

#### Example
```javascript
const aggregated = await retrospectiveSignals.getAggregatedSignals("SD-LEO-001");

if (aggregated.hasSignals) {
  console.log(`Found ${aggregated.signalCount} signals`);
  console.log('Key learnings:', aggregated.content.key_learnings);
}
```

---

### enhanceRetrospective(retroData, sdId)

Merge captured signals into existing retrospective data.

#### Parameters
- **retroData** (object): Existing retrospective data structure
- **sdId** (string): Strategic Directive ID

#### Returns
```typescript
Promise<object>
```
Enhanced retrospective data with signals merged in

#### Example
```javascript
const existingRetro = {
  sd_id: "SD-LEO-001",
  key_learnings: [
    { learning: "Standard handoff", is_boilerplate: true }
  ]
};

const enhanced = await retrospectiveSignals.enhanceRetrospective(
  existingRetro,
  "SD-LEO-001"
);

// enhanced.key_learnings now includes both existing + captured signals
```

---

### getStats(sdId)

Get signal statistics for a Strategic Directive.

#### Parameters
- **sdId** (string): Strategic Directive ID

#### Returns
```typescript
Promise<{
  totalSignals: number;
  byCategory: Record<string, number>;
  averageConfidence: number;
  captureRate: number;
}>
```

#### Example
```javascript
const stats = await retrospectiveSignals.getStats("SD-LEO-001");
console.log(`Captured ${stats.totalSignals} signals`);
console.log('By category:', stats.byCategory);
```

## Signal Categories

### Category Definitions

| Category | Weight | Maps To | Example Patterns |
|----------|--------|---------|------------------|
| **discovery** | 1.0 | key_learnings | "found the issue", "root cause", "turns out" |
| **resolution** | 0.9 | what_went_well | "fixed by", "solution was", "resolved by" |
| **causal** | 0.8 | protocol_improvements | "which caused", "led to", "because of" |
| **hindsight** | 0.85 | what_needs_improvement | "should have", "next time", "in retrospect" |
| **recurrence** | 0.95 | action_items | "this keeps happening", "recurring", "seen before" |

### Full Pattern List

Access via exported constant:

```javascript
import { SIGNAL_PATTERNS } from './lib/retrospective-signals/index.js';

console.log(SIGNAL_PATTERNS.discovery.patterns);
// [/found the issue/i, /root cause/i, ...]
```

## Submodule Access

Direct access to submodules for advanced use:

```javascript
import * as retrospectiveSignals from './lib/retrospective-signals/index.js';

// Access detector submodule
const { detector } = retrospectiveSignals;
const signals = detector.detectSignals(text, options);

// Access storage submodule
const { storage } = retrospectiveSignals;
await storage.storeSignals(signals);

// Access aggregator submodule
const { aggregator } = retrospectiveSignals;
const mapped = aggregator.mergeIntoRetrospective(retroData, signalData);
```

## Storage Format

### File-Based Storage

**Location**: `.signals/` directory

**Format**: JSONL (newline-delimited JSON)

**File naming**: `{sdId}_signals.jsonl`

**Example Entry**:
```json
{
  "id": "sig_abc123",
  "category": "discovery",
  "pattern": "found the issue",
  "matchedText": "Found the issue - module format was wrong",
  "confidence": 1.0,
  "sessionId": "session_123",
  "sdId": "SD-LEO-001",
  "timestamp": "2026-01-23T10:30:00Z"
}
```

## Integration Examples

### During Session (Real-Time Capture)

```javascript
// In conversation handler
async function processUserMessage(message, context) {
  // Check for learning moments
  if (retrospectiveSignals.hasLearningMoments(message)) {
    // Capture signals (non-blocking)
    await retrospectiveSignals.captureSignals(message, {
      sessionId: context.sessionId,
      sdId: context.currentSdId
    });
  }

  // Continue normal processing...
}
```

### At Retrospective Generation

```javascript
// In generate-comprehensive-retrospective.js
async function generateRetrospective(sdId) {
  // Gather base retrospective data
  const retroData = await gatherComprehensiveData(sdId);

  // Get captured signals
  const signals = await retrospectiveSignals.getAggregatedSignals(sdId);

  // Merge signals into retrospective
  let finalRetro = retroData;
  if (signals.hasSignals) {
    finalRetro = await retrospectiveSignals.enhanceRetrospective(
      retroData,
      sdId
    );
    console.log(`Enhanced with ${signals.signalCount} captured signals`);
  }

  return finalRetro;
}
```

### Manual Signal Capture

```javascript
// Capture specific learning moment
await retrospectiveSignals.captureSignals(
  "Root cause: ESM vs CommonJS module format mismatch",
  { sdId: "SD-LEO-001" }
);

// Later, at retrospective time
const signals = await retrospectiveSignals.getAggregatedSignals("SD-LEO-001");
// Signals automatically appear in key_learnings
```

## Performance Characteristics

### Detection
- **Complexity**: O(patterns × text_length)
- **Patterns**: 25+ regex tests
- **Overhead**: ~1-2ms per call

### Storage
- **Latency**: <1ms (non-blocking)
- **Format**: JSONL append-only
- **Location**: `.signals/` directory

### Aggregation
- **Complexity**: O(signals)
- **Deduplication**: Similarity scoring
- **Overhead**: Only runs at retrospective generation

## Error Handling

```javascript
try {
  const result = await retrospectiveSignals.captureSignals(text, options);
  if (result.captured) {
    console.log(`Captured ${result.count} signals`);
  }
} catch (error) {
  console.error('Signal capture failed:', error);
  // Graceful degradation - continue without signals
}
```

**Philosophy**: Signal capture failures should NEVER block session flow.

## Configuration

### Environment Variables

None required. Module works with defaults.

### Optional Configuration

```javascript
// Configure storage location (future)
const options = {
  storageBackend: 'file',  // or 'database'
  storagePath: '.signals/'
};
```

## Debugging

### Check if signals captured

```bash
# View captured signals for an SD
cat .signals/SD-LEO-001_signals.jsonl | jq .
```

### Get signal stats

```javascript
const stats = await retrospectiveSignals.getStats("SD-LEO-001");
console.log('Signal statistics:', JSON.stringify(stats, null, 2));
```

## Related Documentation

- [Implementation Summary](../summaries/implementations/sd-leo-enh-intelligent-retrospective-triggers-001-implementation.md)
- [Retrospective Quality Gate](./retrospective-quality-gate.md)
- [LEO Protocol v4.3.3](../03_protocols_and_standards/LEO_v4.3.3.md)

## Changelog

### v1.0.0 (2026-01-23)
- Initial release
- 5 signal categories
- 25+ keyword patterns
- File-based storage
- Automatic aggregation at retrospective time

---

*API Reference Version: 1.0.0*
*Module Version: 1.0.0*
*Last Updated: 2026-01-23*
