#!/bin/bash
# Run all negative tests for dual-lane security policies
# These tests SHOULD fail (be blocked) for the system to pass

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 DUAL-LANE NEGATIVE TEST SUITE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "These tests verify that our security policies correctly BLOCK:"
echo "1. Unsigned container images"
echo "2. Images without SHA256 digests"
echo "3. Provenance replay attacks"
echo "4. Invalid policy bundles"
echo ""

FAILED_TESTS=0
PASSED_TESTS=0

# Create test namespace
echo "→ Creating test namespace..."
kubectl create namespace test-negative --dry-run=client -o yaml | kubectl apply -f -

# Test 1: Unsigned Image
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 1: Block Unsigned Image"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if kubectl apply -f test-unsigned-image.yaml 2>&1 | grep -q "denied\|failed"; then
    echo "✅ PASS: Unsigned image was blocked"
    ((PASSED_TESTS++))
else
    echo "❌ FAIL: Unsigned image was NOT blocked"
    ((FAILED_TESTS++))
fi
# Clean up
kubectl delete -f test-unsigned-image.yaml --ignore-not-found=true 2>/dev/null || true

# Test 2: Image without digest
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 2: Block Non-Digest Image"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if kubectl apply -f test-no-digest.yaml 2>&1 | grep -q "must use SHA256 digests\|denied"; then
    echo "✅ PASS: Non-digest image was blocked"
    ((PASSED_TESTS++))
else
    echo "❌ FAIL: Non-digest image was NOT blocked"
    ((FAILED_TESTS++))
fi
# Clean up
kubectl delete -f test-no-digest.yaml --ignore-not-found=true 2>/dev/null || true

# Test 3: Provenance replay attack
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 3: Block Provenance Replay"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
# Extract and run the test script
kubectl apply -f test-provenance-replay.yaml
kubectl get configmap test-provenance-replay -n test-negative -o jsonpath='{.data.test\.sh}' | bash
if [ $? -eq 0 ]; then
    echo "✅ PASS: Provenance replay was blocked"
    ((PASSED_TESTS++))
else
    echo "❌ FAIL: Provenance replay was NOT blocked"
    ((FAILED_TESTS++))
fi

# Test 4: Policy tampering
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 4: Block Unsigned Policy Bundle"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create an unsigned policy bundle
tar czf unsigned-policy.tar.gz kyverno/*.yaml 2>/dev/null || true

# Try to verify it (should fail)
if cosign verify-blob \
    --certificate-identity-regexp ".*" \
    --certificate-oidc-issuer-regexp ".*" \
    unsigned-policy.tar.gz 2>&1 | grep -q "failed\|error"; then
    echo "✅ PASS: Unsigned policy bundle was blocked"
    ((PASSED_TESTS++))
else
    echo "❌ FAIL: Unsigned policy bundle was NOT blocked"
    ((FAILED_TESTS++))
fi
rm -f unsigned-policy.tar.gz

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 TEST SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Passed: $PASSED_TESTS"
echo "❌ Failed: $FAILED_TESTS"
echo ""

# Clean up test namespace
echo "→ Cleaning up test namespace..."
kubectl delete namespace test-negative --ignore-not-found=true

if [ $FAILED_TESTS -eq 0 ]; then
    echo "🎉 All negative tests passed! Security policies are working correctly."
    exit 0
else
    echo "⚠️  Some negative tests failed. Security policies may not be enforcing correctly."
    exit 1
fi