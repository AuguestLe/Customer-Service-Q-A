<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'

const props = defineProps<{
  open: boolean
  busy: boolean
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')

watch(
  () => props.open,
  (open) => {
    const element = dialog.value
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  },
  { flush: 'post' },
)

function handleClose() {
  if (props.open) emit('cancel')
}
</script>

<template>
  <dialog
    ref="dialog"
    class="clear-dialog"
    aria-labelledby="clear-dialog-title"
    aria-describedby="clear-dialog-description"
    @cancel.prevent="emit('cancel')"
    @close="handleClose"
  >
    <div class="dialog-symbol" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>
    <h2 id="clear-dialog-title" class="dialog-title">清空当前对话？</h2>
    <p id="clear-dialog-description" class="dialog-description">
      当前问题、回答和输入框中的草稿将被移除。{{ busy ? '正在进行的回答也会停止。' : '' }}此操作无法撤销。
    </p>
    <div class="dialog-actions">
      <button class="dialog-button cancel-button" type="button" autofocus @click="emit('cancel')">保留对话</button>
      <button class="dialog-button confirm-button" type="button" @click="emit('confirm')">确认清空</button>
    </div>
  </dialog>
</template>

<style scoped>
.clear-dialog {
  width: calc(100% - 40px);
  max-width: 400px;
  max-height: calc(100dvh - 40px);
  padding: 26px;
  color: var(--color-ink);
  background: var(--color-paper);
  border: 1px solid var(--color-line);
  border-radius: 16px;
  box-shadow: 0 25px 90px #152e4430;
}

.clear-dialog::backdrop {
  background: #20384655;
}

.dialog-symbol {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  margin-bottom: 18px;
  color: var(--color-accent);
  background: var(--color-soft);
  border-radius: 12px;
}

.dialog-title {
  margin: 0 0 10px;
  font-size: 19px;
  font-weight: 600;
}

.dialog-description {
  margin: 0 0 24px;
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.9;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-button {
  min-height: 42px;
  padding: 9px 15px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  font-size: 12px;
}

.cancel-button {
  color: var(--color-ink);
  background: var(--color-soft);
  border-color: var(--color-line);
}

.cancel-button:hover {
  background: #e2ecf1;
}

.confirm-button {
  color: white;
  background: var(--color-accent);
}

.confirm-button:hover {
  background: var(--color-accent-hover);
}
</style>
