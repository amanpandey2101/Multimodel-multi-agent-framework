"use client";

import { useEffect, useState, use } from "react";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import Editor from "@monaco-editor/react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import ReactMarkdown from "react-markdown";
import {
  pipelinesApi,
  artifactsApi,
  type Pipeline,
  type Artifact,
} from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  FileCode2,
  FileText,
  File,
  Loader2,
  Terminal,
  Play,
  Monitor,
  ChevronRight,
  ChevronDown,
  Save,
  Download,
  Folder,
  FolderOpen,
  Plus,
  FolderPlus,
  Trash2,
  Send,
} from "lucide-react";
import Link from "next/link";

interface PipelineEvent {
  id?: string;
  event_type: string;
  message?: string;
  data?: any;
  stage?: string;
  metadata?: any;
  created_at?: string;
}

interface ChatMessage {
  id: string;
  sender: {
    name: string;
    role: string;
    avatar?: string;
    type: 'agent' | 'user' | 'system';
  };
  content: string;
  steps: PipelineEvent[];
  timestamp: string;
}

interface GeneratedFile {
  path: string;
  content: string;
  language?: string;
  artifactId?: string;
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api").replace(/\/$/, "");
const PREVIEW_BASE = `${API_BASE}/proxy/3001/`;

function inferLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", java: "java", md: "markdown",
    json: "json", yaml: "yaml", yml: "yaml", css: "css", html: "html",
  };
  return map[ext] || "text";
}

function parseArtifactFiles(content: unknown, artifactId?: string): GeneratedFile[] {
  if (!content) return [];
  if (typeof content === "object" && content !== null) {
    const c = content as Record<string, unknown>;
    
    if (Array.isArray(c.files)) {
      return (c.files as Array<{ path?: string; content?: unknown }>).map((f, i) => ({
        path: f.path || `file_${i}`,
        content: typeof f.content === "string" ? f.content : JSON.stringify(f.content, null, 2),
        language: inferLanguage(f.path || ""),
        artifactId,
      }));
    }
    
    if (c.dockerfile || c.docker_compose || c.ci_cd_pipeline) {
      const files: GeneratedFile[] = [];
      if (typeof c.dockerfile === "string") files.push({ path: "Dockerfile", content: c.dockerfile, language: "dockerfile", artifactId });
      if (typeof c.docker_compose === "string") files.push({ path: "docker-compose.yml", content: c.docker_compose, language: "yaml", artifactId });
      if (typeof c.ci_cd_pipeline === "string") files.push({ path: ".github/workflows/deploy.yml", content: c.ci_cd_pipeline, language: "yaml", artifactId });
      return files;
    }

    const entries = Object.entries(c);
    const areAllValuesStrings = entries.every(([_, v]) => typeof v === "string");
    if (entries.length > 0 && areAllValuesStrings) {
      return entries.map(([path, content]) => ({
        path,
        content: content as string,
        language: inferLanguage(path),
        artifactId,
      }));
    }
  }
  return [];
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

const getFileIcon = (path: string) => {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  if (["ts", "tsx", "js", "jsx"].includes(ext)) return <FileCode2 size={14} color="#6366f1" />;
  if (ext === "md") return <FileText size={14} color="#10b981" />;
  return <File size={14} color="#94a3b8" />;
};

const getFolderIcon = (isOpen: boolean) => {
  return isOpen ? <FolderOpen size={14} color="#6366f1" /> : <Folder size={14} color="#6366f1" />;
};

const getAgentName = (stage: string) => {
  const names: Record<string, string> = {
    requirements: "Product Strategy",
    architecture: "System Architect",
    task_breakdown: "Engineering Lead",
    implementation: "Full-Stack Engineer",
    review: "Security & Quality Critic",
    deployment: "Platform Engineer"
  };
  return names[stage] || "System";
};

const formatSystemMessage = (event: PipelineEvent) => {
  const msg = event.message || "";
  const stage = event.stage || "";
  
  if (event.event_type === 'stage_started') {
    return `${getAgentName(stage)} is starting...`;
  }
  if (event.event_type === 'stage_completed') {
    return `${getAgentName(stage)} finished work.`;
  }
  if (event.event_type === 'artifact_produced') {
    return `New artifacts generated for ${stage}.`;
  }
  if (event.event_type === 'critic_iteration') {
    return msg;
  }
  return msg;
};

const CollapsibleThought = ({ message }: { message: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  if (!message) return null;
  
  return (
    <div style={{ margin: "4px 0 8px 32px", fontSize: "0.8rem" }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: 8, 
          cursor: "pointer", 
          color: "#71717a",
          userSelect: "none",
          padding: "4px 0"
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#eab308", boxShadow: "0 0 8px rgba(234, 179, 8, 0.3)" }} />
        <span style={{ fontWeight: 500, fontSize: "0.75rem" }}>Thinking...</span>
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </div>
      {isOpen && (
        <div style={{ 
          marginTop: 8, 
          padding: "12px", 
          background: "#09090b", 
          borderRadius: 8, 
          color: "#a1a1aa",
          whiteSpace: "pre-wrap",
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: "0.75rem",
          lineHeight: 1.6,
          border: "1px solid #1e1e1e",
          maxHeight: "300px",
          overflowY: "auto"
        }}>
          {message}
        </div>
      )}
    </div>
  );
};

function buildFileTree(files: GeneratedFile[]): FileNode[] {
  const root: FileNode[] = [];
  files.forEach(file => {
    const parts = file.path.split('/');
    let currentLevel = root;
    let currentPath = '';

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = index === parts.length - 1;
      let node = currentLevel.find(n => n.name === part);

      if (!node) {
        node = {
          name: part,
          path: currentPath,
          type: isLast ? 'file' : 'folder',
          children: isLast ? undefined : [],
        };
        currentLevel.push(node);
      }
      if (!isLast) {
        currentLevel = node.children!;
      }
    });
  });
  
  const sortNodes = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach(n => {
      if (n.children) sortNodes(n.children);
    });
  };
  sortNodes(root);
  return root;
}

const FileTreeItem = ({ node, level, activeFile, onSelect, onDelete }: { node: FileNode, level: number, activeFile: string | null, onSelect: (path: string) => void, onDelete: (path: string) => void }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const isSelected = activeFile === node.path;

  if (node.type === 'folder') {
    return (
      <div key={node.path}>
        <div 
          onClick={() => setIsOpen(!isOpen)}
          style={{ 
            padding: "4px 8px", 
            paddingLeft: level * 12 + 8,
            cursor: "pointer", 
            display: "flex", 
            alignItems: "center", 
            gap: 6, 
            fontSize: "0.82rem", 
            color: "#94a3b8",
            borderRadius: 4,
            transition: "background 0.2s"
          }}
        >
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {getFolderIcon(isOpen)}
          <span style={{ fontWeight: 500 }}>{node.name}</span>
        </div>
        {isOpen && node.children?.map(child => (
          <FileTreeItem key={child.path} node={child} level={level + 1} activeFile={activeFile} onSelect={onSelect} onDelete={onDelete} />
        ))}
      </div>
    );
  }

  return (
    <div 
      key={node.path} 
      onClick={() => onSelect(node.path)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ 
        padding: "4px 8px", 
        paddingLeft: level * 12 + 24,
        cursor: "pointer", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between",
        gap: 8, 
        fontSize: "0.82rem", 
        color: isSelected ? "#fff" : "#94a3b8", 
        background: isSelected ? "rgba(99,102,241,0.15)" : "transparent", 
        borderRadius: 4,
        borderLeft: isSelected ? "2px solid #6366f1" : "2px solid transparent",
        margin: "1px 0"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {getFileIcon(node.path)} {node.name}
      </div>
      {isHovered && (
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}
          style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
};

export default function IDEPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [allArtifacts, setAllArtifacts] = useState<Artifact[]>([]);
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor');
  const [activeSideTab, setActiveSideTab] = useState<'explorer' | 'chat'>('explorer');
  const [bottomPanelTab, setBottomPanelTab] = useState<'terminal' | 'output' | 'debug'>('terminal');

  // Chat Suggestions
  const [suggestions, setSuggestions] = useState<GeneratedFile[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(true);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [isAppRunning, setIsAppRunning] = useState(false);

  // Load Initial Data
  useEffect(() => {
    async function load() {
      const [pipeData, artifactsData, eventsData] = await Promise.all([
        pipelinesApi.get(id),
        artifactsApi.listByPipeline(id),
        supabase.from("pipeline_events").select("*").eq("pipeline_id", id).order("created_at", { ascending: true })
      ]);
      setPipeline(pipeData);
      setEvents(eventsData.data || []);
      setAllArtifacts(artifactsData);
      const a = artifactsData;
      if (a.length > 0) {
        setActiveArtifact(a[a.length - 1]);
        const allParsedFiles = a.flatMap(art => parseArtifactFiles(art.content, art.id));
        const fileMap = new Map<string, GeneratedFile>();
        allParsedFiles.forEach(f => fileMap.set(f.path, f));
        const mergedFiles = Array.from(fileMap.values());
        setFiles(mergedFiles);
        if (mergedFiles.length > 0) setActiveFile(mergedFiles[0].path);
      }
    }
    load().catch(() => {});
  }, [id]);

  // Real-time Events
  useEffect(() => {
    const channel = supabase
      .channel(`ide-events-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pipeline_events", filter: `pipeline_id=eq.${id}` },
        (payload) => {
          setEvents((prev) => [...prev, payload.new as PipelineEvent]);
          // Refresh artifacts if a stage completes
          if (payload.new.event_type === "stage_completed") {
            artifactsApi.listByPipeline(id).then((a) => {
              setAllArtifacts(a);
              if (a.length > 0) {
                setActiveArtifact(a[a.length - 1]);
                const allParsedFiles = a.flatMap(art => parseArtifactFiles(art.content, art.id));
                const fileMap = new Map<string, GeneratedFile>();
                allParsedFiles.forEach(f => fileMap.set(f.path, f));
                setFiles(Array.from(fileMap.values()));
              }
            });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);


  const currentFile = files.find((f) => f.path === activeFile);

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined || !currentFile) return;
    setFiles((prev) => prev.map((f) => f.path === currentFile.path ? { ...f, content: value } : f));
  };

  const handleSave = async () => {
    if (!currentFile || !currentFile.artifactId) return;
    const targetArtifact = allArtifacts.find(a => a.id === currentFile.artifactId);
    if (!targetArtifact) return;
    
    setIsSaving(true);
    try {
      const newContent = { ...targetArtifact.content } as Record<string, any>;
      
      if (Array.isArray(newContent.files)) {
        newContent.files = newContent.files.map((f: any) => {
          const match = files.find((local) => local.path === (f.path || `file_${newContent.files.indexOf(f)}`));
          return match ? { ...f, content: match.content } : f;
        });
      } else if (newContent.dockerfile !== undefined && currentFile.path === "Dockerfile") {
        newContent.dockerfile = currentFile.content;
      } else if (newContent.docker_compose !== undefined && currentFile.path === "docker-compose.yml") {
        newContent.docker_compose = currentFile.content;
      } else if (newContent.ci_cd_pipeline !== undefined && currentFile.path === ".github/workflows/deploy.yml") {
        newContent.ci_cd_pipeline = currentFile.content;
      } else if (newContent[currentFile.path] !== undefined) {
        newContent[currentFile.path] = currentFile.content;
      }

      await artifactsApi.update(targetArtifact.id, newContent);
      setAllArtifacts(prev => prev.map(a => a.id === targetArtifact.id ? { ...a, content: newContent } : a));
      if (activeArtifact?.id === targetArtifact.id) setActiveArtifact({ ...targetArtifact, content: newContent });
    } catch (e) {
      console.error("Failed to save artifact", e);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [files, currentFile, allArtifacts, handleSave]);



  const handleDownloadZip = () => {
    const zip = new JSZip();
    files.forEach(f => zip.file(f.path, f.content));
    zip.generateAsync({ type: "blob" }).then(content => {
      saveAs(content, `pipeline_${id}_codebase.zip`);
    });
  };

  const handleChatInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setChatInput(val);

    const atMatch = val.match(/@([\w./-]*)$/);
    if (atMatch) {
      const query = atMatch[1].toLowerCase();
      const filtered = files.filter(f => f.path.toLowerCase().includes(query)).slice(0, 5);
      setSuggestions(filtered);
      setSuggestionIndex(0);
    } else {
      setSuggestions([]);
    }
  };

  const handleChatKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = suggestions[suggestionIndex];
        const newVal = chatInput.replace(/@[\w./-]*$/, `@${selected.path} `);
        setChatInput(newVal);
        setSuggestions([]);
        return;
      }
      if (e.key === 'Escape') {
        setSuggestions([]);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && chatInput.trim()) {
      e.preventDefault();
      const message = chatInput.trim();
      setChatInput("");
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pipelines/${id}/message`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({ message })
        });
      } catch (err) {
        console.error("Failed to send message", err);
      }
    }
  };

  const handleCreateFile = () => {
    const name = prompt("Enter file name (e.g. src/index.js):");
    if (!name) return;
    const newFile: GeneratedFile = {
      path: name,
      content: "",
      language: inferLanguage(name),
      artifactId: activeArtifact?.id
    };
    setFiles(prev => [...prev, newFile]);
    setActiveFile(name);
  };

  const handleRunApp = async () => {
    setIsAppRunning(true);
    setBottomPanelTab('terminal');
    setTerminalLogs(["[*] Starting provisioning..."]);
    if ((window as any)._logInterval) clearInterval((window as any)._logInterval);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pipelines/${id}/run`, { 
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      
      let hasSwitched = false;
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pipelines/${id}/logs`, {
            headers: { 'Authorization': `Bearer ${session?.access_token}` }
          });
          const data = await res.json();
          if (data.logs) {
            setTerminalLogs(data.logs);
            
            const isReady = data.logs.some((l: string) => 
              l.includes("Local:") ||
              l.includes("Network:") ||
              l.includes("ready in") ||
              l.includes("ready for connections") || 
              l.includes("http://localhost:") || 
              l.includes("ready for start up") || 
              l.includes("start worker process")
            );

            if (isReady && !hasSwitched) {
              setPreviewUrl(`${PREVIEW_BASE}?t=${Date.now()}`);
              setViewMode('preview');
              hasSwitched = true; 
            }
          }
        } catch (e) {
          console.error("Log poll error", e);
        }
      }, 1000);

      // Store interval to clear later
      (window as any)._logInterval = interval;
    } catch (err) {
      console.error("Failed to run app", err);
      setTerminalLogs(prev => [...prev, "[!] Failed to start runner."]);
    }
  };

  const handleDeleteFile = (path: string) => {
    if (confirm(`Are you sure you want to delete ${path}?`)) {
      setFiles(prev => prev.filter(f => f.path !== path));
      if (activeFile === path) setActiveFile(null);
    }
  };

  if (!pipeline) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite", color: "var(--accent-primary)" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#09090b", color: "#e4e4e7", fontFamily: "var(--font-geist-sans)" }}>
      {/* Top Header */}
      <header style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between", 
        padding: "0 20px", 
        height: 48, 
        borderBottom: "1px solid #1e1e1e", 
        background: "#09090b",
        zIndex: 50 
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/dashboard" style={{ color: "#71717a", textDecoration: "none", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 6 }}>
            <Folder size={14} /> Dashboard
          </Link>
          <ChevronRight size={14} color="#3f3f46" />
          <span style={{ fontWeight: 500, fontSize: "0.85rem", color: "#e4e4e7" }}>{pipeline.requirement.substring(0, 50)}...</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: pipeline.status === "running" ? "#eab308" : "#10b981" }} />
            <span style={{ fontSize: "0.75rem", color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {pipeline.status === "running" ? "Agent Working" : "Ready"}
            </span>
          </div>
          <button 
            onClick={handleDownloadZip}
            style={{ 
              background: "#18181b", 
              border: "1px solid #27272a", 
              padding: "6px 12px", 
              borderRadius: 6, 
              color: "#e4e4e7", 
              display: "flex", 
              alignItems: "center", 
              gap: 8, 
              cursor: "pointer", 
              fontSize: "0.8rem",
              transition: "all 0.2s"
            }}
          >
            <Download size={14} /> Export
          </button>
        </div>
      </header>

      {/* Main IDE Layout */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        
        {/* Activity Bar (VS Code Style) */}
        <div style={{ 
          width: 48, 
          background: "#09090b", 
          borderRight: "1px solid #1e1e1e", 
          display: "flex", 
          flexDirection: "column", 
          alignItems: "center", 
          padding: "12px 0",
          gap: 20
        }}>
          <div 
            onClick={() => { setActiveSideTab('explorer'); setIsSidebarOpen(true); }}
            style={{ cursor: "pointer", color: activeSideTab === 'explorer' ? "#fff" : "#71717a", transition: "color 0.2s" }}
          >
            <FileCode2 size={24} strokeWidth={1.5} />
          </div>
          <div 
            onClick={() => { setActiveSideTab('chat'); setIsSidebarOpen(true); }}
            style={{ cursor: "pointer", color: activeSideTab === 'chat' ? "#fff" : "#71717a", transition: "color 0.2s" }}
          >
            <Terminal size={24} strokeWidth={1.5} />
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ cursor: "pointer", color: "#71717a" }}>
            <Monitor size={24} strokeWidth={1.5} />
          </div>
        </div>

        {/* Workspace Panels */}
        <PanelGroup orientation="horizontal">
          {/* Sidebar */}
          {isSidebarOpen && (
            <>
              <Panel defaultSize={20} minSize={15}>
                <div style={{ height: "100%", background: "#09090b", borderRight: "1px solid #1e1e1e", display: "flex", flexDirection: "column" }}>
                  <div style={{ padding: "14px 16px", fontSize: "0.7rem", fontWeight: 600, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {activeSideTab === 'explorer' ? 'Explorer' : 'Agent Chat'}
                  </div>
                  
                  {activeSideTab === 'explorer' ? (
                    <div style={{ flex: 1, overflowY: "auto", padding: "0 4px" }}>
                      <div style={{ display: "flex", padding: "4px 12px", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "0.75rem", color: "#3f3f46" }}>Files</span>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={handleCreateFile} style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer" }}><Plus size={14} /></button>
                        </div>
                      </div>
                      {buildFileTree(files).map(node => (
                        <FileTreeItem key={node.path} node={node} level={0} activeFile={activeFile} onSelect={setActiveFile} onDelete={handleDeleteFile} />
                      ))}
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#09090b" }}>
                      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 20 }} className="workspace-sidebar">
                        {events.map((e, idx) => {
                          const isUser = e.event_type === 'user_message';
                          const isTool = e.event_type === 'tool_call';
                          const isThought = e.event_type === 'thought';
                          
                          if (isThought) {
                            return <CollapsibleThought key={idx} message={e.message || ""} />;
                          }

                          if (isTool) {
                            return (
                              <div key={idx} style={{ marginLeft: 32, padding: "8px 12px", borderLeft: "2px solid #6366f1", fontSize: "0.75rem", color: "#71717a", background: "rgba(99, 102, 241, 0.03)", borderRadius: "0 6px 6px 0", margin: "4px 0 12px 32px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                  <Terminal size={12} color="#6366f1" />
                                  <span style={{ fontWeight: 600 }}>{e.message}</span>
                                </div>
                                {e.data && e.data.tool && (
                                  <div style={{ fontFamily: "monospace", opacity: 0.8 }}>
                                    {e.data.tool}({JSON.stringify(e.data.args).substring(0, 50)}...)
                                  </div>
                                )}
                              </div>
                            );
                          }

                          const agentName = isUser ? 'You' : getAgentName(e.stage || "");
                          const isSystemEvent = ['stage_started', 'stage_completed', 'artifact_produced', 'critic_iteration'].includes(e.event_type);

                          if (isSystemEvent && !isUser) {
                            return (
                              <div key={idx} style={{ marginLeft: 32, paddingLeft: 12, borderLeft: "1px solid #1e1e1e", fontSize: "0.75rem", color: "#71717a", margin: "2px 0 8px 32px", opacity: 0.8 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#3f3f46" }} />
                                  <span>{formatSystemMessage(e)}</span>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={idx} style={{ 
                              background: isUser ? "rgba(99, 102, 241, 0.05)" : "transparent",
                              padding: "8px 12px",
                              borderRadius: 8,
                              border: isUser ? "1px solid rgba(99, 102, 241, 0.1)" : "none",
                              marginBottom: 4
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                <div style={{ width: 24, height: 24, borderRadius: "50%", background: isUser ? "#6366f1" : "#27272a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", color: "#fff" }}>
                                  {isUser ? 'U' : <Terminal size={12} />}
                                </div>
                                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: isUser ? "#fff" : "#a1a1aa" }}>{agentName}</span>
                              </div>
                              <div style={{ fontSize: "0.85rem", color: "#d4d4d8", lineHeight: 1.6, marginLeft: 32 }} className="markdown-content">
                                <ReactMarkdown>{e.message || ""}</ReactMarkdown>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ padding: "16px", borderTop: "1px solid #1e1e1e", background: "#09090b", position: "relative" }}>
                        {suggestions.length > 0 && (
                          <div style={{ position: "absolute", bottom: "100%", left: 16, right: 16, background: "#18181b", border: "1px solid #27272a", borderRadius: 8, overflow: "hidden", marginBottom: 8, boxShadow: "0 -4px 12px rgba(0,0,0,0.5)" }}>
                            {suggestions.map((s, i) => (
                              <div 
                                key={s.path}
                                onClick={() => {
                                  const newVal = chatInput.replace(/@[\w./-]*$/, `@${s.path} `);
                                  setChatInput(newVal);
                                  setSuggestions([]);
                                }}
                                style={{ 
                                  padding: "8px 12px", fontSize: "0.75rem", color: i === suggestionIndex ? "#fff" : "#a1a1aa",
                                  background: i === suggestionIndex ? "#27272a" : "transparent", cursor: "pointer",
                                  display: "flex", alignItems: "center", gap: 8
                                }}
                              >
                                <FileCode2 size={14} />
                                {s.path}
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display: "flex", background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: "8px 12px", alignItems: "flex-end", gap: 10 }}>
                          <textarea 
                            value={chatInput}
                            onChange={handleChatInput}
                            onKeyDown={handleChatKeyDown}
                            placeholder="Ask the agent to modify code..."
                            rows={1}
                            style={{ 
                              flex: 1, 
                              background: "transparent", 
                              border: "none", 
                              padding: "4px 0", 
                              color: "#fff", 
                              fontSize: "0.85rem", 
                              outline: "none",
                              resize: "none",
                              maxHeight: "200px",
                              fontFamily: "inherit",
                              lineHeight: "1.5"
                            }}
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = "auto";
                              target.style.height = `${target.scrollHeight}px`;
                            }}
                          />
                          <button 
                            onClick={() => handleChatKeyDown({ key: 'Enter', shiftKey: false, preventDefault: () => {} } as any)}
                            disabled={!chatInput.trim()}
                            style={{ 
                              background: "none", 
                              border: "none", 
                              padding: "4px", 
                              cursor: chatInput ? "pointer" : "default",
                              display: "flex",
                              alignItems: "center"
                            }}
                          >
                            <Send size={16} color={chatInput ? "#6366f1" : "#3f3f46"} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Panel>
              <PanelResizeHandle style={{ width: 1, background: "#1e1e1e" }} />
            </>
          )}

          {/* Editor/Preview Area */}
          <Panel defaultSize={80}>
            <PanelGroup orientation="vertical">
              <Panel defaultSize={70}>
                <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#121214" }}>
                  {/* Tabs Bar */}
                  <div style={{ height: 36, background: "#09090b", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 12 }}>
                    <div style={{ display: "flex", height: "100%" }}>
                      <button 
                        onClick={() => setViewMode('editor')}
                        style={{ 
                          padding: "0 20px", height: "100%", fontSize: "0.8rem", border: "none", cursor: "pointer",
                          background: viewMode === 'editor' ? "#121214" : "transparent",
                          color: viewMode === 'editor' ? "#fff" : "#71717a",
                          borderTop: viewMode === 'editor' ? "2px solid #6366f1" : "2px solid transparent"
                        }}
                      >
                        Code
                      </button>
                      <button 
                        onClick={() => setViewMode('preview')}
                        style={{ 
                          padding: "0 20px", height: "100%", fontSize: "0.8rem", border: "none", cursor: "pointer",
                          background: viewMode === 'preview' ? "#121214" : "transparent",
                          color: viewMode === 'preview' ? "#fff" : "#71717a",
                          borderTop: viewMode === 'preview' ? "2px solid #6366f1" : "2px solid transparent"
                        }}
                      >
                        Preview
                      </button>
                    </div>
                    
                    <div style={{ display: "flex", gap: 12 }}>
                      {viewMode === 'editor' && (
                        <>
                          <button 
                            onClick={handleSave} 
                            disabled={isSaving}
                            style={{ 
                              background: "rgba(99, 102, 241, 0.1)", 
                              border: "1px solid rgba(99, 102, 241, 0.2)", 
                              padding: "4px 12px", 
                              borderRadius: 4, 
                              color: "#6366f1", 
                              fontSize: "0.75rem", 
                              cursor: isSaving ? "not-allowed" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 6
                            }}
                          >
                            <Save size={14} />
                            {isSaving ? 'Saving...' : 'Save'}
                          </button>
                          <button 
                            onClick={handleRunApp} 
                            disabled={isAppRunning}
                            style={{ 
                              background: isAppRunning ? "#18181b" : "#6366f1", 
                              border: "none", 
                              padding: "4px 12px", 
                              borderRadius: 4, 
                              color: "#fff", 
                              fontSize: "0.75rem", 
                              cursor: isAppRunning ? "not-allowed" : "pointer" 
                            }}
                          >
                            {isAppRunning ? 'Running...' : 'Run App'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Editor Content */}
                  <div style={{ flex: 1, position: "relative" }}>
                    {viewMode === 'editor' ? (
                      currentFile ? (
                        <Editor
                          height="100%"
                          language={currentFile.language || "text"}
                          theme="vs-dark"
                          value={currentFile.content}
                          onChange={handleEditorChange}
                          options={{ minimap: { enabled: false }, fontSize: 13, backgroundColor: "#121214" }}
                        />
                      ) : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#3f3f46" }}>Select a file</div>
                    ) : (
                      <div style={{ height: "100%", background: "#fff" }}>
                        {previewUrl ? (
                          <iframe src={previewUrl} style={{ width: "100%", height: "100%", border: "none" }} />
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#71717a", background: "#09090b", fontSize: "0.9rem" }}>
                            Waiting for app to start...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Panel>

              {/* Bottom Panel (Terminal/Logs) */}
              {isBottomPanelOpen && (
                <>
                  <PanelResizeHandle style={{ height: 1, background: "#1e1e1e" }} />
                  <Panel defaultSize={30}>
                    <div style={{ height: "100%", background: "#09090b", display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", background: "#09090b", borderBottom: "1px solid #1e1e1e", padding: "0 16px", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex" }}>
                          {['Terminal', 'Output', 'Debug Console'].map(tab => (
                            <button 
                              key={tab}
                              onClick={() => setBottomPanelTab(tab.toLowerCase() as any)}
                              style={{ 
                                padding: "8px 16px", fontSize: "0.7rem", border: "none", background: "transparent", cursor: "pointer",
                                color: bottomPanelTab === tab.toLowerCase() ? "#fff" : "#71717a",
                                borderBottom: bottomPanelTab === tab.toLowerCase() ? "2px solid #fff" : "2px solid transparent"
                              }}
                            >
                              {tab.toUpperCase()}
                            </button>
                          ))}
                        </div>
                        {isAppRunning && (
                          <button 
                            onClick={async () => {
                              const { data: { session } } = await supabase.auth.getSession();
                              await fetch(`${process.env.NEXT_PUBLIC_API_URL}/pipelines/${id}/stop`, { 
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${session?.access_token}` }
                              });
                              setIsAppRunning(false);
                              if ((window as any)._logInterval) clearInterval((window as any)._logInterval);
                            }}
                            style={{ background: "rgba(239, 68, 68, 0.1)", border: "none", color: "#ef4444", fontSize: "0.65rem", padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}
                          >
                            Stop Process
                          </button>
                        )}
                      </div>
                      <div style={{ flex: 1, padding: "12px", fontFamily: "'Fira Code', monospace", fontSize: "0.8rem", color: "#a1a1aa", overflowY: "auto" }}>
                        {bottomPanelTab === 'terminal' && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {terminalLogs.map((line, i) => (
                              <div key={i} style={{ 
                                color: line.startsWith("[*]") ? "#6366f1" : line.startsWith("[!]") ? "#ef4444" : "#a1a1aa",
                                whiteSpace: "pre-wrap"
                              }}>
                                {line}
                              </div>
                            ))}
                            <div style={{ width: 8, height: 16, background: "#6366f1", marginTop: 4, animation: "pulse 1s infinite" }} />
                          </div>
                        )}
                        {bottomPanelTab === 'output' && <div>No output logs yet.</div>}
                      </div>
                    </div>
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>

      {/* Status Bar */}
      <footer style={{ 
        height: 22, 
        background: "#6366f1", 
        color: "#fff", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between", 
        padding: "0 12px", 
        fontSize: "0.7rem" 
      }}>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Terminal size={12} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <span>UTF-8</span>
          <span>TypeScript JSX</span>
        </div>
      </footer>
    </div>
  );
}
