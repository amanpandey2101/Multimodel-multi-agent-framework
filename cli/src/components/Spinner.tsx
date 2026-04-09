// Spinner component — minimal animated spinner using useInterval
// Pattern mirrors claude-source/components/Spinner.tsx: typed props,
// React.ReactNode return, Box + Text from ink.
import React, { useState, useEffect } from 'react'
import { Text } from 'ink'

const FRAMES = ['◐', '◓', '◑', '◒']

type Props = {
  label?: string
}

export function Spinner({ label }: Props): React.ReactNode {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setFrame(f => (f + 1) % FRAMES.length)
    }, 120)
    return () => clearInterval(id)
  }, [])

  const char = FRAMES[frame] ?? '◐'

  return (
    <Text>
      <Text color="magenta">{char} </Text>
      {label && <Text dimColor>{label}</Text>}
    </Text>
  )
}
