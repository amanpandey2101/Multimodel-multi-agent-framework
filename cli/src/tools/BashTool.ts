// tools/BashTool.ts — execute shell commands with timeout and safety checks
// Uses PowerShell on Windows, bash on Unix. Inspired by claude-source/tools/BashTool.
import { spawn } from 'child_process'
import type { RegisteredTool } from '../agent/ToolRegistry'

const DEFAULT_TIMEOUT_MS = 30_000

// Commands that are blocked outright (no approval possible)
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\/\s*$/,
  /format\s+[a-z]:/i,
  /del\s+\/[sf]/i,
  /rd\s+\/s\s+\/q\s+[a-z]:\\/i,
  /:(){ :|:& };:/,  // fork bomb
]

function isBlocked(command: string): boolean {
  return BLOCKED_PATTERNS.some(p => p.test(command))
}

// Commands requiring approval — destructive but not outright blocked
const APPROVAL_PATTERNS = [
  /\brm\b/,
  /\bdel\b/,
  /\bnpm\s+(install|uninstall|ci)\b/,
  /\bpip\s+install\b/,
  /\bgit\s+(push|reset|rebase|merge|checkout\s+-[bB])/,
  /\bmkdir\b/,
  /\bchmod\b/,
  /\bsudo\b/,
  /\bpowerShell\s+-Command/i,
]

function needsApproval(command: string): boolean {
  return APPROVAL_PATTERNS.some(p => p.test(command))
}

function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32'
    const shell = isWindows ? 'powershell.exe' : '/bin/sh'
    const shellArgs = isWindows ? ['-NoProfile', '-Command', command] : ['-c', command]

    const child = spawn(shell, shellArgs, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({ stdout, stderr: stderr + '\n[Command timed out]', exitCode: 124 })
    }, timeoutMs)

    signal?.addEventListener('abort', () => {
      child.kill('SIGTERM')
      clearTimeout(timer)
      resolve({ stdout, stderr: stderr + '\n[Command cancelled]', exitCode: 130 })
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: code ?? 0 })
    })
  })
}

const MAX_OUTPUT_CHARS = 10_000

function truncate(s: string): string {
  if (s.length <= MAX_OUTPUT_CHARS) return s
  const half = MAX_OUTPUT_CHARS / 2
  return s.slice(0, half) + '\n... [output truncated] ...\n' + s.slice(-half)
}

export const BashTool: RegisteredTool = {
  definition: {
    name: 'bash',
    description: `Execute a shell command and return its output.
- On Windows, commands run in PowerShell. Use PowerShell syntax.
- Avoid interactive commands that require stdin.
- Commands time out after 30s by default (use timeout_ms to override, max 120s).
- For long-running processes, add & to run in background.`,
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute.' },
        cwd: { type: 'string', description: 'Working directory. Defaults to current project directory.' },
        timeout_ms: { type: 'number', description: 'Timeout in milliseconds. Max 120000.' },
      },
      required: ['command'],
    },
  },

  requiresApproval: (args) => {
    const command = args['command']
    return typeof command === 'string' && needsApproval(command)
  },

  async handler(args, signal) {
    const command = args['command']
    if (typeof command !== 'string' || !command.trim()) {
      return { output: 'command is required.', isError: true }
    }

    if (isBlocked(command)) {
      return {
        output: `❌ Command blocked for safety: ${command}\nThis command pattern is not allowed.`,
        isError: true,
      }
    }

    const cwd = typeof args['cwd'] === 'string' ? args['cwd'] : process.cwd()
    const rawTimeout = typeof args['timeout_ms'] === 'number' ? args['timeout_ms'] : DEFAULT_TIMEOUT_MS
    const timeoutMs = Math.min(rawTimeout, 120_000)

    const { stdout, stderr, exitCode } = await runCommand(command, cwd, timeoutMs, signal)

    const parts: string[] = []
    if (stdout.trim()) parts.push(truncate(stdout.trimEnd()))
    if (stderr.trim()) parts.push(`[stderr]\n${truncate(stderr.trimEnd())}`)
    if (exitCode !== 0) parts.push(`[exit code: ${exitCode}]`)

    const output = parts.join('\n') || '(no output)'
    return { output, isError: exitCode !== 0 }
  },
}
