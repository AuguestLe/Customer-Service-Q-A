export interface SseEvent {
  event: string
  data: string
}

/** Incremental SSE parser: network chunks are not event boundaries. */
export function createSseParser(onEvent: (event: SseEvent) => void) {
  let buffer = ''
  let eventName = ''
  let data: string[] = []
  let size = 0

  function consumeLine(line: string) {
    if (line === '') {
      if (data.length) onEvent({ event: eventName || 'message', data: data.join('\n') })
      eventName = ''
      data = []
      size = 0
      return
    }
    if (line.startsWith(':')) return
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') eventName = value
    if (field === 'data') {
      data.push(value)
      size += value.length
      if (size > 1_000_000) throw new Error('流式响应过大，已停止接收。')
    }
  }

  return {
    push(chunk: string) {
      buffer += chunk
      let index: number
      while ((index = buffer.search(/[\r\n]/)) !== -1) {
        // Retain a trailing CR: the next network chunk may start with LF.
        if (buffer[index] === '\r' && index === buffer.length - 1) break
        const line = buffer.slice(0, index)
        const separatorLength = buffer[index] === '\r' && buffer[index + 1] === '\n' ? 2 : 1
        buffer = buffer.slice(index + separatorLength)
        consumeLine(line)
      }
      if (buffer.length > 1_000_000) throw new Error('流式响应过大，已停止接收。')
    },
    finish() {
      if (buffer.endsWith('\r')) {
        consumeLine(buffer.slice(0, -1))
        buffer = ''
      }
      // Never turn a partial data frame into a valid event on EOF.
      if (buffer || data.length) throw new Error('连接中断，未完成的回答已保留。')
    },
  }
}
