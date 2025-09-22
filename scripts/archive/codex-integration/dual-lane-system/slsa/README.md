# SLSA Provenance Examples

This directory contains sample files demonstrating the formats and structures used in SLSA (Supply chain Levels for Software Artifacts) provenance and attestation.

## Files

### 1. `sample-attestation.json`
A complete in-toto v1.0 attestation with SLSA Provenance v0.2 predicate. This format is used to attest to the provenance of a software artifact.

**Key Components:**
- `_type`: Must be `https://in-toto.io/Statement/v1`
- `subject`: The artifact being attested with its SHA256 digest
- `predicateType`: `https://slsa.dev/provenance/v0.2` for SLSA provenance
- `predicate`: Contains builder info, invocation details, and materials

### 2. `sample-sbom.cdx.json`
A Software Bill of Materials (SBOM) in CycloneDX 1.5 format. This provides a complete inventory of components in the software.

**Key Components:**
- `bomFormat`: CycloneDX standard
- `specVersion`: Version 1.5
- `components`: List of all libraries, files, and dependencies
- `dependencies`: Dependency relationships between components

### 3. `sample-cosign-bundle.json`
A Sigstore cosign bundle containing signature, certificate, and transparency log proof.

**Key Components:**
- `verificationMaterial`: X.509 certificate with identity claims
- `tlogEntries`: Rekor transparency log entries with inclusion proof
- `messageSignature`: The actual signature over the artifact

## Format Standards

### In-toto Statement v1.0
- **Specification**: https://github.com/in-toto/attestation/blob/main/spec/v1.0/statement.md
- **Purpose**: Provides a standard envelope for attestations
- **Required Fields**: `_type`, `subject`, `predicateType`, `predicate`

### SLSA Provenance v0.2
- **Specification**: https://slsa.dev/provenance/v0.2
- **Purpose**: Documents how an artifact was produced
- **SLSA Levels**: L1-L3 based on provenance completeness and builder isolation

### CycloneDX 1.5
- **Specification**: https://cyclonedx.org/specification/overview/
- **Purpose**: Industry standard for SBOM format
- **Supports**: Components, dependencies, vulnerabilities, licenses

### Sigstore Bundle Format
- **Specification**: https://github.com/sigstore/protobuf-specs
- **Purpose**: Combines signature, certificate, and transparency proofs
- **Features**: Keyless signing, OIDC identity, Rekor integration

## Verification Commands

### Verify In-toto Attestation
```bash
# Extract and verify subject digest matches artifact
jq -r '.subject[0].digest.sha256' sample-attestation.json | \
  xargs -I {} sh -c 'echo "{} artifact.tar.gz" | sha256sum -c'
```

### Validate SBOM Structure
```bash
# Check CycloneDX format
jq -e '.bomFormat == "CycloneDX" and .specVersion == "1.5"' sample-sbom.cdx.json
```

### Verify Cosign Bundle
```bash
# With real cosign bundle
cosign verify-blob \
  --bundle sample-cosign-bundle.json \
  --certificate-identity-regexp ".*" \
  --certificate-oidc-issuer-regexp ".*" \
  artifact.tar.gz
```

## Creating Real Attestations

### Generate SBOM
```bash
syft dir:. -o cyclonedx-json=sbom.cdx.json
```

### Create Attestation
```bash
# Calculate digest
DIGEST=$(sha256sum artifact.tar.gz | cut -d' ' -f1)

# Generate attestation (see sample-attestation.json for structure)
```

### Sign with Cosign
```bash
# Keyless signing
COSIGN_EXPERIMENTAL=1 cosign sign-blob \
  --bundle artifact.bundle \
  artifact.tar.gz
```

## Security Considerations

1. **Digest Verification**: Always verify SHA256 digests match
2. **Certificate Validation**: Check certificate identity and issuer
3. **Timestamp Checks**: Ensure attestations aren't expired (>90 days)
4. **Repository Match**: Verify builder ID matches expected repository
5. **Transparency Log**: Confirm inclusion in Rekor for non-repudiation

## Integration with LEO Protocol

These formats integrate with the dual-lane workflow:
- **Codex Lane**: Generates initial attestations and SBOM
- **Claude Lane**: Signs artifacts and creates cosign bundles
- **PLAN Supervisor**: Verifies all attestations meet SLSA L3
- **Branch Protection**: Requires valid signatures before merge

## References

- [SLSA Framework](https://slsa.dev/)
- [In-toto Attestation](https://in-toto.io/)
- [Sigstore Project](https://www.sigstore.dev/)
- [CycloneDX Specification](https://cyclonedx.org/)