# dsh-search-locate

[English](README.en.md) | 简体中文

DSH 浏览器端插件：**点击侧栏搜索结果后，会话自动滚动到命中那一行并短暂高亮**。纯浏览器端 UI，不改任何官方文件。

## 它解决什么

官方搜索能列出命中的会话，但点进去只会打开会话、停在最新处；官方正文搜索的结果里带了命中片段，
却没有"跳到那一行"的能力（`loadOlder` / `loadThrough` 都在，只是没人消费）。

本插件把这两头自己接起来，**不改任何官方文件**：

1. 用 document 级 **capture** 点击监听识别"点的是搜索结果行"，从该行的
   `[class*="searchResultSnippet"]` 里读出命中片段（capture 阶段读，避免官方处理器先把行卸载）
2. 在**会话级插槽**里等会话打开、历史翻完（目标行才会出现在 DOM 里），
   然后在滚动区按文本找**最小的命中元素** → 平滑滚到中间 + 高亮

## 开关

设置 → 通用 → 「搜索命中跳转定位」，默认开启。关掉后点结果只打开会话、不滚动。

## 安装

```bash
dsh plugin --profile web add -w dsh-search-locate
```

手动等价方式：包放到 `<DSH_HOME>/profiles/node_modules/dsh-search-locate/`，在 `cordis.patch.yml` 加一条：

```yaml
- insert:
    - id: search-locate
      name: 'dsh-search-locate'
```

## 卸载

删掉那条 insert 即可。纯浏览器端插件，强刷页面即生效。

## 实现要点

- 零渲染组件，挂在会话级插槽 `conversation.session.header.utilities`
- 就绪判定：`session.openState === "open" && !session.hasMore && !session.loadingOlder`
  （用 `ctx.sessions.binding(sessionId).session` 读）
- **取"最小的命中元素"而不是"最深的"**：命中片段常横跨多个行内子元素，
  只按树深度取会拿到整段/整条消息，于是高亮糊成一大片
- **命中在折叠的过程区里时先展开**：`[data-turn-process-hidden]` 里的内容根本没渲染出来，
  先找到它前面最近的折叠头 `[class*="l_V-RG_root"]` 点开，等 340ms 再滚动
- **滚动要"算 + 校验 + 重试"**：会话视图自己会贴底/锚定（流式跟随），
  一次 `scrollIntoView({behavior:"smooth"})` 会被顶掉 → 改成直接算 `scrollTop`
  把目标放到视口中间，**每轮都用 `getBoundingClientRect()` 校验是否真的落在可见带内**，
  不满足就重试（最多 5 次），仍未可见则整体交给外层再试（最多 40 次 / 60 秒）
- 匹配片段**归一化空白 + 多针**（全文 / 折叠空白版 / 前 48·32·24·16·12 字），
  因为搜索结果片段含换行与代码块，直接 `indexOf` 匹配不到
- 高亮用**普通 rgba**（`color-mix` 在部分内核会被静默忽略），2.2 秒后还原
- 滚动区选择器 `.wSkVaW_scrollBody` **兜底 `[class*="_scrollBody"]`**，防版本间 CSS 类名变化
- 片段 < 4 字放弃；命中请求 60 秒过期；全部逻辑在 effect / 异步回调里、整体 try/catch
- 与 `dsh-history-autoload` **完全独立**：未装它时用短重试兜底，
  但历史没翻完时最旧的那条命中可能定位不到 —— 建议两个一起用

## 已知边界（升级 DSH 后）

依赖的内部选择器：`[class*="searchResultRow"]`、`[class*="searchResultSnippet"]`、
`[class*="l_V-RG_root"]`、`[data-turn-process-hidden]`、`.wSkVaW_scrollBody`（有通配兜底）。
DSH 升级后若定位失灵，优先核对这些选择器是否更名。

## 兼容性

- DeepSeek Harness `0.1.5-rc.1`（web profile，浏览器端）
- 客户端仅 require `react` / `react/jsx-runtime`（平台基线表内）

## License

MIT
