
import os
import sys
import argparse
from getpass import getpass
import psycopg2
from dotenv import load_dotenv

# Load env from root
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

SQL_SCHEMA = """
-- 1. Create Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Pipelines Table
CREATE TABLE IF NOT EXISTS public.pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  requirement TEXT NOT NULL,
  llm_provider TEXT DEFAULT 'openai',
  llm_model TEXT,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 3. Create Pipeline Stages Table
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  agent_role TEXT,
  iteration INTEGER DEFAULT 1,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- 4. Create Artifacts Table
CREATE TABLE IF NOT EXISTS public.artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  content JSONB NOT NULL,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Create Pipeline Events Table
CREATE TABLE IF NOT EXISTS public.pipeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  stage TEXT DEFAULT '',
  message TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Create GitHub Tokens Table
CREATE TABLE IF NOT EXISTS public.github_tokens (
  user_id UUID PRIMARY KEY,
  access_token TEXT NOT NULL,
  github_username TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Realtime (This might fail if already added, so wrapped in BEGIN/END if needed)
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_events;
"""

def main():
    parser = argparse.ArgumentParser(description="Initialize Supabase database schema")
    parser.add_argument("--password", help="Supabase database password")
    args = parser.parse_args()

    # Extract project ref from URL
    # https://whfzvzkamjqnzpdfjgmf.supabase.co -> whfzvzkamjqnzpdfjgmf
    supabase_url = os.getenv("SUPABASE_URL", "")
    if not supabase_url:
        print("❌ Error: SUPABASE_URL not found in .env")
        return

    project_ref = supabase_url.split("//")[1].split(".")[0]
    host = f"db.{project_ref}.supabase.co"
    port = 5432
    user = "postgres"
    database = "postgres"
    
    password = args.password or getpass(f"Enter Supabase Database Password for {project_ref}: ")

    print(f"📡 Connecting to {host}...")
    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            connect_timeout=10
        )
        conn.autocommit = True
        with conn.cursor() as cur:
            print("🚀 Executing schema SQL...")
            cur.execute(SQL_SCHEMA)
            print("✅ Database successfully initialized!")
        conn.close()
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    main()
