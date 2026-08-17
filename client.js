// dsh-plugin-balance — browser half, hand-written client bundle.
// Registered into `conversation.composer.dock` (the ambient readout line under
// the composer card, beside the shipped stats row). Follows the
// window.__ModuleLoader__.load protocol the shell seeds into the module table:
// `react` resolves from the frozen module table (external); everything else is
// inlined here. Data comes from the node half's `/dsh-balance` route via fetch,
// re-polled every 10s, with an immediate re-query when a provider switch is
// detected.
window.__ModuleLoader__.load({
  id: 'dsh-plugin-balance',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')

    const TEXTS = {
      zh: {
        prefix: '余额', querying: '查询中…', switching: '切换中…', fetchFailed: '获取失败',
        unsupported: '暂不支持该模型的余额查询', noInfo: '无余额信息', cash: '现金', voucher: '代金券',
        usedRun: '运行期已耗', overdue: '⚠ 欠费', unavailable: '⚠ 账户不可用',
        noCredentials: '凭据服务未挂载', noSubprocess: '进程服务未挂载',
        missingKey: '未找到 {env}，请在设置或环境变量中配置', curl: '请求失败', request: '请求失败',
        tokenPlan: 'Token Plan 需在控制台查询，API Key 暂无余额接口',
      },
      en: {
        prefix: 'Balance', querying: 'querying…', switching: 'switching…', fetchFailed: 'fetch failed',
        unsupported: 'balance query not supported for this model', noInfo: 'no balance info',
        cash: 'cash', voucher: 'voucher', usedRun: 'used this run', overdue: '⚠ overdue',
        unavailable: '⚠ account unavailable', noCredentials: 'credential service unavailable',
        noSubprocess: 'subprocess service unavailable',
        missingKey: 'missing {env}; configure it in settings or the environment',
        curl: 'request failed', request: 'request failed',
        tokenPlan: 'Token Plan requires the console; no API-key balance endpoint yet',
      },
    }

    const REFRESH_NOTES = {
      'deepseek-5min': {
        zh: 'DeepSeek 官方：数据最多延迟 5 分钟（GMT+8）',
        en: 'DeepSeek official: data may be delayed up to 5 minutes (GMT+8)',
      },
      'kimi-10min': {
        zh: 'Kimi 官方：可用余额、今日消费及总消费约延迟 10 分钟',
        en: 'Kimi official: balance and consumption may be delayed ~10 minutes',
      },
    }

    const ROW_STYLE = {
      display: 'block', textAlign: 'left', maxWidth: 'var(--dsh-chat-content-width)',
      width: '100%', margin: '0 auto', boxSizing: 'border-box',
      padding: '0 calc(var(--dsh-composer-side-clearance) + 16px)',
      fontSize: '12px', lineHeight: '20px', fontWeight: '400',
      color: 'var(--dsw-alias-label-tertiary)',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }

    // Inline SVG info icon (no font glyph, so it never falls back to a box).
    const InfoIcon = (note) => React.createElement('svg', {
      width: '11', height: '11', viewBox: '0 0 16 16',
      fill: 'none', stroke: 'currentColor', strokeWidth: '1.5',
      style: { verticalAlign: '-1px', marginLeft: '3px', opacity: '0.6', cursor: 'help', flexShrink: '0' },
      title: note,
      'aria-label': note,
    },
      React.createElement('circle', { cx: '8', cy: '8', r: '6.5' }),
      React.createElement('path', { d: 'M8 7.2v4.6', strokeLinecap: 'round' }),
      React.createElement('circle', { cx: '8', cy: '4.6', r: '0.9', fill: 'currentColor', stroke: 'none' }),
    )

    const inject = ['slots', 'locale']

    function apply(ctx) {
      const timerService = ctx.get('timer')
      const localeService = ctx.locale

      function BalanceReadout() {
        const lang = localeService !== undefined && localeService.getSnapshot().active === 'en' ? 'en' : 'zh'
        const t = TEXTS[lang]
        const [state, setState] = React.useState({ status: 'loading' })
        const prevProvider = React.useRef(null)
        const inflight = React.useRef(false)

        React.useEffect(() => {
          let cancelled = false
          const refresh = async () => {
            if (inflight.current) return
            inflight.current = true
            try {
              const response = await fetch('/dsh-balance')
              const data = await response.json()
              if (cancelled) return
              if (prevProvider.current !== null && data.provider !== prevProvider.current) {
                // A model switch happened since the last poll: acknowledge it
                // now (switching state) and re-query immediately.
                prevProvider.current = data.provider
                setState({ status: 'switching', provider: data.provider })
                inflight.current = false
                refresh()
                return
              }
              prevProvider.current = data.provider
              setState({ status: 'ok', data })
            } catch (error) {
              if (!cancelled) {
                const message = error instanceof Error ? error.message : String(error)
                setState({ status: 'error', message })
              }
            } finally {
              inflight.current = false
            }
          }
          refresh()
          let dispose
          if (timerService !== undefined) dispose = timerService.interval(refresh, 10000)
          return () => {
            cancelled = true
            if (dispose !== undefined) dispose()
          }
        }, [])

        const refreshNote = (data) => {
          const key = data !== undefined && data !== null ? data.refreshNoteKey : null
          if (key === null || key === undefined) return null
          const note = REFRESH_NOTES[key]
          return note !== undefined ? note[lang] : null
        }

        let text
        if (state.status === 'loading') text = `${t.prefix} · ${t.querying}`
        else if (state.status === 'switching') text = `${t.prefix} · ${t.switching}`
        else if (state.status === 'error') text = `${t.prefix} · ${t.fetchFailed}：${state.message}`
        else {
          const data = state.data
          if (data.mode === 'other') text = `${t.prefix} · ${t.unsupported}`
          else if (data.errorCode !== undefined && data.errorCode !== null) {
            const detail = data.errorDetail === null || data.errorDetail === undefined ? '' : String(data.errorDetail)
            if (data.errorCode === 'missing-key') text = `${data.family} · ${t.missingKey.replace('{env}', data.errorDetail)}`
            else if (data.errorCode === 'no-credentials') text = `${data.family} · ${t.noCredentials}`
            else if (data.errorCode === 'no-subprocess') text = `${data.family} · ${t.noSubprocess}`
            else text = `${data.family} · ${t[data.errorCode] ?? t.request}${detail === '' ? '' : ` (${detail})`}`
          } else if (data.unsupported !== undefined && data.unsupported !== null) text = `${data.family} · ${t.tokenPlan}`
          else {
            const first = data.balances !== undefined && data.balances.length > 0 ? data.balances[0] : undefined
            if (first === undefined) text = `${data.family} · ${t.noInfo}`
            else {
              const parts = [`${data.family} · ${first.currency} ¥${first.total}`]
              if (first.toppedUp !== null && first.toppedUp !== undefined && String(first.toppedUp) !== '') {
                parts.push(`${t.cash} ¥${first.toppedUp}`)
                if (Number(first.toppedUp) < 0) parts.push(t.overdue)
              }
              if (first.granted !== null && first.granted !== undefined && String(first.granted) !== '') {
                parts.push(`${t.voucher} ¥${first.granted}`)
              }
              if (data.consumed !== null && data.consumed !== undefined) parts.push(`${t.usedRun} ¥${data.consumed.toFixed(2)}`)
              if (data.flags !== undefined && data.flags.isAvailable === false) parts.push(t.unavailable)
              text = parts.join(' · ')
            }
          }
        }

        const note = state.status === 'ok' ? refreshNote(state.data) : null
        return React.createElement('div', { style: ROW_STYLE },
          text,
          note === null ? null : InfoIcon(note),
        )
      }

      ctx.slots.inject('conversation.composer.dock', () =>
        ctx.slots.register(
          { name: 'conversation.composer.dock', id: 'balance', order: 1 },
          BalanceReadout,
        ),
      )
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
