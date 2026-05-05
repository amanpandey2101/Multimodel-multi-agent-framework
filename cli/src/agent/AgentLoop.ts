// agent/AgentLoop.ts — core conversation loop
// Streams LLM responses, dispatches tool calls, handles multi-turn agentic flow.
import type { LLMClient, Message, ToolCall } from './LLMClient'
import type { ToolRegistry } from './ToolRegistry'

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'thinking'; delta: string }
  | { type: 'tool_start'; name: string; args: string; callId: string }
  | { type: 'tool_result'; name: string; callId: string; output: string; isError: boolean; needsApproval: boolean }
  | { type: 'approval_needed'; name: string; args: string; callId: string }
  | { type: 'turn_done'; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'done' }
  | { type: 'error'; error: Error }

export type ApprovalCallback = (name: string, args: string) => Promise<boolean>

export type AgentLoopOptions = {
  model?: string
  maxTurns?: number
  signal?: AbortSignal
  onApproval?: ApprovalCallback
}

export class AgentLoop {
  private history: Message[] = []

  constructor(
    private readonly client: LLMClient,
    private readonly registry: ToolRegistry,
    private readonly systemPrompt: string,
  ) {}

  getHistory(): Message[] {
    return [...this.history]
  }

  clearHistory(): void {
    this.history = []
  }

  async *run(
    userMessage: string,
    opts: AgentLoopOptions = {},
  ): AsyncGenerator<AgentEvent> {
    const { model, maxTurns = 20, signal, onApproval } = opts

    // Append user message to history
    this.history.push({ role: 'user', content: userMessage })

    const messages: Message[] = [
      { role: 'system', content: this.systemPrompt },
      ...this.history,
    ]

    let turns = 0

    while (turns < maxTurns) {
      if (signal?.aborted) break
      turns++

      const pendingToolCalls: ToolCall[] = []
      let assistantText = ''
      let usage = { inputTokens: 0, outputTokens: 0 }

      // Stream from LLM
      for await (const chunk of this.client.stream(messages, this.registry.getDefinitions(), model, signal)) {
        if (chunk.type === 'text') {
          assistantText += chunk.delta
          yield { type: 'text', delta: chunk.delta }
        } else if (chunk.type === 'thinking') {
          yield { type: 'thinking', delta: chunk.delta }
        } else if (chunk.type === 'tool_call') {
          pendingToolCalls.push(chunk.toolCall)
        } else if (chunk.type === 'done') {
          usage = chunk.usage
          yield { type: 'turn_done', usage }
        } else if (chunk.type === 'error') {
          console.error('Error occurred:', chunk.error); 
          yield { type: 'error', error: chunk.error }
          return
        }
      }

      // Append assistant message (with or without tool_calls)
      const assistantMessage: Message = {
        role: 'assistant',
        content: assistantText || null,
        ...(pendingToolCalls.length > 0 ? { tool_calls: pendingToolCalls } : {}),
      }
      messages.push(assistantMessage)
      this.history.push(assistantMessage)

      // If no tool calls — we're done
      if (pendingToolCalls.length === 0) {
        break
      }

      // Execute tool calls
      for (const tc of pendingToolCalls) {
        const { name, arguments: rawArgs } = tc.function
        const callId = tc.id

        const needsApproval = this.registry.needsApproval(name, rawArgs)

        if (needsApproval) {
          yield { type: 'approval_needed', name, args: rawArgs, callId }
          if (onApproval) {
            const approved = await onApproval(name, rawArgs)
            if (!approved) {
              const deniedOutput = `[User denied permission to run ${name}]`
              const toolMsg: Message = {
                role: 'tool',
                tool_call_id: callId,
                content: deniedOutput,
              }
              messages.push(toolMsg)
              this.history.push(toolMsg)
              yield { type: 'tool_result', name, callId, output: deniedOutput, isError: false, needsApproval: true }
              continue
            }
          }
        }

        yield { type: 'tool_start', name, args: rawArgs, callId }

        const result = await this.registry.execute(name, rawArgs, signal)

        const toolMsg: Message = {
          role: 'tool',
          tool_call_id: callId,
          content: result.output,
        }
        messages.push(toolMsg)
        this.history.push(toolMsg)

        yield { type: 'tool_result', name, callId, output: result.output, isError: result.isError, needsApproval: false }
      }
      // Loop back — LLM will see tool results and continue
    }

    yield { type: 'done' }
  }
}
