# dsh-computer-use-compat

> Backfill the prompt-section order keys that DSH core 0.1.5-rc.2 lacks, so the official
> Computer Use providers can load on an older host.
>
> 给老宿主回填 system prompt 段位表里缺失的键，让官方 Computer Use 插件在 core 0.1.5-rc.2 上也能加载。

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

---

## 它解决什么

官方的 Computer Use 包（`@deepseek-ai/dsh-computer-use@0.1.6-alpha.1` +
`@deepseek-ai/dsh-experimental-computer-use-cua-driver-native@0.1.6-alpha.1`）在 native
provider 的 `systemPrompt.section()` 里这样取段位：

```js
order: inner.systemPrompt.getSectionOrder("TOOL_COMPUTER_USE")
```

而 core **0.1.5-rc.2** 的 `dsh-system-prompt` 里 `SECTION_ORDERS` 表**没有** `TOOL_COMPUTER_USE`
（0.1.6-alpha 才加入，官方值 3000）。`getSectionOrder` 对未知键返回 `undefined`，
`section()` 又写着 `if (!Number.isFinite(section.order)) throw new TypeError(...)` ——
于是 provider 的 `apply` 必然抛错、整块回滚，**一个 `cua_driver_native__*` 工具都注册不上**。

## 它做什么

只做一件事：包裹 `ctx.systemPrompt.getSectionOrder`，为缺失的键返回官方同一个数值：

| 键 | 值 |
| --- | --- |
| `TOOL_COMPUTER_USE` | 3000 |
| `MCP_SERVERS` | 3100 |

其余键原样透传；用 `Symbol.for('dsh-computer-use-compat.patched')` 防重复打补丁；
卸载时经 `ctx.effect` 还原原方法。**不改应用产物、不触碰 DSH 本体**，删掉插件即完全回退。

```
dsh-computer-use-compat  (host only)
  └─ ctx.systemPrompt.getSectionOrder  ← 猴子补丁，只补缺口
```

## 安装

两种装法任选其一（都会往 profile 的 `dependencies` 加一项，再配一行 insert）：

```bash
# ① npm（快，走 registry）
dsh plugin --profile <profile> add dsh-computer-use-compat

# ② GitHub（源码直装，跟随 main 分支）
dsh plugin --profile <profile> add github:jipika/dsh-computer-use-compat
```

然后在 `~/.dsh/profiles/<profile>/cordis.patch.yml` 里 insert 一行：

```yaml
- insert:
    - id: dsh-computer-use-compat
      name: dsh-computer-use-compat
```

**顺序要求**：这行必须排在 computer-use provider 之前，补丁才会早于 provider 的 `apply` 生效
（插件 `inject = ['systemPrompt', 'tools']`，等这两个服务就绪后再打补丁）。

`desktop` profile 被 Electron 独占，CLI 子命令会被拒；手改 profile 的 `package.json`
（`dependencies` 加 `github:jipika/dsh-computer-use-compat`）+ `pnpm install`，再 insert 同一行，
**重启应用才生效**。

## 调试

设置 `DSH_CU_COMPAT_DEBUG=1` 启动，插件会在 5 秒后打印一次工具注册情况
（依次探测 `schemas` / `sdkSchemas` / `view` / `names` / `list`，把结果打到 host 日志）。

## 已知限制

- 数值是**硬编码**的官方 3000 / 3100，官方改值即失效（改这个文件即可）。
- 依赖 `ctx.systemPrompt.getSectionOrder` 这个内部 API 与 provider 的 `apply` 时序。
- 只解决「段位表缺键」这一类不兼容；core 0.1.6-alpha 起官方已自带这些键，本插件会成为无害的透传。

## License

MIT © 2026 jipika
