/**
 * dsh-plugin-balance — node half.
 * A Cordis plugin that registers one HTTP route, `/dsh-balance`, which returns
 * the current provider's account balance as JSON. The browser half fetches it.
 *
 * Supports three providers (DeepSeek / Kimi / Qwen); add a family by appending
 * one entry to FAMILIES. Errors cross the wire as `errorCode` + `errorDetail`
 * so the browser half can localize; every other value is normalized through
 * `jv()` to stay lossless JSON.
 */

export const name = 'dsh-plugin-balance'
export const inject = ['webServer']

export function apply(ctx) {
  // In-run consumption baseline per family: first observed primary balance.
  const baselines = {}

  // Every value crossing the wire must be JSON: undefined -> null.
  const jv = (v) => (v === undefined ? null : v)
  const primaryTotal = (balances) => {
    const t = balances[0] !== undefined ? balances[0].total : undefined
    return t !== null && t !== undefined && t !== '' ? Number(t) : undefined
  }

  // One bounded curl GET through the subprocess seam. ctx.web.fetch cannot
  // carry an Authorization header (WebFetchRequest is url-only), so every
  // credentialed query goes through curl, which macOS/Linux ship.
  const curlGet = async (url, token) => {
    const subprocess = ctx.get('subprocess')
    if (subprocess === undefined) return { errorCode: 'no-subprocess' }
    const sandboxPolicy = ctx.get('sandboxPolicy')
    const cwd = (sandboxPolicy !== undefined && sandboxPolicy.workspaceRoot) || '/'
    try {
      const proc = subprocess.spawn({
        argv: ['curl', '-sS', '--max-time', '10', '-H', `Authorization: Bearer ${token}`, url],
        cwd,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: 65536 },
          stderr: { maxBytes: 65536 },
        },
        graceMs: 15000,
      })
      const outcome = await proc.done
      if (outcome.exitCode !== 0) {
        const errText = proc.collected.stderr !== undefined
          ? proc.collected.stderr.readFrom(0).text.trim()
          : ''
        return { errorCode: 'curl', errorDetail: `${outcome.exitCode}${errText === '' ? '' : ` ${errText}`}` }
      }
      const outText = proc.collected.stdout !== undefined
        ? proc.collected.stdout.readFrom(0).text
        : ''
      return { body: JSON.parse(outText) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { errorCode: 'request', errorDetail: message }
    }
  }

  // Connection facts mirror how each adapter layers its config: the
  // `llm-deepseek` and `llm-pi-ai` settings sections.
  const connectionFacts = (provider) => {
    const settings = ctx.get('settings')
    const read = (ns) => {
      if (settings === undefined) return undefined
      const raw = settings.get(ns)
      return raw !== null && typeof raw === 'object' ? raw : undefined
    }
    if (provider === 'deepseek-official') {
      const s = read('llm-deepseek')
      return {
        apiKeyEnv: s !== undefined && typeof s.apiKeyEnv === 'string' && s.apiKeyEnv.length > 0
          ? s.apiKeyEnv
          : 'DEEPSEEK_API_KEY',
        baseURL: s !== undefined && typeof s.baseURL === 'string' && s.baseURL.length > 0
          ? s.baseURL.replace(/\/+$/, '')
          : 'https://api.deepseek.com',
      }
    }
    const s = read('llm-pi-ai')
    const p = s !== undefined && s.providers !== null && typeof s.providers === 'object'
      ? s.providers[provider]
      : undefined
    return {
      apiKeyEnv: p !== undefined && typeof p.apiKeyEnv === 'string' && p.apiKeyEnv.length > 0
        ? p.apiKeyEnv
        : undefined,
      baseURL: p !== undefined && typeof p.baseURL === 'string' && p.baseURL.length > 0
        ? p.baseURL.replace(/\/+$/, '')
        : undefined,
    }
  }

  const FAMILIES = [
    {
      id: 'deepseek',
      label: 'DS',
      defaultEnv: 'DEEPSEEK_API_KEY',
      refreshNoteKey: 'deepseek-5min',
      match: (provider, baseURL) =>
        provider === 'deepseek-official' || /deepseek/i.test(baseURL || ''),
      async query(facts) {
        const base = facts.baseURL || 'https://api.deepseek.com'
        const res = await curlGet(`${base}/user/balance`, facts.token)
        if (res.errorCode !== undefined) return res
        const body = res.body
        return {
          balances: Array.isArray(body.balance_infos)
            ? body.balance_infos.map((e) => ({
              currency: jv(e.currency),
              total: jv(e.total_balance),
              granted: jv(e.granted_balance),
              toppedUp: jv(e.topped_up_balance),
            }))
            : [],
          flags: { isAvailable: body.is_available === true },
        }
      },
      primary: primaryTotal,
    },
    {
      id: 'kimi',
      label: 'Kimi',
      defaultEnv: 'MOONSHOT_API_KEY',
      refreshNoteKey: 'kimi-10min',
      match: (provider, baseURL) =>
        /moon|kimi/i.test(provider) || /moonshot\.(cn|ai)|kimi\.com/i.test(baseURL || ''),
      async query(facts) {
        const base = (facts.baseURL || 'https://api.moonshot.cn').replace(/\/+$/, '')
        const url = /\/v1$/i.test(base)
          ? `${base}/users/me/balance`
          : `${base}/v1/users/me/balance`
        const res = await curlGet(url, facts.token)
        if (res.errorCode !== undefined) return res
        // Official shape: { code, data: { available_balance, voucher_balance,
        // cash_balance }, scode, status }.
        const d = res.body !== null && typeof res.body === 'object'
          ? (res.body.data ?? {})
          : {}
        return {
          balances: [{
            currency: 'CNY',
            total: jv(d.available_balance),
            granted: jv(d.voucher_balance),
            toppedUp: jv(d.cash_balance),
          }],
          flags: {},
        }
      },
      primary: primaryTotal,
    },
    {
      id: 'qwen',
      label: 'Qwen',
      defaultEnv: 'DASHSCOPE_API_KEY',
      refreshNoteKey: null,
      match: (provider, baseURL) =>
        /qwen|dashscope|bailian/i.test(provider) || /dashscope\.aliyuncs\.com/i.test(baseURL || ''),
      // Bailian Token Plan is console-only today (no API-key balance endpoint).
      async query() {
        return { unsupported: 'token-plan' }
      },
      primary: () => undefined,
    },
  ]

  const query = async () => {
    const defaultModel = ctx.get('agentDefaultModel')
    const selection = defaultModel === undefined ? undefined : defaultModel.currentSelection()
    const provider = selection === undefined ? null : selection.provider
    const model = selection === undefined ? null : selection.model
    if (provider === null) return { mode: 'other', provider: null, model }

    const facts = connectionFacts(provider)
    const family = FAMILIES.find((f) => f.match(provider, facts.baseURL))
    if (family === undefined) return { mode: 'other', provider, model }

    const credentials = ctx.get('credentials')
    const envName = facts.apiKeyEnv ?? family.defaultEnv
    if (credentials === undefined) {
      return { mode: family.id, family: family.label, provider, model, errorCode: 'no-credentials' }
    }
    const hit = await credentials.resolve(envName)
    if (hit === undefined) {
      return { mode: family.id, family: family.label, provider, model, errorCode: 'missing-key', errorDetail: envName }
    }
    facts.token = hit.value

    const result = await family.query(facts)
    if (result.errorCode !== undefined) {
      return {
        mode: family.id,
        family: family.label,
        provider,
        model,
        errorCode: result.errorCode,
        errorDetail: result.errorDetail === undefined ? null : result.errorDetail,
      }
    }
    if (result.unsupported !== undefined) {
      return { mode: family.id, family: family.label, provider, model, unsupported: result.unsupported, refreshNoteKey: family.refreshNoteKey }
    }

    const primary = family.primary(result.balances)
    let consumed = null
    if (primary !== undefined && Number.isFinite(primary)) {
      if (baselines[family.id] === undefined) baselines[family.id] = primary
      consumed = primary <= baselines[family.id] ? baselines[family.id] - primary : 0
    }
    return {
      mode: family.id,
      family: family.label,
      provider,
      model,
      flags: result.flags,
      balances: result.balances,
      consumed,
      refreshNoteKey: family.refreshNoteKey,
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-balance',
    handler: async (_req, res) => {
      try {
        const payload = await query()
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(payload))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ mode: 'other', provider: null, model: null, errorCode: 'request', errorDetail: message }))
      }
    },
  }), 'dsh-plugin-balance: /dsh-balance route')
}
