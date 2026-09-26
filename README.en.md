# dsh-search-locate

简体中文 | [English](README.en.md)

A browser-only DSH plugin: **clicking a sidebar search result opens the session, scrolls to the matching row and briefly highlights it**. No official file is modified.

## The problem it solves

Stock search lists matching sessions, but clicking one only opens the session and parks it at the latest position; the full-text search results carry the matching snippet, yet nothing consumes it to jump to that row (`loadOlder` / `loadThrough` exist — nobody calls them).

This plugin connects both ends itself, **without touching any official file**:

1. A document-level **capture-phase** click listener recognizes "this click was on a search-result row" and reads the snippet from that row's `[class*="searchResultSnippet"]` (read in the capture phase, before the stock handler can unmount the row)
2. In the **session-level slot** it waits for the session to open and the history to finish paging (only then does the target row exist in the DOM), then finds the **tightest matching element** by text in the scroll area, scrolls it to the middle and highlights it briefly

## Toggle

Settings → General → "Jump to search hits", on by default. Off restores stock click behavior.

## Install

```bash
dsh plugin --profile web add -w dsh-search-locate
```

Manual equivalent: place the package at `<DSH_HOME>/profiles/node_modules/dsh-search-locate/` and add a row to `cordis.patch.yml`:

```yaml
- insert:
    - id: search-locate
      name: 'dsh-search-locate'
```

## Uninstall

Delete the insert row. Browser-only: a hard refresh applies it.

## Implementation notes

- Zero-render component seated on the session-level slot `conversation.session.header.utilities`
- Readiness: `session.openState === "open" && !session.hasMore && !session.loadingOlder`
  (read via `ctx.sessions.binding(sessionId).session`)
- **Tightest matching element, not deepest**: a snippet often spans several inline children; picking by tree depth alone grabs a whole paragraph or message and the highlight smears across it
- **Expand first when the hit sits in a collapsed process run**: content inside `[data-turn-process-hidden]` is not rendered at all, so the nearest preceding fold header `[class*="l_V-RG_root"]` is clicked, then it waits 340ms before scrolling
- **Scrolling is compute + verify + retry**: the conversation view sticks to the bottom / anchors on its own (streaming follow), so a single `scrollIntoView({behavior:"smooth"})` gets undone → instead it computes `scrollTop` directly to place the target mid-viewport, **verifying with `getBoundingClientRect()` every round that the target really landed in the visible band**, retrying up to 5 times, and handing the whole attempt back to the outer loop (up to 40 attempts / 60 seconds)
- Snippet matching **normalizes whitespace and tries multiple needles** (full text / whitespace-collapsed / leading 48·32·24·16·12 chars), because search snippets contain newlines and code blocks that defeat a plain `indexOf`
- Highlight uses **plain rgba** (`color-mix` is silently ignored in some kernels), restored after 2.2 seconds
- Scroller selector `.wSkVaW_scrollBody` **falls back to `[class*="_scrollBody"]`**, tolerant of CSS class renames across versions
- Snippets shorter than 4 characters are dropped; a pending hit expires after 60 seconds; all logic lives in effects / async callbacks under an overall try/catch
- **Fully independent of `dsh-history-autoload`**: without it a short retry still works, but the oldest hit may be unreachable while history is unpaged — the two are recommended together

## Known boundaries (after a DSH upgrade)

Internal selectors relied upon: `[class*="searchResultRow"]`, `[class*="searchResultSnippet"]`, `[class*="l_V-RG_root"]`, `[data-turn-process-hidden]`, `.wSkVaW_scrollBody` (with wildcard fallbacks). If locating stops working after an upgrade, check these first.

## Compatibility

- DeepSeek Harness `0.1.5-rc.1` (web profile, browser side)
- Client-side `require` limited to `react` / `react/jsx-runtime` (platform baseline table)

## License

MIT
