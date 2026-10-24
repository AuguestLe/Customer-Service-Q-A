<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import type { ChatTurn, ServiceConfig } from '../types'

const props = defineProps<{
  turn: Readonly<ChatTurn>
  mode: ServiceConfig['mode'] | null
  canRetry: boolean
  serviceReady: boolean
}>()

const emit = defineEmits<{
  retry: []
}>()

const answerText = useTemplateRef<HTMLParagraphElement>('answerText')
const copying = shallowRef(false)
const copyFeedback = shallowRef('')
const copyFailed = shallowRef(false)
let copyOperation = 0

const statusLabels = {
  waiting: '等待回答',
  streaming: '正在回答…',
  done: '回答完成',
  stopped: '已停止',
  error: '回答失败',
} as const

const statusLabel = computed(() => statusLabels[props.turn.status])
const terminal = computed(() => ['done', 'stopped', 'error'].includes(props.turn.status))
const retryable = computed(() => props.canRetry && (props.turn.status === 'error' || props.turn.status === 'stopped'))
const retryLabel = computed(() => props.turn.status === 'stopped' ? '重新生成' : '重试')
const copyLabel = computed(() => {
  if (copying.value) return '正在复制…'
  return props.turn.status === 'done' ? '复制回答' : '复制已有内容'
})
const errorText = computed(() => props.turn.error || '本次回答未能完成，请稍后重试。')

function selectAnswer(): boolean {
  const element = answerText.value
  const selection = window.getSelection()
  if (!element || !selection) return false
  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

async function copyAnswer() {
  if (copying.value || !terminal.value || !props.turn.answer) return
  const operation = ++copyOperation
  copying.value = true
  copyFeedback.value = ''
  copyFailed.value = false

  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
    await navigator.clipboard.writeText(props.turn.answer)
    if (operation !== copyOperation) return
    copyFeedback.value = '已复制回答。'
  } catch {
    if (operation !== copyOperation) return
    copyFailed.value = true
    copyFeedback.value = selectAnswer()
      ? '自动复制失败，已选中回答文字，请使用系统复制功能手动复制。'
      : '自动复制失败，请选中回答文字，使用系统复制功能手动复制。'
  } finally {
    if (operation === copyOperation) copying.value = false
  }
}

watch(
  () => [props.turn.id, props.turn.attempt],
  () => {
    copyOperation += 1
    copying.value = false
    copyFeedback.value = ''
    copyFailed.value = false
  },
  { flush: 'sync' },
)

onBeforeUnmount(() => { copyOperation += 1 })
</script>

<template>
  <div class="turn">
    <article class="user-message" aria-label="你的问题">
      <p class="user-text">{{ turn.prompt }}</p>
    </article>
    <article class="assistant-message" :aria-label="mode === 'mock' ? 'AI 的模拟回答' : 'AI 的回答'">
      <div class="assistant-avatar" aria-hidden="true">AI</div>
      <div class="assistant-body">
        <div class="message-meta">
          <span class="assistant-name">AI 咨询助手</span>
          <span v-if="mode === 'mock'" class="mode-label mock-label">模拟回复</span>
          <span v-else-if="mode === 'deepseek'" class="mode-label">DeepSeek</span>
          <span v-if="turn.attempt > 1" class="attempt-label">第 {{ turn.attempt }} 次尝试</span>
        </div>
        <p v-if="turn.answer" ref="answerText" class="answer-text">{{ turn.answer }}</p>
        <p v-if="turn.status === 'waiting'" class="waiting-text">
          <span class="waiting-dot" aria-hidden="true"></span>
          正在准备回答…
        </p>
        <p v-else-if="!turn.answer && turn.status === 'stopped'" class="empty-answer">已在回答开始前停止。</p>
        <p v-else-if="!turn.answer && turn.status === 'error'" class="empty-answer">本次未能生成回答。</p>
        <div v-if="turn.status === 'error'" class="error-notice">
          <p class="notice-text">{{ errorText }}</p>
          <p v-if="turn.answer" class="partial-note">本次回答未完成，已收到的文字已保留。</p>
        </div>
        <p v-if="turn.warning" class="warning-notice">{{ turn.warning }}</p>
        <div class="message-footer">
          <span class="reply-status" :class="`status-${turn.status}`">
            <span v-if="turn.status === 'streaming'" class="stream-dot" aria-hidden="true"></span>
            {{ statusLabel }}
          </span>
          <button
            v-if="retryable"
            class="message-action retry-action"
            type="button"
            :disabled="!serviceReady"
            :title="serviceReady ? undefined : '服务尚未就绪，请先重新检查服务配置'"
            @click="emit('retry')"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
              <path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            {{ retryLabel }}
          </button>
          <button v-if="terminal && turn.answer" class="message-action" type="button" :disabled="copying" @click="copyAnswer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <rect x="8" y="8" width="12" height="13" rx="2" />
              <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
            </svg>
            {{ copyLabel }}
          </button>
        </div>
        <p class="copy-feedback" :class="{ 'copy-failed': copyFailed }" role="status" aria-live="polite" aria-atomic="true">{{ copyFeedback }}</p>
      </div>
    </article>
  </div>
</template>

<style scoped>
.turn {
  display: flex;
  flex-direction: column;
  gap: 25px;
}

.user-message {
  display: flex;
  justify-content: flex-end;
  padding-left: 48px;
}

.user-text {
  max-width: 85%;
  margin: 0;
  padding: 12px 17px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--color-soft);
  border: 1px solid #dbe8ef;
  border-radius: 15px 15px 3px 15px;
  line-height: 1.9;
}

.assistant-message {
  display: flex;
  align-items: flex-start;
  gap: 11px;
}

.assistant-avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  margin-top: 1px;
  color: var(--color-accent);
  background: var(--color-soft);
  border: 1px solid #cddfe7;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.assistant-body {
  flex: 1;
  min-width: 0;
  padding-top: 1px;
}

.message-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 9px;
  margin-bottom: 9px;
  color: var(--color-muted);
  font-size: 11px;
}

.assistant-name {
  color: var(--color-ink);
  font-weight: 600;
}

.mode-label {
  padding: 1px 6px;
  color: var(--color-accent);
  background: var(--color-soft);
  border-radius: 4px;
  font-size: 10px;
}

.mock-label {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.attempt-label {
  font-size: 10px;
}

.answer-text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
  line-height: 1.95;
}

.waiting-text,
.empty-answer {
  margin: 0;
  padding: 3px 0;
  color: var(--color-muted);
  font-size: 13px;
}

.waiting-text {
  display: flex;
  align-items: center;
  gap: 8px;
}

.waiting-dot,
.stream-dot {
  display: inline-block;
  flex: none;
  width: 6px;
  height: 6px;
  background: #7199a9;
  border-radius: 50%;
}

.stream-dot {
  animation: breathe 1.4s ease-in-out infinite;
}

.message-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px 10px;
  min-height: 28px;
  margin-top: 10px;
  color: var(--color-muted);
  font-size: 11px;
}

.reply-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.status-stopped {
  padding: 2px 7px;
  background: var(--color-bg);
  border-radius: 5px;
}

.status-error {
  color: var(--color-danger);
}

.message-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  padding: 4px 8px;
  color: var(--color-accent);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 11px;
}

.retry-action {
  background: var(--color-soft);
}

.message-action:hover:not(:disabled) {
  background: #e3eef3;
}

.message-action:disabled {
  opacity: 0.5;
}

.error-notice,
.warning-notice {
  margin: 12px 0 0;
  padding: 9px 12px;
  overflow-wrap: anywhere;
  border: 1px solid;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.8;
}

.error-notice {
  color: var(--color-danger);
  background: var(--color-danger-bg);
  border-color: var(--color-danger-line);
}

.notice-text {
  margin: 0;
  white-space: pre-wrap;
}

.partial-note {
  margin: 4px 0 0;
  font-size: 11px;
}

.warning-notice {
  color: var(--color-warning);
  white-space: pre-wrap;
  background: var(--color-warning-bg);
  border-color: var(--color-warning-line);
}

.copy-feedback {
  margin: 6px 0 0;
  color: var(--color-accent);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.copy-feedback:empty {
  margin: 0;
}

.copy-failed {
  color: var(--color-warning);
}

@keyframes breathe {
  50% { opacity: 0.35; }
}

@media (max-width: 600px) {
  .turn {
    gap: 22px;
  }

  .user-message {
    padding-left: 25px;
  }

  .user-text {
    max-width: 95%;
    padding: 10px 13px;
    font-size: 13px;
  }

  .assistant-message {
    gap: 9px;
  }

  .assistant-avatar {
    width: 27px;
    height: 27px;
  }

  .answer-text {
    font-size: 13px;
  }

  .message-action {
    min-height: 38px;
  }
}
</style>
