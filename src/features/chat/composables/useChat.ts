import { computed, onScopeDispose, readonly, ref, shallowRef } from 'vue'
import { streamChat } from '../api/chat'
import { buildContext } from '../context'
import { MAX_INPUT_CHARS } from '../types'
import type { ApiMessage, ChatTransport, ChatTurn } from '../types'

interface ActiveRequest {
  controller: AbortController
  turnId: string
  buffer: string
  timer?: ReturnType<typeof setTimeout>
}

export function useChat(options: { transport?: ChatTransport } = {}) {
  const transport = options.transport ?? streamChat
  const turns = ref<ChatTurn[]>([])
  const draft = shallowRef('')
  const status = computed(() => turns.value.at(-1)?.status ?? 'idle')
  const busy = computed(() => status.value === 'waiting' || status.value === 'streaming')
  const canRetry = computed(() => status.value === 'error' || status.value === 'stopped')
  let active: ActiveRequest | undefined

  function flush(request: ActiveRequest) {
    clearTimeout(request.timer)
    request.timer = undefined
    if (active !== request) return
    const turn = turns.value.find(item => item.id === request.turnId)
    if (turn && request.buffer) turn.answer += request.buffer
    request.buffer = ''
  }

  async function generate(turnId: string, messages: ApiMessage[]) {
    const request: ActiveRequest = { turnId, controller: new AbortController(), buffer: '' }
    active = request
    try {
      const result = await transport(messages, {
        signal: request.controller.signal,
        onDelta(text) {
          if (active !== request || request.controller.signal.aborted || !text) return
          const turn = turns.value.find(item => item.id === turnId)
          if (!turn) return
          turn.status = 'streaming'
          request.buffer += text
          request.timer ??= setTimeout(() => flush(request), 32)
        },
      })
      if (active !== request) return
      flush(request)
      const turn = turns.value.find(item => item.id === turnId)
      if (turn) {
        turn.status = 'done'
        if (result.finishReason === 'length') turn.warning = '回答达到长度上限，可以继续追问。'
      }
    } catch (error) {
      if (active !== request) return
      flush(request)
      const turn = turns.value.find(item => item.id === turnId)
      if (turn) {
        turn.status = 'error'
        turn.error = error instanceof Error ? error.message : '回答失败，请重试。'
      }
    } finally {
      clearTimeout(request.timer)
      if (active === request) active = undefined
    }
  }

  async function send() {
    const question = draft.value.trim()
    if (busy.value || !question || question.length > MAX_INPUT_CHARS) return
    const messages = buildContext(turns.value, question)
    const turn: ChatTurn = {
      id: crypto.randomUUID(), prompt: question, answer: '', status: 'waiting', attempt: 1,
    }
    turns.value.push(turn)
    draft.value = ''
    await generate(turn.id, messages)
  }

  async function retry() {
    const turn = turns.value.at(-1)
    if (!canRetry.value || !turn) return
    const messages = buildContext(turns.value.slice(0, -1), turn.prompt)
    turn.answer = ''
    turn.error = undefined
    turn.warning = undefined
    turn.status = 'waiting'
    turn.attempt += 1
    await generate(turn.id, messages)
  }

  function stop() {
    if (!active) return
    const request = active
    flush(request)
    const turn = turns.value.find(item => item.id === request.turnId)
    if (turn) turn.status = 'stopped'
    active = undefined
    request.controller.abort()
  }

  function clear() {
    if (active) {
      const request = active
      active = undefined
      clearTimeout(request.timer)
      request.controller.abort()
    }
    turns.value = []
    draft.value = ''
  }

  onScopeDispose(clear)
  return { turns: readonly(turns), draft, busy, status, canRetry, send, retry, stop, clear }
}
