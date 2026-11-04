// codegraph: component agent-window
import { useState } from 'react'
import type { AgentConnection } from '../../features/connect-agent.js'
import { Button, Sheet } from '../design-system/kit.js'

/** How to connect the agent a person already uses: one command, run once. */
export const AgentWindow = ({ connection, onClose }: { connection: AgentConnection | null; onClose: () => void }) => {
  const [copied, setCopied] = useState(false)
  return (
    <Sheet title="Your agent" onClose={onClose} wide>
      <div className="ds-hint">
        Your own agent sets repos up and builds what you draw, through the codegraph MCP. Run this once in a
        terminal to connect Claude Code to it, in every repo on this computer. Then ask it to set a repo up for
        codegraph.
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
    </Sheet>
  )
}
