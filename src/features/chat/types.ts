export type ReplyStatus = 'waiting' | 'streaming' | 'done' | 'stopped' | 'error'

export interface ChatTurn {
  id: string
  prompt: string
  answer: string
  status: ReplyStatus
  attempt: number
  error?: string
  warning?: string
}

export interface ApiMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ServiceConfig {
  mode: 'mock' | 'deepseek'
  configured: boolean
  model: string
  max_input_chars: number
}

export interface StreamResult {
  finishReason: 'stop' | 'length'
}

export interface StreamOptions {
  signal: AbortSignal
  onDelta: (text: string) => void
}

export type ChatTransport = (
  messages: ApiMessage[],
  options: StreamOptions,
) => Promise<StreamResult>

export const MAX_INPUT_CHARS = 2000
export const MAX_CONTEXT_TURNS = 6
