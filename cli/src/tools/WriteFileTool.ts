// tools/WriteFileTool.ts — write/create files, auto-creating parent directories
import { writeFile, mkdir } from 'fs/promises'
import { resolve, relative, dirname } from 'path'
import type { RegisteredTool } from '../agent/ToolRegistry'

export const WriteFileTool: RegisteredTool = {
  definition: {
    name: 'write_file',
    description: 'Write content to a file, creating it (and any parent directories) if it does not exist. Overwrites existing content.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to write.' },
        content: { type: 'string', description: 'The content to write into the file.' },
      },
      required: ['path', 'content'],
    },
  },

  // Always require approval for write operations
  requiresApproval: () => true,

  async handler(args, _signal) {
    const rawPath = args['path']
    const content = args['content']

    if (typeof rawPath !== 'string' || !rawPath) {
      return { output: 'path is required.', isError: true }
    }
    if (typeof content !== 'string') {
      return { output: 'content must be a string.', isError: true }
    }

    const absPath = resolve(process.cwd(), rawPath)
    const relPath = relative(process.cwd(), absPath)

    try {
      await mkdir(dirname(absPath), { recursive: true })
      await writeFile(absPath, content, 'utf-8')
      const lines = content.split('\n').length
      return { output: `Wrote ${lines} lines to ${relPath}`, isError: false }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { output: `Failed to write "${relPath}": ${msg}`, isError: true }
    }
  },
}
