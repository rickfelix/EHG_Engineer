"""
Stage 4 Competitive Intelligence - CrewAI Agent Definitions
Simplified, practical implementation focused on results
"""

from crewai import Agent
from crewai_tools import (
    ScrapeWebsiteTool,
    SerperDevTool,
    WebsiteSearchTool
)
from typing import Optional
from .prompts import PROMPTS


class CompetitiveIntelligenceAgents:
    """
    Factory class for creating Stage 4 competitive intelligence agents.
    Simplified 3-agent system for practical implementation.
    """

    def __init__(self, openai_api_key: str, serper_api_key: Optional[str] = None):
        self.openai_api_key = openai_api_key
        self.serper_api_key = serper_api_key

        # Initialize tools
        self.scrape_tool = ScrapeWebsiteTool()
        self.search_tool = SerperDevTool(api_key=serper_api_key) if serper_api_key else None
        self.website_search_tool = WebsiteSearchTool()

    def research_agent(self) -> Agent:
        """
        Research Agent: Gathers competitor data from multiple sources
        Uses cheaper/faster model for high-volume data extraction
        """
        return Agent(
            role="Competitive Intelligence Researcher",
            goal="Gather comprehensive, factual data about competitors from websites, "
                 "reviews, and public sources",
            backstory="""You are an experienced competitive intelligence researcher with
            a keen eye for detail. You excel at finding and extracting relevant information
            from various sources. You always verify facts and note your sources. You follow
            ethical guidelines, respecting robots.txt and terms of service.""",
            tools=[
                self.scrape_tool,
                self.website_search_tool,
                self.search_tool
            ] if self.search_tool else [
                self.scrape_tool,
                self.website_search_tool
            ],
            llm="gpt-4-turbo",  # Cheaper for data gathering
            max_iter=3,
            memory=True,
            verbose=True,
            allow_delegation=False
        )

    def analysis_agent(self) -> Agent:
        """
        Analysis Agent: Performs deep strategic analysis
        Uses advanced model for complex reasoning
        """
        return Agent(
            role="Strategic Competitive Analyst",
            goal="Analyze competitor data to identify market gaps, competitive moats, "
                 "and strategic opportunities",
            backstory="""You are a senior strategic analyst with expertise in competitive
            positioning and market analysis. You excel at identifying patterns, finding
            market gaps, and assessing competitive advantages. You think strategically
            about how to compete effectively without copying competitors. Your analysis
            is always backed by evidence and focused on actionable insights.""",
            tools=[],  # Pure reasoning agent - no tools needed
            llm="gpt-4o",  # Better reasoning capabilities
            max_iter=2,
            memory=True,
            verbose=True,
            allow_delegation=False
        )

    def synthesis_agent(self) -> Agent:
        """
        Synthesis Agent: Creates final reports and recommendations
        Ensures completeness and actionability
        """
        return Agent(
            role="Competitive Intelligence Report Writer",
            goal="Synthesize all findings into a comprehensive, actionable competitive "
                 "intelligence report with specific recommendations",
            backstory="""You are an expert at synthesizing complex competitive intelligence
            into clear, actionable reports. You ensure every insight is supported by evidence
            and every recommendation is specific and practical. You excel at creating
            executive summaries that highlight the most important findings and organizing
            detailed information in a scannable, useful format.""",
            tools=[],  # Pure synthesis - no tools needed
            llm="gpt-4o",  # Good at structured output
            max_iter=2,
            memory=True,
            verbose=True,
            allow_delegation=False
        )

    def create_simple_crew(self):
        """
        Creates a simple sequential crew for basic competitive analysis
        Good for analyzing 1-3 competitors
        """
        from crewai import Crew, Process

        return Crew(
            agents=[
                self.research_agent(),
                self.analysis_agent(),
                self.synthesis_agent()
            ],
            process=Process.sequential,
            memory=True,
            cache=True,  # Enable caching for tool results
            max_rpm=10,  # Rate limiting
            share_crew=False
        )

    def create_hierarchical_crew(self, manager_llm: str = "gpt-4o"):
        """
        Creates a hierarchical crew with a manager for complex analysis
        Good for analyzing 5+ competitors or complex market analysis
        """
        from crewai import Crew, Process

        # Manager agent for orchestration
        manager = Agent(
            role="Competitive Intelligence Director",
            goal="Orchestrate the team to produce comprehensive competitive intelligence",
            backstory="""You are an experienced CI director who excels at breaking down
            complex analysis tasks and delegating to the right specialists. You ensure
            all work is complete, accurate, and actionable.""",
            llm=manager_llm,
            memory=True,
            verbose=True,
            allow_delegation=True  # Manager must be able to delegate
        )

        return Crew(
            agents=[
                self.research_agent(),
                self.analysis_agent(),
                self.synthesis_agent()
            ],
            manager_agent=manager,
            process=Process.hierarchical,
            memory=True,
            cache=True,
            max_rpm=10,
            share_crew=False
        )


class OptimizedAgentFactory:
    """
    Factory for creating optimized agents based on specific use cases
    Implements cost and performance optimizations from research
    """

    @staticmethod
    def create_batch_processing_agent(model: str = "gpt-3.5-turbo") -> Agent:
        """
        Optimized for processing many competitors quickly
        Uses cheaper model with focused prompts
        """
        return Agent(
            role="Batch Data Processor",
            goal="Quickly extract key information from multiple competitor websites",
            backstory="You are optimized for speed and efficiency. Extract only essential "
                     "information without deep analysis.",
            llm=model,
            max_iter=1,  # Single pass for speed
            memory=False,  # No memory for stateless batch processing
            verbose=False,
            allow_delegation=False
        )

    @staticmethod
    def create_deep_analysis_agent(model: str = "gpt-4o") -> Agent:
        """
        Optimized for deep strategic analysis of key competitors
        Uses advanced model with more iterations
        """
        return Agent(
            role="Deep Strategic Analyst",
            goal="Perform comprehensive strategic analysis with multiple perspectives",
            backstory="You are a strategic thinker who considers multiple angles and "
                     "second-order effects. You dig deep into implications and connections.",
            llm=model,
            max_iter=5,  # More iterations for deeper analysis
            memory=True,
            verbose=True,
            allow_delegation=False
        )

    @staticmethod
    def create_validation_agent(model: str = "gpt-4-turbo") -> Agent:
        """
        Specialized agent for fact-checking and validation
        Balanced model for accuracy checking
        """
        return Agent(
            role="Intelligence Validator",
            goal="Verify facts, check sources, and ensure accuracy of findings",
            backstory="You are a meticulous fact-checker who verifies every claim "
                     "and ensures all intelligence is accurate and properly sourced.",
            llm=model,
            max_iter=2,
            memory=True,
            verbose=True,
            allow_delegation=False
        )


# Practical usage example
if __name__ == "__main__":
    # Example: Creating a simple competitive analysis crew

    import os
    from crewai import Task
    from .schemas import CompetitorAnalysis

    # Initialize agents
    ci_agents = CompetitiveIntelligenceAgents(
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        serper_api_key=os.getenv("SERPER_API_KEY")  # Optional for search
    )

    # Create tasks
    research_task = Task(
        description=PROMPTS["competitor_discovery"].format(
            competitor_url="https://example-competitor.com"
        ),
        agent=ci_agents.research_agent(),
        expected_output="Comprehensive competitor data in JSON format"
    )

    analysis_task = Task(
        description=PROMPTS["feature_gap_analysis"],
        agent=ci_agents.analysis_agent(),
        expected_output="Strategic analysis with gaps and opportunities",
        context=[research_task]  # Uses output from research task
    )

    synthesis_task = Task(
        description=PROMPTS["executive_summary"],
        agent=ci_agents.synthesis_agent(),
        expected_output="Complete competitive intelligence report",
        context=[research_task, analysis_task],
        output_pydantic=CompetitorAnalysis  # Ensures structured output
    )

    # Create and run crew
    crew = ci_agents.create_simple_crew()
    crew.tasks = [research_task, analysis_task, synthesis_task]

    # Execute
    result = crew.kickoff()
    print(result)