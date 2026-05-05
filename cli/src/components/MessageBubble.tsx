// components/MessageBubble.tsx — renders user/assistant messages in the chat
import React from 'react'
import { Box, Text } from 'ink'
import { Markdown } from './Markdown';

type Role = 'user' | 'assistant'

type Props = {
  role: Role
  content: string
}

export function MessageBubble({ role, content }: Props): React.ReactNode {
  if (role === 'user') {
    return (
      <Box marginTop={1}>
        <Box flexDirection="column">
          <Text color="cyan" bold>▶ You</Text>
          <Box marginLeft={2}>
            <Markdown>{content}</Markdown>
          </Box>
        </Box>
      </Box>
    )
  }

  // assistant
  return (
    <Box marginTop={1}>
      <Box flexDirection="column">
        <Text color="magenta" bold>◈ AgentiX</Text>
        <Box marginLeft={2} flexDirection="column">
          <Markdown>{content}</Markdown>
        </Box>
      </Box>
    </Box>
  )
}
