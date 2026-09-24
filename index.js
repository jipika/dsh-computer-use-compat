/**
 * dsh-computer-use-compat — 宿主段位表回填
 *
 * 背景（实测，非推测）：
 *   官方 Computer Use 包 @deepseek-ai/dsh-computer-use@0.1.6-alpha.1 +
 *   @deepseek-ai/dsh-experimental-computer-use-cua-driver-native@0.1.6-alpha.1
 *   在 native provider 的 systemPrompt.section() 里调用
 *       order: inner.systemPrompt.getSectionOrder("TOOL_COMPUTER_USE")
 *   而本机宿主是 core 0.1.5-rc.2，其 dsh-system-prompt 的 SECTION_ORDERS
 *   表里没有 TOOL_COMPUTER_USE（0.1.6-alpha 才加入，官方值 3000）。
 *   getSectionOrder 对未知键返回 undefined，而 section() 会
 *       if (!Number.isFinite(section.order)) throw new TypeError(...)
 *   于是 provider 加载必然抛错并回滚 —— 工具一个都注册不上。
 *
 * 本插件只做一件事：包裹 ctx.systemPrompt.getSectionOrder，
 * 为缺失的键返回官方同一个数值；其余键原样透传，卸载时恢复原方法。
 * 不改应用产物、不触碰 DSH 本体，删掉插件即完全回退。
 */

export const name = 'dsh-computer-use-compat'

/** 必须等服务就绪后再打补丁，且补丁要早于 computer-use provider 的 apply。 */
export const inject = ['systemPrompt', 'tools']

/** 宿主 0.1.5-rc.2 缺失的键 → 官方 0.1.6-alpha.2 里的同一数值。 */
const MISSING_SECTION_ORDERS = {
  TOOL_COMPUTER_USE: 3000,
  MCP_SERVERS: 3100,
}

const PATCHED_FLAG = Symbol.for('dsh-computer-use-compat.patched')

export function apply(ctx) {
  const service = ctx.systemPrompt
  if (service[PATCHED_FLAG] === true) return

  const original = service.getSectionOrder
  service.getSectionOrder = function getSectionOrder(key) {
    const backfilled = MISSING_SECTION_ORDERS[key]
    if (backfilled !== undefined) return backfilled
    return original.call(this, key)
  }
  service[PATCHED_FLAG] = true

  ctx.effect(() => () => {
    service.getSectionOrder = original
    delete service[PATCHED_FLAG]
  })

  // 可选诊断：DSH_CU_COMPAT_DEBUG=1 时在启动后打印 computer-use 工具注册情况，
  // 用于「不重启桌面应用也能验证」的实测。
  if (process.env.DSH_CU_COMPAT_DEBUG) {
    setTimeout(() => {
      try {
        const tools = ctx.tools
        const namesFrom = (value) => {
          if (value === undefined || value === null) return []
          if (value instanceof Map) return [...value.keys()]
          if (Array.isArray(value)) return value.map((item) => (typeof item === 'string' ? item : item?.name)).filter(Boolean)
          if (typeof value === 'object') {
            const nested = value.tools ?? value.entries ?? value.byName
            if (nested !== undefined && nested !== value) return namesFrom(nested)
            return Object.keys(value)
          }
          return []
        }
        let reported = false
        for (const method of ['schemas', 'sdkSchemas', 'view', 'names', 'list']) {
          if (typeof tools[method] !== 'function') continue
          try {
            const value = tools[method]()
            const names = namesFrom(value)
            if (!names.length) continue
            const cua = names.filter((name) => /cua_driver|cua-driver|computer/i.test(name))
            console.log(`[cu-compat] tools.${method}() total=${names.length} computer-related=${cua.length}`)
            console.log('[cu-compat] computer tools:', cua.join(',') || '(none)')
            console.log('[cu-compat] sample:', names.slice(0, 12).join(','))
            reported = true
            break
          } catch (error) {
            console.log(`[cu-compat] tools.${method}() failed:`, error.message)
          }
        }
        if (!reported) console.log('[cu-compat] no enumerable tool list found')
      } catch (error) {
        console.log('[cu-compat] probe failed:', error.message)
      }
    }, 5000)
  }
}
