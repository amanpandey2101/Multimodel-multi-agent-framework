"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { projectsApi, pipelinesApi, type Project, type PipelineListItem } from "@/lib/api";
import {
  FolderOpen,
  GitBranch,
  CheckCircle2,
  Zap,
  Plus,
  ArrowRight,
  FileCode2,
  Layers,
  Code2,
  TestTube2,
  Rocket,
  ClipboardList,
} from "lucide-react";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentPipelines, setRecentPipelines] = useState<PipelineListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const projectList = await projectsApi.list();
        setProjects(projectList);

        const allPipelines: PipelineListItem[] = [];
        for (const p of projectList.slice(0, 5)) {
          try {
            const pipes = await pipelinesApi.listByProject(p.id);
            allPipelines.push(...pipes);
          } catch { /* ignore */ }
        }
        allPipelines.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRecentPipelines(allPipelines.slice(0, 5));
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalPipelines = projects.reduce((sum, p) => sum + (p.pipeline_count || 0), 0);
  const completedPipelines = recentPipelines.filter(p => p.status === "completed").length;
  const activePipelines = recentPipelines.filter(p => p.status === "running").length;

  const timeAgo = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const agentNodes = [
    { icon: ClipboardList, label: "Requirements" },
    { icon: Layers, label: "Architecture" },
    { icon: FileCode2, label: "Tasks" },
    { icon: Code2, label: "Code" },
    { icon: TestTube2, label: "Review" },
    { icon: Rocket, label: "Deploy" },
  ];

  if (loading) {
    return (
      <div className="animate-in">
        <div className="page-header">
          <div className="page-header-left">
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-text" style={{ width: "40%" }} />
          </div>
        </div>
        <div className="stats-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton skeleton-card" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Monitor your autonomous engineering pipelines
          </p>
        </div>
        <div className="page-actions">
          <Link href="/dashboard/projects" className="btn btn-primary">
            <Plus size={16} strokeWidth={2.5} />
            New Project
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card hover-lift">
          <div className="stat-icon purple">
            <FolderOpen size={20} />
          </div>
          <div className="stat-value">{projects.length}</div>
          <div className="stat-label">Total Projects</div>
        </div>
        <div className="stat-card hover-lift">
          <div className="stat-icon blue">
            <GitBranch size={20} />
          </div>
          <div className="stat-value">{totalPipelines}</div>
          <div className="stat-label">Total Pipelines</div>
        </div>
        <div className="stat-card hover-lift">
          <div className="stat-icon green">
            <CheckCircle2 size={20} />
          </div>
          <div className="stat-value">{completedPipelines}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card hover-lift">
          <div className="stat-icon amber">
            <Zap size={20} />
          </div>
          <div className="stat-value">{activePipelines}</div>
          <div className="stat-label">Active Now</div>
        </div>
      </div>

      {/* Agent Flow Visualization */}
      <div className="card" style={{ marginBottom: 24, padding: "20px 24px" }}>
        <div className="card-header">
          <h3 className="card-title">Agent Pipeline Flow</h3>
          <span className="badge badge-completed">
            <span className="badge-dot" />
            6 Agents
          </span>
        </div>
        <div className="agent-flow">
          {agentNodes.map((agent, idx, arr) => {
            const Icon = agent.icon;
            return (
              <div key={agent.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="agent-node completed">
                  <div className="agent-node-icon">
                    <Icon size={18} strokeWidth={1.5} />
                  </div>
                  <div className="agent-node-label">{agent.label}</div>
                </div>
                {idx < arr.length - 1 && (
                  <div className="agent-arrow active">
                    <ArrowRight size={14} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Recent Projects */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recent Projects</h3>
            <Link href="/dashboard/projects" className="btn btn-ghost btn-sm">
              View all <ArrowRight size={12} style={{ display: "inline", marginLeft: 2 }} />
            </Link>
          </div>
          {projects.length === 0 ? (
            <div className="empty-state" style={{ padding: "30px 20px" }}>
              <div className="empty-state-icon">
                <FolderOpen size={32} strokeWidth={1.2} />
              </div>
              <div className="empty-state-title">No projects yet</div>
              <div className="empty-state-text">
                Create your first project to start generating code with AI agents.
              </div>
              <Link href="/dashboard/projects" className="btn btn-primary btn-sm">
                Create Project
              </Link>
            </div>
          ) : (
            <div>
              {projects.slice(0, 4).map((project) => (
                <Link
                  key={project.id}
                  href={`/dashboard/projects/${project.id}`}
                  style={{ textDecoration: "none", display: "block" }}
                >
                  <div className="github-repo-item">
                    <div className="github-repo-info">
                      <div className="github-repo-name">{project.name}</div>
                      <div className="github-repo-meta">
                        <GitBranch size={12} style={{ display: "inline" }} />
                        <span>{project.pipeline_count} pipelines</span>
                        <span>·</span>
                        <span>{timeAgo(project.created_at)}</span>
                      </div>
                    </div>
                    <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Pipelines */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recent Pipelines</h3>
          </div>
          {recentPipelines.length === 0 ? (
            <div className="empty-state" style={{ padding: "30px 20px" }}>
              <div className="empty-state-icon">
                <Zap size={32} strokeWidth={1.2} />
              </div>
              <div className="empty-state-title">No pipelines yet</div>
              <div className="empty-state-text">
                Start a pipeline to generate code autonomously.
              </div>
            </div>
          ) : (
            <div>
              {recentPipelines.map((pipe) => (
                <Link
                  key={pipe.id}
                  href={`/dashboard/pipeline/${pipe.id}`}
                  style={{ textDecoration: "none", display: "block" }}
                >
                  <div className="github-repo-item">
                    <div className="github-repo-info">
                      <div className="github-repo-name" style={{ fontSize: "0.82rem" }}>
                        {pipe.requirement.length > 50
                          ? `${pipe.requirement.substring(0, 50)}...`
                          : pipe.requirement}
                      </div>
                      <div className="github-repo-meta">
                        <span>{pipe.llm_provider}</span>
                        <span>·</span>
                        <span>{timeAgo(pipe.created_at)}</span>
                      </div>
                    </div>
                    <span className={`badge badge-${pipe.status}`}>
                      <span className="badge-dot" />
                      {pipe.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
