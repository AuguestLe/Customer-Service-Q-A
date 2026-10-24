<script setup lang="ts">
import { computed, nextTick, onMounted, shallowRef, useTemplateRef, watch } from 'vue'

const draft = defineModel<string>({ required: true })

const props = defineProps<{
  busy: boolean
  serviceReady: boolean
  unavailableReason: string
  maxChars: number
}>()

const emit = defineEmits<{
  send: []
  stop: []
}>()

const input = useTemplateRef<HTMLTextAreaElement>('input')
const composing = shallowRef(false)
let compositionEndedAt = -Infinity

const characterCount = computed(() => draft.value.length)
const overLimit = computed(() => characterCount.value > props.maxChars)
const canSend = computed(
  () => props.serviceReady && !props.busy && !composing.value && !overLimit.value && draft.value.trim().length > 0,
)
const inputHelp = computed(() => props.busy
  ? '回答中，可以先编辑下一条问题'
  : 'Enter 发送 · Shift+Enter 换行',
)
const limitHelp = computed(() => {
  if (overLimit.value) return `已超出 ${characterCount.value - props.maxChars} 个字符，请删减后发送。`
  if (characterCount.value === props.maxChars) return '已达到输入上限。'
  return ''
})

function resizeInput() {
  const element = input.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.min(Math.max(element.scrollHeight, 62), 148)}px`
}

async function focus() {
  await nextTick()
  const element = input.value
  if (!element) return
  element.focus({ preventScroll: true })
  element.setSelectionRange(element.value.length, element.value.length)
}

function submit() {
  if (!canSend.value) return
  emit('send')
  void focus()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  // Some IMEs (including Safari) finish composition before the confirming Enter.
  if (event.isComposing || composing.value || event.keyCode === 229 || performance.now() - compositionEndedAt < 50) return
  event.preventDefault()
  // Enter never stops an answer or starts a concurrent request.
  submit()
}

function finishComposition() {
  composing.value = false
  compositionEndedAt = performance.now()
}

watch(draft, resizeInput, { flush: 'post' })
onMounted(resizeInput)
defineExpose({ focus })
</script>

<template>
  <div class="composer-area">
    <form class="composer" :class="{ 'composer-invalid': overLimit }" @submit.prevent="submit">
      <label class="sr-only" for="chat-question">输入你的问题</label>
      <textarea
        id="chat-question"
        ref="input"
        v-model="draft"
        class="question-input"
        name="question"
        rows="2"
        :maxlength="maxChars"
        :aria-invalid="overLimit ? 'true' : undefined"
        aria-describedby="composer-help composer-counter composer-limit composer-availability"
        placeholder="输入你的问题，按 Enter 发送…"
        @input="resizeInput"
        @keydown="handleKeydown"
        @compositionstart="composing = true"
        @compositionend="finishComposition"
      />
      <div class="composer-controls">
        <div class="input-hints">
          <span id="composer-help" class="input-help">{{ inputHelp }}</span>
          <span id="composer-counter" class="input-counter" :class="{ 'counter-at-limit': characterCount >= maxChars }">
            {{ characterCount }} / {{ maxChars }}<span class="sr-only"> 个字符</span>
          </span>
        </div>
        <button v-if="busy" class="action-button stop-button" type="button" @click="emit('stop')">
          <span class="stop-symbol" aria-hidden="true"></span>
          停止回答
        </button>
        <button v-else class="action-button send-button" type="submit" :disabled="!canSend">
          发送
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M12 19V5m-6 6 6-6 6 6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </form>
    <p id="composer-limit" v-show="limitHelp" class="limit-help" :class="{ 'limit-error': overLimit }">{{ limitHelp }}</p>
    <p id="composer-availability" class="sr-only">{{ serviceReady ? '' : unavailableReason }}</p>
    <p class="disclaimer">请勿输入敏感信息。AI 回答仅供参考，请核实重要内容。</p>
  </div>
</template>

<style scoped>
.composer-area {
  flex: none;
  padding: 0 28px 16px;
  background: var(--color-paper);
}

.composer {
  padding: 13px 15px 11px;
  border: 1px solid #becfd8;
  border-radius: 13px;
  transition: border-color 140ms, box-shadow 140ms;
}

.composer:focus-within {
  border-color: #6a96aa;
  box-shadow: 0 0 0 3px #285f770b;
}

.composer-invalid,
.composer-invalid:focus-within {
  border-color: var(--color-danger);
}

.question-input {
  display: block;
  width: 100%;
  min-height: 62px;
  max-height: 148px;
  padding: 0 2px 5px;
  overflow-y: auto;
  resize: none;
  color: var(--color-ink);
  background: transparent;
  border: 0;
  border-radius: 3px;
  font-size: 14px;
  line-height: 1.8;
  scrollbar-width: thin;
}

.question-input:focus-visible {
  outline: none;
}

.question-input::placeholder {
  color: #7b8c96;
}

.composer-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 6px;
}

.input-hints {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px 14px;
  min-width: 0;
  color: var(--color-muted);
  font-size: 11px;
}

.input-counter {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.counter-at-limit {
  color: var(--color-warning);
}

.action-button {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 76px;
  min-height: 38px;
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  font-size: 12px;
  font-weight: 500;
}

.send-button {
  color: white;
  background: var(--color-accent);
}

.send-button:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.send-button:disabled {
  color: #6a8290;
  background: #e6edf1;
}

.stop-button {
  color: var(--color-accent);
  background: var(--color-soft);
  border-color: #d3e1e8;
}

.stop-button:hover {
  background: #e0ebf1;
}

.stop-symbol {
  width: 9px;
  height: 9px;
  background: currentColor;
  border-radius: 2px;
}

.limit-help {
  margin: 7px 2px 0;
  color: var(--color-warning);
  font-size: 11px;
}

.limit-error {
  color: var(--color-danger);
}

.disclaimer {
  margin: 10px 0 0;
  color: var(--color-muted);
  font-size: 10px;
  text-align: center;
}

@media (max-width: 600px) {
  .composer-area {
    padding: 0 13px max(12px, env(safe-area-inset-bottom));
  }

  .composer {
    padding: 11px 12px 10px;
  }

  .question-input {
    font-size: 16px;
  }

  .input-hints {
    display: grid;
    gap: 2px;
    font-size: 10px;
  }

  .action-button {
    min-height: 42px;
    padding: 8px 12px;
  }

  .disclaimer {
    font-size: 10px;
  }
}
</style>
