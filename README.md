# dsh-balance-plugin

[English](README.md) | [中文](README.zh-CN.md)

Shows your model provider's account balance in a persistent readout line under the composer in the [DeepSeek Harness](https://github.com/lucaslus/deepseek-harness-desktop) web client.

- **DeepSeek**: total / topped-up / granted balance + account availability
- **Kimi (Moonshot)**: available / cash / voucher balance (a negative cash balance is flagged ⚠ overdue)
- **Qwen (Alibaba Cloud Bailian)**: mode is detected with a console-only note (the Bailian API key exposes no balance endpoint)

The readout matches the built-in stats line (`tok/s · cache hit %`) typography, sits on its own second line, and is left-aligned against the same content column. The official data-freshness note renders as trailing text; the UI language (zh/en) follows the client.

## Preview

<img src="docs/dsh-balance.png" alt="Balance readout preview" width="720">

## Install

### One-liner (curl)

```sh
curl -fsSL https://raw.githubusercontent.com/lucaslus/dsh-balance-plugin/main/install.sh | bash
```

Installs into the `web` profile by default; pick a profile:

```sh
DSH_PROFILE=web curl -fsSL https://raw.githubusercontent.com/lucaslus/dsh-balance-plugin/main/install.sh | bash
```

If the `dsh` command is not installed, the script falls back to `npx --yes @deepseek-ai/dsh` (the harness CLI is published as an npm package), so the plugin installs either way. The same fallback applies when restarting the client — see the hint the installer prints.

### Manual

```sh
dsh plugin --profile web add github:lucaslus/dsh-balance-plugin
```

No `dsh`? Run the same command through npx:

```sh
npx --yes @deepseek-ai/dsh plugin --profile web add github:lucaslus/dsh-balance-plugin
```

## Restart required after install

This plugin ships a browser half (`dsh.client`), which is scanned into the browser plugin table when the `dsh` process starts; Web HMR is currently disabled. So **restart the client after installing** before the readout loads:

```sh
dsh --profile web
```

## Configuration

The plugin detects the provider from the current model route and reuses each model adapter's own credential configuration — nothing to fill in:

| Provider | API key env (default) |
|---|---|
| DeepSeek | `DEEPSEEK_API_KEY` |
| Kimi | `KIMI_API_KEY` (or `MOONSHOT_API_KEY`) |
| Qwen | `DASHSCOPE_API_KEY` |

If you configured a custom `apiKeyEnv` or `baseURL` for a model in settings, the plugin follows it.

## Data freshness (official)

| Provider | Official delay |
|---|---|
| DeepSeek | Data may be delayed up to 5 minutes (GMT+8) |
| Kimi | Balance and today's consumption may be delayed ~10 minutes |

The note renders at the end of the readout line. The plugin polls the balance endpoint every 5 seconds, but the numbers themselves are subject to the official delays above, so no change within a short window is expected.

## Companion client

This plugin is an extension of DeepSeek Harness — use it together with the client:

- DeepSeek Harness client: <https://github.com/lucaslus/deepseek-harness-desktop>

## Known limitations

- **Qwen / Bailian Token Plan**: Bailian has no usable API-key balance endpoint (official queries require the console), so the plugin only detects the mode and shows a note.
- **"Used this run"**: the DeepSeek / Kimi balance APIs return remaining amounts only, not historical consumption. The plugin takes the first balance read after startup as its baseline; the delta is the run's consumption, and the baseline resets on restart.
- The balance query relies on local `curl` (bundled with macOS / Linux).

## Development

- `index.js` — node half: registers the `/dsh-balance` HTTP route, queries the balance, returns JSON. The `FAMILIES` array is the extension point — add a provider by appending one entry.
- `client.js` — browser half: a hand-written `window.__ModuleLoader__.load` client bundle that renders the `conversation.composer.dock` readout.
- `cordis.patch.yml` — the bundle patch layer inserting the plugin row.

## License

MIT
