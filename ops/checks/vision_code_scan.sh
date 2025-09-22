#!/bin/bash
# Vision Code Scanner - Read-only ripgrep analysis
# Scans codebase for vision implementation markers
# Output: ops/checks/out/vision_code_markers.csv

set -euo pipefail

# Ensure output directory exists
mkdir -p ops/checks/out

# Initialize CSV with headers
echo "marker,file,lines_matched,category" > ops/checks/out/vision_code_markers.csv

echo "🔍 Starting Vision Code Scan..."
echo "   Scanning for implementation markers from vision rubric..."

# Track total matches
TOTAL_MATCHES=0

# Function to scan and append results
scan_pattern() {
    local pattern="$1"
    local category="$2"
    local marker="$3"

    # Use ripgrep with count to find matches
    # Exclude test/coverage/node_modules directories
    if rg --count \
          --type-not=test \
          --glob='!node_modules/*' \
          --glob='!coverage/*' \
          --glob='!dist/*' \
          --glob='!.git/*' \
          --glob='!*.min.js' \
          --glob='!package-lock.json' \
          "$pattern" 2>/dev/null; then

        # Get files and line counts
        rg --count \
           --type-not=test \
           --glob='!node_modules/*' \
           --glob='!coverage/*' \
           --glob='!dist/*' \
           --glob='!.git/*' \
           --glob='!*.min.js' \
           --glob='!package-lock.json' \
           "$pattern" 2>/dev/null | while IFS=: read -r file count; do
            echo "\"$marker\",\"$file\",\"$count\",\"$category\"" >> ops/checks/out/vision_code_markers.csv
            TOTAL_MATCHES=$((TOTAL_MATCHES + count))
        done
    fi
}

# ============================================================================
# 1. Governance/Data Patterns (Database-first, views, evidence chain)
# ============================================================================
echo "   📊 Scanning governance/data patterns..."

# Views and database patterns
scan_pattern "v_vh_stage_progress" "governance" "vh_stage_progress_view"
scan_pattern "v_eng_trace" "governance" "eng_trace_view"
scan_pattern "v_eng_prd_payload" "governance" "eng_prd_payload_view"
scan_pattern "sd_backlog_map" "governance" "sd_backlog_mapping"
scan_pattern "v_vh_governance_snapshot" "governance" "governance_snapshot_view"

# Evidence and audit patterns
scan_pattern "evidence_ref|evidence_chain" "governance" "evidence_chain"
scan_pattern "decision_log_ref|decision_log" "governance" "decision_logging"
scan_pattern "audit_trail|audit_ready" "governance" "audit_trail"
scan_pattern "rubric.*scor|scor.*rubric" "governance" "rubric_scoring"

# Database-first patterns
scan_pattern "\\bpsql\\b|\\\\copy\\b" "governance" "database_operations"
scan_pattern "FROM.*strategic_directives" "governance" "sd_queries"
scan_pattern "FROM.*product_requirements" "governance" "prd_queries"

# ============================================================================
# 2. Quality/Telemetry Patterns (Gates, metrics, thresholds)
# ============================================================================
echo "   🎯 Scanning quality/telemetry patterns..."

# Quality gates
scan_pattern "quality.*gate|gate.*quality" "quality" "quality_gates"
scan_pattern "qa_gate_min|gate_met" "quality" "gate_metrics"
scan_pattern "gate.*pass.*rate|pass.*rate.*85" "quality" "gate_pass_rate"
scan_pattern "acceptance.*criteria|AC.*complet" "quality" "acceptance_criteria"

# Metrics and thresholds
scan_pattern "Rule.*of.*40|rule_of_40" "efficiency" "rule_of_40"
scan_pattern "NRR|net.*revenue.*retention" "efficiency" "nrr_metric"
scan_pattern "GRR|gross.*revenue.*retention" "efficiency" "grr_metric"
scan_pattern "burn.*multiple|burn_multiple" "efficiency" "burn_multiple"
scan_pattern "CAC.*payback|payback.*period" "efficiency" "cac_payback"

# Backlog and story metrics
scan_pattern "backlog.*accuracy|story.*coverage" "quality" "backlog_accuracy"
scan_pattern "story.*points|story_points" "quality" "story_points"
scan_pattern "completeness.*score|completeness_score" "quality" "completeness_score"

# ============================================================================
# 3. Automation Patterns (Agent execution, LEO Protocol)
# ============================================================================
echo "   🤖 Scanning automation patterns..."

# Agent and automation
scan_pattern "automation.*coverage|agent.*coverage" "automation" "automation_coverage"
scan_pattern "agent.*alignment|alignment.*score" "automation" "agent_alignment"
scan_pattern "LEO.*Protocol|leo.*protocol" "automation" "leo_protocol"
scan_pattern "LEAD.*agent|PLAN.*agent|EXEC.*agent" "automation" "leo_agents"

# EVA orchestration
scan_pattern "EVA.*orchestrat|eva.*mediat" "automation" "eva_orchestration"
scan_pattern "agent.*decision|autonomous.*decision" "automation" "agent_decisions"
scan_pattern "human.*intervention|manual.*override" "automation" "human_intervention"

# ============================================================================
# 4. Chairman Vision Specific Patterns
# ============================================================================
echo "   👔 Scanning chairman-specific patterns..."

# Chairman governance
scan_pattern "chairman.*approval|chairman.*decision" "chairman" "chairman_approval"
scan_pattern "no.*surprises|exception.*alert" "chairman" "no_surprises"
scan_pattern "truth.*over.*polish|evidence.*over.*opinion" "chairman" "truth_over_polish"
scan_pattern "decision.*brief|async.*decision" "chairman" "async_decisions"

# Strategic patterns
scan_pattern "strategic.*directive|strategic_directives" "chairman" "strategic_directives"
scan_pattern "portfolio.*objective|venture.*create" "chairman" "portfolio_management"
scan_pattern "funding.*flywheel|capital.*allocation" "chairman" "capital_allocation"

# ============================================================================
# 5. Implementation Proximity Indicators
# ============================================================================
echo "   🔧 Scanning implementation indicators..."

# Testing and validation
scan_pattern "test.*plan|test.*scenario" "implementation" "test_plans"
scan_pattern "metric.*hypothesis|hypothesis.*test" "implementation" "metric_hypotheses"
scan_pattern "validation.*checklist|validation_checklist" "implementation" "validation_checklists"

# Progress tracking
scan_pattern "phase.*progress|progress.*tracking" "implementation" "progress_tracking"
scan_pattern "milestone|deliverable" "implementation" "milestones"
scan_pattern "scorecard|score.*card" "implementation" "scorecards"

# ============================================================================
# Generate Summary Statistics
# ============================================================================
echo "   📈 Generating summary..."

# Count total markers found
MARKER_COUNT=$(tail -n +2 ops/checks/out/vision_code_markers.csv | wc -l)
UNIQUE_FILES=$(tail -n +2 ops/checks/out/vision_code_markers.csv | cut -d',' -f2 | sort -u | wc -l)

# Category breakdown
GOVERNANCE_COUNT=$(grep ',"governance"$' ops/checks/out/vision_code_markers.csv | wc -l)
QUALITY_COUNT=$(grep ',"quality"$' ops/checks/out/vision_code_markers.csv | wc -l)
EFFICIENCY_COUNT=$(grep ',"efficiency"$' ops/checks/out/vision_code_markers.csv | wc -l)
AUTOMATION_COUNT=$(grep ',"automation"$' ops/checks/out/vision_code_markers.csv | wc -l)
CHAIRMAN_COUNT=$(grep ',"chairman"$' ops/checks/out/vision_code_markers.csv | wc -l)
IMPLEMENTATION_COUNT=$(grep ',"implementation"$' ops/checks/out/vision_code_markers.csv | wc -l)

# Write summary to stdout (will be captured by workflow)
echo ""
echo "✅ Vision Code Scan Complete!"
echo "   Total markers found: $MARKER_COUNT"
echo "   Unique files matched: $UNIQUE_FILES"
echo ""
echo "   Category breakdown:"
echo "   - Governance: $GOVERNANCE_COUNT markers"
echo "   - Quality: $QUALITY_COUNT markers"
echo "   - Efficiency: $EFFICIENCY_COUNT markers"
echo "   - Automation: $AUTOMATION_COUNT markers"
echo "   - Chairman: $CHAIRMAN_COUNT markers"
echo "   - Implementation: $IMPLEMENTATION_COUNT markers"
echo ""
echo "   Results saved to: ops/checks/out/vision_code_markers.csv"

# Create a summary file for easy parsing
cat > ops/checks/out/vision_code_scan_summary.txt <<EOF
MARKER_COUNT=$MARKER_COUNT
UNIQUE_FILES=$UNIQUE_FILES
GOVERNANCE_COUNT=$GOVERNANCE_COUNT
QUALITY_COUNT=$QUALITY_COUNT
EFFICIENCY_COUNT=$EFFICIENCY_COUNT
AUTOMATION_COUNT=$AUTOMATION_COUNT
CHAIRMAN_COUNT=$CHAIRMAN_COUNT
IMPLEMENTATION_COUNT=$IMPLEMENTATION_COUNT
EOF

# Exit successfully (report-only, never fails)
exit 0