// codegraph: component proposal-panel
import type { AgentShown } from '../../features/show-map.js'
import type { Progress } from '../../modules/reader/index.js'
import { Button } from '../design-system/kit.js'

const MARK: Record<string, { state: string; words: string }> = {
  'to build': { state: 'proposed', words: 'To build' },
  built: { state: 'built', words: 'Built' },
  'to remove': { state: 'gone', words: 'To remove' },
  removed: { state: 'built', words: 'Removed' },
}

/** The proposal on a branch, as a list: each thing it draws and how it
 *  stands, what changed that it does not draw, and where the agent is. */
export const ProposalPanel = ({
  progress,
  agent,
  onClose,
}: {
  progress: Progress
  agent: AgentShown | null
  onClose: () => void
}) => (
  <aside className="map-problems map-proposal-list" aria-label="The proposal on this branch">
    <div className="ds-row" style={{ justifyContent: 'space-between' }}>
      <span className="ds-label">{progress.says || 'The proposal on this branch'}</span>
      <Button look="bare" onClick={onClose}>
        Close
      </Button>
    </div>
    <div className="ds-hint">
      {progress.built
        ? 'Built: everything it draws is in the code. Once the tests pass, the agent deletes it in the same change.'
        : agent
          ? `The agent is on ${agent.name}${agent.words ? `: ${agent.words}` : ''}.`
          : 'Ask your agent to build the proposal on this branch. The map changes as it works.'}
    </div>
    <ul>
      {progress.items.map((item) => (
        <li key={`${item.what}:${item.name}`}>
          <span className={`map-state map-state--${MARK[item.state]!.state}`}>{MARK[item.state]!.words}</span>
          <span>{item.what === 'wire' ? `wire: ${item.name}` : item.name}</span>
        </li>
      ))}
    </ul>
    {progress.unasked.length ? (
      <>
        <span className="ds-label">Changed, but not drawn</span>
        <ul>
          {progress.unasked.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      </>
    ) : null}
  </aside>
)
