// screens/ChatScreen.tsx — Interactive coding agent chat (Claude Code style)
// Features: streaming text, tool call display, approval prompts, slash commands,
//           conversation history, model display, cwd/git branch in header.
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Box, Text, useInput } from 'ink'
import * as fs from 'fs/promises'
import * as path from 'path'
import TextInput from 'ink-text-input'
import { Spinner } from '../components/Spinner'
import { MessageBubble } from '../components/MessageBubble'
import { ToolCallLine } from '../components/ToolCallLine'
import { ApprovalPrompt } from '../components/ApprovalPrompt'
import { LLMClient } from '../agent/LLMClient'
import { ToolRegistry } from '../agent/ToolRegistry'
import { AgentLoop, type AgentEvent } from '../agent/AgentLoop'
import { buildSystemPrompt } from '../context/SystemPrompt'
import { ReadFileTool } from '../tools/ReadFileTool'
import { WriteFileTool } from '../tools/WriteFileTool'
import { EditFileTool } from '../tools/EditFileTool'
import { BashTool } from '../tools/BashTool'
import { GrepTool } from '../tools/GrepTool'
import { ListDirTool } from '../tools/ListDirTool'
import { config } from '../config'
import { exec } from 'child_process'
import type { Screen } from '../types'

// ─── Types ───────────────────────────────────────────────────────────────────

type ChatMessage =
  | { id: string; kind: 'user'; content: string }
  | { id: string; kind: 'thinking'; content: string; streaming?: boolean }
  | { id: string; kind: 'assistant'; content: string; streaming?: boolean }
  | { id: string; kind: 'tool_start'; name: string; args: string; callId: string }
  | { id: string; kind: 'tool_done'; name: string; args: string; callId: string; output: string; isError: boolean }
  | { id: string; kind: 'approval'; name: string; args: string; callId: string; resolved: boolean }
  | { id: string; kind: 'error'; content: string }
  | { id: string; kind: 'info'; content: string }

type Props = {
  onNavigate: (s: Screen) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SLASH_COMMANDS: Record<string, string> = {
  '/help': 'Show available slash commands',
  '/clear': 'Clear conversation history',
  '/model': 'Show or switch model: /model gpt-4o',
  '/context': 'Show what context was injected into the system prompt',
  '/cwd': 'Show current working directory',
  '/tools': 'List available tools',
  '/exit': 'Exit chat and return to menu',
}

function uid(): string {
  return Math.random().toString(36).slice(2)
}

function getGitBranch(): Promise<string> {
  return new Promise(resolve => {
    exec('git rev-parse --abbrev-ref HEAD', { cwd: process.cwd(), timeout: 2000 }, (err, stdout) => {
      resolve(err ? '' : stdout.trim())
    })
  })
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ChatScreen({ onNavigate }: Props): React.ReactNode {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [model, setModel] = useState(config.defaultModel)
  const [branch, setBranch] = useState('')
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null)

  // Abort controller for cancelling agent runs
  const abortRef = useRef<AbortController | null>(null)

  // Stable agent references
  const registryRef = useRef<ToolRegistry | null>(null)
  const loopRef = useRef<AgentLoop | null>(null)

  // Pending approval callbacks
  const approvalCallbackRef = useRef<Map<string, (approved: boolean) => void>>(new Map())

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => [...prev, msg])
  }, [])

  const updateLastAssistant = useCallback((delta: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if (last?.kind === 'assistant' && last.streaming) {
        return [
          ...prev.slice(0, -1),
          { ...last, content: last.content + delta },
        ]
      }
      return [
        ...prev,
        { id: uid(), kind: 'assistant', content: delta, streaming: true },
      ]
    })
  }, [])

  const updateLastThinking = useCallback((delta: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if (last?.kind === 'thinking' && last.streaming) {
        return [
          ...prev.slice(0, -1),
          { ...last, content: last.content + delta },
        ]
      }
      return [
        ...prev,
        { id: uid(), kind: 'thinking', content: delta, streaming: true },
      ]
    })
  }, [])

  const finalizeLast = useCallback(() => {
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if ((last?.kind === 'assistant' || last?.kind === 'thinking') && last.streaming) {
        return [...prev.slice(0, -1), { ...last, streaming: false }]
      }
      return prev
    })
  }, [])

  // ─── Init ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const [sp, br] = await Promise.all([
        buildSystemPrompt(process.cwd()).catch(() => ''),
        getGitBranch(),
      ])
      setSystemPrompt(sp)
      setBranch(br)

      if (!config.openaiApiKey) {
        addMessage({
          id: uid(),
          kind: 'error',
          content: 'OPENAI_API_KEY is missing. Please add it to your .env file in the Major/ directory.',
        })
      }

      // Build registry
      const registry = new ToolRegistry()
      registry.register(ReadFileTool)
      registry.register(WriteFileTool)
      registry.register(EditFileTool)
      registry.register(BashTool)
      registry.register(GrepTool)
      registry.register(ListDirTool)
      registryRef.current = registry

      // Initialize loop
      const client = new LLMClient()
      loopRef.current = new AgentLoop(client, registry, sp)

      setLoading(false)

      addMessage({
        id: uid(),
        kind: 'info',
        content: `Agent ready. Model: ${config.defaultModel} · Tools: read_file, write_file, edit_file, bash, grep, list_dir\nType /help for commands. Esc or /exit to go back.`,
      })
    }

    void init()
  }, [addMessage])

  // Rebuild loop when model changes
  useEffect(() => {
    if (!registryRef.current || systemPrompt === null) return
    const client = new LLMClient()
    loopRef.current = new AgentLoop(client, registryRef.current, systemPrompt)
  }, [model])

  // ─── Slash commands ────────────────────────────────────────────────────────

  const handleSlashCommand = useCallback((cmd: string) => {
    const parts = cmd.trim().split(/\s+/)
    const base = parts[0]?.toLowerCase() ?? ''

    if (base === '/help') {
      const helpText = Object.entries(SLASH_COMMANDS)
        .map(([c, d]) => `${c.padEnd(12)} — ${d}`)
        .join('\n')
      addMessage({ id: uid(), kind: 'info', content: helpText })
      return
    }

    if (base === '/clear') {
      setMessages([{ id: uid(), kind: 'info', content: 'Conversation cleared.' }])
      loopRef.current?.clearHistory()
      return
    }

    if (base === '/model') {
      if (parts[1]) {
        const newModel = parts[1]
        setModel(newModel)
        // Loop will be rebuilt via useEffect
        addMessage({ id: uid(), kind: 'info', content: `Model switched to: ${newModel}` })
      } else {
        addMessage({ id: uid(), kind: 'info', content: `Current model: ${model}` })
      }
      return
    }

    if (base === '/context') {
      const preview = systemPrompt.slice(0, 1500)
      addMessage({ id: uid(), kind: 'info', content: `System prompt preview:\n${preview}${systemPrompt.length > 1500 ? '\n… (truncated)' : ''}` })
      return
    }

    if (base === '/cwd') {
      addMessage({ id: uid(), kind: 'info', content: `Working directory: ${process.cwd()}` })
      return
    }

    if (base === '/tools') {
      const tools = registryRef.current?.getDefinitions().map(t => `• ${t.name} — ${t.description.split('\n')[0]}`) ?? []
      addMessage({ id: uid(), kind: 'info', content: tools.join('\n') })
      return
    }

    if (base === '/exit') {
      onNavigate({ type: 'projects' })
      return
    }

    addMessage({ id: uid(), kind: 'error', content: `Unknown command: ${base}. Type /help for list.` })
  }, [model, systemPrompt, onNavigate, addMessage])

  // ─── Run agent ─────────────────────────────────────────────────────────────

  // ─── Event dispatch ────────────────────────────────────────────────────────

  const handleAgentEvent = useCallback((event: AgentEvent, toolStatusMap: Map<string, string>): void => {
    switch (event.type) {
      case 'text':
        updateLastAssistant(event.delta)
        break

      case 'thinking':
        updateLastThinking(event.delta)
        break

      case 'tool_start': {
        const msgId = uid()
        toolStatusMap.set(event.callId, msgId)
        addMessage({ id: msgId, kind: 'tool_start', name: event.name, args: event.args, callId: event.callId })
        break
      }

      case 'tool_result': {
        const msgId = uid()
        // Find the original start message to get args
        const startMsg = messages.find(m => m.kind === 'tool_start' && m.callId === event.callId)
        addMessage({
          id: msgId,
          kind: 'tool_done',
          name: event.name,
          args: startMsg && startMsg.kind === 'tool_start' ? startMsg.args : '',
          callId: event.callId,
          output: event.output,
          isError: event.isError,
        })
        break
      }

      case 'approval_needed':
        // Approval is handled by the onApproval callback above
        break

      case 'error':
        finalizeLast()
        addMessage({ id: uid(), kind: 'error', content: event.error.message })
        break

      case 'done':
        finalizeLast()
        break
    }
  }, [updateLastAssistant, updateLastThinking, addMessage, finalizeLast])

  // ─── Run agent ─────────────────────────────────────────────────────────────

  const runAgent = useCallback(async (userInput: string) => {
    if (!loopRef.current) {
      addMessage({ id: uid(), kind: 'error', content: 'Agent not initialised yet. Wait a moment.' })
      return
    }

    addMessage({ id: uid(), kind: 'user', content: userInput })
    setIsRunning(true)

    let finalInput = userInput
    const matches = [...userInput.matchAll(/@(?:\[([^\]]+)\]|([^\s]+))/g)]
    if (matches.length > 0) {
      let extraContext = '\n\n[System: The user referenced the following paths via @mentions:]\n'
      const resolvedPaths: string[] = []
      
      for (const match of matches) {
        const filePath = match[1] || match[2]
        if (!filePath) continue
        
        try {
          const fullPath = path.resolve(process.cwd(), filePath)
          const stats = await fs.stat(fullPath)
          if (stats.isFile()) {
            const content = await fs.readFile(fullPath, 'utf8')
            extraContext += `\n--- ${filePath} ---\n${content.slice(0, 10000)}${content.length > 10000 ? '\n... (truncated)' : ''}\n`
            resolvedPaths.push(filePath)
          } else if (stats.isDirectory()) {
            const files = await fs.readdir(fullPath)
            extraContext += `\n--- Directory: ${filePath} ---\n${files.join('\n')}\n`
            resolvedPaths.push(`${filePath}/`)
          }
        } catch (e) {
          extraContext += `\n--- ${filePath} ---\n(Could not read file or directory. It may not exist.)\n`
        }
      }
      finalInput += extraContext
      
      if (resolvedPaths.length > 0) {
        addMessage({ id: uid(), kind: 'info', content: `Attached context: ${resolvedPaths.join(', ')}` })
      }
    }

    const abort = new AbortController()
    abortRef.current = abort

    const toolStatusMap = new Map<string, string>() // callId → message id

    try {
      for await (const event of loopRef.current.run(finalInput, {
        model,
        signal: abort.signal,
        onApproval: (name, args) => {
          return new Promise<boolean>(resolve => {
            const callId = `approval-${uid()}`
            addMessage({ id: callId, kind: 'approval', name, args, callId, resolved: false })
            approvalCallbackRef.current.set(callId, resolve)
          })
        },
      })) {
        if (abort.signal.aborted) break
        handleAgentEvent(event, toolStatusMap)
      }
    } finally {
      finalizeLast()
      setIsRunning(false)
      abortRef.current = null
    }
  }, [model, addMessage, finalizeLast, handleAgentEvent])


  // ─── Input & Autocomplete ──────────────────────────────────────────────────

  useEffect(() => {
    const match = input.match(/@([^\s]*)$/)
    if (match) {
      const query = match[1] ?? ''
      const dirPath = path.dirname(query)
      const baseName = path.basename(query)
      // Check if query ends with / to show children
      const isDirQuery = query.endsWith('/')
      const targetDir = dirPath === '.' && !query.includes('/') && !isDirQuery
        ? process.cwd() 
        : path.resolve(process.cwd(), isDirQuery ? query : dirPath)
      
      const searchBase = isDirQuery ? '' : baseName

      fs.readdir(targetDir).then(files => {
         const matches = files.filter(f => f.toLowerCase().startsWith(searchBase.toLowerCase())).slice(0, 5)
         const formatted = matches.map(f => {
           if (dirPath === '.' && !query.includes('/') && !isDirQuery) return f
           return path.join(isDirQuery ? query : dirPath, f).replace(/\\/g, '/')
         })
         setSuggestions(formatted)
      }).catch(() => setSuggestions([]))
    } else {
      setSuggestions([])
    }
  }, [input])

  const handleSubmit = useCallback((value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    setInput('')

    if (trimmed.startsWith('/')) {
      handleSlashCommand(trimmed)
      return
    }

    if (!isRunning) {
      void runAgent(trimmed)
    }
  }, [handleSlashCommand, isRunning, runAgent])

  useInput((_input, key) => {
    if (key.tab && suggestions.length > 0) {
      const lastAt = input.lastIndexOf('@')
      if (lastAt !== -1) {
        const completion = suggestions[0]
        setInput(input.substring(0, lastAt + 1) + completion + ' ')
        setSuggestions([])
      }
      return
    }

    if (key.escape) {
      if (isRunning && abortRef.current) {
        abortRef.current.abort()
        addMessage({ id: uid(), kind: 'info', content: '[Interrupted]' })
      } else {
        onNavigate({ type: 'projects' })
      }
    }
  })

  // ─── Approval handler ─────────────────────────────────────────────────────

  const handleApproval = useCallback((callId: string, approved: boolean) => {
    const resolve = approvalCallbackRef.current.get(callId)
    if (resolve) {
      resolve(approved)
      approvalCallbackRef.current.delete(callId)
    }
    setMessages(prev =>
      prev.map(m => m.kind === 'approval' && m.callId === callId ? { ...m, resolved: true } : m)
    )
  }, [])

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Spinner label="Initialising agent context…" />
      </Box>
    )
  }

  const cwd = process.cwd().replace(process.env['HOME'] ?? process.env['USERPROFILE'] ?? '', '~')
  const MAX_VISIBLE = 30 // Show last N messages to avoid Ink overflow

  return (
    <Box flexDirection="column" minHeight={20}>

      {/* Header */}
      <Box paddingX={2} paddingY={0} borderStyle="round" borderColor="cyan" flexDirection="row" justifyContent="space-between">
        <Box>
          <Text bold color="cyan">◈ AgentiX</Text>
          <Text dimColor>  ·  {model}</Text>
          <Text dimColor>  ·  {isRunning ? '● running' : '○ ready'}</Text>
        </Box>
        <Box>
          <Text dimColor>{cwd}</Text>
          {branch ? <Text color="green">  [{branch}]</Text> : null}
        </Box>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" paddingX={2} flexGrow={1}>
        {messages.slice(-MAX_VISIBLE).map(msg => {
          switch (msg.kind) {
            case 'user':
              return <MessageBubble key={msg.id} role="user" content={msg.content} />

            case 'thinking':
              return (
                <Box key={msg.id} marginLeft={2} paddingY={0} flexDirection="column" marginTop={1}>
                  <Box>
                    <Text color="blue" bold>THINKING</Text>
                    {msg.streaming && <Spinner />}
                  </Box>
                  <Box paddingLeft={2} borderStyle="classic" borderColor="blue" paddingX={1} marginTop={0}>
                    <Text dimColor italic>{msg.content.trim() || '...'}</Text>
                  </Box>
                </Box>
              )

            case 'assistant':
              return (
                <Box key={msg.id} flexDirection="column">
                  <MessageBubble role="assistant" content={msg.content} />
                  {msg.streaming ? <Spinner /> : null}
                </Box>
              )

            case 'tool_start': {
              const args = JSON.parse(msg.args || '{}')
              const filePath = args.path || args.target_file || args.file || ''
              
              return (
                <Box key={msg.id} marginLeft={4} marginTop={0} flexDirection="column">
                  <ToolCallLine name={msg.name} args={msg.args} status="running" />
                  {filePath && (
                    <Box marginLeft={2}>
                      <Text dimColor>  ↳ </Text>
                      <Text color="yellow" bold>{msg.name === 'read_file' ? 'Reading' : 'Editing'} </Text>
                      <Text color="white">{filePath}</Text>
                    </Box>
                  )}
                </Box>
              )
            }

            case 'tool_done': {
              const argsStr = msg.args || '{}'
              let filePath = ''
              try {
                const args = JSON.parse(argsStr)
                filePath = args.path || args.target_file || args.file || ''
              } catch (e) {}
              
              return (
                <Box key={msg.id} marginLeft={4} flexDirection="column">
                  <ToolCallLine
                    name={msg.name}
                    args=""
                    status={msg.isError ? 'error' : 'done'}
                    output={msg.isError ? msg.output : undefined}
                  />
                  {!msg.isError && (msg.name === 'write_file' || msg.name === 'edit_file') && (
                    <Box marginLeft={2}>
                      <Text color="green" bold>  ✓ Successfully modified </Text>
                      <Text color="white">{filePath || 'file'}</Text>
                    </Box>
                  )}
                </Box>
              )
            }

            case 'approval':
              if (msg.resolved) return null
              return (
                <ApprovalPrompt
                  key={msg.id}
                  toolName={msg.name}
                  args={msg.args}
                  onDecision={approved => handleApproval(msg.callId, approved)}
                />
              )

            case 'error':
              return (
                <Box key={msg.id} marginTop={1}>
                  <Text color="red">✗ {msg.content}</Text>
                </Box>
              )

            case 'info':
              return (
                <Box key={msg.id} marginTop={1} marginLeft={2} flexDirection="column">
                  {msg.content.split('\n').map((line, i) => (
                    <Text key={i} dimColor>{line}</Text>
                  ))}
                </Box>
              )

            default:
              return null
          }
        })}
      </Box>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <Box paddingX={2} paddingY={0}>
          <Text dimColor>Suggestions (Tab): </Text>
          <Text color="green">{suggestions.join('  ')}</Text>
        </Box>
      )}

      {/* Input */}
      <Box paddingX={2} paddingY={0} borderStyle="round" borderColor={isRunning ? 'yellow' : 'cyan'}>
        <Text color={isRunning ? 'yellow' : 'cyan'}>{'> '}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          focus={!isRunning}
          placeholder={isRunning ? 'Running… (Esc to interrupt)' : 'Ask me anything about your code…'}
        />
      </Box>

      {/* Hints */}
      <Box paddingX={2}>
        <Text dimColor>
          {isRunning
            ? 'Esc: interrupt'
            : '/help  /clear  /model  /context  /tools  Esc: menu'}
        </Text>
      </Box>

    </Box>
  )
}
