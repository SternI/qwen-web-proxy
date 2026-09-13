# Qwen Web Proxy

OpenAI-compatible local API proxy for Qwen Web (`chat.qwen.ai` & `chat.qwenlm.ai`).

Allows you to use Qwen models and specialized features (**Web Search**, **Deep Research**, **Agent Mode**, and **Image Generation**) with any OpenAI-compatible client or SDK.

---

## Disclaimer

This repository is created for **educational and research purposes only**. It demonstrates browser automation, WebSocket bridging, and local reverse proxy architectures. It is not affiliated with, endorsed by, or sponsored by Alibaba or Qwen.

---

## Features

- **OpenAI Chat Compatibility**: Exposes `http://127.0.0.1:1338/v1/chat/completions` and `/v1/models`.
- **OpenAI Images API**: Exposes `http://127.0.0.1:1338/v1/images/generations` powered by `qwen-image-3.0-pro`.
- **Native Feature Modes**:
  - `qwen-search`: Live web search enabled.
  - `qwen-deep-search` / `qwen-deep-thinking`: Deep thinking / deep search.
  - `qwen-deep-research`: Advanced multi-step research mode.
  - `qwen-agent`: Qwen Agent Mode (web search + code interpreter + execution).
  - `qwen-image` / `qwen-image-3.0-pro`: Text-to-image creation returning direct image URLs.
- **Native Tool Calling**: Automatically translates tool schemas to the model and parses `<tool_call>` outputs into OpenAI function call structures.
- **XML Tool Protocol Support**: Compatibility with agent XML tool formats (`<attempt_completion>`, `<ask_followup_question>`).
- **Real-Time Token Usage Tracking**: Intercepts native token usage (`prompt_tokens`, `completion_tokens`, `total_tokens`, and cached tokens).
- **Reasoning / Thinking Mode**: Extracts thinking process into `reasoning_content` delta chunks.
- **Chat Management**: Use `/clear`, `/reset`, `/new`, or `/deleteCurrentChat` in chat to automatically start a fresh session.
- **Lightweight**: Pure Python (`aiohttp`) + Tampermonkey userscript with zero heavy browser automation dependencies (no Selenium/Playwright).

---

## Quick Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Install Userscript

1. Install Tampermonkey or Violentmonkey in your browser.
2. Create a new userscript and paste the contents of [`qwen-bridge.user.js`](./qwen-bridge.user.js).
3. Navigate to [chat.qwen.ai](https://chat.qwen.ai/) (or [chat.qwenlm.ai](https://chat.qwenlm.ai/)).
4. You will see a badge at the bottom-right: **Bridge: Connected (Ready)** once the proxy is running.

### 3. Start the Proxy

```bash
python qwen-proxy.py
```

Options:
- `--host 127.0.0.1`: Listening host (default: `127.0.0.1`).
- `--port 1338`: Listening port (default: `1338`).
- `--reset-threshold 150000`: Auto-reset chat session if total tokens exceed threshold (default: `150000`, `0` to disable).

---

## Client Configration

Use these basic settings in any OpenAI-compatible client:

- **Base URL**: `http://127.0.0.1:1338/v1`
- **API Key**: `nah`
- **Models**:
  - `qwen-chat` (standard chat, uses whichever model is active in the web UI)
  - `qwen-search` (live web search)
  - `qwen-deep-search` (deep search / thinking)
  - `qwen-deep-research` (advanced research mode)
  - `qwen-agent` (agent mode with search & tools)
  - `qwen-image` (text-to-image generation)

---

## Python Example

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:1338/v1",
    api_key="nah",
)

response = client.chat.completions.create(
    model="qwen-chat",
    messages=[{"role": "user", "content": "What's Up"}],
    stream=True,
)

for chunk in response:
    content = chunk.choices[0].delta.content or ""
    print(content, end="", flush=True)
```

---

## Notes & Chat Management

- Keep the browser tab open while using the proxy.
- If the browser badge shows disconnected, click it to reconnect immediately.
- Auto-resets the browser chat when session tokens reach 150k (configurable via `--reset-threshold`) to prevent context overflows.
- To reset manually, send `/clear`, `/reset`, or `/new` directly from your client prompt (or run `window.deleteCurrentChat()` in the browser console).

---

## License

MIT
