// codegraph: component proposal-panel
import { X } from 'lucide-react'
import type { AgentShown } from '../../features/show-map.js'
import type { Progress } from '../../modules/reader/index.js'
import { Button } from '../design-system/kit.js'
import { PromptToCopy } from './hand-to-agent.js'

const MARK: Record<string, { state: string; words: string }> = {
  'to build': { state: 'proposed', words: 'To build' },
  built: { state: 'built', words: 'Built' },
  'to remove': { state: 'gone', words: 'To remove' },
  removed: { state: 'built', words: 'Removed' },
}

/** How wide the panel is, with the gap it keeps from the edge, so the map
 *  can keep what it centres on clear of it. */
export const PROPOSAL_PANEL_COVERS = 420 + 24

/** A thing a proposal names, said the way a person would: "web/feature
 *  find-notes" is "find-notes" and a feature; "web" is a container. */
const plainly = (item: Progress['items'][number]): { name: string; kind: string } => {
  if (item.what === 'container') return { name: item.name, kind: 'container' }
  const slash = item.name.indexOf('/')
  if (slash < 0) return { name: item.name, kind: item.what }
  const [kind = '', ...rest] = item.name.slice(slash + 1).split(' ')
  return rest.length ? { name: rest.join(' '), kind } : { name: kind, kind: item.what }
}

/** A wire as a sentence of names: "web/page search asks web/feature
 *  find-notes" reads "search asks find-notes". */
const wireWords = (name: string): string => name.replace(/[^\s/]+\/[^\s/]+ /g, '')

/** The proposal on a branch, as a list: each thing it draws and how it
 *  stands, what changed that it does not draw, and where the agent is. It
 *  gives the words that set an agent building it, and goes to each card. */
export const ProposalPanel = ({
  progress,
  agent,
  prompt,
  onGoTo,
  onOpenSketch,
  onClose,
}: {
  progress: Progress
  agent: AgentShown | null
  /** What to paste into an agent to build it. */
  prompt: string
  /** Goes to where a card of the proposal is drawn. */
  onGoTo: (id: string) => void
  /** Opens the sketch it was made from, when that is still in the project. */
  onOpenSketch?: () => void
  onClose: () => void
}) => (
  <aside className="map-problems map-proposal-list" aria-label="The proposal on this branch">
    <div className="map-proposal-head">
      <span className="map-proposal-title">{progress.says || 'The proposal on this branch'}</span>
      <button type="button" className="ds-sheet-close" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
    <div className="ds-hint">
      {progress.built
        ? 'Built: everything it draws is in the code. Once the tests pass, the agent deletes it in the same change.'
        : agent
          ? `The agent is on ${agent.name}${agent.words ? `: ${agent.words}` : ''}.`
          : 'Nobody is building it yet. Paste this into your agent; the map changes as it works.'}
    </div>
    {progress.built || agent ? null : <PromptToCopy prompt={prompt} words="Copy the prompt to build it" />}
    {onOpenSketch ? (
      <div>
        <Button look="bare" onClick={onOpenSketch}>
          Open the sketch it came from
        </Button>
      </div>
    ) : null}
    <ul>
      {progress.items.map((item) => {
        const said = plainly(item)
        return (
          <li key={`${item.what}:${item.name}`}>
            <button
              type="button"
              className="map-proposal-item"
              title={item.what === 'wire' ? item.name : `${item.name}. Go to it on the map`}
              disabled={item.what === 'wire' || !item.id}
              onClick={() => onGoTo(item.id)}
            >
              <span className={`map-state map-state--${MARK[item.state]!.state}`}>{MARK[item.state]!.words}</span>
              {item.what === 'wire' ? (
                <span>{wireWords(item.name)}</span>
              ) : (
                <span>
                  {said.name}
                  <span className="map-proposal-kind"> · {said.kind}</span>
                </span>
              )}
            </button>
          </li>
        )
      })}
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
