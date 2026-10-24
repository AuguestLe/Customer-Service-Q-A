import { describe, expect, it } from 'vitest'
import { buildContext } from './context'
import type { ChatTurn } from './types'

const turn = (id: number, status: ChatTurn['status'] = 'done'): ChatTurn => ({
  id: String(id), prompt: '问题' + id, answer: '回答' + id, status, attempt: 1,
})

describe('conversation context', () => {
  it('keeps only the last six completed turns and the current question', () => {
    const result = buildContext(Array.from({ length: 8 }, (_, index) => turn(index)), '新问题')
    expect(result).toHaveLength(13)
    expect(result[0]?.content).toBe('问题2')
    expect(result.at(-1)).toEqual({ role: 'user', content: '新问题' })
  })
  it('excludes stopped and failed pairs', () => {
    const result = buildContext([turn(1), turn(2, 'stopped'), turn(3, 'error')], '新问题')
    expect(result.map(item => item.content)).toEqual(['问题1', '回答1', '新问题'])
  })
  it('bounds total context without splitting a user/assistant pair', () => {
    const turns = Array.from({ length: 6 }, (_, index) => ({ ...turn(index), answer: 'x'.repeat(15000) }))
    const result = buildContext(turns, '新问题')
    expect(result).toHaveLength(3)
    expect(result.reduce((sum, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(30000)
  })
})
