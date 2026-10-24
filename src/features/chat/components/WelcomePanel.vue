<script setup lang="ts">
defineEmits<{
  choosePrompt: [prompt: string]
}>()

const suggestions = [
  {
    title: '解释一个概念',
    description: '用简单的话解释什么是 API',
    prompt: '用简单的话解释一下，什么是 API？',
  },
  {
    title: '写一封邮件',
    description: '礼貌地询问一下项目进度',
    prompt: '帮我写一封礼貌询问项目进度的邮件。',
  },
  {
    title: '整理工作计划',
    description: '把今天要做的事情理清楚',
    prompt: '如何把一天的工作安排得更清楚？',
  },
] as const
</script>

<template>
  <section class="welcome" aria-labelledby="welcome-title">
    <div class="welcome-symbol" aria-hidden="true">
      <svg width="29" height="29" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M7 5h18a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H13l-7 4v-4H5V8a3 3 0 0 1 2-3Z" stroke-linejoin="round" />
        <path d="M11 12h10M11 17h6" stroke-linecap="round" />
      </svg>
    </div>
    <p class="eyebrow">从一个问题开始</p>
    <h2 id="welcome-title" class="welcome-title">有问题，直接问。</h2>
    <p class="welcome-description">解释概念、整理思路，或帮你写一段文字。<br />先从一次简单的对话开始。</p>
    <div class="suggestions" aria-label="示例问题，点击填入输入框">
      <button
        v-for="suggestion in suggestions"
        :key="suggestion.title"
        type="button"
        class="suggestion"
        :aria-label="`填入问题：${suggestion.prompt}`"
        @click="$emit('choosePrompt', suggestion.prompt)"
      >
        <span class="suggestion-title">
          {{ suggestion.title }}
          <svg class="suggestion-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M6 18 18 6M7 6h11v11" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="suggestion-description">{{ suggestion.description }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.welcome {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  width: 100%;
  max-width: 670px;
  margin: auto;
  padding: 26px 0 44px;
}

.welcome-symbol {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  margin-bottom: 23px;
  color: var(--color-accent);
  background: var(--color-soft);
  border-radius: 17px;
}

.eyebrow {
  margin: 0 0 9px;
  color: var(--color-muted);
  font-size: 11px;
  letter-spacing: 0.15em;
}

.welcome-title {
  margin: 0 0 12px;
  font-size: clamp(27px, 3.3vw, 34px);
  font-weight: 600;
  letter-spacing: -0.035em;
  line-height: 1.4;
}

.welcome-description {
  margin: 0;
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.95;
}

.suggestions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 32px;
}

.suggestion {
  padding: 17px 14px;
  color: var(--color-ink);
  text-align: left;
  background: var(--color-paper);
  border: 1px solid var(--color-line);
  border-radius: 11px;
  transition: background 140ms, border-color 140ms;
}

.suggestion:hover {
  background: var(--color-soft);
  border-color: #aec7d3;
}

.suggestion-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
}

.suggestion-arrow {
  flex: none;
  color: var(--color-accent);
}

.suggestion-description {
  display: block;
  margin-top: 7px;
  color: var(--color-muted);
  font-size: 11px;
}

@media (max-width: 650px) {
  .welcome {
    padding: 12px 4px 24px;
  }

  .welcome-symbol {
    margin-bottom: 18px;
  }

  .suggestions {
    grid-template-columns: 1fr;
    gap: 8px;
    margin-top: 24px;
  }

  .suggestion {
    padding: 11px 13px;
  }

  .suggestion-description {
    margin-top: 3px;
  }
}
</style>
