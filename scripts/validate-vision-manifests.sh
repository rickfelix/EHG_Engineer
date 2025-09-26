#!/bin/bash

# Vision Manifest Sanity Checker
# Validates CSV manifests before applying to production

set -e

echo "🔍 Vision Manifest Validator"
echo "============================"
echo ""

# Check for required files
if [ ! -f "ops/inbox/vision_sd_manifest.csv" ]; then
    echo "❌ ERROR: SD manifest not found at ops/inbox/vision_sd_manifest.csv"
    echo "   Run: gh workflow run 'Vision Alignment (Prod, Read-Only)' to generate"
    exit 1
fi

if [ ! -f "ops/inbox/vision_prd_manifest.csv" ]; then
    echo "❌ ERROR: PRD manifest not found at ops/inbox/vision_prd_manifest.csv"
    echo "   Run: gh workflow run 'Vision Alignment (Prod, Read-Only)' to generate"
    exit 1
fi

# Python validation script
python3 - << 'EOF'
import csv
import sys
import re
from collections import defaultdict

print("📋 Checking SD Manifest...")
print("-" * 40)

errors = []
warnings = []
sd_keys = set()
sd_titles = set()

# Required SD fields
required_sd = ['sd_key', 'title', 'priority', 'owner', 'decision_log_ref', 'evidence_ref']

with open('ops/inbox/vision_sd_manifest.csv', 'r') as f:
    reader = csv.DictReader(f)
    sd_count = 0

    for row_num, row in enumerate(reader, 1):
        sd_count += 1

        # Check required fields
        for field in required_sd:
            if field not in row:
                errors.append(f"SD row {row_num}: Missing column '{field}'")
                continue

            value = row[field].strip()
            if not value or value.upper() == 'TODO' or value == 'TBD':
                errors.append(f"SD row {row_num}: {field} is empty or TODO")

        # Validate SD key format
        sd_key = row.get('sd_key', '').strip()
        if sd_key:
            if not re.match(r'^SD-[\w-]+$', sd_key):
                errors.append(f"SD row {row_num}: Invalid sd_key format '{sd_key}' (expected SD-XXX)")
            if sd_key in sd_keys:
                errors.append(f"SD row {row_num}: Duplicate sd_key '{sd_key}'")
            sd_keys.add(sd_key)

        # Check for duplicate titles
        title = row.get('title', '').strip()
        if title:
            if title in sd_titles:
                warnings.append(f"SD row {row_num}: Duplicate title '{title[:50]}...'")
            sd_titles.add(title)

        # Validate priority
        priority = row.get('priority', '').strip()
        if priority:
            try:
                p = int(priority)
                if p < 0 or p > 100:
                    warnings.append(f"SD row {row_num}: Priority {p} outside 0-100 range")
            except ValueError:
                errors.append(f"SD row {row_num}: Invalid priority '{priority}' (must be integer)")

        # Check owner format (should be email or name)
        owner = row.get('owner', '').strip()
        if owner and '@' not in owner and len(owner) < 3:
            warnings.append(f"SD row {row_num}: Suspicious owner value '{owner}'")

print(f"✅ Found {sd_count} SDs")
print(f"   Unique SD keys: {len(sd_keys)}")
print("")

print("📋 Checking PRD Manifest...")
print("-" * 40)

# Required PRD fields
required_prd = ['title', 'sd_key', 'completeness_score', 'risk_rating']
prd_count = 0
orphaned_prds = []

with open('ops/inbox/vision_prd_manifest.csv', 'r') as f:
    reader = csv.DictReader(f)

    for row_num, row in enumerate(reader, 1):
        prd_count += 1

        # Check required fields
        for field in required_prd:
            if field not in row:
                errors.append(f"PRD row {row_num}: Missing column '{field}'")
                continue

            value = row[field].strip()
            if not value or value.upper() == 'TODO' or value == 'TBD':
                errors.append(f"PRD row {row_num}: {field} is empty or TODO")

        # Check SD linkage
        prd_sd_key = row.get('sd_key', '').strip()
        if prd_sd_key:
            if prd_sd_key not in sd_keys:
                orphaned_prds.append(prd_sd_key)
                warnings.append(f"PRD row {row_num}: References unknown SD '{prd_sd_key}'")

        # Validate completeness score
        comp = row.get('completeness_score', '').strip()
        if comp:
            try:
                c = int(comp)
                if c < 0 or c > 100:
                    errors.append(f"PRD row {row_num}: Completeness {c} outside 0-100 range")
            except ValueError:
                errors.append(f"PRD row {row_num}: Invalid completeness '{comp}' (must be integer)")

        # Validate risk rating
        risk = row.get('risk_rating', '').strip().lower()
        if risk and risk not in ['low', 'medium', 'high', 'critical', 'none']:
            warnings.append(f"PRD row {row_num}: Unusual risk_rating '{risk}'")

print(f"✅ Found {prd_count} PRDs")
if orphaned_prds:
    print(f"⚠️  Orphaned PRDs (no matching SD): {len(set(orphaned_prds))}")
print("")

# Final report
print("=" * 40)
print("📊 VALIDATION SUMMARY")
print("=" * 40)

if errors:
    print(f"\n❌ ERRORS FOUND ({len(errors)} issues) - MUST FIX BEFORE APPLY:\n")
    for i, error in enumerate(errors[:20], 1):  # Show first 20
        print(f"   {i}. {error}")
    if len(errors) > 20:
        print(f"   ... and {len(errors) - 20} more errors")
    print("\n⚠️  Fix these errors before running production apply!")
    sys.exit(1)
else:
    print("\n✅ No critical errors found")

if warnings:
    print(f"\n⚠️  WARNINGS ({len(warnings)} issues) - Review recommended:\n")
    for i, warning in enumerate(warnings[:10], 1):  # Show first 10
        print(f"   {i}. {warning}")
    if len(warnings) > 10:
        print(f"   ... and {len(warnings) - 10} more warnings")
    print("\n   Consider reviewing these warnings before apply")
else:
    print("✅ No warnings")

print("\n🎯 READY FOR PRODUCTION APPLY")
print("-" * 40)
print("Next steps:")
print("  1. Review any warnings above")
print("  2. Run dry-run: gh workflow run 'Vision Governance Apply (Prod)' -f dry_run=true")
print("  3. Apply to prod: gh workflow run 'Vision Governance Apply (Prod)' -f dry_run=false -f confirm=PROMOTE")
print("")

# Write summary file
with open('ops/checks/out/manifest_validation.txt', 'w') as f:
    f.write(f"SDs: {sd_count} ({len(sd_keys)} unique keys)\n")
    f.write(f"PRDs: {prd_count}\n")
    f.write(f"Errors: {len(errors)}\n")
    f.write(f"Warnings: {len(warnings)}\n")
    f.write(f"Status: {'FAIL' if errors else 'PASS'}\n")

EOF

echo ""
echo "✅ Validation complete!"
echo ""
echo "To apply these manifests to production:"
echo "  ./scripts/apply-vision-to-prod.sh"