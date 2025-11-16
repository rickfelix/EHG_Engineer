"""
Stage 4 Competitive Intelligence - Pydantic Schemas
Simplified schemas focused on what actually matters for competitive analysis
"""

from pydantic import BaseModel, Field, HttpUrl, validator
from typing import List, Optional, Literal, Dict
from datetime import datetime
from uuid import uuid4


class CompetitorBasicInfo(BaseModel):
    """Basic competitor identification and overview"""

    name: str = Field(..., description="Company name")
    url: HttpUrl = Field(..., description="Primary website URL")
    description: str = Field(..., max_length=500, description="Brief company description")
    market_segment: str = Field(..., description="Primary market segment")
    company_size: Optional[Literal["startup", "smb", "mid-market", "enterprise"]] = None
    founded_year: Optional[int] = Field(None, ge=1900, le=2025)
    headquarters: Optional[str] = None


class PricingInfo(BaseModel):
    """Competitor pricing structure"""

    model: Literal["subscription", "usage-based", "flat-fee", "freemium", "enterprise", "hybrid"]
    tiers: List[Dict[str, str]] = Field(
        default_factory=list,
        description="List of pricing tiers with name and price"
    )
    free_trial_days: Optional[int] = Field(None, ge=0, le=365)
    starting_price: Optional[str] = Field(None, description="Lowest paid tier price")
    billing_periods: List[str] = Field(
        default_factory=lambda: ["monthly", "annual"],
        description="Available billing periods"
    )


class CompetitiveStrength(BaseModel):
    """Analysis of competitive advantages and weaknesses"""

    strengths: List[str] = Field(
        ...,
        max_items=5,
        description="Top competitive strengths"
    )
    weaknesses: List[str] = Field(
        ...,
        max_items=5,
        description="Main vulnerabilities or weaknesses"
    )
    moat_type: Optional[Literal[
        "network_effects",
        "switching_costs",
        "brand",
        "scale",
        "ip_technology",
        "data",
        "regulatory",
        "none"
    ]] = None
    moat_strength: Optional[Literal["weak", "moderate", "strong"]] = None
    moat_description: Optional[str] = Field(
        None,
        max_length=500,
        description="Explanation of their competitive moat"
    )


class MarketOpportunity(BaseModel):
    """Identified market opportunity or gap"""

    title: str = Field(..., max_length=100)
    description: str = Field(..., max_length=500)
    opportunity_type: Literal["feature_gap", "underserved_segment", "price_point", "geographic", "use_case"]
    target_audience: str = Field(..., description="Who would benefit from this")
    implementation_difficulty: Literal["easy", "medium", "hard"]
    potential_impact: Literal["low", "medium", "high"]
    evidence: List[str] = Field(
        ...,
        min_items=1,
        description="Supporting evidence for this opportunity"
    )
    score: int = Field(..., ge=1, le=10, description="Opportunity score (1-10)")

    @validator('score')
    def validate_score(cls, v, values):
        """Auto-calculate score based on impact and difficulty if not provided"""
        if 'potential_impact' in values and 'implementation_difficulty' in values:
            impact_scores = {"low": 1, "medium": 2, "high": 3}
            difficulty_scores = {"easy": 3, "medium": 2, "hard": 1}

            calculated = (impact_scores[values['potential_impact']] *
                         difficulty_scores[values['implementation_difficulty']])

            # Scale to 1-10
            return min(max(calculated * 1.5, 1), 10)
        return v


class SourceCitation(BaseModel):
    """Source attribution for transparency and trust"""

    url: str = Field(..., description="Source URL")
    quote: Optional[str] = Field(None, description="Exact quote from source")
    retrieved_at: datetime = Field(default_factory=datetime.utcnow)
    confidence: Literal["low", "medium", "high"] = Field(
        default="medium",
        description="Confidence in this source"
    )


class CompetitorAnalysis(BaseModel):
    """Complete competitor analysis - main output schema"""

    # Basic Information
    basic_info: CompetitorBasicInfo

    # Product & Features
    core_features: List[str] = Field(
        ...,
        min_items=5,
        max_items=20,
        description="Key product features"
    )
    unique_features: List[str] = Field(
        default_factory=list,
        max_items=5,
        description="Features unique to this competitor"
    )
    integrations_count: Optional[int] = Field(None, ge=0)
    has_api: bool = Field(default=False)
    has_mobile_app: bool = Field(default=False)

    # Pricing
    pricing: Optional[PricingInfo] = None

    # Market Position
    estimated_customers: Optional[str] = Field(
        None,
        description="Estimated customer count or range"
    )
    notable_customers: List[str] = Field(
        default_factory=list,
        max_items=10,
        description="Notable customer logos/names"
    )
    estimated_revenue: Optional[str] = Field(
        None,
        description="Estimated annual revenue or range"
    )

    # Competitive Analysis
    competitive_position: CompetitiveStrength

    # Strategic Insights
    how_to_compete: str = Field(
        ...,
        max_length=1000,
        description="Specific strategy to compete against this competitor"
    )
    risk_level: Literal["low", "medium", "high"] = Field(
        ...,
        description="Threat level this competitor poses"
    )

    # Metadata
    analysis_date: datetime = Field(default_factory=datetime.utcnow)
    sources: List[SourceCitation] = Field(
        ...,
        min_items=1,
        description="Sources for this analysis"
    )
    confidence_score: float = Field(
        ...,
        ge=0,
        le=1,
        description="Overall confidence in this analysis (0-1)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "basic_info": {
                    "name": "CompetitorX",
                    "url": "https://competitorx.com",
                    "description": "AI-powered project management platform",
                    "market_segment": "B2B SaaS Project Management",
                    "company_size": "mid-market",
                    "founded_year": 2018
                },
                "core_features": [
                    "Task management",
                    "Team collaboration",
                    "Time tracking",
                    "Resource planning",
                    "Gantt charts"
                ],
                "unique_features": ["AI task prioritization"],
                "has_api": True,
                "has_mobile_app": True,
                "competitive_position": {
                    "strengths": ["Strong UX", "Good integrations"],
                    "weaknesses": ["High price", "Limited customization"],
                    "moat_type": "brand",
                    "moat_strength": "moderate"
                },
                "how_to_compete": "Focus on customization and lower price point",
                "risk_level": "medium",
                "confidence_score": 0.85
            }
        }


class CompetitiveIntelligenceReport(BaseModel):
    """Full competitive intelligence report for multiple competitors"""

    # Report Metadata
    report_id: str = Field(default_factory=lambda: str(uuid4()))
    venture_id: str = Field(..., description="Associated venture ID")
    analysis_date: datetime = Field(default_factory=datetime.utcnow)

    # Market Overview
    total_competitors_analyzed: int = Field(..., ge=1)
    market_maturity: Literal["nascent", "growing", "mature", "declining"]
    key_market_trend: str = Field(..., max_length=500)

    # Competitor Analyses
    competitors: List[CompetitorAnalysis] = Field(
        ...,
        min_items=1,
        description="Individual competitor analyses"
    )

    # Market Opportunities
    opportunities: List[MarketOpportunity] = Field(
        ...,
        min_items=1,
        max_items=10,
        description="Identified market opportunities"
    )

    # Strategic Recommendations
    immediate_actions: List[str] = Field(
        ...,
        min_items=1,
        max_items=3,
        description="Actions for next 30 days"
    )
    short_term_strategy: List[str] = Field(
        ...,
        min_items=1,
        max_items=3,
        description="Strategy for next quarter"
    )
    long_term_positioning: str = Field(
        ...,
        max_length=1000,
        description="Recommended long-term market position"
    )

    # Risk Assessment
    primary_threat: str = Field(
        ...,
        max_length=500,
        description="Biggest competitive threat identified"
    )
    market_shifts_to_monitor: List[str] = Field(
        ...,
        max_items=3,
        description="Market changes to watch"
    )

    # Report Quality
    overall_confidence: float = Field(
        ...,
        ge=0,
        le=1,
        description="Confidence in overall analysis"
    )
    data_completeness: float = Field(
        ...,
        ge=0,
        le=1,
        description="Percentage of data successfully gathered"
    )

    @validator('overall_confidence')
    def calculate_confidence(cls, v, values):
        """Calculate overall confidence from individual analyses"""
        if 'competitors' in values and values['competitors']:
            confidences = [c.confidence_score for c in values['competitors']]
            return sum(confidences) / len(confidences)
        return v


class QuickCompetitorCheck(BaseModel):
    """Simplified schema for quick competitor validation"""

    name: str
    url: HttpUrl
    is_direct_competitor: bool
    threat_level: Literal["low", "medium", "high"]
    key_strength: str
    key_weakness: str
    should_analyze_deeply: bool
    reason: Optional[str] = None


# Utility schemas for specific use cases

class FeatureComparison(BaseModel):
    """Feature comparison matrix"""

    feature_name: str
    description: str
    our_status: Literal["have", "planned", "not_planned"]
    competitors_with_feature: List[str]
    importance: Literal["critical", "important", "nice_to_have"]
    implementation_effort: Literal["low", "medium", "high"]


class PricingComparison(BaseModel):
    """Pricing comparison across competitors"""

    tier_name: str  # e.g., "Starter", "Professional"
    our_price: Optional[str]
    competitor_prices: Dict[str, str]  # company_name -> price
    value_comparison: str  # Analysis of value vs price
    recommendation: str