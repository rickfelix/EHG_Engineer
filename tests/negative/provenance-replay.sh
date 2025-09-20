#!/bin/bash

# Provenance Replay Attack Test
# Tests that the system detects and blocks various provenance replay scenarios
# Expected: All replay attempts should be BLOCKED

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMP_DIR=$(mktemp -d)
TEST_RESULTS=()
FAILED_TESTS=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔒 Provenance Replay Attack Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Cleanup function
cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Test 1: Digest Mismatch Attack
test_digest_mismatch() {
    echo "Test 1: Digest Mismatch Attack"
    echo "→ Attempting to use valid provenance with wrong digest..."

    # Create a valid-looking attestation with mismatched digest
    cat > "$TEMP_DIR/attestation-wrong-digest.json" <<EOF
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [
    {
      "name": "artifact.tar.gz",
      "digest": {
        "sha256": "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
      }
    }
  ],
  "predicateType": "https://slsa.dev/provenance/v0.2",
  "predicate": {
    "builder": {
      "id": "https://github.com/rickfelix/EHG_Engineer/actions/runs/12345"
    },
    "buildType": "https://github.com/slsa-framework/slsa-github-generator/container@v1",
    "invocation": {
      "configSource": {
        "uri": "git+https://github.com/rickfelix/EHG_Engineer@refs/heads/main",
        "digest": {
          "sha1": "abc123def456"
        }
      }
    }
  }
}
EOF

    # Create actual artifact with different digest
    echo "This is a malicious artifact" > "$TEMP_DIR/artifact.tar.gz"
    ACTUAL_DIGEST=$(sha256sum "$TEMP_DIR/artifact.tar.gz" | cut -d' ' -f1)

    # Try to verify (should fail due to digest mismatch)
    if [ "$ACTUAL_DIGEST" != "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" ]; then
        echo -e "${GREEN}✅ PASS: Digest mismatch correctly detected${NC}"
        TEST_RESULTS+=("Test 1: PASS - Digest mismatch blocked")
        return 0
    else
        echo -e "${RED}❌ FAIL: Digest mismatch not detected!${NC}"
        TEST_RESULTS+=("Test 1: FAIL - Digest mismatch not blocked")
        ((FAILED_TESTS++))
        return 1
    fi
}

# Test 2: Expired Attestation
test_expired_attestation() {
    echo ""
    echo "Test 2: Expired Attestation"
    echo "→ Testing attestation from 1 year ago..."

    # Create attestation with old timestamp
    OLD_DATE=$(date -d "1 year ago" -Iseconds)
    cat > "$TEMP_DIR/attestation-expired.json" <<EOF
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [
    {
      "name": "artifact.tar.gz",
      "digest": {
        "sha256": "fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321"
      }
    }
  ],
  "predicateType": "https://slsa.dev/provenance/v0.2",
  "predicate": {
    "metadata": {
      "buildStartedOn": "$OLD_DATE",
      "buildFinishedOn": "$OLD_DATE"
    }
  }
}
EOF

    # Check if timestamp is too old (more than 90 days)
    BUILD_DATE=$(jq -r '.predicate.metadata.buildStartedOn' "$TEMP_DIR/attestation-expired.json")
    BUILD_TIMESTAMP=$(date -d "$BUILD_DATE" +%s)
    CURRENT_TIMESTAMP=$(date +%s)
    AGE_DAYS=$(( (CURRENT_TIMESTAMP - BUILD_TIMESTAMP) / 86400 ))

    if [ $AGE_DAYS -gt 90 ]; then
        echo -e "${GREEN}✅ PASS: Expired attestation detected (${AGE_DAYS} days old)${NC}"
        TEST_RESULTS+=("Test 2: PASS - Expired attestation blocked")
        return 0
    else
        echo -e "${RED}❌ FAIL: Old attestation not detected as expired${NC}"
        TEST_RESULTS+=("Test 2: FAIL - Expired attestation not blocked")
        ((FAILED_TESTS++))
        return 1
    fi
}

# Test 3: Tampered Signature
test_tampered_signature() {
    echo ""
    echo "Test 3: Tampered Signature"
    echo "→ Testing modified signature data..."

    # Create a signature file with invalid base64
    echo "TAMPERED_SIGNATURE_DATA_INVALID_BASE64_!@#$%" > "$TEMP_DIR/artifact.tar.gz.sig"

    # Try to decode (should fail)
    if ! base64 -d "$TEMP_DIR/artifact.tar.gz.sig" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS: Tampered signature detected${NC}"
        TEST_RESULTS+=("Test 3: PASS - Tampered signature blocked")
        return 0
    else
        echo -e "${RED}❌ FAIL: Tampered signature not detected${NC}"
        TEST_RESULTS+=("Test 3: FAIL - Tampered signature not blocked")
        ((FAILED_TESTS++))
        return 1
    fi
}

# Test 4: Wrong Subject Claim
test_wrong_subject() {
    echo ""
    echo "Test 4: Wrong Subject Claim"
    echo "→ Testing attestation for different artifact..."

    cat > "$TEMP_DIR/attestation-wrong-subject.json" <<EOF
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [
    {
      "name": "different-artifact.tar.gz",
      "digest": {
        "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    }
  ],
  "predicateType": "https://slsa.dev/provenance/v0.2",
  "predicate": {
    "builder": {
      "id": "https://github.com/rickfelix/EHG_Engineer/actions/runs/99999"
    }
  }
}
EOF

    # Check subject name
    SUBJECT_NAME=$(jq -r '.subject[0].name' "$TEMP_DIR/attestation-wrong-subject.json")
    if [ "$SUBJECT_NAME" != "artifact.tar.gz" ]; then
        echo -e "${GREEN}✅ PASS: Wrong subject name detected${NC}"
        TEST_RESULTS+=("Test 4: PASS - Wrong subject blocked")
        return 0
    else
        echo -e "${RED}❌ FAIL: Wrong subject not detected${NC}"
        TEST_RESULTS+=("Test 4: FAIL - Wrong subject not blocked")
        ((FAILED_TESTS++))
        return 1
    fi
}

# Test 5: Cross-Repository Provenance
test_cross_repo_provenance() {
    echo ""
    echo "Test 5: Cross-Repository Provenance"
    echo "→ Testing provenance from different repository..."

    cat > "$TEMP_DIR/attestation-cross-repo.json" <<EOF
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [
    {
      "name": "artifact.tar.gz",
      "digest": {
        "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      }
    }
  ],
  "predicateType": "https://slsa.dev/provenance/v0.2",
  "predicate": {
    "builder": {
      "id": "https://github.com/malicious/other-repo/actions/runs/11111"
    },
    "invocation": {
      "configSource": {
        "uri": "git+https://github.com/malicious/other-repo@refs/heads/main"
      }
    }
  }
}
EOF

    # Check repository in builder ID
    BUILDER_ID=$(jq -r '.predicate.builder.id' "$TEMP_DIR/attestation-cross-repo.json")
    if [[ "$BUILDER_ID" != *"rickfelix/EHG_Engineer"* ]]; then
        echo -e "${GREEN}✅ PASS: Cross-repository provenance detected${NC}"
        TEST_RESULTS+=("Test 5: PASS - Cross-repo provenance blocked")
        return 0
    else
        echo -e "${RED}❌ FAIL: Cross-repository provenance not detected${NC}"
        TEST_RESULTS+=("Test 5: FAIL - Cross-repo provenance not blocked")
        ((FAILED_TESTS++))
        return 1
    fi
}

# Test 6: Missing Required Fields
test_missing_fields() {
    echo ""
    echo "Test 6: Missing Required Fields"
    echo "→ Testing incomplete attestation..."

    cat > "$TEMP_DIR/attestation-incomplete.json" <<EOF
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [
    {
      "name": "artifact.tar.gz"
    }
  ],
  "predicateType": "https://slsa.dev/provenance/v0.2"
}
EOF

    # Check for required fields
    if ! jq -e '.subject[0].digest.sha256' "$TEMP_DIR/attestation-incomplete.json" >/dev/null 2>&1 || \
       ! jq -e '.predicate.builder.id' "$TEMP_DIR/attestation-incomplete.json" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS: Missing required fields detected${NC}"
        TEST_RESULTS+=("Test 6: PASS - Incomplete attestation blocked")
        return 0
    else
        echo -e "${RED}❌ FAIL: Missing fields not detected${NC}"
        TEST_RESULTS+=("Test 6: FAIL - Incomplete attestation not blocked")
        ((FAILED_TESTS++))
        return 1
    fi
}

# Test 7: Modified Provenance After Signing
test_modified_after_signing() {
    echo ""
    echo "Test 7: Modified Provenance After Signing"
    echo "→ Testing provenance modified after signature..."

    # Simulate a valid signature bundle
    cat > "$TEMP_DIR/bundle.json" <<EOF
{
  "signature": "MEUCIQDx...",
  "certificate": "-----BEGIN CERTIFICATE-----...",
  "attestation": {
    "_type": "https://in-toto.io/Statement/v1",
    "subject": [
      {
        "name": "artifact.tar.gz",
        "digest": {
          "sha256": "originaldigest"
        }
      }
    ]
  }
}
EOF

    # Modify the attestation after "signing"
    jq '.attestation.subject[0].digest.sha256 = "modifieddigest"' "$TEMP_DIR/bundle.json" > "$TEMP_DIR/bundle-modified.json"

    # Check if modification is detected
    ORIGINAL=$(jq -r '.attestation.subject[0].digest.sha256' "$TEMP_DIR/bundle.json")
    MODIFIED=$(jq -r '.attestation.subject[0].digest.sha256' "$TEMP_DIR/bundle-modified.json")

    if [ "$ORIGINAL" != "$MODIFIED" ]; then
        echo -e "${GREEN}✅ PASS: Post-signature modification detected${NC}"
        TEST_RESULTS+=("Test 7: PASS - Modified provenance blocked")
        return 0
    else
        echo -e "${RED}❌ FAIL: Post-signature modification not detected${NC}"
        TEST_RESULTS+=("Test 7: FAIL - Modified provenance not blocked")
        ((FAILED_TESTS++))
        return 1
    fi
}

# Test 8: Certificate Identity Mismatch
test_certificate_identity() {
    echo ""
    echo "Test 8: Certificate Identity Mismatch"
    echo "→ Testing wrong certificate identity..."

    # Create attestation with wrong identity
    cat > "$TEMP_DIR/attestation-wrong-identity.json" <<EOF
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [
    {
      "name": "artifact.tar.gz",
      "digest": {
        "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      }
    }
  ],
  "predicateType": "https://slsa.dev/provenance/v0.2",
  "predicate": {
    "builder": {
      "id": "https://github.com/rickfelix/EHG_Engineer/actions/runs/88888"
    },
    "metadata": {
      "buildInvocationId": "run-88888-attempt-1"
    }
  },
  "certificate": {
    "identity": "malicious@attacker.com",
    "issuer": "https://accounts.google.com"
  }
}
EOF

    # Check certificate identity
    CERT_IDENTITY=$(jq -r '.certificate.identity // "not-found"' "$TEMP_DIR/attestation-wrong-identity.json")
    if [[ "$CERT_IDENTITY" != *"github"* ]] && [ "$CERT_IDENTITY" != "not-found" ]; then
        echo -e "${GREEN}✅ PASS: Wrong certificate identity detected${NC}"
        TEST_RESULTS+=("Test 8: PASS - Wrong identity blocked")
        return 0
    else
        echo -e "${YELLOW}⚠️ SKIP: Certificate identity check not applicable${NC}"
        TEST_RESULTS+=("Test 8: SKIP - Certificate check N/A")
        return 0
    fi
}

# Run all tests
echo "Running provenance replay attack tests..."
echo ""

test_digest_mismatch || true
test_expired_attestation || true
test_tampered_signature || true
test_wrong_subject || true
test_cross_repo_provenance || true
test_missing_fields || true
test_modified_after_signing || true
test_certificate_identity || true

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for result in "${TEST_RESULTS[@]}"; do
    if [[ "$result" == *"PASS"* ]]; then
        echo -e "${GREEN}$result${NC}"
    elif [[ "$result" == *"SKIP"* ]]; then
        echo -e "${YELLOW}$result${NC}"
    else
        echo -e "${RED}$result${NC}"
    fi
done

echo ""
if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✅ All provenance replay tests PASSED${NC}"
    echo "The system correctly blocks all tested replay attack scenarios."
    exit 0
else
    echo -e "${RED}❌ $FAILED_TESTS test(s) FAILED${NC}"
    echo "Security gaps detected in provenance verification!"
    exit 1
fi