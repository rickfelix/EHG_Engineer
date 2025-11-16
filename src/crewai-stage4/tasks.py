"""
Stage 4 Competitive Intelligence - Task Creation Module
Practical task definitions for CrewAI competitive analysis
"""

from crewai import Task
from typing import List, Optional
from .agents import CompetitiveIntelligenceAgents
from .schemas import CompetitorAnalysis, MarketOpportunity


# Import prompts (these would normally be in a separate prompts.py file)
PROMPTS = {
    "competitor_discovery": """
Analyze {competitor_url} to extract competitive intelligence.

Required Information:
1. Company Overview (name, description, market segment)
2. Core Product Features (at least 10 specific features)
3. Pricing Structure (all tiers, costs, billing periods)
4. Target Market (company size, industries, use cases)
5. Technology Indicators (tech stack, integrations, APIs)

For each finding, note the specific URL where you found it.
Output as structured JSON matching our CompetitorAnalysis schema.
""",

    "feature_gap_analysis": """
Based on the competitor data, identify market opportunities:

1. Features everyone has that customers don't value (eliminate)
2. Features customers want but no one offers (gaps)
3. Underserved customer segments

For each opportunity:
- Describe it clearly
- Provide evidence (reviews, missing features)
- Rate difficulty (Easy/Medium/Hard)
- Rate impact (Low/Medium/High)

Focus on actionable opportunities, not theoretical ones.
""",

    "moat_assessment": """
Evaluate the competitor's competitive advantages:

1. Identify their moat type (network effects, brand, scale, IP, data)
2. Assess moat strength (weak/moderate/strong)
3. Estimate replication difficulty (time and cost)
4. Recommend counter-strategy (compete/flank/disrupt/partner)

Focus on structural advantages, not generic ones like "good UX".
Provide specific evidence and reasoning.
""",

    "executive_summary": """
Create a concise competitive intelligence summary:

1. Market Overview (2-3 sentences)
2. Top 3 Competitors (strengths, weaknesses, threat level)
3. Top 3 Strategic Opportunities
4. Top 3 Recommended Actions (immediate)
5. Primary Risk to Monitor

Keep under 500 words. Make it scannable with bullet points.
Include confidence scores and data sources.
"""
}


def create_analysis_tasks(
    ci_agents: CompetitiveIntelligenceAgents,
    competitor_url: str,
    analysis_depth: str = "standard",
    include_screenshots: bool = False
) -> List[Task]:
    """
    Create a set of tasks for analyzing a single competitor

    Args:
        ci_agents: Initialized CompetitiveIntelligenceAgents instance
        competitor_url: URL of the competitor to analyze
        analysis_depth: Level of analysis (quick/standard/comprehensive)
        include_screenshots: Whether to include visual analysis

    Returns:
        List of CrewAI Task objects
    """

    tasks = []

    # Task 1: Research and Data Gathering
    research_task = Task(
        description=PROMPTS["competitor_discovery"].format(
            competitor_url=competitor_url
        ),
        agent=ci_agents.research_agent(),
        expected_output="Comprehensive competitor data in JSON format with all required fields"
    )
    tasks.append(research_task)

    # Task 2: Strategic Analysis (for standard and comprehensive)
    if analysis_depth in ["standard", "comprehensive"]:
        analysis_prompts = [
            PROMPTS["feature_gap_analysis"],
            PROMPTS["moat_assessment"]
        ]

        combined_prompt = "\n\n".join(analysis_prompts)

        analysis_task = Task(
            description=combined_prompt,
            agent=ci_agents.analysis_agent(),
            expected_output="Strategic analysis identifying gaps, opportunities, and competitive moats",
            context=[research_task]  # Depends on research task output
        )
        tasks.append(analysis_task)

    # Task 3: Comprehensive Deep Dive (only for comprehensive)
    if analysis_depth == "comprehensive":
        deep_dive_task = Task(
            description="""
            Perform deep competitive analysis:
            1. Technology stack detection (from job posts, docs, blogs)
            2. Growth trajectory analysis (funding, team size, momentum)
            3. Customer sentiment analysis (from reviews)
            4. Pricing psychology and positioning
            5. Partnership and integration ecosystem

            Provide detailed findings with confidence levels.
            """,
            agent=ci_agents.analysis_agent(),
            expected_output="Comprehensive deep dive analysis with all requested elements",
            context=[research_task]
        )
        tasks.append(deep_dive_task)

    # Task 4: Screenshot Analysis (if requested)
    if include_screenshots:
        screenshot_task = Task(
            description=f"""
            Analyze the visual design and UX of {competitor_url}:
            1. Homepage design and primary call-to-action
            2. Brand tone (professional/playful/technical)
            3. Target audience indicators from design
            4. UI/UX strengths and weaknesses
            5. Comparison to industry standards

            Focus on visual elements only, not content.
            """,
            agent=ci_agents.analysis_agent(),
            expected_output="Visual and UX analysis based on website screenshots",
            context=[research_task]
        )
        tasks.append(screenshot_task)

    # Final Task: Synthesis and Report Generation
    synthesis_task = Task(
        description=PROMPTS["executive_summary"],
        agent=ci_agents.synthesis_agent(),
        expected_output="Complete competitive intelligence report with executive summary and recommendations",
        context=tasks[:-1] if len(tasks) > 1 else [research_task],  # All previous tasks
        output_pydantic=CompetitorAnalysis  # Enforce structured output
    )
    tasks.append(synthesis_task)

    return tasks


def create_market_analysis_tasks(
    ci_agents: CompetitiveIntelligenceAgents,
    competitor_list: List[str],
    venture_context: dict
) -> List[Task]:
    """
    Create tasks for analyzing an entire market (multiple competitors)

    Args:
        ci_agents: Initialized CompetitiveIntelligenceAgents instance
        competitor_list: List of competitor URLs
        venture_context: Context about the venture being analyzed

    Returns:
        List of CrewAI Task objects for market analysis
    """

    tasks = []

    # Task 1: Market Landscape Mapping
    market_mapping_task = Task(
        description=f"""
        Create a comprehensive market landscape for {venture_context.get('name', 'this venture')}:

        Competitors to analyze: {', '.join(competitor_list)}

        1. Categorize competitors (direct, indirect, potential)
        2. Identify market segments and positioning
        3. Estimate market size and growth rate
        4. Identify market leaders vs challengers vs niche players

        Output as structured market map.
        """,
        agent=ci_agents.research_agent(),
        expected_output="Structured market landscape analysis"
    )
    tasks.append(market_mapping_task)

    # Task 2: Competitive Positioning Matrix
    positioning_task = Task(
        description="""
        Create a competitive positioning analysis:

        1. Define the two most important market dimensions
        2. Plot all competitors on a 2x2 matrix
        3. Identify open market positions
        4. Recommend optimal positioning for our venture

        Consider: price vs features, speed vs depth, self-serve vs managed
        """,
        agent=ci_agents.analysis_agent(),
        expected_output="Competitive positioning matrix with recommendations",
        context=[market_mapping_task]
    )
    tasks.append(positioning_task)

    # Task 3: Blue Ocean Opportunities
    blue_ocean_task = Task(
        description="""
        Identify Blue Ocean opportunities:

        1. What are customers complaining about that NO ONE solves?
        2. What features could be eliminated to reduce cost/complexity?
        3. What new customer segments are being ignored?
        4. What non-customers could be converted?

        Use the Four Actions Framework:
        - Eliminate: What the industry takes for granted
        - Reduce: Well below industry standard
        - Raise: Well above industry standard
        - Create: Never offered before

        Rank opportunities by feasibility and impact.
        """,
        agent=ci_agents.analysis_agent(),
        expected_output="Blue Ocean strategic opportunities with implementation paths",
        context=[market_mapping_task, positioning_task]
    )
    tasks.append(blue_ocean_task)

    # Task 4: Strategic Recommendations
    strategy_task = Task(
        description=f"""
        Develop strategic recommendations for {venture_context.get('name', 'this venture')}:

        Based on all analysis, provide:
        1. Recommended market position and messaging
        2. MVP feature set to compete effectively
        3. Pricing strategy and model
        4. Go-to-market approach
        5. Key partnerships to pursue
        6. Risks to mitigate

        Be specific and actionable. Consider our constraints and advantages.
        """,
        agent=ci_agents.synthesis_agent(),
        expected_output="Complete strategic recommendations document",
        context=tasks,  # All previous tasks
        output_pydantic=MarketOpportunity  # Structured output
    )
    tasks.append(strategy_task)

    return tasks


def create_quick_validation_task(
    ci_agents: CompetitiveIntelligenceAgents,
    competitor_url: str
) -> Task:
    """
    Create a single quick validation task for rapid competitor checking

    Args:
        ci_agents: Initialized CompetitiveIntelligenceAgents instance
        competitor_url: URL to quickly validate

    Returns:
        Single Task for quick validation
    """

    return Task(
        description=f"""
        Quick competitive check for {competitor_url}:

        In 2 minutes or less, determine:
        1. Is this a direct competitor? (yes/no)
        2. Their primary value proposition (1 sentence)
        3. Estimated company size (startup/SMB/enterprise)
        4. Main strength (1 item)
        5. Main weakness (1 item)
        6. Threat level (low/medium/high)
        7. Worth deeper analysis? (yes/no with reason)

        Be concise. Output as JSON.
        """,
        agent=ci_agents.research_agent(),
        expected_output="Quick competitive validation in JSON format"
    )


def create_monitoring_task(
    ci_agents: CompetitiveIntelligenceAgents,
    competitor_url: str,
    previous_analysis: dict
) -> Task:
    """
    Create a monitoring task to track competitor changes

    Args:
        ci_agents: Initialized CompetitiveIntelligenceAgents instance
        competitor_url: Competitor to monitor
        previous_analysis: Previous analysis data for comparison

    Returns:
        Task for monitoring competitor changes
    """

    return Task(
        description=f"""
        Monitor {competitor_url} for changes since last analysis:

        Previous analysis date: {previous_analysis.get('analyzed_at', 'Unknown')}

        Check for:
        1. New features or product launches
        2. Pricing changes
        3. New partnerships or integrations
        4. Team growth (new hires, leadership changes)
        5. Funding or acquisition news
        6. Major customer wins or losses
        7. Strategic pivots or messaging changes

        Compare to previous analysis and highlight:
        - What's new
        - What changed
        - Implications for us

        Output as change report with urgency levels.
        """,
        agent=ci_agents.research_agent(),
        expected_output="Competitor monitoring report highlighting changes and implications"
    )