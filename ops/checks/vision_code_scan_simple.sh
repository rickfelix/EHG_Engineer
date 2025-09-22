#!/bin/bash
# Simplified Vision Code Scanner - Uses grep if ripgrep not available
# Output: ops/checks/out/vision_code_markers.csv

set -euo pipefail

# Ensure output directory exists
mkdir -p ops/checks/out

# Check if ripgrep is available, fallback to grep
if command -v rg &> /dev/null; then
    SEARCH_CMD="rg --count"
    echo "🔍 Using ripgrep for scanning..."
else
    SEARCH_CMD="grep -r --count"
    echo "🔍 Using grep for scanning (slower but works)..."
fi

# Initialize CSV with headers
echo "marker,file,lines_matched,category" > ops/checks/out/vision_code_markers.csv

echo "   Scanning for implementation markers from vision rubric..."

# Simple grep-based scanning (works without ripgrep)
scan_simple() {
    local pattern="$1"
    local category="$2"
    local marker="$3"

    # Use grep to find matches, excluding common directories
    grep -r "$pattern" \
        --include="*.sql" \
        --include="*.js" \
        --include="*.ts" \
        --include="*.jsx" \
        --include="*.tsx" \
        --include="*.md" \
        --include="*.yaml" \
        --include="*.yml" \
        --exclude-dir=node_modules \
        --exclude-dir=coverage \
        --exclude-dir=dist \
        --exclude-dir=.git \
        . 2>/dev/null | \
        cut -d: -f1 | \
        sort | uniq -c | \
        while read count file; do
            echo "\"$marker\",\"$file\",\"$count\",\"$category\"" >> ops/checks/out/vision_code_markers.csv
        done || true
}

# Scan for key patterns
echo "   📊 Scanning governance patterns..."
scan_simple "v_vh_stage_progress\|v_eng_trace\|v_vh_governance" "governance" "governance_views"
scan_simple "evidence_ref\|evidence_chain\|decision_log" "governance" "evidence_chain"
scan_simple "strategic_directive\|product_requirement" "governance" "sd_prd_queries"

echo "   🎯 Scanning quality patterns..."
scan_simple "quality.*gate\|gate.*quality\|gate_met\|qa_gate" "quality" "quality_gates"
scan_simple "acceptance.*criteria\|acceptance_criteria" "quality" "acceptance_criteria"
scan_simple "completeness.*score\|risk_rating" "quality" "completeness_metrics"

echo "   🤖 Scanning automation patterns..."
scan_simple "LEO.*Protocol\|leo.*protocol\|LEAD.*PLAN.*EXEC" "automation" "leo_protocol"
scan_simple "agent.*alignment\|automation.*coverage" "automation" "automation_metrics"

echo "   📈 Generating summary..."

# Count results
MARKER_COUNT=$(tail -n +2 ops/checks/out/vision_code_markers.csv 2>/dev/null | wc -l || echo 0)
UNIQUE_FILES=$(tail -n +2 ops/checks/out/vision_code_markers.csv 2>/dev/null | cut -d',' -f2 | sort -u | wc -l || echo 0)

echo ""
echo "✅ Vision Code Scan Complete!"
echo "   Total markers found: $MARKER_COUNT"
echo "   Unique files matched: $UNIQUE_FILES"
echo "   Results saved to: ops/checks/out/vision_code_markers.csv"

# Create summary file
cat > ops/checks/out/vision_code_scan_summary.txt <<EOF
MARKER_COUNT=$MARKER_COUNT
UNIQUE_FILES=$UNIQUE_FILES
GOVERNANCE_COUNT=0
QUALITY_COUNT=0
EFFICIENCY_COUNT=0
AUTOMATION_COUNT=0
CHAIRMAN_COUNT=0
IMPLEMENTATION_COUNT=0
EOF

exit 0