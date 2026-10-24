import { MAX_CONTEXT_TURNS } from './types'
import type { ApiMessage, ChatTurn } from './types'

export function buildContext(turns: readonly ChatTurn[], question: string): ApiMessage[] {
  const completed = turns.filter(turn => turn.status === 'done').slice(-MAX_CONTEXT_TURNS)
  const history: ApiMessage[] = []
  let characters = question.length
  for (const turn of [...completed].reverse()) {
    const pairLength = turn.prompt.length + turn.answer.length
    if (characters + pairLength > 30000 || turn.answer.length > 16000) break
    history.unshift(
      { role: 'user', content: turn.prompt },
      { role: 'assistant', content: turn.answer },
    )
    characters += pairLength
  }
  return [...history, { role: 'user', content: question }]
}
