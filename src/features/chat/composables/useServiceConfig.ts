import { onMounted, onScopeDispose, readonly, shallowRef } from 'vue'
import { fetchServiceConfig } from '../api/chat'
import type { ServiceConfig } from '../types'

export function useServiceConfig() {
  const config = shallowRef<ServiceConfig | null>(null)
  const loading = shallowRef(true)
  const error = shallowRef('')
  let active: AbortController | undefined

  async function reload() {
    active?.abort()
    const controller = new AbortController()
    active = controller
    loading.value = true
    error.value = ''
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
      const value = await fetchServiceConfig(controller.signal)
      if (active === controller) config.value = value
    } catch {
      if (active !== controller) return
      config.value = null
      error.value = '无法读取服务状态，请启动 Python 后端后重新检查。'
    } finally {
      clearTimeout(timer)
      if (active === controller) {
        loading.value = false
        active = undefined
      }
    }
  }

  onMounted(reload)
  onScopeDispose(() => { const controller = active; active = undefined; controller?.abort() })
  return { config: readonly(config), loading, error, reload }
}
