-- 1. Create Profiles table (tied to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'username');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Safely add preferred_language column to profiles
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.profiles ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'en';
  EXCEPTION WHEN duplicate_column THEN END;
END $$;

-- 2. Create Groups table
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES public.profiles(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Group Members table
CREATE TABLE IF NOT EXISTS public.group_members (
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

-- 4. Create Mediation Sessions table
CREATE TABLE IF NOT EXISTS public.mediation_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'ready', 'processing', 'completed', 'resolved')),
  result_content TEXT,
  category TEXT,
  action_memos JSONB DEFAULT '{}'::jsonb,
  confirmations JSONB DEFAULT '[]'::jsonb,
  nudged_by UUID DEFAULT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safely add columns if the table already exists
DO $$ 
BEGIN 
  BEGIN
    ALTER TABLE public.mediation_sessions ADD COLUMN result_content TEXT;
  EXCEPTION WHEN duplicate_column THEN END;
  BEGIN
    ALTER TABLE public.mediation_sessions ADD COLUMN category TEXT;
  EXCEPTION WHEN duplicate_column THEN END;
  BEGIN
    ALTER TABLE public.mediation_sessions ADD COLUMN action_memos JSONB DEFAULT '{}'::jsonb;
  EXCEPTION WHEN duplicate_column THEN END;
  BEGIN
    ALTER TABLE public.mediation_sessions ADD COLUMN confirmations JSONB DEFAULT '[]'::jsonb;
  EXCEPTION WHEN duplicate_column THEN END;
  BEGIN
    ALTER TABLE public.mediation_sessions ADD COLUMN nudged_by UUID DEFAULT NULL REFERENCES public.profiles(id);
  EXCEPTION WHEN duplicate_column THEN END;
  BEGIN
    ALTER TABLE public.mediation_sessions DROP CONSTRAINT IF EXISTS mediation_sessions_status_check;
    ALTER TABLE public.mediation_sessions ADD CONSTRAINT mediation_sessions_status_check CHECK (status IN ('waiting', 'ready', 'processing', 'completed', 'resolved'));
  EXCEPTION WHEN others THEN END;
END $$;

-- 5. Create Session Inputs table
CREATE TABLE IF NOT EXISTS public.session_inputs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.mediation_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  input_type TEXT DEFAULT 'text' CHECK (input_type IN ('text', 'voice')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Helper Function for RLS (Bypasses recursion)
CREATE OR REPLACE FUNCTION public.get_user_groups()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT group_id FROM group_members WHERE user_id = auth.uid();
$$;

-- 7. Helper: Lookup group by invite code (bypasses RLS so non-members can find groups to join)
CREATE OR REPLACE FUNCTION public.lookup_group_by_invite_code(p_invite_code TEXT)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name FROM groups WHERE invite_code = p_invite_code LIMIT 1;
$$;

-- Turn on Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mediation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_inputs ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can view their own profile
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

-- Profiles: Users can update their own profile (e.g. set username)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Profiles: Users can view profiles of group members in their groups (needed for mediation username lookup)
DROP POLICY IF EXISTS "Users can view group member profiles" ON public.profiles;
CREATE POLICY "Users can view group member profiles" ON public.profiles FOR SELECT USING (
  id IN (
    SELECT user_id FROM public.group_members WHERE group_id IN (SELECT public.get_user_groups())
  )
);

-- Groups
DROP POLICY IF EXISTS "Users can view groups they belong to" ON public.groups;
CREATE POLICY "Users can view groups they belong to" ON public.groups FOR SELECT USING (
  id IN (SELECT public.get_user_groups()) OR created_by = auth.uid()
);
DROP POLICY IF EXISTS "Users can create groups" ON public.groups;
CREATE POLICY "Users can create groups" ON public.groups FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Group Members
DROP POLICY IF EXISTS "Users can view members of their groups" ON public.group_members;
CREATE POLICY "Users can view members of their groups" ON public.group_members FOR SELECT USING (
  group_id IN (SELECT public.get_user_groups())
);
DROP POLICY IF EXISTS "Users can insert themselves into a group" ON public.group_members;
CREATE POLICY "Users can insert themselves into a group" ON public.group_members FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete themselves from a group" ON public.group_members;
CREATE POLICY "Users can delete themselves from a group" ON public.group_members FOR DELETE USING (auth.uid() = user_id);

-- Sessions
DROP POLICY IF EXISTS "Users can view sessions for their groups" ON public.mediation_sessions;
CREATE POLICY "Users can view sessions for their groups" ON public.mediation_sessions FOR SELECT USING (
  group_id IN (SELECT public.get_user_groups())
);
DROP POLICY IF EXISTS "Users can create sessions for their groups" ON public.mediation_sessions;
CREATE POLICY "Users can create sessions for their groups" ON public.mediation_sessions FOR INSERT WITH CHECK (
  group_id IN (SELECT public.get_user_groups())
);
DROP POLICY IF EXISTS "Users can update sessions for their groups" ON public.mediation_sessions;
CREATE POLICY "Users can update sessions for their groups" ON public.mediation_sessions FOR UPDATE USING (
  group_id IN (SELECT public.get_user_groups())
);

-- Inputs
DROP POLICY IF EXISTS "Users can view inputs for their sessions" ON public.session_inputs;
CREATE POLICY "Users can view inputs for their sessions" ON public.session_inputs FOR SELECT USING (
  session_id IN (
    SELECT id FROM public.mediation_sessions WHERE group_id IN (SELECT public.get_user_groups())
  )
);
DROP POLICY IF EXISTS "Users can insert their own inputs" ON public.session_inputs;
CREATE POLICY "Users can insert their own inputs" ON public.session_inputs FOR INSERT WITH CHECK (auth.uid() = user_id);


-- Session Inputs: Users can update their own inputs
DROP POLICY IF EXISTS "Users can update their own inputs" ON public.session_inputs;
CREATE POLICY "Users can update their own inputs" ON public.session_inputs FOR UPDATE USING (auth.uid() = user_id);

-- Session Inputs: Users can delete their own inputs
DROP POLICY IF EXISTS "Users can delete their own inputs" ON public.session_inputs;
CREATE POLICY "Users can delete their own inputs" ON public.session_inputs FOR DELETE USING (auth.uid() = user_id);

-- Partial unique index: only one active session per group at a time
-- completed and resolved sessions are excluded so new sessions can be created after resolution
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_session_per_group
  ON public.mediation_sessions (group_id)
  WHERE status NOT IN ('completed', 'resolved');

-- Enable REPLICA IDENTITY FULL for realtime tables (required for UPDATE/DELETE events)
ALTER TABLE public.session_inputs REPLICA IDENTITY FULL;
ALTER TABLE public.mediation_sessions REPLICA IDENTITY FULL;

-- ENABLE REALTIME FOR session_inputs and mediation_sessions safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'session_inputs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.session_inputs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mediation_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mediation_sessions;
  END IF;
END $$;
