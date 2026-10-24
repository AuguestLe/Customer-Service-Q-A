import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChatComposer from './ChatComposer.vue'

function mountComposer(overrides: Record<string, unknown> = {}) {
  return mount(ChatComposer, {
    props: { modelValue: '', busy: false, serviceReady: true, unavailableReason: '', maxChars: 2000, ...overrides },
  })
}

describe('chat input interaction', () => {
  it('does not send whitespace or exceed the input limit', async () => {
    const wrapper = mountComposer({ modelValue: '   ' })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ modelValue: 'x'.repeat(2001) })
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('send')).toBeUndefined()
    expect(wrapper.text()).toContain('超出')
    wrapper.unmount()
  })

  it('sends on Enter but not Shift+Enter or IME confirmation', async () => {
    const wrapper = mountComposer({ modelValue: '问题' })
    const input = wrapper.get('textarea')
    await input.trigger('keydown', { key: 'Enter', shiftKey: true })
    await input.trigger('keydown', { key: 'Enter', isComposing: true })
    await input.trigger('compositionstart')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('send')).toBeUndefined()
    await input.trigger('compositionend')
    wrapper.unmount()
    const ready = mountComposer({ modelValue: '问题' })
    await ready.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(ready.emitted('send')).toHaveLength(1)
    ready.unmount()
  })

  it('keeps drafting available during generation; Enter cannot stop or resubmit', async () => {
    const wrapper = mountComposer({ modelValue: '下一问', busy: true })
    expect(wrapper.get('textarea').attributes('disabled')).toBeUndefined()
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('send')).toBeUndefined()
    expect(wrapper.emitted('stop')).toBeUndefined()
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)
    wrapper.unmount()
  })

  it('blocks submission while the backend is unconfigured', async () => {
    const wrapper = mountComposer({ modelValue: '问题', serviceReady: false })
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('send')).toBeUndefined()
    wrapper.unmount()
  })
})
