import type { ChatTransport, ServiceConfig, StreamResult } from '../types'
import { createSseParser } from './sse'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function responseError(response: Response): Promise<Error> {
  try {
    const payload: unknown = await response.json()
    if (record(payload) && typeof payload.message === 'string') return new Error(payload.message)
  } catch {
    // Proxy HTML and infrastructure errors are not safe to show as an answer.
  }
  return new Error(`请求失败（${response.status}），请检查后端服务后重试。`)
}

export async function fetchServiceConfig(signal: AbortSignal): Promise<ServiceConfig> {
  const response = await fetch('/api/config', { signal, cache: 'no-store' })
  if (!response.ok) throw await responseError(response)
  const value: unknown = await response.json()
  if (
    !record(value) || !['mock', 'deepseek'].includes(String(value.mode)) ||
    typeof value.configured !== 'boolean' || typeof value.model !== 'string' ||
    typeof value.max_input_chars !== 'number'
  ) throw new Error('后端返回了无效的服务配置。')
  return {
    mode: value.mode === 'mock' ? 'mock' : 'deepseek',
    configured: value.configured,
    model: value.model,
    max_input_chars: value.max_input_chars,
  }
}

export const streamChat: ChatTransport = async (messages, options) => {
  const controller = new AbortController()
  let timedOut = false
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const forwardAbort = () => controller.abort()
  const armTimeout = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => { timedOut = true; controller.abort() }, 45_000)
  }
  options.signal.addEventListener('abort', forwardAbort, { once: true })
  if (options.signal.aborted) controller.abort()
  armTimeout()

  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ messages }),
      signal: controller.signal,
    })
    if (!response.ok) throw await responseError(response)
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
      throw new Error('未收到流式响应，请检查后端服务。')
    }
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let result: StreamResult | undefined
    let answerLength = 0
    let hasText = false
    const parser = createSseParser(({ event, data }) => {
      if (result || !['delta', 'done', 'error'].includes(event)) return
      let payload: unknown
      try { payload = JSON.parse(data) } catch { throw new Error('回答数据格式异常，请重试。') }
      if (!record(payload)) throw new Error('回答数据格式异常，请重试。')
      if (event === 'error') {
        throw new Error(typeof payload.message === 'string' ? payload.message : '回答失败，请重试。')
      }
      if (event === 'delta') {
        if (typeof payload.text !== 'string') throw new Error('回答数据格式异常，请重试。')
        answerLength += payload.text.length
        hasText ||= Boolean(payload.text.trim())
        if (answerLength > 16000) throw new Error('回答超出本页长度限制，已保留部分内容。')
        if (!options.signal.aborted) options.onDelta(payload.text)
      } else {
        if (!hasText) throw new Error('模型没有返回有效文字，请重试。')
        if (!['stop', 'length'].includes(String(payload.finish_reason))) {
          throw new Error('回答没有正常结束，请重试。')
        }
        result = { finishReason: payload.finish_reason === 'length' ? 'length' : 'stop' }
      }
    })
    reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        parser.push(decoder.decode())
        parser.finish()
        break
      }
      armTimeout()
      parser.push(decoder.decode(value, { stream: true }))
      if (result) break
    }
    if (!result) throw new Error('连接中断，未完成的回答已保留，请手动重试。')
    return result
  } catch (error) {
    if (timedOut) throw new Error('连接长时间没有响应，请检查网络后重试。')
    if (error instanceof TypeError && !options.signal.aborted) {
      throw new Error('无法连接服务，请检查网络和 Python 后端是否已启动。')
    }
    throw error
  } finally {
    clearTimeout(idleTimer)
    options.signal.removeEventListener('abort', forwardAbort)
    await reader?.cancel().catch(() => undefined)
    reader?.releaseLock()
    controller.abort()
  }
}
