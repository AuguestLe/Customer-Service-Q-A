import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchServiceConfig, streamChat } from './chat'

const prompt = [{ role: 'user' as const, content: '你好' }]
function response(wire: string, splitBytes = false) {
  const bytes = new TextEncoder().encode(wire)
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      if (splitBytes) for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
      else controller.enqueue(bytes)
      controller.close()
    },
  }), { headers: { 'content-type': 'text/event-stream' } })
}
afterEach(() => vi.unstubAllGlobals())

describe('chat HTTP adapter', () => {
  it('decodes UTF-8 split across network bytes and normalizes events', async () => {
    const wire = 'event: delta\r\ndata: {"text":"中文你好"}\r\n\r\nevent: done\ndata: {"finish_reason":"stop"}\n\n'
    const fetcher = vi.fn().mockResolvedValue(response(wire, true))
    vi.stubGlobal('fetch', fetcher)
    const delta = vi.fn()
    const result = await streamChat(prompt, { signal: new AbortController().signal, onDelta: delta })
    expect(delta).toHaveBeenCalledWith('中文你好')
    expect(result).toEqual({ finishReason: 'stop' })
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/chat/stream')
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toEqual({ messages: prompt })
    expect(fetcher.mock.calls[0]?.[1].headers).not.toHaveProperty('Authorization')
  })

  it('reports premature EOF without throwing away received deltas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('event: delta\ndata: {"text":"部分"}\n\n')))
    const delta = vi.fn()
    await expect(streamChat(prompt, { signal: new AbortController().signal, onDelta: delta })).rejects.toThrow('连接中断')
    expect(delta).toHaveBeenCalledWith('部分')
  })

  it('uses safe error messages for pre-stream failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: '尚未配置' }), { status: 503 })))
    await expect(streamChat(prompt, { signal: new AbortController().signal, onDelta: vi.fn() })).rejects.toThrow('尚未配置')
  })

  it('handles mid-stream errors and rejects empty successful replies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('event: error\ndata: {"message":"模型超时"}\n\n')))
    await expect(streamChat(prompt, { signal: new AbortController().signal, onDelta: vi.fn() })).rejects.toThrow('模型超时')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('event: done\ndata: {"finish_reason":"stop"}\n\n')))
    await expect(streamChat(prompt, { signal: new AbortController().signal, onDelta: vi.fn() })).rejects.toThrow('有效文字')
  })

  it('rejects malformed config rather than enabling requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"mode":"unknown"}')))
    await expect(fetchServiceConfig(new AbortController().signal)).rejects.toThrow('无效')
  })
})
