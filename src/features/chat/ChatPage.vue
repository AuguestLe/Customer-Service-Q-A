<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useChat } from './composables/useChat'
import { useServiceConfig } from './composables/useServiceConfig'
import { MAX_INPUT_CHARS } from './types'
import ChatHeader from './components/ChatHeader.vue'
import MessageList from './components/MessageList.vue'
import ChatComposer from './components/ChatComposer.vue'
import ClearDialog from './components/ClearDialog.vue'

const { turns, draft, busy, status, canRetry, send, retry, stop, clear } = useChat()
const { config, loading, error, reload } = useServiceConfig()
const composer = useTemplateRef<InstanceType<typeof ChatComposer>>('composer')
const clearDialogOpen = shallowRef(false)

const hasTurns = computed(() => turns.value.length > 0)
const maxChars = computed(() => Math.min(MAX_INPUT_CHARS, config.value?.max_input_chars ?? MAX_INPUT_CHARS))
const serviceReady = computed(() => Boolean(
  !loading.value && !error.value && config.value
  && (config.value.mode === 'mock' || (config.value.mode === 'deepseek' && config.value.configured)),
))
const servicePresentation = computed(() => {
  if (loading.value) {
    return { tone: 'neutral', label: '正在读取服务配置…', detail: '暂时无法发送，可以先准备你的问题。', canReload: false }
  }
  if (error.value) {
    return { tone: 'error', label: '服务配置读取失败', detail: error.value, canReload: true }
  }
  if (!config.value) {
    return { tone: 'neutral', label: '服务配置尚未就绪', detail: '请重新检查后再发送问题。', canReload: true }
  }
  if (config.value.mode === 'mock') {
    return { tone: 'mock', label: '模拟模式 · 非真实 DeepSeek 回复', detail: '回复由后端模拟，仅用于体验问答交互。', canReload: false }
  }
  if (!config.value.configured) {
    return {
      tone: 'error',
      label: '尚未配置 DeepSeek',
      detail: '尚未配置 DeepSeek：在 backend/.env 中填写 DEEPSEEK_API_KEY，重启后端后重新检查。',
      canReload: true,
    }
  }
  return {
    tone: 'ready',
    label: 'DeepSeek · 配置已就绪',
    detail: `模型：${config.value.model} · 尚未验证实际连通性`,
    canReload: false,
  }
})

function choosePrompt(prompt: string) {
  draft.value = prompt
  void composer.value?.focus()
}

function sendQuestion() {
  if (serviceReady.value) void send()
}

function retryAnswer() {
  if (serviceReady.value && canRetry.value) void retry()
}

function confirmClear() {
  clearDialogOpen.value = false
  clear()
  void composer.value?.focus()
}
</script>

<template>
  <main class="chat-page">
    <div class="page-top">
      <div class="brand">
        <span class="brand-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3H3V6a2 2 0 0 1 2-2Z" stroke-linejoin="round" />
            <path d="M8 9h8M8 13h5" stroke-linecap="round" />
          </svg>
        </span>
        <span>问一问</span>
        <span class="page-context">客服问答</span>
      </div>
      <span class="session-note">仅当前页面 · 刷新后清空</span>
    </div>
    <section class="chat-card" aria-labelledby="chat-title">
      <ChatHeader :can-clear="hasTurns" @clear="clearDialogOpen = true" />
      <section class="service-banner" :class="`service-${servicePresentation.tone}`" aria-label="服务状态">
        <span class="service-mark" aria-hidden="true"></span>
        <div class="service-copy" role="status" aria-live="polite" aria-atomic="true">
          <strong class="service-label">{{ servicePresentation.label }}</strong>
          <span class="service-detail">{{ servicePresentation.detail }}</span>
        </div>
        <button v-if="servicePresentation.canReload" class="reload-button" type="button" :disabled="loading" @click="reload">重新检查</button>
      </section>
      <MessageList
        :turns="turns"
        :status="status"
        :can-retry="canRetry"
        :service-ready="serviceReady"
        :mode="config?.mode ?? null"
        @choose-prompt="choosePrompt"
        @retry="retryAnswer"
      />
      <ChatComposer
        ref="composer"
        v-model="draft"
        :busy="busy"
        :service-ready="serviceReady"
        :unavailable-reason="servicePresentation.label"
        :max-chars="maxChars"
        @send="sendQuestion"
        @stop="stop"
      />
    </section>
    <ClearDialog :open="clearDialogOpen" :busy="busy" @cancel="clearDialogOpen = false" @confirm="confirmClear" />
  </main>
</template>

<style scoped>
.chat-page {
  width: calc(100% - 64px);
  max-width: 1100px;
  margin: 0 auto;
  padding: 26px 0 24px;
}

.page-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 21px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
}

.brand-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 29px;
  height: 29px;
  color: white;
  background: var(--color-accent);
  border-radius: 8px;
}

.page-context {
  margin-left: 6px;
  padding-left: 16px;
  color: var(--color-muted);
  border-left: 1px solid #cdd9e0;
  font-size: 12px;
  font-weight: 400;
}

.session-note {
  color: var(--color-muted);
  font-size: 11px;
  text-align: right;
}

.chat-card {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 101px);
  height: calc(100dvh - 101px);
  min-height: 460px;
  max-height: 1100px;
  overflow: hidden;
  background: var(--color-paper);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  box-shadow: 0 6px 28px #20384605;
}

.service-banner {
  display: flex;
  flex: none;
  align-items: center;
  gap: 9px;
  min-height: 40px;
  padding: 9px 28px;
  color: var(--color-muted);
  background: #f6f8fa;
  font-size: 11px;
}

.service-mark {
  flex: none;
  width: 5px;
  height: 5px;
  background: currentColor;
  border-radius: 50%;
}

.service-copy {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 12px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.service-label {
  font-weight: 600;
}

.service-detail {
  white-space: pre-wrap;
}

.service-mock {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.service-ready {
  color: var(--color-accent);
  background: #f1f6f8;
}

.service-error {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.reload-button {
  flex: none;
  min-height: 32px;
  padding: 4px 10px;
  color: inherit;
  background: var(--color-paper);
  border: 1px solid currentColor;
  border-radius: 6px;
  font-size: 11px;
}

.reload-button:hover:not(:disabled) {
  background: #ffffff99;
}

.reload-button:disabled {
  opacity: 0.5;
}

@media (max-width: 600px) {
  .chat-page {
    width: calc(100% - 24px);
    padding: 15px 0 12px;
  }

  .page-top {
    gap: 10px;
    margin-bottom: 15px;
  }

  .brand {
    gap: 8px;
    font-size: 14px;
  }

  .page-context {
    display: none;
  }

  .session-note {
    font-size: 10px;
  }

  .chat-card {
    height: calc(100vh - 71px);
    height: calc(100dvh - 71px);
    min-height: 420px;
    border-radius: 14px;
  }

  .service-banner {
    gap: 7px;
    padding: 9px 16px;
  }

  .service-copy {
    display: block;
  }

  .service-detail {
    display: block;
    margin-top: 2px;
  }

  .reload-button {
    min-height: 40px;
    padding: 5px 8px;
  }
}

@media (max-height: 600px) {
  .chat-card {
    min-height: 360px;
  }
}
</style>
