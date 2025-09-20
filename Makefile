# EHG Engineering Makefile
# User Story Management & E2E Testing

.PHONY: help stories-migrate stories-verify stories-generate stories-test stories-e2e stories-gate stories-activate
.PHONY: stories-ci-prod stories-health-prod stories-snapshot-prod

# Environment detection
ENV ?= staging
ifeq ($(ENV),prod)
    API_BASE = https://your-prod-domain.com
    DB_QUERY = psql "$$DATABASE_URL_PROD"
else
    API_BASE = http://localhost:3000
    DB_QUERY = psql "$$DATABASE_URL"
endif

# Default target
help:
	@echo "User Story Management Commands:"
	@echo "  make stories-migrate    - Apply story database migration"
	@echo "  make stories-verify     - Verify migration was successful"
	@echo "  make stories-generate   - Generate stories for an SD (SD=xxx)"
	@echo "  make stories-test       - Run smoke tests"
	@echo "  make stories-e2e        - Run E2E, post results, check gate"
	@echo "  make stories-gate       - Check release gate status"
	@echo "  make stories-activate   - Progressive staging activation"
	@echo ""
	@echo "Production Commands:"
	@echo "  make stories-ci-prod    - Run CI and post to prod webhooks"
	@echo "  make stories-health-prod - Check prod API health"
	@echo "  make stories-snapshot-prod - Get prod verification snapshot"
	@echo ""
	@echo "Examples:"
	@echo "  make stories-generate SD=SD-2025-09-EMB"
	@echo "  make stories-e2e SD=SD-2025-09-EMB"
	@echo "  make stories-ci-prod SD=SD-2025-PILOT-001"

# Database migration
stories-migrate:
	@echo "📦 Applying story migration..."
	psql "$$DATABASE_URL" -f database/migrations/2025-01-17-user-stories.sql
	@echo "✅ Migration applied"

# Verify migration
stories-verify:
	@echo "🔍 Verifying migration..."
	psql "$$DATABASE_URL" -f database/migrations/verify-2025-01-17-user-stories.sql
	@echo "✅ Verification complete"

# Generate stories (requires SD parameter - can be key or ID)
stories-generate:
ifndef SD
	$(error SD is required. Usage: make stories-generate SD=SD-2025-09-EMB)
endif
	@echo "🎯 Generating stories for $(SD)..."
	@echo "Step 1: Dry run preview"
	@# Determine if SD is a key or ID and use appropriate field
	@if echo "$(SD)" | grep -qE '^SD-[0-9]{4}-[0-9]{2}-[A-Z]+$$'; then \
		curl -s -X POST "http://localhost:3000/api/stories/generate" \
		-H "Authorization: Bearer $$SERVICE_TOKEN" \
		-H "Content-Type: application/json" \
		-d '{"sd_key":"$(SD)","mode":"dry_run"}' | jq .; \
	else \
		curl -s -X POST "http://localhost:3000/api/stories/generate" \
		-H "Authorization: Bearer $$SERVICE_TOKEN" \
		-H "Content-Type: application/json" \
		-d '{"sd_id":"$(SD)","mode":"dry_run"}' | jq .; \
	fi
	@echo ""
	@echo "Step 2: Create stories (y/n)?"
	@read -p "Continue? " confirm && [ "$$confirm" = "y" ] && \
		curl -s -X POST "http://localhost:3000/api/stories/generate" \
		-H "Authorization: Bearer $$SERVICE_TOKEN" \
		-H "Content-Type: application/json" \
		-d '{"sd_key":"$(SD)","mode":"upsert"}' | jq . || \
		echo "Cancelled"

# Run smoke tests
stories-test:
	@echo "🧪 Running smoke tests..."
	@bash scripts/smoke-test-stories.sh

# Full E2E with webhook posting
stories-e2e:
	@echo "🚀 Running E2E tests with story verification..."
	@echo "Step 1: Running Playwright tests"
	npm run test:e2e -- --reporter=json
	@echo ""
	@echo "Step 2: Posting results to webhook"
	node tools/post-playwright-results.mjs \
		--report artifacts/playwright-report.json \
		--api http://localhost:3000/api/stories/verify
	@echo ""
	@echo "Step 3: Checking release gate"
ifdef SD
	@node scripts/check-story-gates.js | grep -A10 "$(SD)" || true
else
	@node scripts/check-story-gates.js
endif

# Check release gate status
stories-gate:
ifdef SD
	@echo "📊 Checking gate for $(SD)..."
	@node -e "\
	const { createClient } = require('@supabase/supabase-js');\
	const supabase = createClient(\
		process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,\
		process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY\
	);\
	(async () => {\
		const { data } = await supabase\
			.from('v_sd_release_gate')\
			.select('*')\
			.eq('sd_key', '$(SD)')\
			.single();\
		if (data) {\
			console.log('SD:', data.sd_key);\
			console.log('Ready:', data.ready ? '✅ YES' : '❌ NO');\
			console.log('Coverage:', data.passing_pct + '%');\
			console.log('Stories:', data.passing_count + '/' + data.total_stories);\
		} else {\
			console.log('No gate data for $(SD)');\
		}\
	})();"
else
	@echo "📊 Checking all gates..."
	@node scripts/check-story-gates.js
endif

# Progressive activation
stories-activate:
	@echo "🎬 Progressive Story Activation"
	@echo "Current feature flag status:"
	@grep "FEATURE_.*STOR" .env | sed 's/^/  /'
	@echo ""
	@echo "Activation checklist:"
	@echo "  [ ] Migration applied (make stories-migrate)"
	@echo "  [ ] Migration verified (make stories-verify)"
	@echo "  [ ] Feature flags enabled in .env"
	@echo "  [ ] Server restarted"
	@echo "  [ ] UI rebuilt (npm run build:client)"
	@echo ""
	@echo "Run activation script? (y/n)"
	@read -p "Continue? " confirm && [ "$$confirm" = "y" ] && \
		bash scripts/activate-stories-staging.sh || \
		echo "Cancelled"

# Quick check for duplicates
stories-check-dupes:
ifdef SD
	@echo "🔍 Checking for duplicates in $(SD)..."
	@psql "$$DATABASE_URL" -c "\
		SELECT sd_id, COUNT(*) c, COUNT(DISTINCT backlog_id) d \
		FROM sd_backlog_map WHERE sd_id='$(SD)' \
		GROUP BY 1 HAVING COUNT(*)<>COUNT(DISTINCT backlog_id);"
else
	@echo "🔍 Checking for duplicates across all SDs..."
	@psql "$$DATABASE_URL" -c "\
		SELECT sd_id, COUNT(*) c, COUNT(DISTINCT backlog_id) d \
		FROM sd_backlog_map WHERE story_key IS NOT NULL \
		GROUP BY 1 HAVING COUNT(*)<>COUNT(DISTINCT backlog_id);"
endif

# Development helpers
stories-dev:
	@echo "🛠️ Development mode"
	@echo "Setting feature flags for development..."
	@sed -i 's/FEATURE_AUTO_STORIES=.*/FEATURE_AUTO_STORIES=true/' .env
	@sed -i 's/FEATURE_STORY_UI=.*/FEATURE_STORY_UI=true/' .env
	@echo "Building client..."
	@npm run build:client
	@echo "Starting server..."
	PORT=3000 node server.js

# Clean test artifacts
stories-clean:
	@echo "🧹 Cleaning test artifacts..."
	@rm -rf artifacts/
	@rm -rf playwright-report/
	@rm -rf test-results/
	@rm -f gate-output.txt
	@echo "✅ Cleaned"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Sigstore Artifact Signing & Verification
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

.PHONY: sign-artifact verify-artifact generate-sbom create-attestation verify-provenance

# Sign local artifact with Sigstore keyless
sign-artifact:
ifndef ARTIFACT
	$(error ARTIFACT is required. Usage: make sign-artifact ARTIFACT=artifact.tar.gz)
endif
	@echo "🔏 Signing artifact with Sigstore keyless..."
	@# Check if cosign is installed
	@which cosign >/dev/null || (echo "Error: cosign not installed. Run: make install-signing-tools" && exit 1)
	@# Sign the artifact
	COSIGN_EXPERIMENTAL=1 cosign sign-blob \
		--yes \
		--bundle $(ARTIFACT).bundle \
		--output-signature $(ARTIFACT).sig \
		--output-certificate $(ARTIFACT).crt \
		$(ARTIFACT)
	@echo "✅ Artifact signed: $(ARTIFACT)"
	@echo "  Signature: $(ARTIFACT).sig"
	@echo "  Certificate: $(ARTIFACT).crt"
	@echo "  Bundle: $(ARTIFACT).bundle"

# Verify signed artifact
verify-artifact:
ifndef ARTIFACT
	$(error ARTIFACT is required. Usage: make verify-artifact ARTIFACT=artifact.tar.gz)
endif
	@echo "🔍 Verifying artifact signature..."
	@which cosign >/dev/null || (echo "Error: cosign not installed. Run: make install-signing-tools" && exit 1)
	@# Verify with bundle
	cosign verify-blob \
		--bundle $(ARTIFACT).bundle \
		--certificate-identity-regexp ".*" \
		--certificate-oidc-issuer-regexp ".*" \
		$(ARTIFACT)
	@echo "✅ Signature verified successfully"

# Generate SBOM in CycloneDX format
generate-sbom:
	@echo "📦 Generating SBOM..."
	@which syft >/dev/null || (echo "Error: syft not installed. Run: make install-signing-tools" && exit 1)
	syft dir:. -o cyclonedx-json=sbom.cdx.json
	@echo "✅ SBOM generated: sbom.cdx.json"
	@echo "Format: CycloneDX 1.5"
	@echo "Components: $$(jq '.components | length' sbom.cdx.json) found"

# Create in-toto attestation
create-attestation:
ifndef ARTIFACT
	$(error ARTIFACT is required. Usage: make create-attestation ARTIFACT=artifact.tar.gz)
endif
	@echo "📝 Creating in-toto attestation..."
	@# Calculate digest
	$(eval DIGEST := $(shell sha256sum $(ARTIFACT) | cut -d' ' -f1))
	@# Create attestation
	@cat > attestation.intoto.json <<EOF
	{
	  "_type": "https://in-toto.io/Statement/v1",
	  "subject": [
	    {
	      "name": "$(ARTIFACT)",
	      "digest": {
	        "sha256": "$(DIGEST)"
	      }
	    }
	  ],
	  "predicateType": "https://slsa.dev/provenance/v0.2",
	  "predicate": {
	    "builder": {
	      "id": "https://github.com/rickfelix/EHG_Engineer/Makefile"
	    },
	    "buildType": "https://github.com/slsa-framework/slsa-github-generator/generic@v1",
	    "invocation": {
	      "configSource": {
	        "uri": "git+https://github.com/rickfelix/EHG_Engineer",
	        "digest": {
	          "sha1": "$$(git rev-parse HEAD)"
	        },
	        "entryPoint": "Makefile"
	      }
	    },
	    "metadata": {
	      "buildStartedOn": "$$(date -Iseconds)",
	      "completeness": {
	        "parameters": true,
	        "environment": false,
	        "materials": false
	      },
	      "reproducible": false
	    },
	    "materials": [
	      {
	        "uri": "git+https://github.com/rickfelix/EHG_Engineer",
	        "digest": {
	          "sha1": "$$(git rev-parse HEAD)"
	        }
	      }
	    ]
	  }
	}
	EOF
	@echo "✅ Attestation created: attestation.intoto.json"
	@echo "Type: in-toto v1.0"
	@echo "Predicate: SLSA Provenance v0.2"

# Verify provenance replay attack protection
verify-provenance:
	@echo "🛡️ Running provenance verification tests..."
	@bash tests/negative/provenance-replay.sh
	@echo "✅ All provenance checks passed"

# Install signing tools
install-signing-tools:
	@echo "📦 Installing signing tools..."
	@# Install cosign
	@if ! which cosign >/dev/null; then \
		echo "Installing cosign..."; \
		curl -sSL https://github.com/sigstore/cosign/releases/latest/download/cosign-linux-amd64 -o /tmp/cosign; \
		chmod +x /tmp/cosign; \
		sudo mv /tmp/cosign /usr/local/bin/; \
		cosign version; \
	else \
		echo "cosign already installed: $$(cosign version)"; \
	fi
	@# Install syft for SBOM
	@if ! which syft >/dev/null; then \
		echo "Installing syft..."; \
		curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /tmp; \
		sudo mv /tmp/syft /usr/local/bin/; \
		syft version; \
	else \
		echo "syft already installed: $$(syft version)"; \
	fi
	@# Install slsa-verifier
	@if ! which slsa-verifier >/dev/null; then \
		echo "Installing slsa-verifier..."; \
		curl -sSL https://github.com/slsa-framework/slsa-verifier/releases/latest/download/slsa-verifier-linux-amd64 -o /tmp/slsa-verifier; \
		chmod +x /tmp/slsa-verifier; \
		sudo mv /tmp/slsa-verifier /usr/local/bin/; \
		slsa-verifier version; \
	else \
		echo "slsa-verifier already installed: $$(slsa-verifier version)"; \
	fi
	@echo "✅ All signing tools installed"

# Complete signing workflow
sign-complete:
ifndef ARTIFACT
	@echo "Creating test artifact..."
	@tar czf artifact.tar.gz README.md Makefile
	$(eval ARTIFACT := artifact.tar.gz)
endif
	@echo "🚀 Complete signing workflow for $(ARTIFACT)"
	@$(MAKE) generate-sbom
	@$(MAKE) create-attestation ARTIFACT=$(ARTIFACT)
	@$(MAKE) sign-artifact ARTIFACT=$(ARTIFACT)
	@$(MAKE) verify-artifact ARTIFACT=$(ARTIFACT)
	@echo ""
	@echo "✅ Complete signing workflow successful!"
	@echo "Artifacts created:"
	@echo "  - $(ARTIFACT) (original)"
	@echo "  - $(ARTIFACT).sig (signature)"
	@echo "  - $(ARTIFACT).crt (certificate)"
	@echo "  - $(ARTIFACT).bundle (cosign bundle)"
	@echo "  - attestation.intoto.json (provenance)"
	@echo "  - sbom.cdx.json (SBOM)"

# Clean signing artifacts
clean-signing:
	@echo "🧹 Cleaning signing artifacts..."
	@rm -f *.sig *.crt *.bundle attestation.intoto.json sbom.cdx.json
	@rm -f artifact.tar.gz
	@echo "✅ Signing artifacts cleaned"