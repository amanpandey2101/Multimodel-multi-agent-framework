// agent/ToolRegistry.ts — register tools and execute them
import type { ToolDefinition } from './LLMClient'

export type ToolResult = {
  output: string
  isError: boolean
}

export type ToolHandler = (
  args: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<ToolResult>

export type RegisteredTool = {
  definition: ToolDefinition
  handler: ToolHandler
  requiresApproval?: (args: Record<string, unknown>) => boolean
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>()

  register(tool: RegisteredTool): void {
    this.tools.set(tool.definition.name, tool)
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name)
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition)
  }

  async execute(
    name: string,
    rawArgs: string,
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      return { output: `Tool "${name}" is not registered.`, isError: true }
    }

    let args: Record<string, unknown>
    try {
      args = JSON.parse(rawArgs) as Record<string, unknown>
    } catch {
      return { output: `Invalid JSON arguments for tool "${name}".`, isError: true }
    }

    try {
      return await tool.handler(args, signal)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { output: `Tool "${name}" error: ${msg}`, isError: true }
    }
  }

  needsApproval(name: string, rawArgs: string): boolean {
    const tool = this.tools.get(name)
    if (!tool?.requiresApproval) return false
    try {
      const args = JSON.parse(rawArgs) as Record<string, unknown>
      return tool.requiresApproval(args)
    } catch {
      return false
    }
  }
}
