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
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

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
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'ready', 'processing', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- Turn on Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mediation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_inputs ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can view their own profile
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

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
