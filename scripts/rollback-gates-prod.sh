#!/bin/bash
# Emergency rollback - disable gates in production
# This only disables enforcement, doesn't remove the infrastructure

set -euo pipefail

echo "🛑 EMERGENCY ROLLBACK - Disabling story gates in production"
echo ""
echo "This will:"
echo "  1. Disable gate enforcement (merge blocking)"
echo "  2. Keep tracking/metrics running"
echo "  3. NOT remove branch protection (do manually if needed)"
echo ""
read -p "Continue with rollback? (y/N): " confirm

if [[ "$confirm" != "y" ]]; then
    echo "Rollback cancelled"
    exit 0
fi

echo ""
echo "Step 1: Update environment variables"
echo "Set these in your deployment configuration:"
echo ""
echo "FEATURE_STORY_GATES=false"
echo "VITE_FEATURE_STORY_GATES=false"
echo ""
echo "Keep these enabled (for tracking):"
echo "FEATURE_AUTO_STORIES=true"
echo "FEATURE_STORY_AGENT=true"
echo "FEATURE_STORY_UI=true"
echo ""
echo "Step 2: Redeploy your application"
echo ""
echo "Step 3: Verify gates are disabled:"
echo "curl -X GET https://your-prod-domain.com/api/stories/health"
echo ""
echo "Response should show gates_enabled: false"
echo ""
echo "Step 4: (Optional) Remove branch protection requirement:"
echo "gh api -X DELETE repos/OWNER/REPO/branches/main/protection/required_status_checks/contexts/CHECK_NAME"
echo ""
echo "Rollback instructions complete. Execute the steps above in your deployment system."