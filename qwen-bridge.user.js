// ==UserScript==
// @name         Qwen Web Bridge
// @namespace    https://github.com/your-username/qwen-web-proxy
// @version      1.0.0
// @description  Automates chat.qwen.ai bridge for local OpenAI-compatible proxy
// @match        https://chat.qwen.ai/*
// @match        https://chat.qwenlm.ai/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  if (window.__QWEN_BRIDGE_INITIALIZED__) {
    console.log("[Qwen Bridge] Already running.");
    return;
  }
  window.__QWEN_BRIDGE_INITIALIZED__ = true;

  const WS_URL = "ws://127.0.0.1:1338/ws";
  const JOB_TIMEOUT_MS = 600_000;

  const isCompletionUrl = (url) => {
    if (!url) return false;
    const s = typeof url === "string" ? url : (url.url || (url.toString ? url.toString() : ""));
    if (!s.includes("/chat/completions")) return false;
    if (s.includes("/stop") || s.includes("/task/") || s.includes("/suggestions") || s.includes("/tags") || s.includes("/tts/")) {
      return false;
    }
    return true;
  };

  const log = (msg, color = "#38bdf8") => {
    const time = new Date().toLocaleTimeString();
    console.log(`%c[Qwen Bridge ${time}] ${msg}`, `color:${color};font-weight:bold;`);
  };

  const badge = document.createElement("div");
  badge.id = "qwen-bridge-badge";
  badge.title = "Click to reconnect to proxy";
  Object.assign(badge.style, {
    position: "fixed",
    bottom: "16px",
    right: "16px",
    zIndex: "999999",
    padding: "6px 14px",
    borderRadius: "20px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: "12px",
    fontWeight: "600",
    color: "#fff",
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    backdropFilter: "blur(6px)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    userSelect: "none",
    transition: "all 0.2s ease",
  });

  const dot = document.createElement("span");
  Object.assign(dot.style, {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#ef4444",
    transition: "background-color 0.2s ease",
  });

  const text = document.createElement("span");
  text.textContent = "Bridge: Disconnected";

  badge.appendChild(dot);
  badge.appendChild(text);

  function updateBadge(state, message) {
    if (!badge.parentElement && document.body) {
      document.body.appendChild(badge);
    }
    if (state === "connected") {
      dot.style.backgroundColor = "#10b981";
      text.textContent = message || "Bridge: Connected (Ready)";
    } else if (state === "busy") {
      dot.style.backgroundColor = "#f59e0b";
      text.textContent = message || "Bridge: Working...";
    } else {
      dot.style.backgroundColor = "#ef4444";
      text.textContent = message || "Bridge: Disconnected";
    }
  }

  if (document.body) {
    document.body.appendChild(badge);
  } else {
    window.addEventListener("DOMContentLoaded", () => document.body.appendChild(badge));
  }

  function getCurrentChatId() {
    const match = window.location.pathname.match(/\/c\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  async function waitForIdle(maxWaitMs = 8_000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const stopBtn = document.querySelector(
        ".chat-prompt-send-button button.stop-button, .stop-button, button[aria-label*='Stop']"
      );
      if (!stopBtn) return true;
      updateBadge("busy", "Bridge: Waiting for previous turn to finish...");
      await new Promise((r) => setTimeout(r, 120));
    }
    return true;
  }



  async function switchMode(feature) {
    if (!feature) {
      const exitBtn = document.querySelector(
        ".mode-select-current-mode-close, .mode-select-popover-close-icon, [aria-label*='Exit']"
      );
      if (exitBtn) {
        try { exitBtn.click(); } catch (_) { }
      }
      return;
    }

    const chatType = feature.chat_type;
    const subChatType = feature.sub_chat_type;
    log(`Configring feature mode: ${chatType} (${subChatType || "default"})...`, "#facc15");

    const modeTrigger = document.querySelector(".mode-select-current-mode");
    if (modeTrigger) {
      let targetLabel = "";
      if (chatType === "search") targetLabel = "search";
      else if (chatType === "deep_research") targetLabel = "research";
      else if (chatType === "agent_mode") targetLabel = "agent";
      else if (chatType === "t2i") targetLabel = "image";

      const currentModeText = (modeTrigger.textContent || "").toLowerCase();
      if (targetLabel && currentModeText.includes(targetLabel)) {
        log(`Mode '${targetLabel}' already active in UI.`, "#10b981");
        return;
      }

      modeTrigger.click();
      await new Promise((r) => setTimeout(r, 120));

      if (targetLabel) {
        const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const items = Array.from(
          document.querySelectorAll(".mode-select-dropdown-item, .mode-select-common-item, .mode-select-dropdown-item-wrapper")
        );
        let found = false;
        for (const item of items) {
          const nameEl = item.querySelector(".mode-select-dropdown-item-name") || item;
          if (norm(nameEl.textContent).includes(norm(targetLabel))) {
            item.click();
            log(`Activated mode in UI: ${nameEl.textContent.trim()}`, "#10b981");
            found = true;
            await new Promise((r) => setTimeout(r, 80));
            break;
          }
        }
        if (!found) {
          modeTrigger.click();
        }
      }
    }
  }

  function locateQwenSubmit() {
    const candidates = [
      document.querySelector(".message-input-wrapper"),
      document.querySelector(".message-input-container"),
      document.querySelector(".message-input-container-area"),
      document.querySelector(".chat-prompt-send-button"),
      document.querySelector("textarea.message-input-textarea"),
      document.querySelector("#root"),
      document.body,
    ].filter(Boolean);

    for (const el of candidates) {
      const key = Object.keys(el).find(
        (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
      );
      if (!key || !el[key]) continue;

      let fiber = el[key];
      while (fiber) {
        const props = fiber.memoizedProps || fiber.pendingProps;
        if (props) {
          if (typeof props.onPromptSend === "function") {
            log("Located submit via fiber props.onPromptSend!", "#10b981");
            return (text, opts) => props.onPromptSend({ inputText: text, promptSource: "message_input", ...opts });
          }
          if (typeof props.beforePromptSend === "function") {
            log("Located submit via fiber props.beforePromptSend!", "#10b981");
            return (text, opts) => props.beforePromptSend({ inputText: text, promptSource: "message_input", ...opts });
          }
        }

        let hook = fiber.memoizedState;
        while (hook) {
          if (hook.memoizedState && typeof hook.memoizedState.getSnapshot === "function") {
            try {
              const snap = hook.memoizedState.getSnapshot();
              if (snap && typeof snap.onPromptSend === "function") {
                log("Located submit via fiber Zustand hook snap.onPromptSend!", "#10b981");
                return (text, opts) => {
                  if (typeof snap.setInputValue === "function") {
                    try { snap.setInputValue(text); } catch (_) { }
                  }
                  snap.onPromptSend({ inputText: text, promptSource: "message_input", ...opts });
                };
              }
            } catch (_) { }
          }
          hook = hook.next;
        }

        fiber = fiber.return;
      }
    }

    const rootEl = document.querySelector("#root") || document.body;
    const rootKey = Object.keys(rootEl).find(
      (k) => k.startsWith("__reactContainer$") || k.startsWith("__reactFiber$")
    );
    if (rootKey && rootEl[rootKey]) {
      const queue = [rootEl[rootKey]];
      let visited = 0;
      while (queue.length > 0 && visited < 3000) {
        visited++;
        const f = queue.shift();
        if (!f) continue;

        let hook = f.memoizedState;
        while (hook) {
          if (hook.memoizedState && typeof hook.memoizedState.getSnapshot === "function") {
            try {
              const snap = hook.memoizedState.getSnapshot();
              if (snap && typeof snap.onPromptSend === "function") {
                log(`Located submit via root BFS (node #${visited}) snap.onPromptSend!`, "#10b981");
                return (text, opts) => {
                  if (typeof snap.setInputValue === "function") {
                    try { snap.setInputValue(text); } catch (_) { }
                  }
                  snap.onPromptSend({ inputText: text, promptSource: "message_input", ...opts });
                };
              }
            } catch (_) { }
          }
          hook = hook.next;
        }

        const p = f.memoizedProps;
        if (p) {
          if (typeof p.onPromptSend === "function") {
            log(`Located submit via root BFS (node #${visited}) props.onPromptSend!`, "#10b981");
            return (text, opts) => p.onPromptSend({ inputText: text, promptSource: "message_input", ...opts });
          }
          if (typeof p.beforePromptSend === "function") {
            log(`Located submit via root BFS (node #${visited}) props.beforePromptSend!`, "#10b981");
            return (text, opts) => p.beforePromptSend({ inputText: text, promptSource: "message_input", ...opts });
          }
        }

        if (f.child) queue.push(f.child);
        if (f.sibling) queue.push(f.sibling);
      }
    }

    for (const el of candidates) {
      const key = Object.keys(el).find(
        (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
      );
      if (!key || !el[key]) continue;
      let fiber = el[key];
      while (fiber) {
        const props = fiber.memoizedProps || fiber.pendingProps;
        if (props && typeof props.handleSend === "function") {
          log("Located submit via fiber props.handleSend", "#10b981");
          return (text) => props.handleSend("send", text);
        }
        fiber = fiber.return;
      }
    }

    return null;
  }

  const initialSubmit = locateQwenSubmit();
  if (initialSubmit) {
    window.mySubmit = initialSubmit;
    log("Bound to window.mySubmit", "#10b981");
  }

  async function submitPrompt(prompt, modelId, feature) {
    log(`Submitting prompt (${prompt.length} chars)...`, "#facc15");
    updateBadge("busy", "Bridge: Generating...");

    await waitForIdle(8_000);


    if (feature) {
      try {
        await switchMode(feature);
      } catch (e) {
        console.warn("[Qwen Bridge] switchMode error:", e);
      }
    }

    let submitFn = window.mySubmit || locateQwenSubmit();
    if (!submitFn) {
      await new Promise((r) => setTimeout(r, 250));
      submitFn = locateQwenSubmit();
    }

    const submitOpts = {
      inputText: prompt,
      promptSource: "message_input",
    };
    if (feature) {
      if (feature.chat_type) submitOpts.chatType = feature.chat_type;
      if (feature.sub_chat_type) submitOpts.subChatType = feature.sub_chat_type;
      if (feature.feature_config) submitOpts.featureConfig = feature.feature_config;
      if (feature.extra) submitOpts.extra = feature.extra;
      if (feature.size) submitOpts.visionSize = feature.size;
    }

    if (submitFn) {
      window.mySubmit = submitFn;
      try {
        submitFn(prompt, submitOpts);
        return true;
      } catch (e) {
        console.warn("[Qwen Bridge] Direct submitFn threw, trying DOM fallback:", e);
      }
    }

    const input = document.querySelector(
      ".message-input-wrapper textarea, .message-input-container textarea, textarea.message-input-textarea"
    );
    if (!input) {
      throw new Error("Chat input not found. Make sure https://chat.qwen.ai/ is loaded.");
    }

    input.focus();
    const tracker = input._valueTracker;
    if (tracker) tracker.setValue("");
    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(input, prompt);
    else input.value = prompt;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 120));

    const sendBtn = document.querySelector(
      ".chat-prompt-send-button button, .message-input-right-button-send button, .send-button"
    );
    if (sendBtn && !sendBtn.disabled && !sendBtn.classList.contains("disabled")) {
      sendBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      sendBtn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      sendBtn.click();
      return true;
    }

    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      })
    );
    return true;
  }

  window.deleteCurrentChat = async () => {
    const chatId = getCurrentChatId();
    log(`Deleting chat session ${chatId || "new"}...`, "#facc15");

    const newChatBtn = document.querySelector(
      ".new-chat, [aria-label*='New chat'], [title*='New chat'], button[class*='new-chat'], .sidebar-new-chat-button"
    );
    if (newChatBtn) {
      newChatBtn.click();
      log("Chat deleted successfully!", "#10b981");
      return;
    }

    if (chatId) {
      try {
        await fetch(`/api/v1/chats/${chatId}`, { method: "DELETE" }).catch(() => { });
        await fetch(`/api/v2/chats/${chatId}`, { method: "DELETE" }).catch(() => { });
      } catch (_) { }
    }
    window.location.href = "/";
  };

  class QwenSSEParser {
    constructor() {
      this.buffer = "";
      this.finished = false;
      this.text = "";
      this.reasoning = "";
      this.imageUrl = "";
      this.inputTokens = 0;
      this.outputTokens = 0;
      this.totalTokens = 0;
      this.cachedTokens = 0;
      this.chatId = null;
      this.responseId = null;
    }

    feed(chunk) {
      if (this.finished) return true;
      this.buffer += chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

      let boundary;
      while ((boundary = this.buffer.indexOf("\n\n")) !== -1) {
        const block = this.buffer.slice(0, boundary);
        this.buffer = this.buffer.slice(boundary + 2);

        let evtName = "message";
        const dataLines = [];

        for (const line of block.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith("event:")) {
            evtName = trimmed.slice(6).trim();
          } else if (trimmed.startsWith("data:")) {
            dataLines.push(trimmed.slice(5).trim());
          }
        }

        const dataStr = dataLines.join("\n");
        if (this.processEvent(evtName, dataStr)) {
          this.finished = true;
          return true;
        }
      }
      return false;
    }

    processEvent(evtName, dataStr) {
      if (dataStr === "[DONE]" || evtName === "close") {
        return true;
      }
      if (!dataStr) return false;

      let p;
      try {
        p = JSON.parse(dataStr);
      } catch {
        return false;
      }

      if (p["response.info"] && p["response.info"].action === "keep_alive") {
        return false;
      }

      if (p["response.created"]) {
        this.chatId = p["response.created"].chat_id || this.chatId;
        this.responseId = p["response.created"].response_id || this.responseId;
        return false;
      }

      if (p["response.stopped"]) {
        return true;
      }

      if (p.response_id) {
        this.responseId = p.response_id;
      }

      if (p.usage) {
        if (typeof p.usage.input_tokens === "number") this.inputTokens = p.usage.input_tokens;
        if (typeof p.usage.output_tokens === "number") this.outputTokens = p.usage.output_tokens;
        if (typeof p.usage.total_tokens === "number") this.totalTokens = p.usage.total_tokens;
        if (p.usage.prompt_tokens_details && typeof p.usage.prompt_tokens_details.cached_tokens === "number") {
          this.cachedTokens = p.usage.prompt_tokens_details.cached_tokens;
        }
      }

      if (Array.isArray(p.choices)) {
        for (const choice of p.choices) {
          const delta = choice.delta;
          if (!delta) continue;

          if (delta.phase === "thinking") {
            if (delta.content) this.reasoning += delta.content;
          } else if (delta.phase === "image_gen") {
            if (delta.content) {
              this.imageUrl = delta.content;
              this.text = delta.content;
            }
          } else if (delta.phase === "web_search") {
            if (delta.extra && delta.extra.tool_result) {
              log("Web search completed, compiling results...", "#38bdf8");
            }
          } else {
            if (delta.content) this.text += delta.content;
          }
        }
      }

      return false;
    }

    getResult() {
      if (this.buffer.trim()) {
        const remaining = this.buffer.trim();
        for (const line of remaining.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) {
            this.processEvent("message", trimmed.slice(5).trim());
          }
        }
      }
      return {
        text: this.text,
        reasoning: this.reasoning,
        imageUrl: this.imageUrl || null,
        input_tokens: this.inputTokens,
        output_tokens: this.outputTokens,
        total_tokens: this.totalTokens,
        cached_tokens: this.cachedTokens,
        inputTokens: this.inputTokens,
        outputTokens: this.outputTokens,
        totalTokens: this.totalTokens,
        accumulatedTokens: this.totalTokens,
        initialTokens: this.inputTokens,
        cachedTokens: this.cachedTokens,
        chatId: this.chatId,
        responseId: this.responseId,
      };
    }
  }

  let _pendingCapture = null;

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const [resource, config] = args;
    const url = typeof resource === "string" ? resource : (resource && resource.url) || "";

    if (!isCompletionUrl(url)) {
      return originalFetch.apply(this, args);
    }

    log(`Intercepted fetch completions request: ${url}`, "#38bdf8");

    const response = await originalFetch.apply(this, args);
    const clone = response.clone();

    (async () => {
      const capture = _pendingCapture;
      if (!capture) return;

      const parser = new QwenSSEParser();
      try {
        const reader = clone.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const finished = parser.feed(chunk);
          if (finished) break;
        }

        const result = parser.getResult();
        if (capture === _pendingCapture && !capture._resolved) {
          capture._resolved = true;
          _pendingCapture = null;
          const tokenInfo = `tokens: in=${result.input_tokens}, out=${result.output_tokens}, total=${result.total_tokens}` +
            (result.cached_tokens ? `, cached=${result.cached_tokens}` : "");
          log(
            `Stream finished (${result.text.length} chars, ${tokenInfo})` +
            (result.reasoning ? `, reasoning: ${result.reasoning.length} chars` : ""),
            "#10b981"
          );
          capture.resolve(result);
        }
      } catch (err) {
        if (capture === _pendingCapture && !capture._resolved) {
          capture._resolved = true;
          _pendingCapture = null;
          capture.reject(err);
        }
      }
    })();

    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._qwenUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (this._qwenUrl && isCompletionUrl(this._qwenUrl)) {
      log(`Intercepted XHR completions request: ${this._qwenUrl}`, "#38bdf8");
      const capture = _pendingCapture;

      if (capture) {
        const parser = new QwenSSEParser();
        let lastLen = 0;

        this.addEventListener("progress", () => {
          const text = this.responseText || "";
          const newChunk = text.slice(lastLen);
          lastLen = text.length;
          if (newChunk) {
            parser.feed(newChunk);
          }
        });

        this.addEventListener("loadend", () => {
          const result = parser.getResult();
          if (capture === _pendingCapture && !capture._resolved) {
            capture._resolved = true;
            _pendingCapture = null;
            const tokenInfo = `tokens: in=${result.input_tokens}, out=${result.output_tokens}, total=${result.total_tokens}` +
              (result.cached_tokens ? `, cached=${result.cached_tokens}` : "");
            log(
              `Stream finished (${result.text.length} chars, ${tokenInfo})` +
              (result.reasoning ? `, reasoning: ${result.reasoning.length} chars` : ""),
              "#10b981"
            );
            capture.resolve(result);
          }
        });

        this.addEventListener("error", () => {
          if (capture === _pendingCapture && !capture._resolved) {
            capture._resolved = true;
            _pendingCapture = null;
            capture.reject(new Error("XHR completion request failed"));
          }
        });
      }
    }
    return originalSend.apply(this, args);
  };

  let activeWs = null;
  let reconnectTimer = null;

  function connect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);

    if (activeWs && (activeWs.readyState === WebSocket.CONNECTING || activeWs.readyState === WebSocket.OPEN)) {
      return;
    }

    log(`Connecting to proxy at ${WS_URL}...`, "#38bdf8");
    updateBadge("disconnected", "Bridge: Connecting...");

    let ws;
    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      log(`WebSocket error: ${e.message}`, "#ef4444");
      updateBadge("disconnected", "Bridge: Disconnected");
      reconnectTimer = setTimeout(connect, 3000);
      return;
    }

    activeWs = ws;

    ws.onopen = () => {
      log("Connected to proxy!", "#10b981");
      updateBadge("connected", "Bridge: Connected (Ready)");
    };

    ws.onclose = () => {
      if (activeWs === ws) activeWs = null;
      log("Disconnected from proxy. Retrying in 3s...", "#ef4444");
      updateBadge("disconnected", "Bridge: Disconnected");
      reconnectTimer = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      try { ws.close(); } catch (_) { }
    };

    ws.onmessage = async (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload.action === "delete_chat") {
        log("Reset chat command received from client", "#facc15");
        updateBadge("busy", "Bridge: Resetting chat...");
        try {
          await window.deleteCurrentChat();
          updateBadge("connected", "Bridge: Connected (Ready)");
          ws.send(JSON.stringify({ id: payload.id, success: true }));
        } catch (e) {
          updateBadge("connected", "Bridge: Connected (Ready)");
          ws.send(JSON.stringify({ id: payload.id, error: String(e) }));
        }
        return;
      }

      if (payload.action === "stop") {
        log("Stop command received", "#facc15");
        const stopBtn = document.querySelector(
          ".chat-prompt-send-button button.stop-button, .stop-button, button[aria-label*='Stop']"
        );
        if (stopBtn) stopBtn.click();
        return;
      }

      if (_pendingCapture) {
        try {
          _pendingCapture.reject(new Error("Superseded by new request"));
        } catch (_) { }
        _pendingCapture = null;
      }

      const { id, prompt, model, feature } = payload;
      const t0 = Date.now();
      log(`[WS] Incoming prompt (${prompt.length} chars, ID: ${id}, model: ${model || "default"})...`, "#facc15");
      updateBadge("busy", "Bridge: Submitting...");

      const capturePromise = new Promise((resolve, reject) => {
        _pendingCapture = { resolve, reject, _resolved: false };
      });

      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          _pendingCapture = null;
          reject(new Error("Qwen generation timed out"));
        }, JOB_TIMEOUT_MS);
      });

      try {
        const submitted = await submitPrompt(prompt, model, feature);
        if (!submitted) {
          throw new Error("Failed to submit prompt to Qwen input");
        }

        updateBadge("busy", "Bridge: Generating stream...");
        const result = await Promise.race([capturePromise, timeoutPromise]);
        clearTimeout(timeoutId);
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        updateBadge("connected", `Bridge: Connected (Done in ${elapsed}s)`);
        log(`[WS] Completed prompt ${id} in ${elapsed}s`, "#10b981");
        ws.send(JSON.stringify({ id, ...result }));
      } catch (err) {
        clearTimeout(timeoutId);
        _pendingCapture = null;
        updateBadge("connected", "Bridge: Connected (Ready)");
        log(`[WS] Request ${id} failed: ${err.message}`, "#ef4444");
        ws.send(JSON.stringify({ id, error: String(err) }));
      }
    };
  }

  window.__qwenBridge = {
    get wsState() {
      if (!activeWs) return "NONE";
      return ["CONNECTING", "OPEN", "CLOSING", "CLOSED"][activeWs.readyState] || "UNKNOWN";
    },
    get isBusy() {
      const stopBtn = document.querySelector(
        ".chat-prompt-send-button button.stop-button, .stop-button, button[aria-label*='Stop']"
      );
      return Boolean(stopBtn);
    },
    get currentChatId() {
      return getCurrentChatId();
    },
    get submitFn() {
      return window.mySubmit || locateQwenSubmit();
    },
    locateSubmit: () => locateQwenSubmit(),
    reconnect: () => connect(),
    reset: () => window.deleteCurrentChat(),
  };

  badge.addEventListener("click", () => {
    log("Reconnecting to proxy...", "#facc15");
    connect();
  });

  connect();
})();
