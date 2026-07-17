import React, { useState } from 'react'
import { buildBootstrapPrompt } from './onboarding.js'
import { isPromptConsoleAvailable, openPromptConsole } from './integrations/promptConsole.js'

// First-run onboarding surface (MOS-19). Renders the live setup steps derived
// from feed availability and hands the bootstrap conversation to the MOS-7
// prompt console as an editable prompt (falling back to inline copy when MOS-7
// isn't present yet). Presentational — App owns dismissal + when to show it.
export default function Onboarding({ model, meta, onDismiss }) {
  const [prompt, setPrompt] = useState(() => buildBootstrapPrompt(meta))
  const [guiding, setGuiding] = useState(false)
  const [handoff, setHandoff] = useState(null) // 'sent' | 'stub' | null
  const [copied, setCopied] = useState(false)

  const { steps, fresh } = model
  const instance = meta?.instance

  const handoffPrompt = () => {
    const delivered = openPromptConsole(prompt)
    setHandoff(delivered ? 'sent' : 'stub')
  }
  const startGuided = () => {
    setGuiding(true)
    handoffPrompt()
  }
  const copyPrompt = () => {
    Promise.resolve(navigator.clipboard?.writeText(prompt))
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {
        /* clipboard blocked/unavailable — user can still select the textarea */
      })
  }

  return (
    <section className="ob card" role="region" aria-label="First-run setup">
      <div className="ob-head">
        <h2 className="ob-title">
          Welcome to meta-os{instance ? <> <span className="dim">/</span> {instance}</> : null}
        </h2>
        {fresh && <span className="static-badge">first run</span>}
        <span className="spacer" />
        <button className="ghostbtn" onClick={onDismiss} title="Hide this until you re-open it">
          Dismiss
        </button>
      </div>

      <p className="ob-lead">
        This instance needs a bit of setup before the dashboard fills in. Each step below is
        reported live by a data source — nothing here is a fixed checklist, so it clears itself
        as you configure things.
      </p>

      {steps.length > 0 && (
        <ul className="ob-steps">
          {steps.map((s, i) => (
            <li key={i} className="ob-step">
              <span className="ob-step-reason">{s.reason}</span>
              {(s.feeds.length > 0 || s.sources.length > 0) && (
                <span className="ob-step-where hint dim">
                  affects {[...s.feeds, ...s.sources].join(', ')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="ob-actions">
        {!guiding && (
          <button className="ghostbtn ob-primary" onClick={startGuided}>
            Guide me through setup
          </button>
        )}
      </div>

      {guiding && (
        <div className="ob-guide">
          <label className="hint dim" htmlFor="ob-prompt">
            Bootstrap prompt — edit before sending:
          </label>
          <textarea
            id="ob-prompt"
            className="ob-prompt mono"
            rows={10}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="ob-guide-actions">
            <button className="ghostbtn" onClick={handoffPrompt}>
              {isPromptConsoleAvailable() ? 'Send to prompt console' : 'Retry prompt console'}
            </button>
            <button className="ghostbtn" onClick={copyPrompt}>
              {copied ? 'Copied' : 'Copy prompt'}
            </button>
          </div>
          {handoff === 'sent' && (
            <p className="hint dim">Sent to the prompt console — continue the conversation there.</p>
          )}
          {handoff === 'stub' && (
            <p className="degraded">
              Prompt console (MOS-7) isn’t available yet. Copy this prompt and run it in your engine,
              or send it here once the console ships.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
