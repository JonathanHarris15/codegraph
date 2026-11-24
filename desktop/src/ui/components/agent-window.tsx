// codegraph: component agent-window
import { useState } from 'react'
import type { AgentConnection } from '../../features/connect-agent.js'
import { Button, Sheet } from '../design-system/kit.js'
import { said, useCleanUp } from './agent-notice.js'

/** How to connect the agent a person already uses: one command, run once.
 *  Where an older codegraph is still in it, what that is and how to clear it
 *  out instead (ADR 0039). Beside either, the way to what codegraph tells that
 *  agent. */
export const AgentWindow = ({
  connection,
  onClose,
  onInstructions,
  onChanged,
}: {
  connection: AgentConnection | null
  onClose: () => void
  /** Goes to the page of what codegraph tells agents, where there is one. */
  onInstructions?: () => void
  /** Hears how the agent stands after it is cleaned up. */
  onChanged?: (connection: AgentConnection) => void
}) => {
  const { busy, result, cleanUp } = useCleanUp(onChanged ?? (() => undefined))
  const behind = connection?.behind ?? []
  return (
    <Sheet title="Your agent" onClose={onClose} wide>
      {connection && behind.length > 0 ? (
        <>
          <div className="ds-hint">
            <strong>Not up to date:</strong> {said(behind)}.{' '}
            {connection.canCleanUp
              ? 'The app can fix this with Claude Code’s own command, or you can run these yourself:'
              : 'Run these in a terminal, then start a new Claude Code session:'}
          </div>
          <code className="ds-mono ds-command agent-steps">{connection.steps.join('\n')}</code>
          {result?.problem ? <div className="ds-hint agent-problem">{result.problem}</div> : null}
          {connection.canCleanUp ? (
            <div className="ds-sheet-actions">
              <Button look="loud" onClick={() => void cleanUp()} disabled={busy}>
                {busy ? 'Working…' : 'Clean up'}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {result && !result.problem ? (
            <div className="ds-hint">
              <strong>Up to date.</strong> Start a new Claude Code session to use it.
            </div>
          ) : null}
          <FirstTime connection={connection} />
        </>
      )}
      {onInstructions ? (
        <div className="hand-agent-foot">
          <span className="ds-hint">Codegraph tells your agent how to work in your repos. The words are yours to change.</span>
          <Button look="bare" onClick={onInstructions}>
            Agent instructions
          </Button>
        </div>
      ) : null}
    </Sheet>
  )
}

/** The one command that connects Claude Code the first time. */
const FirstTime = ({ connection }: { connection: AgentConnection | null }) => {
  const [copied, setCopied] = useState(false)
  return (
    <>
      <div className="ds-hint">
        Your own agent sets repos up and builds what you draw. Run this once in a terminal to give Claude Code
        codegraph's skills and connect it to this app, in every repo on this computer. Then start a new session and
        ask it to set a repo up for codegraph.
      </div>
      {connection ? (
        <>
          <code className="ds-mono ds-command">{connection.command}</code>
          <div className="ds-sheet-actions">
            <Button
              look="loud"
              onClick={() => {
                void navigator.clipboard.writeText(connection.command).then(() => setCopied(true))
              }}
            >
              {copied ? 'Copied' : 'Copy the command'}
            </Button>
          </div>
          {connection.ready ? null : (
            <div className="ds-hint">
              The MCP is not built yet: run <span className="ds-mono">npm run build</span> in the app's folder first.
            </div>
          )}
        </>
      ) : (
        <div className="ds-hint">Finding the MCP…</div>
      )}
    </>
  )
}
