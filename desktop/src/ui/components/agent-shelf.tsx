// codegraph: component agent-shelf
import { useState } from 'react'
import type { AgentConnection } from '../../features/connect-agent.js'
import { Button, Card } from '../design-system/kit.js'

/** How to connect the agent a person already uses, shown once and quietly. */
export const AgentShelf = ({ connection }: { connection: AgentConnection | null }) => {
  const [copied, setCopied] = useState(false)
  if (!connection) return null
  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 15, marginBottom: 10 }}>Your agent</h2>
      <Card quiet>
        <div className="ds-hint" style={{ marginBottom: 10 }}>
          Your own agent sets repos up and builds what you draw, through the codegraph MCP. Run this
          once in a terminal to connect Claude Code to it, in every repo on this computer. Then ask it
          to set a repo up for codegraph.
        </div>
        <div className="ds-row" style={{ justifyContent: 'space-between', gap: 12 }}>
          <code className="ds-mono" style={{ overflowWrap: 'anywhere' }}>
            {connection.command}
          </code>
          <Button
            onClick={() => {
              void navigator.clipboard.writeText(connection.command).then(() => setCopied(true))
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        {connection.ready ? null : (
          <div className="ds-hint" style={{ marginTop: 8 }}>
            The MCP is not built yet: run <span className="ds-mono">npm run build</span> in the app's
            folder first.
          </div>
        )}
      </Card>
    </div>
  )
}
