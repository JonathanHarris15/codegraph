// codegraph: component agent-notice
import { useState } from 'react'
import type { CleanedUp } from '../../features/clean-up-agent.js'
import type { AgentConnection } from '../../features/connect-agent.js'
import { Button } from '../design-system/kit.js'

/** What the one button does, said for what is behind: installing the skills,
 *  updating them, or clearing out an older codegraph. */
const buttonFor = (behind: string[]): string =>
  behind.every((b) => b.includes('not installed'))
    ? 'Install'
    : behind.every((b) => b.includes('older than this app'))
      ? 'Update'
      : 'Clean up'

const titleFor = (behind: string[]): string =>
  behind.every((b) => b.includes('not installed')) ? "Your agent doesn't have codegraph's skills" : 'Your agent has an older codegraph'

/** Brings the agent up to date through the app, then reads how it stands. */
export const useCleanUp = (onChanged: (connection: AgentConnection) => void) => {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CleanedUp | null>(null)
  const cleanUp = async (): Promise<void> => {
    setBusy(true)
    try {
      setResult(await window.codegraph.cleanUpAgent())
      onChanged(await window.codegraph.connectAgent())
    } finally {
      setBusy(false)
    }
  }
  return { busy, result, cleanUp, forget: () => setResult(null) }
}

/** The behind list as a sentence: "a, b and c". */
export const said = (behind: string[]): string =>
  behind.length < 2 ? (behind[0] ?? '') : `${behind.slice(0, -1).join(', ')} and ${behind[behind.length - 1]}`

/** The person's word, kept until the window closes, so the notice does not
 *  come back on every visit to the projects page. */
const SAID_NOT_NOW = 'codegraph.agent.not-now'
const notNowTo = (): string => {
  try {
    return window.sessionStorage.getItem(SAID_NOT_NOW) ?? ''
  } catch {
    return ''
  }
}

/** A note in the corner of the projects page when Claude Code has an older
 *  codegraph than this app, or none, with the one click that brings it up to
 *  date (ADR 0039). Where the app cannot run Claude Code's command, it opens
 *  the Your agent window, which has the commands to run by hand. */
export const AgentNotice = ({
  connection,
  onChanged,
  onShowMe,
}: {
  connection: AgentConnection | null
  onChanged: (connection: AgentConnection) => void
  onShowMe: () => void
}) => {
  const { busy, result, cleanUp, forget } = useCleanUp(onChanged)
  const [hidden, setHidden] = useState(notNowTo)
  const behind = connection?.behind ?? []
  const notNow = (): void => {
    const what = behind.join('|')
    setHidden(what)
    try {
      window.sessionStorage.setItem(SAID_NOT_NOW, what)
    } catch {
      // Remembered for this page only, then.
    }
  }

  if (result && !result.problem)
    return (
      <aside className="update-notice" role="status" aria-label="Your agent is up to date">
        <div className="update-notice-words">
          <strong>Your agent is up to date</strong>
          <span>Start a new Claude Code session to use it.</span>
        </div>
        <div className="update-notice-actions">
          <Button look="bare" onClick={forget}>
            OK
          </Button>
        </div>
      </aside>
    )
  if (result?.problem)
    return (
      <aside className="update-notice" role="status" aria-label="Your agent is not up to date yet">
        <div className="update-notice-words">
          <strong>Not done yet</strong>
          <span>{result.problem}</span>
        </div>
        <div className="update-notice-actions">
          <Button look="bare" onClick={forget}>
            Not now
          </Button>
          <Button look="loud" onClick={onShowMe}>
            Show me how
          </Button>
        </div>
      </aside>
    )
  if (behind.length === 0 || hidden === behind.join('|')) return null
  const title = titleFor(behind)
  return (
    <aside className="update-notice" role="status" aria-label={title}>
      <div className="update-notice-words">
        <strong>{title}</strong>
        <span>{said(behind).replace(/^./, (c) => c.toUpperCase())}.</span>
      </div>
      <div className="update-notice-actions">
        <Button look="bare" onClick={notNow}>
          Not now
        </Button>
        {connection?.canCleanUp ? (
          <Button look="loud" onClick={() => void cleanUp()} disabled={busy}>
            {busy ? 'Working…' : buttonFor(behind)}
          </Button>
        ) : (
          <Button look="loud" onClick={onShowMe}>
            Show me how
          </Button>
        )}
      </div>
    </aside>
  )
}
