import { describe, expect, it } from 'vitest'
import { createSseParser } from './sse'
import type { SseEvent } from './sse'

describe('incremental SSE parsing', () => {
  it('handles split CRLF, comments and multiline data', () => {
    const events: SseEvent[] = []
    const parser = createSseParser(event => events.push(event))
    const wire = ': heartbeat\r\nevent: delta\r\ndata: first\r\ndata: second\r\n\r\nevent: done\ndata: {}\n\n'
    for (const character of wire) parser.push(character)
    parser.finish()
    expect(events).toEqual([{ event: 'delta', data: 'first\nsecond' }, { event: 'done', data: '{}' }])
  })

  it('does not mistake partial chunks for complete events', () => {
    const events: SseEvent[] = []
    const parser = createSseParser(event => events.push(event))
    parser.push('event: delta\ndata: {"te')
    expect(events).toHaveLength(0)
    parser.push('xt":"中文"}\n\n')
    expect(events).toEqual([{ event: 'delta', data: '{"text":"中文"}' }])
  })

  it('rejects a truncated event rather than completing it', () => {
    const parser = createSseParser(() => undefined)
    parser.push('event: done\ndata: {}')
    expect(() => parser.finish()).toThrow('连接中断')
  })

  it('ignores comments and applies the default event name', () => {
    const events: SseEvent[] = []
    const parser = createSseParser(event => events.push(event))
    parser.push(': keepalive\n\nid: 1\ndata: x\n\n')
    expect(events).toEqual([{ event: 'message', data: 'x' }])
  })
})
