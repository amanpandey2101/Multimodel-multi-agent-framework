// API client — thin wrapper over fetch with /api prefix routing
import * as dotenv from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import type { Project, Pipeline, PipelineCreate } from './types'

// Load .env from the Major/ root (parent of cli/)
const __dirname = fileURLToPath(new URL('.', import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../.env') })

const BASE_URL = (process.env['NEXT_PUBLIC_API_URL'] ?? 'http://127.0.0.1:8000').replace(/\/$/, '')

// Session token — set on successful login
let _token: string | null = null

export function setToken(token: string): void {
  _token = token
}

export function getToken(): string | null {
  return _token
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (_token) h['Authorization'] = `Bearer ${_token}`
  return h
}

async function get<T>(path: string): Promise<T> {
  const resp = await fetch(`${BASE_URL}/api${path}`, { headers: headers() }).catch(err => { console.error('Fetch error:', err); throw err; });
  if (!resp.ok) throw new Error(`GET ${path} → ${resp.status} ${resp.statusText}`)
  return resp.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(`${BASE_URL}/api${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`POST ${path} → ${resp.status}: ${text}`)
  }
  return resp.json() as Promise<T>
}

// Auth
export type LoginResult = {
  access_token: string
  user: { id: string; email: string; full_name: string }
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const result = await post<LoginResult>('/auth/login', { email, password }).catch(err => { console.error('Login error:', err); throw err; });
  setToken(result.access_token)
  return result
}

// Projects
export async function listProjects(): Promise<Project[]> {
  return get<Project[]>('/projects').catch(err => { console.error('List projects error:', err); throw err; });
}

export async function createProject(name: string, description: string): Promise<Project> {
  return post<Project>('/projects/', { name, description }).catch(err => {  throw err; });
}

// Pipelines
export async function listPipelines(projectId: string): Promise<Pipeline[]> {
  return get<Pipeline[]>(`/pipelines/project/${projectId}`).catch(err => {  throw err; });
}

export async function getPipeline(pipelineId: string): Promise<Pipeline> {
  return get<Pipeline>(`/pipelines/${pipelineId}`).catch(err => { console.error('Get pipeline error:', err); throw err; });
}

export async function createPipeline(body: PipelineCreate): Promise<Pipeline> {
  return post<Pipeline>('/pipelines/', body).catch(err => { console.error('Create pipeline error:', err); throw err; });
}

export async function cancelPipeline(pipelineId: string): Promise<void> {
  await post(`/pipelines/${pipelineId}/cancel`, {}).catch(err => { console.error('Cancel pipeline error:', err); throw err; });
}

// Health check
export async function checkHealth(): Promise<boolean> {
  try {
    await fetch(`${BASE_URL}/api/health`).catch(err => { console.error('Health check error:', err); throw err; });
    return true
  } catch {
    return false
  }
}
