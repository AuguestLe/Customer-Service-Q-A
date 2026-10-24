<script setup lang="ts">
defineProps<{
  canClear: boolean
}>()

defineEmits<{
  clear: []
}>()
</script>

<template>
  <header class="chat-header">
    <div class="identity">
      <div class="avatar" aria-hidden="true">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="4" y="6" width="16" height="13" rx="5" />
          <path d="M12 3v3M8 12h.01M16 12h.01M9 15h6" stroke-linecap="round" />
        </svg>
      </div>
      <div class="identity-text">
        <h1 id="chat-title" class="title">AI 咨询助手</h1>
        <p class="subtitle">普通问题 · 日常咨询 · 文字问答</p>
      </div>
    </div>
    <button class="clear-button" type="button" :disabled="!canClear" @click="$emit('clear')">
      <svg class="clear-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      清空对话
    </button>
  </header>
</template>

<style scoped>
.chat-header {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 28px;
  border-bottom: 1px solid var(--color-line);
}

.identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 40px;
  height: 40px;
  color: var(--color-accent);
  background: var(--color-soft);
  border: 1px solid #cddfe7;
  border-radius: 12px;
}

.identity-text {
  min-width: 0;
}

.title {
  margin: 0 0 3px;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.4;
}

.subtitle {
  margin: 0;
  color: var(--color-muted);
  font-size: 11px;
}

.clear-button {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 7px 10px;
  color: var(--color-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  font-size: 12px;
  transition: background 140ms, color 140ms;
}

.clear-button:hover:not(:disabled) {
  color: var(--color-accent);
  background: var(--color-soft);
}

.clear-button:disabled {
  opacity: 0.45;
}

@media (max-width: 600px) {
  .chat-header {
    gap: 8px;
    padding: 16px;
  }

  .identity {
    gap: 9px;
  }

  .avatar {
    width: 35px;
    height: 35px;
    border-radius: 10px;
  }

  .title {
    font-size: 15px;
  }

  .subtitle {
    font-size: 10px;
  }

  .clear-button {
    min-height: 40px;
    padding: 7px;
    font-size: 11px;
  }

  .clear-icon {
    display: none;
  }
}
</style>
