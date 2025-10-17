-- Migration: EVA Content Catalogue & Dynamic Presentation System MVP
-- SD: SD-EVA-CONTENT-001
-- Date: 2025-10-11
-- Description: Comprehensive content management system for EVA with version control,
--              dynamic layouts, and conversation integration

-- ======================================================================================
-- TABLE 1: content_types
-- ======================================================================================
-- Purpose: Define available content types (text_block, data_table, chart, etc.)
-- Each type has creation methods, display rules, validation schema, transformation logic

CREATE TABLE IF NOT EXISTS content_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- "text_block", "data_table", "chart"
  display_name TEXT NOT NULL, -- "Text Block", "Data Table", "Chart"
  description TEXT,

  -- Creation methods (UI form, API, AI generation, import)
  creation_method JSONB NOT NULL DEFAULT '{}',
  -- Example: { "ui_form": {...}, "api_endpoint": "/api/content/create", "ai_prompt_template": "..." }

  -- Display rules for different layout modes
  display_rules JSONB NOT NULL DEFAULT '{}',
  -- Example: { "presentation": {...}, "spreadsheet": {...}, "document": {...} }

  -- Validation schema (JSON Schema format)
  validation_schema JSONB NOT NULL DEFAULT '{}',
  -- Example: { "type": "object", "properties": {...}, "required": [...] }

  -- Transformation logic (how to convert to other types)
  transformation_logic JSONB DEFAULT '{}',
  -- Example: { "to_chart": "function...", "to_table": "function..." }

  -- Metadata
  icon TEXT, -- Icon name for UI
  color TEXT, -- Color for UI
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_content_types_name ON content_types(name);
CREATE INDEX IF NOT EXISTS idx_content_types_active ON content_types(is_active);

-- RLS Policies
ALTER TABLE content_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_types_select_all" ON content_types
  FOR SELECT USING (true); -- Anyone can read content type definitions

CREATE POLICY "content_types_modify_authenticated" ON content_types
  FOR ALL USING (auth.uid() IS NOT NULL); -- Only authenticated users can modify

COMMENT ON TABLE content_types IS 'Defines available content types with creation methods, display rules, and validation schemas';


-- ======================================================================================
-- TABLE 2: screen_layouts
-- ======================================================================================
-- Purpose: Define layout templates (presentation, spreadsheet, document, flowchart, custom)
-- Each layout has template structure, logic rules, default settings

CREATE TABLE IF NOT EXISTS screen_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- "Presentation", "Spreadsheet", "Document", "Flowchart"
  display_name TEXT NOT NULL,
  description TEXT,
  layout_type TEXT NOT NULL CHECK (layout_type IN ('presentation', 'spreadsheet', 'document', 'flowchart', 'custom')),

  -- Template structure (zones, positioning, grid system)
  template_json JSONB NOT NULL DEFAULT '{}',
  -- Example: { "zones": [...], "grid": { "columns": 12, "gap": 20 }, "transitions": {...} }

  -- Logic rules (conditional rendering, responsive breakpoints, data binding)
  logic_rules JSONB DEFAULT '{}',
  -- Example: { "conditional_rendering": [...], "responsive": {...}, "bindings": [...] }

  -- Default settings (zoom level, pan position, theme)
  default_settings JSONB DEFAULT '{}',
  -- Example: { "zoom": 1.0, "pan": { "x": 0, "y": 0 }, "theme": "light" }

  -- Metadata
  thumbnail_url TEXT, -- Preview image
  is_system BOOLEAN DEFAULT false, -- System layouts can't be deleted
  is_active BOOLEAN DEFAULT true,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_screen_layouts_type ON screen_layouts(layout_type);
CREATE INDEX IF NOT EXISTS idx_screen_layouts_active ON screen_layouts(is_active);
CREATE INDEX IF NOT EXISTS idx_screen_layouts_created_by ON screen_layouts(created_by);

-- RLS Policies
ALTER TABLE screen_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "screen_layouts_select_all" ON screen_layouts
  FOR SELECT USING (true); -- Anyone can read layouts

CREATE POLICY "screen_layouts_insert_authenticated" ON screen_layouts
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

CREATE POLICY "screen_layouts_update_owner" ON screen_layouts
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "screen_layouts_delete_owner" ON screen_layouts
  FOR DELETE USING (auth.uid() = created_by AND is_system = false);

COMMENT ON TABLE screen_layouts IS 'Layout templates for different presentation modes (presentation, spreadsheet, document, flowchart)';


-- ======================================================================================
-- TABLE 3: content_catalogue
-- ======================================================================================
-- Purpose: Central repository of all content items (versioned)
-- Links to content_type, stores current version, full data, metadata

CREATE TABLE IF NOT EXISTS content_catalogue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type_id UUID NOT NULL REFERENCES content_types(id),

  -- Basic info
  title TEXT NOT NULL,
  description TEXT,

  -- Versioning
  current_version INTEGER DEFAULT 1,

  -- Content data (structure depends on content_type)
  data JSONB NOT NULL DEFAULT '{}',
  -- Example for text_block: { "markdown": "# Title\nContent...", "plaintext": "..." }
  -- Example for data_table: { "columns": [...], "rows": [...] }
  -- Example for chart: { "type": "bar", "data": [...], "options": {...} }

  -- Metadata
  metadata JSONB DEFAULT '{}',
  -- Example: { "tags": [...], "custom_properties": {...} }

  -- Ownership
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_content_catalogue_type ON content_catalogue(content_type_id);
CREATE INDEX IF NOT EXISTS idx_content_catalogue_created_by ON content_catalogue(created_by);
CREATE INDEX IF NOT EXISTS idx_content_catalogue_created_at ON content_catalogue(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_catalogue_updated_at ON content_catalogue(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_catalogue_data_gin ON content_catalogue USING gin(data); -- For JSONB queries
CREATE INDEX IF NOT EXISTS idx_content_catalogue_metadata_gin ON content_catalogue USING gin(metadata);

-- RLS Policies
ALTER TABLE content_catalogue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_catalogue_select_owner" ON content_catalogue
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "content_catalogue_insert_authenticated" ON content_catalogue
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

CREATE POLICY "content_catalogue_update_owner" ON content_catalogue
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "content_catalogue_delete_owner" ON content_catalogue
  FOR DELETE USING (auth.uid() = created_by);

COMMENT ON TABLE content_catalogue IS 'Central repository of all versioned content items';


-- ======================================================================================
-- TABLE 4: content_versions
-- ======================================================================================
-- Purpose: Version history for every content item (immutable snapshots)
-- Each version stores full snapshot of data and metadata

CREATE TABLE IF NOT EXISTS content_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogue_id UUID NOT NULL REFERENCES content_catalogue(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,

  -- Snapshot of data at this version
  data_snapshot JSONB NOT NULL,
  metadata_snapshot JSONB DEFAULT '{}',

  -- Change tracking
  changed_by UUID REFERENCES auth.users(id),
  change_description TEXT,
  change_type TEXT CHECK (change_type IN ('create', 'update', 'rollback', 'merge')),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(catalogue_id, version_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_content_versions_catalogue ON content_versions(catalogue_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_content_versions_changed_by ON content_versions(changed_by);
CREATE INDEX IF NOT EXISTS idx_content_versions_created_at ON content_versions(created_at DESC);

-- RLS Policies
ALTER TABLE content_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_versions_select_owner" ON content_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM content_catalogue
      WHERE content_catalogue.id = content_versions.catalogue_id
        AND content_catalogue.created_by = auth.uid()
    )
  );

CREATE POLICY "content_versions_insert_owner" ON content_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM content_catalogue
      WHERE content_catalogue.id = content_versions.catalogue_id
        AND content_catalogue.created_by = auth.uid()
    )
  );

COMMENT ON TABLE content_versions IS 'Immutable version history for all content items with full snapshots';


-- ======================================================================================
-- TABLE 5: content_layout_assignments
-- ======================================================================================
-- Purpose: Link content items to layouts with display settings
-- Allows same content to be viewed in multiple layouts (presentation, spreadsheet, etc.)

CREATE TABLE IF NOT EXISTS content_layout_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogue_id UUID NOT NULL REFERENCES content_catalogue(id) ON DELETE CASCADE,
  layout_id UUID NOT NULL REFERENCES screen_layouts(id) ON DELETE CASCADE,

  -- Display settings specific to this content + layout combination
  display_settings JSONB DEFAULT '{}',
  -- Example: { "position": { "x": 100, "y": 200 }, "zoom": 1.2, "custom_styles": {...} }

  is_default BOOLEAN DEFAULT false, -- Is this the default layout for this content?

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(catalogue_id, layout_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_content_layout_assignments_catalogue ON content_layout_assignments(catalogue_id);
CREATE INDEX IF NOT EXISTS idx_content_layout_assignments_layout ON content_layout_assignments(layout_id);
CREATE INDEX IF NOT EXISTS idx_content_layout_assignments_default ON content_layout_assignments(catalogue_id, is_default);

-- RLS Policies
ALTER TABLE content_layout_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_layout_assignments_select_owner" ON content_layout_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM content_catalogue
      WHERE content_catalogue.id = content_layout_assignments.catalogue_id
        AND content_catalogue.created_by = auth.uid()
    )
  );

CREATE POLICY "content_layout_assignments_modify_owner" ON content_layout_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM content_catalogue
      WHERE content_catalogue.id = content_layout_assignments.catalogue_id
        AND content_catalogue.created_by = auth.uid()
    )
  );

COMMENT ON TABLE content_layout_assignments IS 'Links content items to layouts with custom display settings';


-- ======================================================================================
-- TABLE 6: eva_conversations
-- ======================================================================================
-- Purpose: Record all EVA conversations with full transcripts and context
-- Links conversations to content they create or discuss

CREATE TABLE IF NOT EXISTS eva_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- Conversation data
  conversation_data JSONB NOT NULL DEFAULT '{}',
  -- Example: { "messages": [{ "role": "user", "content": "..." }, ...], "turns": 5 }

  -- Context (user intent, session state, entities referenced)
  context JSONB DEFAULT '{}',
  -- Example: { "intent": "create_presentation", "entities": [...], "session_state": {...} }

  -- Metadata
  title TEXT, -- Auto-generated or user-defined
  summary TEXT, -- Brief summary of conversation

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_eva_conversations_user ON eva_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_eva_conversations_created_at ON eva_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eva_conversations_data_gin ON eva_conversations USING gin(conversation_data);
CREATE INDEX IF NOT EXISTS idx_eva_conversations_context_gin ON eva_conversations USING gin(context);

-- RLS Policies
ALTER TABLE eva_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eva_conversations_select_owner" ON eva_conversations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "eva_conversations_insert_owner" ON eva_conversations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "eva_conversations_update_owner" ON eva_conversations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "eva_conversations_delete_owner" ON eva_conversations
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE eva_conversations IS 'Records all EVA conversations with full transcripts and context';


-- ======================================================================================
-- TABLE 7: conversation_content_links
-- ======================================================================================
-- Purpose: Link EVA conversations to content items they created, modified, or discussed
-- Provides context for "where did this content come from?"

CREATE TABLE IF NOT EXISTS conversation_content_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES eva_conversations(id) ON DELETE CASCADE,
  catalogue_id UUID NOT NULL REFERENCES content_catalogue(id) ON DELETE CASCADE,

  -- Link context
  reference_context TEXT, -- "Created in this conversation", "Modified here", "Discussed"
  link_type TEXT NOT NULL CHECK (link_type IN ('created', 'modified', 'referenced', 'displayed')),

  -- Specific message reference (optional)
  message_index INTEGER, -- Which message in conversation mentioned this content?

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(conversation_id, catalogue_id, link_type) -- One link per type per conversation
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversation_content_links_conversation ON conversation_content_links(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_content_links_catalogue ON conversation_content_links(catalogue_id);
CREATE INDEX IF NOT EXISTS idx_conversation_content_links_type ON conversation_content_links(link_type);

-- RLS Policies
ALTER TABLE conversation_content_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_content_links_select_owner" ON conversation_content_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM eva_conversations
      WHERE eva_conversations.id = conversation_content_links.conversation_id
        AND eva_conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "conversation_content_links_insert_owner" ON conversation_content_links
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM eva_conversations
      WHERE eva_conversations.id = conversation_content_links.conversation_id
        AND eva_conversations.user_id = auth.uid()
    )
  );

COMMENT ON TABLE conversation_content_links IS 'Links EVA conversations to content items they created, modified, or discussed';


-- ======================================================================================
-- TABLE 8: eva_user_settings
-- ======================================================================================
-- Purpose: Store user preferences for EVA content system (default layouts, views, etc.)

CREATE TABLE IF NOT EXISTS eva_user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id),

  -- Layout preferences (default layout per content_type)
  layout_preferences JSONB DEFAULT '{}',
  -- Example: { "text_block": "presentation", "data_table": "spreadsheet", "chart": "presentation" }

  -- Default view settings (zoom, pan, theme)
  default_views JSONB DEFAULT '{}',
  -- Example: { "zoom": 1.0, "pan": { "x": 0, "y": 0 }, "theme": "light", "auto_save": true }

  -- UI configurations (keyboard shortcuts, display preferences)
  configurations JSONB DEFAULT '{}',
  -- Example: { "keyboard_shortcuts": {...}, "show_grid": true, "snap_to_grid": false }

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_eva_user_settings_user ON eva_user_settings(user_id);

-- RLS Policies
ALTER TABLE eva_user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eva_user_settings_select_owner" ON eva_user_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "eva_user_settings_insert_owner" ON eva_user_settings
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "eva_user_settings_update_owner" ON eva_user_settings
  FOR UPDATE USING (auth.uid() = user_id);

COMMENT ON TABLE eva_user_settings IS 'User preferences for EVA content system (layouts, views, configurations)';


-- ======================================================================================
-- TABLE 9: content_item_metadata
-- ======================================================================================
-- Purpose: Meta database per content item (tags, relationships, analytics, custom properties)
-- Extensible metadata layer for rich querying and organization

CREATE TABLE IF NOT EXISTS content_item_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogue_id UUID NOT NULL UNIQUE REFERENCES content_catalogue(id) ON DELETE CASCADE,

  -- Organizational
  tags TEXT[] DEFAULT '{}', -- Array of tags for categorization
  relationships JSONB DEFAULT '{}',
  -- Example: { "linked_items": ["uuid1", "uuid2"], "parent_item": "uuid3" }

  -- Access control
  access_control JSONB DEFAULT '{}',
  -- Example: { "viewers": ["uuid1"], "editors": ["uuid2"], "public": false }

  -- Usage analytics
  usage_analytics JSONB DEFAULT '{}',
  -- Example: { "views": 42, "edits": 7, "shares": 3, "last_accessed": "2025-10-11T10:00:00Z" }

  -- Custom properties (user-defined fields)
  custom_properties JSONB DEFAULT '{}',
  -- Example: { "project": "Q4 Campaign", "status": "draft", "owner_department": "Marketing" }

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_content_item_metadata_catalogue ON content_item_metadata(catalogue_id);
CREATE INDEX IF NOT EXISTS idx_content_item_metadata_tags_gin ON content_item_metadata USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_content_item_metadata_relationships_gin ON content_item_metadata USING gin(relationships);
CREATE INDEX IF NOT EXISTS idx_content_item_metadata_custom_gin ON content_item_metadata USING gin(custom_properties);

-- RLS Policies
ALTER TABLE content_item_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_item_metadata_select_owner" ON content_item_metadata
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM content_catalogue
      WHERE content_catalogue.id = content_item_metadata.catalogue_id
        AND content_catalogue.created_by = auth.uid()
    )
  );

CREATE POLICY "content_item_metadata_modify_owner" ON content_item_metadata
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM content_catalogue
      WHERE content_catalogue.id = content_item_metadata.catalogue_id
        AND content_catalogue.created_by = auth.uid()
    )
  );

COMMENT ON TABLE content_item_metadata IS 'Extensible metadata layer for content items (tags, relationships, analytics, custom properties)';


-- ======================================================================================
-- TRIGGERS: Auto-update timestamps
-- ======================================================================================

-- content_types
CREATE OR REPLACE FUNCTION update_content_types_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_types_updated_at
  BEFORE UPDATE ON content_types
  FOR EACH ROW
  EXECUTE FUNCTION update_content_types_timestamp();

-- screen_layouts
CREATE OR REPLACE FUNCTION update_screen_layouts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER screen_layouts_updated_at
  BEFORE UPDATE ON screen_layouts
  FOR EACH ROW
  EXECUTE FUNCTION update_screen_layouts_timestamp();

-- content_catalogue
CREATE OR REPLACE FUNCTION update_content_catalogue_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_catalogue_updated_at
  BEFORE UPDATE ON content_catalogue
  FOR EACH ROW
  EXECUTE FUNCTION update_content_catalogue_timestamp();

-- content_layout_assignments
CREATE OR REPLACE FUNCTION update_content_layout_assignments_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_layout_assignments_updated_at
  BEFORE UPDATE ON content_layout_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_content_layout_assignments_timestamp();

-- eva_conversations
CREATE OR REPLACE FUNCTION update_eva_conversations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER eva_conversations_updated_at
  BEFORE UPDATE ON eva_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_eva_conversations_timestamp();

-- eva_user_settings
CREATE OR REPLACE FUNCTION update_eva_user_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER eva_user_settings_updated_at
  BEFORE UPDATE ON eva_user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_eva_user_settings_timestamp();

-- content_item_metadata
CREATE OR REPLACE FUNCTION update_content_item_metadata_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_item_metadata_updated_at
  BEFORE UPDATE ON content_item_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_content_item_metadata_timestamp();


-- ======================================================================================
-- SEED DATA: Initial content types and layouts
-- ======================================================================================

-- Seed content types (text_block, data_table, chart)
INSERT INTO content_types (name, display_name, description, creation_method, display_rules, validation_schema, icon, color)
VALUES
  (
    'text_block',
    'Text Block',
    'Rich text content with markdown support',
    '{"ui_form": {"type": "markdown_editor"}, "ai_generation": true, "api_endpoint": "/api/content/text"}',
    '{"presentation": {"render": "markdown", "style": "default"}, "document": {"render": "full_width"}}',
    '{"type": "object", "properties": {"markdown": {"type": "string", "maxLength": 50000}}, "required": ["markdown"]}',
    'FileText',
    '#3b82f6'
  ),
  (
    'data_table',
    'Data Table',
    'Structured data with rows and columns',
    '{"ui_form": {"type": "grid_editor"}, "ai_generation": true, "import": ["csv", "excel"], "api_endpoint": "/api/content/table"}',
    '{"spreadsheet": {"render": "grid", "features": ["sort", "filter", "formulas"]}, "presentation": {"render": "summary_table"}}',
    '{"type": "object", "properties": {"columns": {"type": "array"}, "rows": {"type": "array", "maxItems": 1000}}, "required": ["columns", "rows"]}',
    'Table',
    '#10b981'
  ),
  (
    'chart',
    'Chart',
    'Data visualization (bar, line, pie, area)',
    '{"ui_form": {"type": "chart_builder"}, "ai_generation": true, "api_endpoint": "/api/content/chart"}',
    '{"presentation": {"render": "fullscreen", "interactive": true}, "document": {"render": "inline", "size": "medium"}}',
    '{"type": "object", "properties": {"chart_type": {"enum": ["bar", "line", "pie", "area"]}, "data": {"type": "array"}}, "required": ["chart_type", "data"]}',
    'BarChart',
    '#f59e0b'
  )
ON CONFLICT (name) DO NOTHING;

-- Seed screen layouts (presentation mode only for MVP)
INSERT INTO screen_layouts (name, display_name, description, layout_type, template_json, logic_rules, default_settings, is_system)
VALUES
  (
    'presentation',
    'Presentation Mode',
    'Slide deck layout for presentations',
    'presentation',
    '{"zones": [{"id": "main", "type": "slide", "width": "100%", "height": "100%"}], "grid": {"columns": 12, "gap": 20}, "transitions": {"type": "fade", "duration": 300}}',
    '{"conditional_rendering": [], "responsive": {"breakpoints": [{"min": 1024, "layout": "desktop"}, {"min": 768, "layout": "tablet"}, {"max": 767, "layout": "mobile"}]}, "bindings": []}',
    '{"zoom": 1.0, "pan": {"x": 0, "y": 0}, "theme": "light", "auto_advance": false}',
    true
  )
ON CONFLICT (name) DO NOTHING;


-- ======================================================================================
-- COMPLETION MESSAGE
-- ======================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ EVA Content Catalogue migration complete!';
  RAISE NOTICE '   - 9 tables created with indexes and RLS policies';
  RAISE NOTICE '   - 3 content types seeded (text_block, data_table, chart)';
  RAISE NOTICE '   - 1 layout seeded (presentation mode)';
  RAISE NOTICE '   - Auto-update timestamp triggers installed';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Database ready for EVA content creation!';
END $$;
