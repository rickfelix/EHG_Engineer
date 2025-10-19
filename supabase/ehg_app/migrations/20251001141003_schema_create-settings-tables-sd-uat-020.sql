-- Migration: Create Settings Tables for SD-UAT-020
-- Purpose: Create profiles and user_preferences tables for settings functionality
-- Database: EHG Application (liapbndqlqxdcgpwntbv.supabase.co)
-- Generated: 2025-10-01 by PLAN Agent
-- Strategic Directive: SD-UAT-020 - Settings Section Implementation

-- =====================================================================
-- PROFILES TABLE
-- =====================================================================
-- Stores user profile information (name, contact, bio, etc.)

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    location TEXT,
    bio TEXT,
    avatar_url TEXT,
    timezone TEXT DEFAULT 'America/Los_Angeles',
    language TEXT DEFAULT 'en-US',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, created_at, updated_at)
    VALUES (NEW.id, NOW(), NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- USER_PREFERENCES TABLE
-- =====================================================================
-- Stores user preferences for notifications, security, and settings

CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Theme preference
    theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),

    -- Notification preferences - Master toggles
    notifications_email BOOLEAN DEFAULT TRUE,
    notifications_push BOOLEAN DEFAULT TRUE,
    notifications_sms BOOLEAN DEFAULT FALSE,

    -- Email notification categories
    notif_email_ventures BOOLEAN DEFAULT TRUE,
    notif_email_analytics BOOLEAN DEFAULT TRUE,
    notif_email_workflows BOOLEAN DEFAULT TRUE,
    notif_email_security BOOLEAN DEFAULT TRUE,
    notif_email_marketing BOOLEAN DEFAULT FALSE,

    -- Push notification categories
    notif_push_ventures BOOLEAN DEFAULT TRUE,
    notif_push_analytics BOOLEAN DEFAULT FALSE,
    notif_push_workflows BOOLEAN DEFAULT TRUE,
    notif_push_security BOOLEAN DEFAULT TRUE,

    -- SMS notification categories
    notif_sms_urgent BOOLEAN DEFAULT FALSE,
    notif_sms_security BOOLEAN DEFAULT FALSE,

    -- Notification frequency
    notif_frequency TEXT DEFAULT 'realtime' CHECK (notif_frequency IN ('realtime', 'hourly', 'daily', 'weekly')),

    -- Quiet hours settings
    notif_quiet_hours_enabled BOOLEAN DEFAULT FALSE,
    notif_quiet_hours_start TEXT DEFAULT '22:00',
    notif_quiet_hours_end TEXT DEFAULT '08:00',

    -- Privacy settings
    privacy_profile_visible BOOLEAN DEFAULT TRUE,
    privacy_activity_visible BOOLEAN DEFAULT FALSE,
    privacy_email_visible BOOLEAN DEFAULT FALSE,

    -- Security settings
    security_two_factor BOOLEAN DEFAULT FALSE,
    security_session_timeout INTEGER DEFAULT 60,
    security_login_notifications BOOLEAN DEFAULT TRUE,
    security_device_tracking BOOLEAN DEFAULT TRUE,
    security_suspicious_alerts BOOLEAN DEFAULT TRUE,
    security_password_expiry INTEGER DEFAULT 90,
    security_require_password_change BOOLEAN DEFAULT FALSE,
    security_biometric BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_preferences
CREATE POLICY "Users can view own preferences"
    ON public.user_preferences
    FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own preferences"
    ON public.user_preferences
    FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own preferences"
    ON public.user_preferences
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Trigger to auto-create preferences on user signup (optional - preferences created on first save)
CREATE OR REPLACE FUNCTION public.handle_new_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_preferences (id, created_at, updated_at)
    VALUES (NEW.id, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users (optional)
DROP TRIGGER IF EXISTS on_auth_user_preferences_created ON auth.users;
CREATE TRIGGER on_auth_user_preferences_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_preferences();

-- =====================================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================================

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON public.profiles(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_email_visible ON public.profiles(id) WHERE id IN (
    SELECT id FROM public.user_preferences WHERE privacy_email_visible = TRUE
);

-- User preferences indexes
CREATE INDEX IF NOT EXISTS idx_user_preferences_updated_at ON public.user_preferences(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_preferences_theme ON public.user_preferences(theme);

-- =====================================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================================

COMMENT ON TABLE public.profiles IS 'User profile information for SD-UAT-020 Settings Section';
COMMENT ON TABLE public.user_preferences IS 'User preferences for notifications, security, and settings';

COMMENT ON COLUMN public.profiles.id IS 'References auth.users.id';
COMMENT ON COLUMN public.profiles.avatar_url IS 'URL to user avatar image (Supabase Storage or external)';
COMMENT ON COLUMN public.profiles.timezone IS 'IANA timezone identifier (e.g., America/Los_Angeles)';
COMMENT ON COLUMN public.profiles.language IS 'Language code in format: en-US, es-ES, etc.';

COMMENT ON COLUMN public.user_preferences.theme IS 'UI theme preference: light, dark, or system';
COMMENT ON COLUMN public.user_preferences.notif_frequency IS 'Notification digest frequency';
COMMENT ON COLUMN public.user_preferences.security_session_timeout IS 'Session timeout in minutes (15-480)';
COMMENT ON COLUMN public.user_preferences.security_password_expiry IS 'Password expiry in days (0 = never)';

-- =====================================================================
-- VERIFICATION QUERIES
-- =====================================================================
-- Run these after migration to verify success:

-- Verify tables exist
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('profiles', 'user_preferences');

-- Verify RLS is enabled
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('profiles', 'user_preferences');

-- Verify policies exist
-- SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('profiles', 'user_preferences');

-- Test trigger by creating a test user (must be done via Supabase Auth)
-- SELECT * FROM public.profiles WHERE id = 'test-user-id';

-- =====================================================================
-- ROLLBACK INSTRUCTIONS
-- =====================================================================
-- If you need to rollback this migration:

-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP TRIGGER IF EXISTS on_auth_user_preferences_created ON auth.users;
-- DROP FUNCTION IF EXISTS public.handle_new_user();
-- DROP FUNCTION IF EXISTS public.handle_new_user_preferences();
-- DROP TABLE IF EXISTS public.user_preferences CASCADE;
-- DROP TABLE IF EXISTS public.profiles CASCADE;

-- =====================================================================
-- END OF MIGRATION
-- =====================================================================
