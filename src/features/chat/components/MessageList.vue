<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import type { ChatTurn, ReplyStatus, ServiceConfig } from '../types'
import MessageItem from './MessageItem.vue'
import WelcomePanel from './WelcomePanel.vue'

const props = defineProps<{
  turns: readonly Readonly<ChatTurn>[]
  status: 'idle' | ReplyStatus
  canRetry: boolean
  serviceReady: boolean
  mode: ServiceConfig['mode'] | null
}>()

const emit = defineEmits<{
  choosePrompt: [prompt: string]
  retry: []
}>()

const viewport = useTemplateRef<HTMLDivElement>('viewport')
const content = useTemplateRef<HTMLDivElement>('content')
const followLatest = shallowRef(true)
const showLatestButton = shallowRef(false)
let lastScrollTop = 0
let resizeObserver: ResizeObserver | undefined

const statusMessages = {
  idle: '可以开始提问。',
  waiting: '正在准备回答。',
  streaming: '正在回答。',
  done: '回答完成。',
  stopped: '已停止回答，已生成的内容已保留。',
  error: '回答失败，请查看消息中的错误说明。',
} as const
const statusMessage = computed(() => statusMessages[props.status])

function remainingScroll(element: HTMLDivElement) {
  return Math.max(0, element.scrollHeight - element.clientHeight - element.scrollTop)
}

function refreshLatestButton() {
  const element = viewport.value
  showLatestButton.value = Boolean(element && props.turns.length && !followLatest.value && remainingScroll(element) > 4)
}

function scrollToLatest() {
  const element = viewport.value
  if (!element) return
  followLatest.value = true
  element.scrollTop = props.turns.length ? element.scrollHeight : 0
  lastScrollTop = element.scrollTop
  showLatestButton.value = false
}

function syncViewport() {
  if (followLatest.value) scrollToLatest()
  else refreshLatestButton()
}

function handleScroll() {
  const element = viewport.value
  if (!element) return
  // Any intentional upward scroll pauses following, even close to the bottom.
  if (element.scrollTop < lastScrollTop - 1) followLatest.value = false
  else if (remainingScroll(element) <= 4) followLatest.value = true
  lastScrollTop = element.scrollTop
  refreshLatestButton()
}

function handleWheel(event: WheelEvent) {
  if (event.deltaY < 0) {
    followLatest.value = false
    refreshLatestButton()
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.target === viewport.value && ['ArrowUp', 'PageUp', 'Home'].includes(event.key)) {
    followLatest.value = false
    refreshLatestButton()
  }
}

watch(
  () => {
    const latest = props.turns[props.turns.length - 1]
    return [props.turns.length, latest?.id, latest?.attempt, latest?.answer.length, latest?.status, latest?.warning, latest?.error]
  },
  () => {
    if (!props.turns.length) followLatest.value = true
    syncViewport()
  },
  { flush: 'post' },
)

onMounted(() => {
  // Also preserve the follow/read position when input height or viewport changes.
  resizeObserver = new ResizeObserver(syncViewport)
  if (viewport.value) resizeObserver.observe(viewport.value)
  if (content.value) resizeObserver.observe(content.value)
  syncViewport()
})

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <div class="message-list">
    <div
      ref="viewport"
      class="feed"
      tabindex="0"
      role="region"
      aria-label="对话内容"
      aria-live="off"
      @scroll.passive="handleScroll"
      @wheel.passive="handleWheel"
      @keydown="handleKeydown"
    >
      <div ref="content" class="feed-content">
        <WelcomePanel v-if="turns.length === 0" @choose-prompt="emit('choosePrompt', $event)" />
        <ol v-else class="turns" aria-label="当前会话">
          <li v-for="(turn, index) in turns" :key="turn.id" class="turn-item">
            <MessageItem
              :turn="turn"
              :mode="mode"
              :can-retry="canRetry && index === turns.length - 1"
              :service-ready="serviceReady"
              @retry="emit('retry')"
            />
          </li>
        </ol>
      </div>
    </div>
    <button v-show="showLatestButton" class="latest-button" type="button" @click="scrollToLatest">
      回到最新
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <path d="M12 5v14m-6-6 6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ statusMessage }}</p>
  </div>
</template>

<style scoped>
.message-list {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.feed {
  flex: 1;
  min-height: 0;
  padding: 27px 32px 30px;
  overflow-y: auto;
  overscroll-behavior: contain;
  overflow-anchor: none;
  scrollbar-width: thin;
  scrollbar-color: #cad9e1 transparent;
}

.feed:focus-visible {
  outline-offset: -4px;
  border-radius: 4px;
}

.feed-content {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  max-width: 850px;
  margin: 0 auto;
}

.turns {
  display: flex;
  flex-direction: column;
  gap: 32px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.turn-item {
  min-width: 0;
}

.latest-button {
  position: absolute;
  right: 30px;
  bottom: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 6px 13px;
  color: var(--color-accent);
  background: var(--color-paper);
  border: 1px solid #c5d7e0;
  border-radius: 20px;
  box-shadow: 0 3px 12px #20384610;
  font-size: 11px;
}

.latest-button:hover {
  background: var(--color-soft);
}

@media (max-width: 600px) {
  .feed {
    padding: 22px 16px 26px;
  }

  .turns {
    gap: 28px;
  }

  .latest-button {
    right: 16px;
    min-height: 40px;
  }
}
</style>
