-- ============================================================
-- Multi-Agent SaaS Platform — Supabase Schema
-- ============================================================
-- Run this in Supabase SQL Editor (supabase.com → SQL Editor)
-- ============================================================

-- ─── Projects ─────────────────────────────────────────────────
CREATE TABLE projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Pipelines ────────────────────────────────────────────────
CREATE TABLE pipelines (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    requirement TEXT NOT NULL,
    llm_provider TEXT DEFAULT 'openai',
    llm_model TEXT DEFAULT '',
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- ─── Pipeline Stages ──────────────────────────────────────────
CREATE TABLE pipeline_stages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    stage_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    agent_role TEXT DEFAULT '',
    input_data JSONB DEFAULT '{}',
    output_data JSONB DEFAULT '{}',
    iteration INT DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- ─── Artifacts ────────────────────────────────────────────────
CREATE TABLE artifacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    stage_name TEXT NOT NULL,
    artifact_type TEXT NOT NULL,
    content JSONB NOT NULL,
    version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Pipeline Events (for Realtime) ──────────────────────────
CREATE TABLE pipeline_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    stage TEXT,
    message TEXT,
    data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── GitHub Connections ───────────────────────────────────────
CREATE TABLE github_connections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    access_token TEXT NOT NULL,
    github_username TEXT NOT NULL,
    connected_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_connections ENABLE ROW LEVEL SECURITY;

-- Projects: users can only see/modify their own
CREATE POLICY "Users manage own projects" ON projects
    FOR ALL USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- Pipelines: access through project ownership
CREATE POLICY "Users access own pipelines" ON pipelines
    FOR ALL USING (
        EXISTS (SELECT 1 FROM projects WHERE projects.id = pipelines.project_id AND projects.owner_id = auth.uid())
    );

-- Pipeline stages: access through pipeline → project chain
CREATE POLICY "Users access own pipeline stages" ON pipeline_stages
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM pipelines
            JOIN projects ON projects.id = pipelines.project_id
            WHERE pipelines.id = pipeline_stages.pipeline_id
            AND projects.owner_id = auth.uid()
        )
    );

-- Artifacts: access through pipeline → project chain
CREATE POLICY "Users access own artifacts" ON artifacts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM pipelines
            JOIN projects ON projects.id = pipelines.project_id
            WHERE pipelines.id = artifacts.pipeline_id
            AND projects.owner_id = auth.uid()
        )
    );

-- Pipeline events: access through pipeline → project chain
CREATE POLICY "Users access own pipeline events" ON pipeline_events
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM pipelines
            JOIN projects ON projects.id = pipelines.project_id
            WHERE pipelines.id = pipeline_events.pipeline_id
            AND projects.owner_id = auth.uid()
        )
    );

-- Service role bypass (for backend operations)
CREATE POLICY "Service role full access projects" ON projects
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access pipelines" ON pipelines
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access stages" ON pipeline_stages
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access artifacts" ON artifacts
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access events" ON pipeline_events
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access github" ON github_connections
    FOR ALL USING (auth.role() = 'service_role');

-- GitHub connections: users manage only their own
CREATE POLICY "Users manage own github" ON github_connections
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Enable Realtime on pipeline_events and pipelines
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_events;
ALTER PUBLICATION supabase_realtime ADD TABLE pipelines;

-- ─── Indexes ──────────────────────────────────────────────────
CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_pipelines_project ON pipelines(project_id);
CREATE INDEX idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id);
CREATE INDEX idx_artifacts_pipeline ON artifacts(pipeline_id);
CREATE INDEX idx_pipeline_events_pipeline ON pipeline_events(pipeline_id);
CREATE UNIQUE INDEX idx_github_connections_user ON github_connections(user_id);
