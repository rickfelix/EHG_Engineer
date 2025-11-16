"""
Stage 4 Competitive Intelligence - Supabase Integration Tools
Simple, effective tools for CrewAI agents to interact with Supabase
"""

from crewai_tools import BaseTool
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from supabase import create_client, Client
from datetime import datetime
import json
import os


class SupabaseConfig(BaseModel):
    """Supabase connection configuration"""
    url: str = Field(default_factory=lambda: os.getenv("SUPABASE_URL"))
    anon_key: str = Field(default_factory=lambda: os.getenv("SUPABASE_ANON_KEY"))
    service_key: Optional[str] = Field(default_factory=lambda: os.getenv("SUPABASE_SERVICE_ROLE_KEY"))


class VentureResearchQueryInput(BaseModel):
    """Input schema for querying venture research data"""
    venture_id: str = Field(..., description="ID of the venture to query")
    research_type: Optional[str] = Field(
        default="stage_4_competitive_intelligence",
        description="Type of research to retrieve"
    )


class VentureResearchUpdateInput(BaseModel):
    """Input schema for updating venture research data"""
    venture_id: str = Field(..., description="ID of the venture to update")
    research_data: Dict[str, Any] = Field(..., description="Research data to store")
    research_type: str = Field(
        default="stage_4_competitive_intelligence",
        description="Type of research being stored"
    )


class CompetitorStorageInput(BaseModel):
    """Input schema for storing competitor analysis"""
    venture_id: str = Field(..., description="Associated venture ID")
    competitor_data: Dict[str, Any] = Field(..., description="Competitor analysis data")
    competitor_url: str = Field(..., description="Competitor website URL")


class SupabaseQueryTool(BaseTool):
    """
    Tool for CrewAI agents to query data from Supabase
    Focuses on reading existing competitive intelligence
    """

    name: str = "query_supabase"
    description: str = "Query competitive intelligence data from Supabase database"
    args_schema: type[BaseModel] = VentureResearchQueryInput

    def __init__(self, config: Optional[SupabaseConfig] = None):
        super().__init__()
        self.config = config or SupabaseConfig()
        self.client: Client = create_client(self.config.url, self.config.anon_key)

    def _run(self, venture_id: str, research_type: str = "stage_4_competitive_intelligence") -> str:
        """
        Query existing research data for a venture
        Returns JSON string of research data
        """
        try:
            # Query venture_drafts table for research results
            response = self.client.table("venture_drafts") \
                .select("research_results") \
                .eq("id", venture_id) \
                .single() \
                .execute()

            if response.data and response.data.get("research_results"):
                research_results = response.data["research_results"]

                # Extract specific research type if it exists
                if research_type in research_results:
                    return json.dumps(research_results[research_type], indent=2)
                else:
                    return json.dumps({
                        "message": f"No {research_type} data found",
                        "available_research": list(research_results.keys())
                    })
            else:
                return json.dumps({
                    "message": "No research data found for this venture",
                    "venture_id": venture_id
                })

        except Exception as e:
            return json.dumps({
                "error": str(e),
                "message": "Failed to query Supabase"
            })


class SupabaseWriteTool(BaseTool):
    """
    Tool for CrewAI agents to write competitive intelligence to Supabase
    Handles both venture research updates and competitor storage
    """

    name: str = "write_to_supabase"
    description: str = "Store competitive intelligence analysis results in Supabase"
    args_schema: type[BaseModel] = VentureResearchUpdateInput

    def __init__(self, config: Optional[SupabaseConfig] = None):
        super().__init__()
        self.config = config or SupabaseConfig()
        # Use service key for write operations if available
        key = self.config.service_key or self.config.anon_key
        self.client: Client = create_client(self.config.url, key)

    def _run(
        self,
        venture_id: str,
        research_data: Dict[str, Any],
        research_type: str = "stage_4_competitive_intelligence"
    ) -> str:
        """
        Store competitive intelligence data in Supabase
        Updates the research_results JSONB column
        """
        try:
            # First, get existing research results
            existing = self.client.table("venture_drafts") \
                .select("research_results") \
                .eq("id", venture_id) \
                .single() \
                .execute()

            # Prepare updated research results
            if existing.data and existing.data.get("research_results"):
                research_results = existing.data["research_results"]
            else:
                research_results = {}

            # Add timestamp and version
            research_data["analyzed_at"] = datetime.utcnow().isoformat()
            research_data["version"] = "2.0_crewai"

            # Update with new research
            research_results[research_type] = research_data

            # Write back to database
            response = self.client.table("venture_drafts") \
                .update({"research_results": research_results}) \
                .eq("id", venture_id) \
                .execute()

            if response.data:
                return json.dumps({
                    "success": True,
                    "message": f"Successfully stored {research_type} data",
                    "venture_id": venture_id,
                    "timestamp": research_data["analyzed_at"]
                })
            else:
                return json.dumps({
                    "success": False,
                    "message": "Failed to update database"
                })

        except Exception as e:
            return json.dumps({
                "error": str(e),
                "message": "Failed to write to Supabase"
            })


class CompetitorStorageTool(BaseTool):
    """
    Specialized tool for storing individual competitor analyses
    Creates entries in the competitors table
    """

    name: str = "store_competitor"
    description: str = "Store individual competitor analysis in the competitors table"
    args_schema: type[BaseModel] = CompetitorStorageInput

    def __init__(self, config: Optional[SupabaseConfig] = None):
        super().__init__()
        self.config = config or SupabaseConfig()
        key = self.config.service_key or self.config.anon_key
        self.client: Client = create_client(self.config.url, key)

    def _run(
        self,
        venture_id: str,
        competitor_data: Dict[str, Any],
        competitor_url: str
    ) -> str:
        """
        Store competitor analysis in dedicated competitors table
        """
        try:
            # Prepare competitor record
            competitor_record = {
                "venture_id": venture_id,
                "name": competitor_data.get("name", "Unknown"),
                "website": competitor_url,
                "market_segment": competitor_data.get("market_segment"),
                "features": competitor_data.get("core_features", []),
                "strengths": competitor_data.get("strengths", []),
                "weaknesses": competitor_data.get("weaknesses", []),
                "pricing_model": competitor_data.get("pricing", {}).get("model"),
                "analysis_data": competitor_data,  # Store full analysis as JSONB
                "analyzed_at": datetime.utcnow().isoformat()
            }

            # Insert into competitors table
            response = self.client.table("competitors") \
                .insert(competitor_record) \
                .execute()

            if response.data:
                return json.dumps({
                    "success": True,
                    "message": f"Stored competitor: {competitor_record['name']}",
                    "competitor_id": response.data[0].get("id") if response.data else None
                })
            else:
                return json.dumps({
                    "success": False,
                    "message": "Failed to store competitor"
                })

        except Exception as e:
            # If table doesn't exist, fall back to storing in venture_drafts
            return self._fallback_storage(venture_id, competitor_data, str(e))

    def _fallback_storage(self, venture_id: str, competitor_data: Dict[str, Any], error: str) -> str:
        """
        Fallback to storing in venture_drafts if competitors table doesn't exist
        """
        try:
            write_tool = SupabaseWriteTool(self.config)
            return write_tool._run(
                venture_id=venture_id,
                research_data={"competitors": [competitor_data]},
                research_type="stage_4_competitive_intelligence"
            )
        except Exception as e:
            return json.dumps({
                "error": f"Primary error: {error}, Fallback error: {str(e)}",
                "message": "Failed to store competitor data"
            })


class VentureContextTool(BaseTool):
    """
    Tool to hydrate agent context with existing venture data
    Useful for providing agents with background information
    """

    name: str = "get_venture_context"
    description: str = "Retrieve venture context and background information"

    def __init__(self, config: Optional[SupabaseConfig] = None):
        super().__init__()
        self.config = config or SupabaseConfig()
        self.client: Client = create_client(self.config.url, self.config.anon_key)

    def _run(self, venture_id: str) -> str:
        """
        Get comprehensive venture context for agent use
        """
        try:
            # Get venture basic info
            venture_response = self.client.table("venture_drafts") \
                .select("name, description, target_audience, problem_solution") \
                .eq("id", venture_id) \
                .single() \
                .execute()

            if not venture_response.data:
                return json.dumps({"error": "Venture not found"})

            context = {
                "venture": venture_response.data,
                "previous_analyses": {}
            }

            # Get any previous competitive analyses
            research_response = self.client.table("venture_drafts") \
                .select("research_results") \
                .eq("id", venture_id) \
                .single() \
                .execute()

            if research_response.data and research_response.data.get("research_results"):
                # Extract relevant previous research
                research = research_response.data["research_results"]
                if "stage_3_validation" in research:
                    context["previous_analyses"]["validation"] = research["stage_3_validation"]
                if "stage_4_competitive_intelligence" in research:
                    context["previous_analyses"]["previous_competitive"] = research["stage_4_competitive_intelligence"]

            return json.dumps(context, indent=2)

        except Exception as e:
            return json.dumps({
                "error": str(e),
                "message": "Failed to retrieve venture context"
            })


# Utility functions for direct use (not as CrewAI tools)

def store_competitive_report(
    venture_id: str,
    report_data: Dict[str, Any],
    config: Optional[SupabaseConfig] = None
) -> bool:
    """
    Direct function to store a complete competitive intelligence report
    Returns True if successful
    """
    config = config or SupabaseConfig()
    key = config.service_key or config.anon_key
    client = create_client(config.url, key)

    try:
        # Add metadata
        report_data["stored_at"] = datetime.utcnow().isoformat()
        report_data["source"] = "crewai_stage_4"

        # Get existing research results
        existing = client.table("venture_drafts") \
            .select("research_results") \
            .eq("id", venture_id) \
            .single() \
            .execute()

        research_results = existing.data.get("research_results", {}) if existing.data else {}

        # Update with new report
        research_results["stage_4_competitive_intelligence"] = report_data

        # Store back
        response = client.table("venture_drafts") \
            .update({
                "research_results": research_results,
                "updated_at": datetime.utcnow().isoformat()
            }) \
            .eq("id", venture_id) \
            .execute()

        return bool(response.data)

    except Exception as e:
        print(f"Error storing competitive report: {e}")
        return False


def get_existing_competitors(
    venture_id: str,
    config: Optional[SupabaseConfig] = None
) -> List[Dict[str, Any]]:
    """
    Retrieve any existing competitor analyses for a venture
    Returns list of competitor data
    """
    config = config or SupabaseConfig()
    client = create_client(config.url, config.anon_key)

    try:
        # Try to get from competitors table first
        response = client.table("competitors") \
            .select("*") \
            .eq("venture_id", venture_id) \
            .execute()

        if response.data:
            return response.data

        # Fallback to venture_drafts research_results
        venture_response = client.table("venture_drafts") \
            .select("research_results") \
            .eq("id", venture_id) \
            .single() \
            .execute()

        if venture_response.data and venture_response.data.get("research_results"):
            research = venture_response.data["research_results"]
            if "stage_4_competitive_intelligence" in research:
                ci_data = research["stage_4_competitive_intelligence"]
                if isinstance(ci_data, dict) and "competitors" in ci_data:
                    return ci_data["competitors"]

        return []

    except Exception as e:
        print(f"Error retrieving competitors: {e}")
        return []