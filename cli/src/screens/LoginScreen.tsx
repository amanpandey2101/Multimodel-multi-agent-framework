// LoginScreen — email + password form.
// Pattern: typed Props, React.ReactNode, TextInput from ink-text-input,
// useInput from ink for key handling — mirrors claude-source form screens.
import React, { useState, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { Spinner } from '../components/Spinner.js'
import * as api from '../api.js'

type Props = {
  onSuccess: (email: string) => void
  onError: (msg: string) => void
}

type Field = 'email' | 'password'

export function LoginScreen({ onSuccess, onError }: Props): React.ReactNode {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [focus, setFocus] = useState<Field>('email')
  const [loading, setLoading] = useState(false)

  const submit = useCallback(async () => {
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    try {
      await api.login(email.trim(), password)
      onSuccess(email.trim())
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }, [email, password, onSuccess, onError])

  useInput((_input, key) => {
    if (loading) return
    if (key.tab) {
      setFocus(f => (f === 'email' ? 'password' : 'email'))
    }
    if (key.return && focus === 'password') {
      void submit()
    }
  })

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Brand */}
      <Box marginBottom={1}>
        <Text bold color="magenta">◈ Multi-Agent</Text>
        <Text dimColor>  Autonomous Engineering Platform</Text>
      </Box>

      <Box borderStyle="round" borderColor="magenta" flexDirection="column" paddingX={2} paddingY={1} width={50}>
        <Text bold>Sign in</Text>
        <Box marginTop={1} flexDirection="column" gap={1}>

          {/* Email */}
          <Box flexDirection="column">
            <Text dimColor>Email</Text>
            <Box borderStyle="single" borderColor={focus === 'email' ? 'magenta' : 'gray'} paddingX={1}>
              <TextInput
                value={email}
                onChange={setEmail}
                onSubmit={() => setFocus('password')}
                focus={focus === 'email' && !loading}
                placeholder="you@example.com"
              />
            </Box>
          </Box>

          {/* Password */}
          <Box flexDirection="column">
            <Text dimColor>Password</Text>
            <Box borderStyle="single" borderColor={focus === 'password' ? 'magenta' : 'gray'} paddingX={1}>
              <TextInput
                value={password}
                onChange={setPassword}
                onSubmit={() => void submit()}
                focus={focus === 'password' && !loading}
                mask="*"
                placeholder="••••••••"
              />
            </Box>
          </Box>

        </Box>

        <Box marginTop={1}>
          {loading
            ? <Spinner label="Signing in…" />
            : <Text dimColor>Tab to switch · Enter to sign in</Text>
          }
        </Box>
      </Box>
    </Box>
  )
}
