// tools/ReadFileTool.ts — read file contents with optional line range
import { readFile, stat } from 'fs/promises'
import { resolve, relative } from 'path'
import type { RegisteredTool } from '../agent/ToolRegistry'

const MAX_FILE_SIZE = 500_000 // 500KB

export const ReadFileTool: RegisteredTool = {
  definition: {
    name: 'read_file',
    description: 'Read the contents of a file at the given path. For large files, use offset and limit to read specific line ranges.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file to read.',
        },
        offset: {
          type: 'number',
          description: 'Line number to start reading from (1-indexed). Defaults to 1.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of lines to read. Defaults to 250.',
        },
      },
      required: ['path'],
    },
  },

  async handler(args, _signal) {
    const rawPath = args['path']
    if (typeof rawPath !== 'string' || !rawPath) {
      return { output: 'path is required and must be a string.', isError: true }
    }

    const absPath = resolve(process.cwd(), rawPath)
    const relPath = relative(process.cwd(), absPath)

    try {
      const info = await stat(absPath)
      if (!info.isFile()) {
        return { output: `"${relPath}" is not a file.`, isError: true }
      }
      if (info.size > MAX_FILE_SIZE) {
        return {
          output: `File "${relPath}" is too large (${Math.round(info.size / 1024)}KB). Use offset and limit to read specific sections.`,
          isError: true,
        }
      }

      const raw = await readFile(absPath, 'utf-8')
      const lines = raw.split('\n')
      const total = lines.length

      const offset = typeof args['offset'] === 'number' ? Math.max(1, args['offset']) : 1
      const limit = typeof args['limit'] === 'number' ? args['limit'] : 250

      const sliced = lines.slice(offset - 1, offset - 1 + limit)
      const numbered = sliced.map((line, i) => `${String(offset + i).padStart(4, ' ')} │ ${line}`)
      const showing = sliced.length < total ? ` (lines ${offset}–${offset + sliced.length - 1} of ${total})` : ''

      return {
        output: `File: ${relPath}${showing}\n${'─'.repeat(40)}\n${numbered.join('\n')}`,
        isError: false,
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { output: `Cannot read "${relPath}": ${msg}`, isError: true }
    }
  },
}
