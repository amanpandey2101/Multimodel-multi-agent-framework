import React, { useMemo } from 'react';
import { Text } from 'ink';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

export function Markdown({ children }: { children: string }) {
  const rendered = useMemo(() => {
    try {
      const renderer = new TerminalRenderer({
        showSectionPrefix: false,
        unescape: true,
        emoji: true,
        width: 80,
      });

      // Force synchronous parsing for Ink compatibility
      return marked.parse(children || '', { renderer, async: false }) as string;
    } catch (err) {
      return children;
    }
  }, [children]);

  return <Text>{rendered}</Text>;
}
