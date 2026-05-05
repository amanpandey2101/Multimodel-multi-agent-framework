/**
 * API client — now uses Supabase Auth for tokens,
 * but still calls the FastAPI backend for business logic.
 */

import { supabase } from "./supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

async function getToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    // Session expired — try refreshing
    const { error } = await supabase.auth.refreshSession();
    if (!error) {
      const newToken = await getToken();
      if (newToken) {
        headers["Authorization"] = `Bearer ${newToken}`;
        const retry = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers,
        });
        if (retry.ok) return retry.json();
      }
    }
    // Still unauthorized — redirect to login
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || res.statusText);
  }

  if (res.status === 204) return null as T;
  return res.json();
}

// ─── Auth (via Supabase directly) ─────────
export const authApi = {
  register: async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
    return data;
  },

  login: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  },

  logout: async () => {
    await supabase.auth.signOut();
  },

  getSession: () => supabase.auth.getSession(),
};

// ─── Projects ─────────────────────────────
export interface Project {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  pipeline_count: number;
}

export const projectsApi = {
  list: () => request<Project[]>("/projects/"),
  get: (id: string) => request<Project>(`/projects/${id}`),
  create: (name: string, description: string) =>
    request<Project>("/projects/", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    }),
  update: (id: string, data: { name?: string; description?: string }) =>
    request<Project>(`/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`/projects/${id}`, { method: "DELETE" }),
};

// ─── Pipelines ────────────────────────────
export interface PipelineStage {
  id: string;
  stage_name: string;
  status: string;
  agent_role: string;
  iteration: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface Pipeline {
  id: string;
  project_id: string;
  status: string;
  requirement: string;
  llm_provider: string;
  llm_model: string;
  config: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
  stages: PipelineStage[];
}

export interface PipelineListItem {
  id: string;
  project_id: string;
  status: string;
  requirement: string;
  llm_provider: string;
  llm_model: string;
  created_at: string;
}

export const pipelinesApi = {
  create: (data: {
    project_id: string;
    requirement: string;
    llm_provider?: string;
    llm_model?: string;
    enable_critic?: boolean;
    max_iterations?: number;
    mode?: string;
  }) =>
    request<Pipeline>("/pipelines/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listByProject: (projectId: string) =>
    request<PipelineListItem[]>(`/pipelines/project/${projectId}`),
  get: (id: string) => request<Pipeline>(`/pipelines/${id}`),
  cancel: (id: string) =>
    request<{ message: string }>(`/pipelines/${id}/cancel`, { method: "POST" }),
  retry: (id: string) =>
    request<{ message: string }>(`/pipelines/${id}/retry`, { method: "POST" }),
  delete: (id: string) =>
    request<void>(`/pipelines/${id}`, { method: "DELETE" }),
};

// ─── Artifacts ────────────────────────────
export interface Artifact {
  id: string;
  pipeline_id: string;
  stage_name: string;
  artifact_type: string;
  content: Record<string, unknown>;
  version: number;
  created_at: string;
}

export const artifactsApi = {
  listByPipeline: (pipelineId: string) =>
    request<Artifact[]>(`/artifacts/pipeline/${pipelineId}`),
  get: (id: string) => request<Artifact>(`/artifacts/${id}`),
  listByStage: (pipelineId: string, stageName: string) =>
    request<Artifact[]>(`/artifacts/pipeline/${pipelineId}/stage/${stageName}`),
  update: (id: string, content: Record<string, unknown>) =>
    request<{ message: string }>(`/artifacts/${id}`, {
      method: "PUT",
      body: JSON.stringify(content),
    }),
};

// ─── GitHub ───────────────────────────────
export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  url: string;
  private: boolean;
  default_branch: string;
  language: string | null;
  updated_at: string | null;
  stars: number;
}

export interface GitHubStatus {
  connected: boolean;
  github_username?: string;
}

export interface PushResult {
  commit: {
    sha: string;
    message: string;
    url: string;
    files_pushed: number;
  };
  pull_request?: {
    number: number;
    url: string;
    title: string;
  } | null;
  files_pushed: string[];
}

export const githubApi = {
  status: () => request<GitHubStatus>("/github/status"),
  connect: (accessToken: string) =>
    request<{ connected: boolean; github_username: string }>("/github/connect", {
      method: "POST",
      body: JSON.stringify({ access_token: accessToken }),
    }),
  disconnect: () =>
    request<{ disconnected: boolean }>("/github/disconnect", { method: "DELETE" }),
  repos: () => request<GitHubRepo[]>("/github/repos"),
  createRepo: (name: string, description: string, isPrivate: boolean) =>
    request<GitHubRepo>("/github/repos", {
      method: "POST",
      body: JSON.stringify({ name, description, private: isPrivate }),
    }),
  push: (data: {
    repo_full_name: string;
    pipeline_id: string;
    branch?: string;
    commit_message?: string;
    create_pr?: boolean;
  }) =>
    request<PushResult>("/github/push", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  createBranch: (repoFullName: string, branchName: string) =>
    request("/github/branches", {
      method: "POST",
      body: JSON.stringify({ repo_full_name: repoFullName, branch_name: branchName }),
    }),
};
