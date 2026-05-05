// components/ApprovalPrompt.tsx — inline y/n prompt for tool approval
import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'

type Props = {
  toolName: string
  args: string
  onDecision: (approved: boolean) => void
}

function formatArgsForDisplay(rawArgs: string): string {
  try {
    const parsed = JSON.parse(rawArgs) as Record<string, unknown>
    return Object.entries(parsed)
      .map(([k, v]) => `  ${k}: ${String(v).slice(0, 100)}`)
      .join('\n')
  } catch {
    return rawArgs.slice(0, 200)
  }
}

export function ApprovalPrompt({ toolName, args, onDecision }: Props): React.ReactNode {
  const [done, setDone] = useState(false)

  useInput((input, _key) => {
    if (done) return
    if (input === 'y' || input === 'Y') {
      setDone(true)
      onDecision(true)
    } else if (input === 'n' || input === 'N' || input === '\x03') {
      setDone(true)
      onDecision(false)
    }
  })

  if (done) return null

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
      marginTop={1}
    >
      <Text bold color="yellow">⚠  Permission required</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Tool: <Text bold>{toolName}</Text></Text>
        <Text dimColor>Arguments:</Text>
        <Box marginLeft={2}>
          <Text dimColor>{formatArgsForDisplay(args)}</Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text>Allow? </Text>
        <Text bold color="green">[y]</Text>
        <Text> / </Text>
        <Text bold color="red">[n]</Text>
      </Box>
    </Box>
  )
}
