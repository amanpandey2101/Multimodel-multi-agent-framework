// StatusLine — bottom status bar, mirrors claude-source StatusLine.tsx pattern.
// Shows current screen context + key hints.
import React from 'react'
import { Box, Text, useStdout } from 'ink'
import type { Screen } from '../types'

type Props = {
  screen: Screen
  userEmail?: string
  error?: string | null
}

const HINTS: Record<Screen['type'], string> = {
  splash:       '',
  login:        'Tab to switch field · Enter to submit',
  projects:     'c  chat agent · n  new project · Enter  open · ?  help · q  quit',
  pipelines:    'n  new pipeline · Enter  watch · Esc  back · q  quit',
  'new-pipeline': 'Tab  next field · Enter  confirm · Esc  cancel',
  watch:        'q  back',
  help:         'Esc  back',
  chat:         'Esc  menu · /help  commands · /clear  reset',
}

export function StatusLine({ screen, userEmail, error }: Props): React.ReactNode {
  const { stdout } = useStdout()
  const cols = stdout?.columns ?? 80

  const hint = HINTS[screen.type] ?? ''
  const user = userEmail ? ` ${userEmail} ` : ''
  const pad = Math.max(0, cols - hint.length - user.length - 4)

  if (error) {
    return (
      <Box borderStyle="single" borderColor="red" paddingX={1}>
        <Text color="red">✕ {error}</Text>
      </Box>
    )
  }

  return (
    <Box paddingX={1}>
      <Text dimColor>{hint}</Text>
      <Text>{' '.repeat(pad)}</Text>
      {userEmail && <Text color="magenta">{user}</Text>}
    </Box>
  )
}
