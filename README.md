# Qwen Web Proxy

OpenAI-compatible local API proxy for Qwen Web (`chat.qwen.ai` & `chat.qwenlm.ai`).

Allows you to use Qwen models (**Qwen Chat**, **Deep Search / Thinking**, and **Web Search**) with OpenCode or any OpenAI-compatible client.

---

## Disclaimer

This project is for educational and research purposes only. It is not affiliated with or endorsed by Alibaba or Qwen.

---

## Features

- **OpenAI API Compatibility**: Exposes `http://127.0.0.1:1338/v1/chat/completions` and `/v1/models`.
- **Reasoning / Thinking**: Streams thinking / reasoning process into `reasoning_content` delta chunks in real-time.
- **Tool Calling**: Translates tool schemas and parses `<tool_call>` outputs into OpenAI function call structures for agent tools (`write`, `edit`, `bash`, `read`).
- **Real-Time Token Tracking**: Reports native token usage (`prompt_tokens`, `completion_tokens`, `total_tokens`, and cached tokens).
- **Chat Management**: Send `/clear`, `/reset`, or `/new` in chat to start a clean conversation session.
- **Lightweight**: Pure Python (`aiohttp`) + Tampermonkey script with no heavy automation frameworks.

---

## Quick Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Install Userscript

1. Install [Tampermonkey](https://www.tampermonkey.net/) or Violentmonkey in your browser.
2. Create a new userscript and paste the contents of [`qwen-bridge.user.js`](./qwen-bridge.user.js).
3. Open [chat.qwen.ai](https://chat.qwen.ai/) (or [chat.qwenlm.ai](https://chat.qwenlm.ai/)) and log in.
4. You will see a badge at the bottom-right: **Bridge: Connected (Ready)** once the proxy is running.

### 3. Start the Proxy

```bash
python qwen-proxy.py
```

Options:
- `--host 127.0.0.1`: Listening host (default: `127.0.0.1`).
- `--port 1338`: Listening port (default: `1338`).
- `--reset-threshold 150000`: Auto-reset chat session if tokens exceed limit (default: `150000`, `0` to disable).

---

## OpenCode Configration

Add this provider to your OpenCode config (`opencode.jsonc`):

```json
{
  "provider": {
    "qwen-proxy": {
      "api": "openai",
      "name": "Qwen Web Proxy",
      "options": {
        "baseURL": "http://127.0.0.1:1338/v1",
        "apiKey": "nah",
        "timeout": 300000,
        "chunkTimeout": 300000
      },
      "models": {
        "qwen-chat": {
          "id": "qwen-chat",
          "name": "Qwen Chat (Web Proxy)",
          "tool_call": true,
          "temperature": true
        },
        "qwen-deep-search": {
          "id": "qwen-deep-search",
          "name": "Qwen Deep Search / Thinking (Web Proxy)",
          "tool_call": true,
          "reasoning": true,
          "temperature": true
        },
        "qwen-search": {
          "id": "qwen-search",
          "name": "Qwen Web Search (Web Proxy)",
          "tool_call": true,
          "temperature": true
        }
      }
    }
  }
}
```

---

## Other Clients (Cline, Cursor, etc.)

- **Base URL**: `http://127.0.0.1:1338/v1`
- **API Key**: `nah`
- **Models**:
  - `qwen-chat`: Standard chat (uses active model in web UI)
  - `qwen-deep-search`: Thinking / deep search enabled
  - `qwen-search`: Live web search enabled

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
    messages=[{"role": "user", "content": "Hello Qwen"}],
    stream=True,
)

for chunk in response:
    reasoning = getattr(chunk.choices[0].delta, "reasoning_content", None)
    if reasoning:
        print(reasoning, end="", flush=True)
    content = chunk.choices[0].delta.content or ""
    print(content, end="", flush=True)
```

---

## Notes & Chat Management

- Keep the browser tab open while using the proxy.
- If the badge shows disconnected, click it to reconnect immediately.
- To reset manually, send `/clear`, `/reset`, or `/new` directly from your client prompt (or run `window.deleteCurrentChat()` in the browser console).

---

## License

MIT
