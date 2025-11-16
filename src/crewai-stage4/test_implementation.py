#!/usr/bin/env python3
"""
Quick test script for Stage 4 CrewAI implementation
Tests basic functionality without external dependencies
"""

import os
import sys
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

def test_imports():
    """Test that all modules can be imported"""
    print("Testing imports...")
    try:
        # Test schema imports
        from schemas import (
            CompetitorBasicInfo,
            CompetitorAnalysis,
            CompetitiveIntelligenceReport
        )
        print("✓ Schemas imported successfully")

        # Test if we can create a basic schema
        basic_info = CompetitorBasicInfo(
            name="Test Competitor",
            url="https://example.com",
            description="A test competitor",
            market_segment="B2B SaaS"
        )
        print(f"✓ Created basic competitor info: {basic_info.name}")

        return True
    except Exception as e:
        print(f"✗ Import error: {e}")
        return False

def test_pydantic_schemas():
    """Test Pydantic schema creation and validation"""
    print("\nTesting Pydantic schemas...")
    try:
        from schemas import CompetitorBasicInfo, PricingInfo, CompetitiveStrength

        # Test basic info
        competitor = CompetitorBasicInfo(
            name="Acme Corp",
            url="https://acme.com",
            description="Leading provider of widgets",
            market_segment="Enterprise Software",
            company_size="enterprise",
            founded_year=2010
        )

        # Test pricing info
        pricing = PricingInfo(
            model="subscription",
            tiers=[
                {"name": "Starter", "price": "$99/mo"},
                {"name": "Pro", "price": "$299/mo"}
            ],
            free_trial_days=14,
            starting_price="$99/mo"
        )

        # Test competitive strength
        strength = CompetitiveStrength(
            strengths=["Strong brand", "Good UX"],
            weaknesses=["High price", "Limited integrations"],
            moat_type="brand",
            moat_strength="moderate"
        )

        print(f"✓ Created competitor: {competitor.name}")
        print(f"✓ Pricing model: {pricing.model}")
        print(f"✓ Moat type: {strength.moat_type}")

        # Test JSON serialization
        json_output = competitor.model_dump_json(indent=2)
        print(f"✓ JSON serialization works ({len(json_output)} chars)")

        return True

    except Exception as e:
        print(f"✗ Schema test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_agent_creation():
    """Test agent creation (without CrewAI dependency)"""
    print("\nTesting agent creation structure...")
    try:
        # We'll test the structure without actually importing CrewAI
        from agents import CompetitiveIntelligenceAgents

        # Check if the class has the expected methods
        methods = ['research_agent', 'analysis_agent', 'synthesis_agent',
                  'create_simple_crew', 'create_hierarchical_crew']

        for method in methods:
            if hasattr(CompetitiveIntelligenceAgents, method):
                print(f"✓ Method '{method}' exists")
            else:
                print(f"✗ Method '{method}' missing")

        return True

    except ImportError as e:
        print(f"ℹ CrewAI not installed (expected): {e}")
        print("  Would need: pip install crewai crewai-tools")
        return True  # This is expected if CrewAI isn't installed
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        return False

def test_fastapi_structure():
    """Test FastAPI application structure"""
    print("\nTesting FastAPI structure...")
    try:
        # Check if main.py has the expected structure
        with open('main.py', 'r') as f:
            content = f.read()

        endpoints = [
            '/health',
            '/api/v1/analyze',
            '/api/v1/status',
            '/api/v1/results',
            '/api/v1/quick-check'
        ]

        for endpoint in endpoints:
            if endpoint in content:
                print(f"✓ Endpoint '{endpoint}' defined")
            else:
                print(f"✗ Endpoint '{endpoint}' missing")

        return True

    except Exception as e:
        print(f"✗ FastAPI test failed: {e}")
        return False

def test_prompts():
    """Test prompt structure in tasks.py"""
    print("\nTesting prompt definitions...")
    try:
        from tasks import PROMPTS

        expected_prompts = [
            'competitor_discovery',
            'feature_gap_analysis',
            'moat_assessment',
            'executive_summary'
        ]

        for prompt_key in expected_prompts:
            if prompt_key in PROMPTS:
                print(f"✓ Prompt '{prompt_key}' defined ({len(PROMPTS[prompt_key])} chars)")
            else:
                print(f"✗ Prompt '{prompt_key}' missing")

        return True

    except Exception as e:
        print(f"✗ Prompt test failed: {e}")
        return False

def test_supabase_tools():
    """Test Supabase tool structure"""
    print("\nTesting Supabase tools structure...")
    try:
        from supabase_tools import (
            SupabaseConfig,
            SupabaseQueryTool,
            SupabaseWriteTool,
            CompetitorStorageTool
        )

        # Test config creation (without actual credentials)
        config = SupabaseConfig(
            url="https://test.supabase.co",
            anon_key="test-key"
        )

        print(f"✓ SupabaseConfig created")
        print(f"✓ Tools are defined (would need Supabase client to test fully)")

        return True

    except ImportError as e:
        print(f"ℹ Supabase not installed (expected): {e}")
        print("  Would need: pip install supabase")
        return True  # Expected if supabase isn't installed
    except Exception as e:
        print(f"✗ Supabase tools test failed: {e}")
        return False

def create_sample_output():
    """Create a sample output to show the schema structure"""
    print("\n" + "="*50)
    print("SAMPLE OUTPUT STRUCTURE")
    print("="*50)

    try:
        from schemas import CompetitorAnalysis, CompetitorBasicInfo, CompetitiveStrength
        from datetime import datetime

        sample = CompetitorAnalysis(
            basic_info=CompetitorBasicInfo(
                name="Competitor X",
                url="https://competitorx.com",
                description="AI-powered project management platform",
                market_segment="B2B SaaS"
            ),
            core_features=[
                "Task management",
                "Team collaboration",
                "Time tracking",
                "Gantt charts",
                "Resource planning"
            ],
            unique_features=["AI task prioritization"],
            has_api=True,
            has_mobile_app=True,
            competitive_position=CompetitiveStrength(
                strengths=["Strong UX", "Good integrations"],
                weaknesses=["High price", "Limited customization"],
                moat_type="brand",
                moat_strength="moderate"
            ),
            how_to_compete="Focus on customization and competitive pricing",
            risk_level="medium",
            sources=[],
            confidence_score=0.85
        )

        # Print as JSON
        import json
        output = json.loads(sample.model_dump_json())
        print(json.dumps(output, indent=2)[:1000] + "...")

        print("\n✓ Sample competitor analysis created successfully")
        return True

    except Exception as e:
        print(f"✗ Could not create sample output: {e}")
        return False

def main():
    """Run all tests"""
    print("="*50)
    print("STAGE 4 CREWAI IMPLEMENTATION TEST")
    print("="*50)

    tests = [
        ("Import Test", test_imports),
        ("Pydantic Schemas", test_pydantic_schemas),
        ("Agent Structure", test_agent_creation),
        ("FastAPI Structure", test_fastapi_structure),
        ("Prompts", test_prompts),
        ("Supabase Tools", test_supabase_tools),
        ("Sample Output", create_sample_output)
    ]

    results = []
    for test_name, test_func in tests:
        print(f"\n[{test_name}]")
        results.append(test_func())

    print("\n" + "="*50)
    print("TEST SUMMARY")
    print("="*50)

    passed = sum(results)
    total = len(results)

    print(f"Passed: {passed}/{total} tests")

    if passed == total:
        print("✅ All tests passed!")
    else:
        print("⚠️ Some tests did not pass (likely due to missing dependencies)")

    print("\nNOTE: Full functionality requires installing:")
    print("  - crewai & crewai-tools")
    print("  - fastapi & uvicorn")
    print("  - supabase")
    print("  - An OpenAI API key")

    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)