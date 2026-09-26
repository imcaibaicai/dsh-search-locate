window.__ModuleLoader__.load({
	id: "dsh-search-locate",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		// #region constants
		const NS = "searchLocate";
		const SETTINGS_NAMESPACE = "ui-search-locate";
		const FIELD = "enabled";
		const DEFAULT_ENABLED = true;
		/** Delay before the first locate attempt once the hit is captured. */
		const FIRST_DELAY_MS = 150;
		/** Delay between attempts while the Session is not ready yet. */
		const ATTEMPT_DELAY_MS = 500;
		const MAX_ATTEMPTS = 40;
		/** A pending hit older than this is dropped (the user moved on). */
		const PENDING_TTL_MS = 60000;
		/** Snippets shorter than this cannot be matched reliably. */
		const MIN_SNIPPET = 4;
		/** Locate highlight colour — plain rgba so it applies in every Chromium build. */
		const HIGHLIGHT_BG = "rgba(77, 107, 254, 0.28)";
		const HIGHLIGHT_MS = 2200;
		/** Scroll settle + verification pacing (the view also scrolls on its own). */
		const SETTLE_MS = 260;
		const SCROLL_TRIES = 5;
		/** Reveal wait after expanding a collapsed process block. */
		const REVEAL_MS = 340;
		const SESSION_SLOT = "conversation.session.header.utilities";
		const ROW_SELECTOR = "[class*=\"searchResultRow\"]";
		const SNIPPET_SELECTOR = "[class*=\"searchResultSnippet\"]";
		/** Stock markers used to reveal a hit hidden inside a collapsed process run. */
		const HIDDEN_MARKER = "[data-turn-process-hidden]";
		const FOLD_HEADER_SELECTOR = "[class*=\"l_V-RG_root\"]";
		const zh = {
			title: "搜索命中跳转定位",
			description: "点击侧栏搜索结果后，会话自动滚动到命中那一行并短暂高亮",
			on: "已开启",
			off: "已关闭"
		};
		const en = {
			title: "Jump to search hits",
			description: "Scroll to and briefly highlight the matching row after clicking a sidebar search result",
			on: "On",
			off: "Off"
		};
		// #endregion
		// #region styles
		const css = `
.sl-row{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}
.sl-rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}
.sl-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}
.sl-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}
.sl-toggle{flex:none;min-width:58px;height:28px;padding:0 12px;border:none;border-radius:14px;cursor:pointer;
  font-size:13px;line-height:28px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}
.sl-toggle[aria-pressed="true"]{background:var(--dsw-alias-state-business-primary,#4d6bfe);color:#fff}
`;
		try {
			if (typeof document !== "undefined") {
				const key = "dsh-search-locate";
				if (document.querySelector("style[data-plugin-css=" + JSON.stringify(key) + "]") === null) {
					const tag = document.createElement("style");
					tag.dataset.plugin = key;
					tag.dataset.pluginCss = key;
					tag.textContent = css;
					document.head.appendChild(tag);
				}
			}
		} catch (error) {}
		// #endregion
		// #region pending hit store
		let pending = null;
		const pendingListeners = /* @__PURE__ */ new Set();
		const publishPending = () => {
			for (const listener of [...pendingListeners]) {
				try {
					listener();
				} catch (error) {}
			}
		};
		// #endregion
		// #region dom helpers
		/** Resolve the conversation scroll container, tolerating CSS-module hash changes. */
		function scrollBodyEl() {
			try {
				return document.querySelector(".wSkVaW_scrollBody") || document.querySelector("[class*=\"_scrollBody\"]");
			} catch (error) {
				return null;
			}
		}
		/** Collapse every whitespace run so rendered text matches the stored excerpt. */
		function normalizeText(value) {
			return String(value === void 0 || value === null ? "" : value).replace(/\s+/g, " ").trim();
		}
		/**
		 * Build the match needles, longest first. The stored excerpt comes from the search
		 * index and can be split by markdown rendering, so a shorter leading fragment is
		 * tried when the whole excerpt cannot be found verbatim.
		 * @param snippet - excerpt captured from the search-result row.
		 * @returns candidate needles, most specific first.
		 */
		function buildNeedles(snippet) {
			const collapsed = normalizeText(snippet);
			const needles = [];
			if (collapsed.length >= MIN_SNIPPET) needles.push(collapsed);
			for (const length of [48, 32, 24, 16, 12]) {
				if (collapsed.length <= length) continue;
				const fragment = normalizeText(collapsed.slice(0, length));
				if (fragment.length >= MIN_SNIPPET && needles.indexOf(fragment) < 0) needles.push(fragment);
			}
			return needles;
		}
		/**
		 * Smallest element that still contains the needle — a tight highlight instead of a
		 * whole paragraph. (Walking for "the deepest match" alone overshoots whenever the
		 * excerpt spans several inline children.)
		 * @param root - subtree root.
		 * @param needle - normalized needle.
		 * @returns the tightest matching element, or null.
		 */
		function findTightest(root, needle) {
			let best = null;
			let bestLength = Infinity;
			const walk = (el) => {
				const kids = el.children;
				for (let i = 0; i < kids.length; i += 1) {
					const child = kids[i];
					if (child.nodeType !== 1) continue;
					const text = normalizeText(child.textContent);
					if (text.indexOf(needle) < 0) continue;
					if (text.length < bestLength) {
						best = child;
						bestLength = text.length;
					}
					walk(child);
				}
			};
			walk(root);
			return best;
		}
		/** True when the element's box intersects the scroller's visible band. */
		function isInView(scroller, el) {
			try {
				const box = el.getBoundingClientRect();
				const view = scroller.getBoundingClientRect();
				if (box.height <= 0) return false;
				return box.bottom > view.top + 8 && box.top < view.bottom - 8;
			} catch (error) {
				return false;
			}
		}
		/** Scroll so the element sits mid-viewport, by direct scrollTop arithmetic. */
		function scrollToCenter(scroller, el) {
			try {
				const box = el.getBoundingClientRect();
				const view = scroller.getBoundingClientRect();
				const delta = box.top - view.top - (view.height - box.height) / 2;
				scroller.scrollTop = scroller.scrollTop + delta;
			} catch (error) {}
		}
		/**
		 * A hit can live inside a collapsed process run, where it is not rendered visibly at
		 * all. Find the fold header that precedes it and expand that turn.
		 * @param scroller - conversation scroller.
		 * @param el - matched element.
		 */
		function revealIfCollapsed(scroller, el) {
			try {
				if (typeof el.closest !== "function") return;
				const hiddenHost = el.closest(HIDDEN_MARKER);
				if (hiddenHost === null) return;
				const headers = Array.prototype.slice.call(scroller.querySelectorAll(FOLD_HEADER_SELECTOR));
				let header = null;
				for (const candidate of headers) {
					// 4 === Node.DOCUMENT_POSITION_FOLLOWING: candidate 在命中元素之前
					if (candidate.compareDocumentPosition(hiddenHost) & 4) header = candidate;
				}
				if (header !== null && typeof header.click === "function") header.click();
			} catch (error) {}
		}
		/** Background pulse, cleared after HIGHLIGHT_MS. */
		function pulse(el) {
			try {
				const previous = el.style.backgroundColor;
				el.style.transition = "background-color .45s ease";
				el.style.backgroundColor = HIGHLIGHT_BG;
				window.setTimeout(() => {
					try {
						el.style.backgroundColor = previous;
					} catch (error) {}
				}, HIGHLIGHT_MS);
			} catch (error) {}
		}
		const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
		/**
		 * Locate one excerpt, make it visible, and report whether it really landed in view.
		 * The conversation view scrolls on its own (streaming follow / anchoring), so the
		 * scroll is re-applied and verified instead of fired once.
		 * @param snippet - excerpt captured from the search-result row.
		 * @returns true once the target is inside the visible band and has been pulsed.
		 */
		async function locateAndVerify(snippet) {
			try {
				const scroller = scrollBodyEl();
				if (scroller === null) return false;
				const needles = buildNeedles(snippet);
				if (needles.length === 0) return false;
				let target = null;
				let needle = null;
				for (const candidate of needles) {
					target = findTightest(scroller, candidate);
					if (target !== null) {
						needle = candidate;
						break;
					}
				}
				if (target === null) return false;
				revealIfCollapsed(scroller, target);
				await sleep(REVEAL_MS);
				// The reveal may have re-rendered the subtree; re-find with the same needle.
				const fresh = findTightest(scroller, needle) || target;
				for (let attempt = 0; attempt < SCROLL_TRIES; attempt += 1) {
					if (isInView(scroller, fresh)) {
						pulse(fresh);
						return true;
					}
					scrollToCenter(scroller, fresh);
					await sleep(SETTLE_MS);
				}
				const landed = isInView(scroller, fresh);
				pulse(fresh);
				return landed;
			} catch (error) {
				return false;
			}
		}
		// #endregion
		// #region session seat
		/**
		 * Zero-render seat mounted once per Session: waits until the Session is open and
		 * fully paged, then resolves the pending hit inside the conversation DOM.
		 * @param props - composed Session-scope slot props plus this plugin's injected face.
		 * @returns nothing; this component never renders UI.
		 */
		function LocateSeat(props) {
			const enabled = props.getEnabled() === true;
			const [tick, setTick] = (0, react.useState)(0);
			(0, react.useEffect)(() => props.subscribePending(() => setTick((value) => value + 1)), [props]);
			(0, react.useEffect)(() => {
				if (!enabled) return void 0;
				const hit = props.getPending();
				if (hit === null) return void 0;
				if (Date.now() - hit.at > PENDING_TTL_MS) {
					props.clearPending();
					return void 0;
				}
				let cancelled = false;
				let attempts = 0;
				let timer = 0;
				const sessionId = props.sessionId;
				const api = props.sessionsApi;
				const attempt = () => {
					if (cancelled) return;
					let face;
					try {
						face = api.binding(sessionId).session;
					} catch (error) {
						return;
					}
					if (face === void 0) return;
					const ready = face.openState === "open" && face.hasMore !== true && face.loadingOlder !== true;
					if (ready) {
						locateAndVerify(hit.snippet).then((landed) => {
							if (cancelled) return;
							if (landed) {
								cancelled = true;
								props.clearPending();
								return;
							}
							attempts += 1;
							if (attempts >= MAX_ATTEMPTS) return;
							timer = window.setTimeout(attempt, ATTEMPT_DELAY_MS);
						}, () => {
							attempts += 1;
							if (cancelled || attempts >= MAX_ATTEMPTS) return;
							timer = window.setTimeout(attempt, ATTEMPT_DELAY_MS);
						});
						return;
					}
					attempts += 1;
					if (attempts >= MAX_ATTEMPTS) return;
					timer = window.setTimeout(attempt, ATTEMPT_DELAY_MS);
				};
				timer = window.setTimeout(attempt, FIRST_DELAY_MS);
				return () => {
					cancelled = true;
					try {
						window.clearTimeout(timer);
					} catch (error) {}
				};
			}, [
				enabled,
				tick,
				props.sessionId,
				props.sessionsApi
			]);
			return null;
		}
		// #endregion
		// #region settings row
		/**
		 * Settings → General row: one on/off switch for this plugin.
		 * @param props - composed Settings slot props plus this plugin's injected face.
		 * @returns the preference row.
		 */
		function LocateRow(props) {
			const t = props.t;
			const [enabled, setLocal] = (0, react.useState)(() => props.getEnabled());
			(0, react.useEffect)(() => props.subscribeEnabled(() => setLocal(props.getEnabled())), [props]);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "sl-row",
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: "sl-rowText",
					children: [(0, react_jsx_runtime.jsx)("div", {
						className: "sl-title",
						children: t("title")
					}), (0, react_jsx_runtime.jsx)("div", {
						className: "sl-desc",
						children: t("description")
					})]
				}), (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "sl-toggle",
					"aria-pressed": enabled,
					onClick: () => props.setEnabled(!enabled),
					children: enabled ? t("on") : t("off")
				})]
			});
		}
		// #endregion
		// #region plugin
		const inject = [
			"slots",
			"locale",
			"settingsScope",
			"sessions"
		];
		/**
		 * Client plugin body: own the preference, watch search-result clicks, seat the
		 * per-Session locator, and expose the Settings row.
		 * @param ctx - client cordis context.
		 */
		function apply(ctx) {
			let host;
			try {
				host = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE });
			} catch (error) {
				host = void 0;
			}
			let current = DEFAULT_ENABLED;
			const listeners = /* @__PURE__ */ new Set();
			const publish = () => {
				for (const listener of [...listeners]) {
					try {
						listener();
					} catch (error) {}
				}
			};
			const adopt = () => {
				const section = host === void 0 ? void 0 : host.getSnapshot().value;
				const raw = section === void 0 || section === null ? void 0 : section[FIELD];
				const next = typeof raw === "boolean" ? raw : DEFAULT_ENABLED;
				if (next === current) return;
				current = next;
				publish();
			};
			if (host !== void 0) {
				ctx.effect(() => host.subscribe(adopt), "search-locate: settings scope adoption");
				adopt();
			}
			const getEnabled = () => current;
			const subscribeEnabled = (listener) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			};
			const setEnabled = (value) => {
				const next = value === true;
				if (next === current) return;
				current = next;
				publish();
				if (host !== void 0) {
					try {
						host.set(FIELD, next);
					} catch (error) {}
				}
			};
			const getPending = () => pending;
			const clearPending = () => {
				pending = null;
			};
			const subscribePending = (listener) => {
				pendingListeners.add(listener);
				return () => {
					pendingListeners.delete(listener);
				};
			};
			/** Capture one search-result click (capture phase, so the stock handler cannot
			 * unmount the row before the excerpt is read). */
			const onDocumentClick = (event) => {
				try {
					if (!getEnabled()) return;
					const target = event.target;
					if (target === null || typeof target.closest !== "function") return;
					const row = target.closest(ROW_SELECTOR);
					if (row === null) return;
					const node = row.querySelector(SNIPPET_SELECTOR);
					if (node === null) return;
					const snippet = String(node.textContent || "").trim();
					if (snippet.length < MIN_SNIPPET) return;
					pending = {
						snippet,
						at: Date.now()
					};
					publishPending();
				} catch (error) {}
			};
			ctx.effect(() => {
				if (typeof document === "undefined") return () => {};
				document.addEventListener("click", onDocumentClick, true);
				return () => {
					try {
						document.removeEventListener("click", onDocumentClick, true);
					} catch (error) {}
				};
			}, "search-locate: search-result click capture");
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "search-locate: dictionaries");
			ctx.slots.inject(SESSION_SLOT, () => ctx.slots.register({
				name: SESSION_SLOT,
				id: "search-locate",
				order: 91,
				locale: NS,
				inject: () => ({
					sessionsApi: ctx.sessions,
					getEnabled,
					subscribeEnabled,
					getPending,
					clearPending,
					subscribePending
				})
			}, LocateSeat));
			ctx.slots.inject("settings.general.item", () => ctx.slots.register({
				name: "settings.general.item",
				id: "search-locate",
				order: 16,
				locale: NS,
				inject: () => ({
					getEnabled,
					subscribeEnabled,
					setEnabled
				})
			}, LocateRow));
		}
		// #endregion
		exports.LocateSeat = LocateSeat;
		exports.LocateRow = LocateRow;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
