import { test, expect } from '@playwright/test'

const success = (text: string) => `event: delta\ndata: ${JSON.stringify({ text })}\n\nevent: done\ndata: {"finish_reason":"stop"}\n\n`

test('real local API mock stream: send, copy, follow-up, clear and refresh', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const requests: unknown[] = []
  page.on('request', request => {
    if (request.url().endsWith('/api/chat/stream')) requests.push(request.postDataJSON())
  })
  await page.goto('/')
  await expect(page.getByText('模拟模式 · 非真实 DeepSeek 回复')).toBeVisible()
  const input = page.getByRole('textbox', { name: '输入你的问题' })
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '填入问题：用简单的话解释一下，什么是 API？' }).click()
  await expect(input).toHaveValue('用简单的话解释一下，什么是 API？')
  await expect(page.getByRole('article', { name: '你的问题' })).toHaveCount(0)
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止回答' })).toBeVisible()
  await expect(page.getByRole('button', { name: '复制回答', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '复制回答', exact: true }).click()
  await expect(page.getByText('已复制回答。', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('API')
  await input.fill('请再解释一下')
  await input.press('Enter')
  await expect(page.getByRole('button', { name: '复制回答', exact: true })).toHaveCount(2)
  expect(requests[1]).toMatchObject({ messages: [
    { role: 'user', content: '用简单的话解释一下，什么是 API？' },
    { role: 'assistant' },
    { role: 'user', content: '请再解释一下' },
  ] })
  await page.getByRole('button', { name: '清空对话', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '保留对话' }).click()
  await expect(page.getByRole('article', { name: '你的问题' })).toHaveCount(2)
  await page.getByRole('button', { name: '清空对话', exact: true }).click()
  await page.getByRole('button', { name: '确认清空' }).click()
  await expect(page.getByRole('heading', { name: '有问题，直接问。' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('article', { name: '你的问题' })).toHaveCount(0)
})

test('stop retains a partial answer; regenerate replaces only the last reply', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('模拟模式 · 非真实 DeepSeek 回复')).toBeVisible()
  await page.getByRole('textbox').fill('什么是 API？')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.locator('.answer-text')).toContainText('API')
  await page.getByRole('button', { name: '停止回答' }).click()
  await expect(page.getByText('已停止', { exact: true })).toBeVisible()
  const partial = await page.locator('.answer-text').innerText()
  expect(partial.length).toBeGreaterThan(0)
  await page.getByRole('button', { name: '重新生成' }).click()
  await expect(page.getByRole('button', { name: '复制回答', exact: true })).toBeVisible()
  await expect(page.getByRole('article', { name: '你的问题' })).toHaveCount(1)
  await expect(page.getByText('第 2 次尝试')).toBeVisible()
})

test('failed stream can be retried and malicious content stays plain text', async ({ page }) => {
  let call = 0
  await page.route('**/api/chat/stream', route => {
    call++
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: call === 1
      ? 'event: delta\ndata: {"text":"部分回答"}\n\nevent: error\ndata: {"message":"测试连接中断"}\n\n'
      : success('<img src=x onerror="window.injected=true">重试成功') })
  })
  await page.goto('/')
  await expect(page.getByText('模拟模式 · 非真实 DeepSeek 回复')).toBeVisible()
  await page.getByRole('textbox').fill('测试失败重试')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('测试连接中断', { exact: true })).toBeVisible()
  await expect(page.locator('.answer-text')).toHaveText('部分回答')
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.getByRole('button', { name: '复制回答', exact: true })).toBeVisible()
  await expect(page.getByRole('article', { name: '你的问题' })).toHaveCount(1)
  await expect(page.locator('.answer-text')).toContainText('<img')
  await expect(page.locator('.answer-text img')).toHaveCount(0)
})

test('unconfigured service blocks sends, and small viewport has no horizontal overflow', async ({ page }) => {
  await page.route('**/api/config', route => route.fulfill({ json: {
    mode: 'deepseek', configured: false, model: 'deepseek-flash', max_input_chars: 2000,
  } }))
  await page.goto('/')
  await expect(page.getByText('尚未配置 DeepSeek', { exact: true }).first()).toBeVisible()
  await page.getByRole('textbox').fill('你好')
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '重新检查' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('small-screen welcome begins at the top instead of auto-scrolling down', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/')
  await expect(page.getByText('模拟模式 · 非真实 DeepSeek 回复')).toBeVisible()
  const feed = page.getByRole('region', { name: '对话内容', exact: true })
  await expect.poll(() => feed.evaluate(element => element.scrollTop)).toBe(0)
  await expect(page.locator('.welcome-symbol')).toBeInViewport({ ratio: 1 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('clear while streaming prevents late content from returning', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('模拟模式 · 非真实 DeepSeek 回复')).toBeVisible()
  await page.getByRole('textbox').fill('什么是 API？')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止回答' })).toBeVisible()
  await page.getByRole('button', { name: '清空对话', exact: true }).click()
  await page.getByRole('button', { name: '确认清空' }).click()
  await expect(page.getByRole('heading', { name: '有问题，直接问。' })).toBeVisible()
  await page.getByRole('textbox').fill('新问题')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('button', { name: '复制回答', exact: true })).toBeVisible()
  await expect(page.getByRole('article', { name: '你的问题' })).toHaveCount(1)
  await expect(page.locator('.user-text')).toHaveText('新问题')
})

test('reading earlier content pauses auto-follow until returning to latest', async ({ page }) => {
  let call = 0
  await page.route('**/api/chat/stream', route => {
    call++
    return call === 1
      ? route.fulfill({ status: 200, contentType: 'text/event-stream', body: success('用于验证滚动阅读的历史内容。\n'.repeat(40)) })
      : route.continue()
  })
  await page.goto('/')
  await expect(page.getByText('模拟模式 · 非真实 DeepSeek 回复')).toBeVisible()
  await page.getByRole('textbox').fill('先给一段较长的回答')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('button', { name: '复制回答', exact: true })).toBeVisible()
  const feed = page.getByRole('region', { name: '对话内容', exact: true })
  expect(await feed.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  await page.getByRole('textbox').fill('什么是 API？')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  const answer = page.locator('.answer-text').nth(1)
  await expect(answer).toContainText('API')
  await feed.hover()
  await page.mouse.wheel(0, -500)
  const latest = page.getByRole('button', { name: '回到最新' })
  await expect(latest).toBeVisible()
  const position = await feed.evaluate(element => element.scrollTop)
  const length = (await answer.innerText()).length
  await expect.poll(async () => (await answer.innerText()).length).toBeGreaterThan(length + 12)
  expect(Math.abs(await feed.evaluate(element => element.scrollTop) - position)).toBeLessThan(3)
  await latest.click()
  await expect(latest).toBeHidden()
  await expect.poll(() => feed.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(5)
  await expect(page.getByRole('button', { name: '复制回答', exact: true })).toHaveCount(2)
  await page.reload()
  await expect(page.getByRole('heading', { name: '有问题，直接问。' })).toBeVisible()
  await expect(page.getByRole('article', { name: '你的问题' })).toHaveCount(0)
})

test('clipboard permission failure selects the answer for manual copying', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('Permission denied') } },
    })
  })
  await page.route('**/api/chat/stream', route => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: success('可以手动复制的回答'),
  }))
  await page.goto('/')
  await expect(page.getByText('模拟模式 · 非真实 DeepSeek 回复')).toBeVisible()
  await page.getByRole('textbox').fill('测试复制兜底')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '复制回答', exact: true }).click()
  await expect(page.getByText('自动复制失败，已选中回答文字，请使用系统复制功能手动复制。')).toBeVisible()
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('可以手动复制的回答')
})
