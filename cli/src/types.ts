// Types shared across the CLI
export type PipelineStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export type Project = {
  id: string
  name: string
  description: string
  pipeline_count: number
  created_at: string
}

export type PipelineStage = {
  id: string
  pipeline_id: string
  stage_name: string
  status: PipelineStatus
  agent_role: string
  started_at?: string
  completed_at?: string
}

export type Pipeline = {
  id: string
  project_id: string
  requirement: string
  llm_provider: string
  status: PipelineStatus
  stages: PipelineStage[]
  created_at: string
}

export type PipelineCreate = {
  project_id: string
  requirement: string
  llm_provider: string
  mode: 'planning' | 'fast'
}

export type Screen =
  | { type: 'splash' }
  | { type: 'login' }
  | { type: 'projects' }
  | { type: 'pipelines'; projectId: string; projectName: string }
  | { type: 'new-pipeline'; projectId: string; projectName: string }
  | { type: 'watch'; pipelineId: string }
  | { type: 'help' }
  | { type: 'chat' }
