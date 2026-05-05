// components/ToolCallLine.tsx — shows tool call status in the chat (start → done/error)
import React from 'react'
import { Box, Text } from 'ink'

type Status = 'running' | 'done' | 'error' | 'denied' | 'approval'

type Props = {
  name: string
  args?: string
  status: Status
  output?: string
}

function formatArgs(rawArgs: string, toolName: string): string {
  try {
    const args = JSON.parse(rawArgs) as Record<string, unknown>
    // Show most relevant arg as a summary
    const summary =
      args['path'] ?? args['command'] ?? args['pattern'] ?? args['query'] ??
      Object.values(args)[0] ?? ''
    const str = String(summary)
    return str.length > 60 ? str.slice(0, 57) + '...' : str
  } catch {
    return ''
  }
}

const ICONS: Record<Status, string> = {
  running: '⟳',
  done: '✓',
  error: '✗',
  denied: '⊘',
  approval: '⚠',
}

const COLORS: Record<Status, string> = {
  running: 'yellow',
  done: 'green',
  error: 'red',
  denied: 'gray',
  approval: 'yellow',
}

export function ToolCallLine({ name, args = '', status, output }: Props): React.ReactNode {
  const icon = ICONS[status]
  const color = COLORS[status]
  const summary = formatArgs(args, name)

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={color}>{icon} </Text>
        <Text bold>{name}</Text>
        {summary ? (
          <>
            <Text dimColor>(</Text>
            <Text dimColor>{summary}</Text>
            <Text dimColor>)</Text>
          </>
        ) : null}
      </Box>
      {status === 'error' && output ? (
        <Box marginLeft={2}>
          <Text color="red" dimColor>{output.slice(0, 200)}</Text>
        </Box>
      ) : null}
    </Box>
  )
}
