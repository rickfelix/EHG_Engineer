# WS6: Observability & Labels - Implementation Plan

**Workstream**: WS6
**Priority**: HIGH
**Target**: Enable comprehensive observability for dual-lane workflow
**Agent**: Claude/EXEC

## Objectives

1. **Label Taxonomy**: Define and implement consistent labeling across all resources
2. **Metrics Collection**: Prometheus metrics for security controls
3. **Dashboards**: Grafana dashboards for supply chain visibility
4. **Alerts**: Critical security event notifications
5. **Tracing**: OpenTelemetry integration for workflow tracking

## Deliverables

### 1. Label Standards (`.github/labels.yml`)
Define labels for:
- Lane identification (`lane:codex`, `lane:claude`)
- Security controls (`security:signed`, `security:slsa-l3`)
- Policy status (`policy:enforced`, `policy:exception`)
- Workflow stages (`stage:building`, `stage:verifying`)
- Gate results (`gate:pass`, `gate:fail`, `gate:pending`)

### 2. Prometheus Metrics
- `ehg_policy_violations_total`: Count of policy blocks by type
- `ehg_signature_verifications_total`: Signature check results
- `ehg_slsa_attestations_verified`: SLSA verification metrics
- `ehg_lane_handoffs_total`: Codex→Claude handoff events
- `ehg_gate_execution_duration_seconds`: Gate processing time

### 3. Grafana Dashboards
- **Supply Chain Overview**: SLSA coverage, signing status
- **Policy Enforcement**: Violation trends, exception usage
- **Lane Performance**: Handoff success rates, processing times
- **Security Posture**: Real-time compliance scoring

### 4. Alert Rules
Critical alerts for:
- Unsigned artifacts in production
- Policy violations exceeding threshold
- SLSA verification failures
- Lane handoff timeouts
- Gate bypass attempts

### 5. OpenTelemetry Traces
- End-to-end workflow tracing
- Lane boundary crossing events
- Sub-agent activation tracking
- Gate decision points

## Implementation Steps

### Phase 1: Label Foundation
1. Create `.github/labels.yml` with taxonomy
2. Add label sync GitHub Action
3. Apply labels to existing PRs/issues
4. Update workflows to auto-label

### Phase 2: Metrics Infrastructure
1. Deploy Prometheus operator (if not present)
2. Create ServiceMonitor CRDs
3. Implement metrics endpoints in workflows
4. Add custom metrics to applications

### Phase 3: Visualization
1. Import base Grafana dashboards
2. Customize for dual-lane workflow
3. Add security control panels
4. Create executive summary view

### Phase 4: Alerting
1. Define PrometheusRule CRDs
2. Configure AlertManager routing
3. Set up notification channels
4. Test alert scenarios

### Phase 5: Tracing
1. Deploy OpenTelemetry collector
2. Instrument GitHub Actions
3. Add trace context propagation
4. Configure trace sampling

## Success Criteria

- [ ] 100% of resources labeled according to taxonomy
- [ ] Metrics collected for all security controls
- [ ] Dashboards showing real-time compliance
- [ ] Alerts firing for critical violations
- [ ] Full workflow tracing available

## Dependencies

- Prometheus/Grafana stack deployed
- GitHub API tokens for label management
- OpenTelemetry collector infrastructure
- AlertManager configuration access

## Timeline

- Phase 1: 2 hours (Label Foundation)
- Phase 2: 3 hours (Metrics)
- Phase 3: 2 hours (Dashboards)
- Phase 4: 1 hour (Alerts)
- Phase 5: 2 hours (Tracing)

**Total Estimate**: 10 hours

## Notes

- Start with labels as they enable all other observability
- Metrics should align with SLSA requirements
- Dashboards must show lane separation clearly
- Alerts should not be noisy - critical only
- Tracing helps debug complex handoffs

---

**Status**: READY TO IMPLEMENT
**Next Step**: Create `.github/labels.yml`