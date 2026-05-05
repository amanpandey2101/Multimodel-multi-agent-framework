// agent/LLMClient.ts — streaming OpenAI adapter
// Handles chat completions with tool_calls and streaming text deltas.
import OpenAI from 'openai'
import { config } from '../config'

export type Message = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

export type ToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type ToolDefinition = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type StreamChunk =
  | { type: 'text'; delta: string }
  | { type: 'thinking'; delta: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'done'; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'error'; error: Error }

export class LLMClient {
  private client: OpenAI

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey ?? config.openaiApiKey,
    })
  }

  async *stream(
    messages: Message[],
    tools: ToolDefinition[],
    model: string = config.defaultModel,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    try {
      const toolCallBuffers = new Map<number, { id: string; name: string; args: string }>()

      const stream = await this.client.chat.completions.create(
        {
          model,
          messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
          tools: tools.length > 0
            ? tools.map(t => ({
                type: 'function' as const,
                function: { name: t.name, description: t.description, parameters: t.parameters },
              }))
            : undefined,
          stream: true,
          stream_options: { include_usage: true },
          temperature: config.temperature,
          max_tokens: config.maxTokens,
        },
        { signal },
      )

      let inputTokens = 0
      let outputTokens = 0

      for await (const chunk of stream) {
        const choice = chunk.choices[0]

        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens
          outputTokens = chunk.usage.completion_tokens
        }

        if (!choice) continue

        const delta = choice.delta as any
        
        // Reasoning content (for o1/o3-mini etc)
        if (delta.reasoning_content) {
          yield { type: 'thinking', delta: delta.reasoning_content }
        }

        // Text delta
        if (delta.content) {
          yield { type: 'text', delta: delta.content }
        }

        // Tool call deltas — accumulate args streamed piecemeal
        for (const tc of delta.tool_calls ?? []) {
          const idx = tc.index
          if (!toolCallBuffers.has(idx)) {
            toolCallBuffers.set(idx, { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' })
          }
          const buf = toolCallBuffers.get(idx)!
          if (tc.id) buf.id = tc.id
          if (tc.function?.name) buf.name = tc.function.name
          if (tc.function?.arguments) buf.args += tc.function.arguments
        }
      }

      // Emit all accumulated tool calls
      for (const buf of toolCallBuffers.values()) {
        yield {
          type: 'tool_call',
          toolCall: {
            id: buf.id,
            type: 'function',
            function: { name: buf.name, arguments: buf.args },
          },
        }
      }

      yield { type: 'done', usage: { inputTokens, outputTokens } }
    } catch (err) {
      yield { type: 'error', error: err instanceof Error ? err : new Error(String(err)) }
    }
  }
}
