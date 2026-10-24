import { effectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useChat } from './useChat'
import type { ApiMessage, ChatTransport, StreamOptions, StreamResult } from '../types'

interface PendingRequest extends StreamOptions {
  messages: ApiMessage[]
  resolve: (result: StreamResult) => void
  reject: (error: Error) => void
}
const cleanups: Array<() => void> = []
function setup() {
  const requests: PendingRequest[] = []
  const transport = vi.fn<ChatTransport>((messages, options) => new Promise((resolve, reject) => {
    requests.push({ messages, ...options, resolve, reject })
  }))
  const scope = effectScope()
  const chat = scope.run(() => useChat({ transport }))!
  cleanups.push(() => scope.stop())
  return { chat, requests, transport, scope }
}
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.useRealTimers() })

describe('chat state and cancellation', () => {
  it('rejects whitespace and concurrent sends', async () => {
    const { chat, requests, transport } = setup()
    chat.draft.value = '   '
    await chat.send()
    expect(transport).not.toHaveBeenCalled()
    chat.draft.value = '你好'
    const first = chat.send()
    chat.draft.value = '第二个问题'
    await chat.send()
    expect(transport).toHaveBeenCalledTimes(1)
    requests[0]!.onDelta('你好')
    requests[0]!.resolve({ finishReason: 'stop' })
    await first
    expect(chat.turns.value[0]?.answer).toBe('你好')
    expect(chat.draft.value).toBe('第二个问题')
  })

  it('stops and retains even the buffered partial answer', async () => {
    const { chat, requests } = setup()
    chat.draft.value = '问题'
    const pending = chat.send()
    requests[0]!.onDelta('部分答案')
    chat.stop()
    expect(requests[0]!.signal.aborted).toBe(true)
    expect(chat.turns.value[0]?.answer).toBe('部分答案')
    expect(chat.status.value).toBe('stopped')
    requests[0]!.onDelta('不应写入')
    requests[0]!.resolve({ finishReason: 'stop' })
    await pending
    expect(chat.turns.value[0]?.answer).toBe('部分答案')
    expect(chat.status.value).toBe('stopped')
  })

  it('retries the same question without duplication or stale writes', async () => {
    const { chat, requests } = setup()
    chat.draft.value = '问题'
    const first = chat.send()
    requests[0]!.onDelta('旧回答')
    chat.stop()
    const retry = chat.retry()
    requests[0]!.onDelta('旧请求迟到')
    requests[0]!.resolve({ finishReason: 'stop' })
    requests[1]!.onDelta('新回答')
    requests[1]!.resolve({ finishReason: 'stop' })
    await Promise.all([first, retry])
    expect(chat.turns.value).toHaveLength(1)
    expect(chat.turns.value[0]).toMatchObject({ prompt: '问题', answer: '新回答', status: 'done', attempt: 2 })
    expect(requests[1]!.messages).toEqual([{ role: 'user', content: '问题' }])
  })

  it('keeps partial text on error and allows an explicit retry', async () => {
    const { chat, requests } = setup()
    chat.draft.value = '问题'
    const pending = chat.send()
    requests[0]!.onDelta('部分')
    requests[0]!.reject(new Error('连接中断'))
    await pending
    expect(chat.turns.value[0]).toMatchObject({ answer: '部分', error: '连接中断', status: 'error' })
    expect(chat.canRetry.value).toBe(true)
  })

  it('clears and ignores all callbacks belonging to the previous request', async () => {
    const { chat, requests } = setup()
    chat.draft.value = '旧问题'
    const first = chat.send()
    chat.clear()
    chat.draft.value = '新问题'
    const second = chat.send()
    requests[0]!.onDelta('旧内容')
    requests[0]!.reject(new Error('旧异常'))
    requests[1]!.onDelta('新内容')
    requests[1]!.resolve({ finishReason: 'stop' })
    await Promise.all([first, second])
    expect(chat.turns.value).toHaveLength(1)
    expect(chat.turns.value[0]).toMatchObject({ prompt: '新问题', answer: '新内容', status: 'done' })
  })

  it('batches updates and flushes on completion', async () => {
    vi.useFakeTimers()
    const { chat, requests } = setup()
    chat.draft.value = '问题'
    const pending = chat.send()
    requests[0]!.onDelta('一')
    requests[0]!.onDelta('二')
    expect(chat.turns.value[0]?.answer).toBe('')
    vi.advanceTimersByTime(32)
    expect(chat.turns.value[0]?.answer).toBe('一二')
    requests[0]!.onDelta('三')
    requests[0]!.resolve({ finishReason: 'length' })
    await pending
    expect(chat.turns.value[0]?.answer).toBe('一二三')
    expect(chat.turns.value[0]?.warning).toContain('长度上限')
  })

  it('aborts when the component scope is disposed', async () => {
    const { chat, requests, scope } = setup()
    chat.draft.value = '问题'
    const pending = chat.send()
    scope.stop()
    expect(requests[0]!.signal.aborted).toBe(true)
    requests[0]!.resolve({ finishReason: 'stop' })
    await pending
    expect(chat.turns.value).toHaveLength(0)
  })
})
