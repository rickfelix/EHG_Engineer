# API Documentation

## Metadata
- **Category**: API
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Documentation Sub-Agent
- **Last Updated**: 2025-10-24
- **Tags**: api, rest, websocket, endpoints

## Overview

This directory contains API documentation for EHG_Engineer, organized by development stages (1-40). Files are numbered according to the stage-gate development model.

---

## Stage Numbering

**Important**: Files are numbered by **development stage** (1-40), not sequential order:

- **Gaps are intentional** - represent skipped or future stages
- **Letter variants (a/b/c)** - parallel implementations or progressive enhancements
- **Example**: `04a`, `04c` exist but `04b` missing = intentional gap

**See**: [FILE_NUMBERING_AUDIT.md](../01_architecture/FILE_NUMBERING_AUDIT.md) for complete numbering explanation

---

## Stage-Based Files

### Stages 1-10: Idea & Validation

| Document | Description |
|----------|-------------|
| `rest-api.md` | REST API endpoint documentation |
| `websocket-api.md` | WebSocket events and protocols |
| `authentication.md` | API authentication methods |
| `rate-limiting.md` | API rate limiting policies |
| `error-handling.md` | Error codes and handling |

## Related Documentation

- [Architecture](../01_architecture/README.md)
- [User Guides](../01_architecture/README.md)
- [Testing](../05_testing/README.md)