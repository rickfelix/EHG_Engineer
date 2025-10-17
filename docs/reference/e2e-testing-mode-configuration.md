# E2E Testing: Dev Mode vs Preview Mode

**Generated**: 2025-10-14T01:31:51.208Z
**Source**: Database (leo_protocol_sections)
**Context Tier**: REFERENCE

---

**E2E Testing Mode**: Default to dev mode (port 5173) for reliable tests.

**Issue**: Preview mode (4173) may have rendering problems
**Solution**: Use dev mode for tests, preview only for production validation
```typescript
baseURL: 'http://localhost:5173'  // Dev mode
```

**Full Guide**: See `docs/reference/e2e-testing-modes.md`

---

*This is reference documentation, load on-demand only*
*Generated from: scripts/generate-claude-md-from-db-v3.js*
