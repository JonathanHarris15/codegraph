// codegraph: component ui-blocks-view
import { useEffect, useState } from 'react'
import type { UiBlock, UiOption } from '../../features/show-map.js'
import { Badge, Button } from '../design-system/kit.js'
import { LiveFrame } from './live-view.js'

/** Folders of UI blocks, nested as their paths say: forms/inputs sits
 *  inside forms. */
type Folder = { name: string; path: string; folders: Folder[]; blocks: UiBlock[] }

const treeOf = (blocks: UiBlock[]): Folder => {
  const top: Folder = { name: '', path: '', folders: [], blocks: [] }
  for (const block of blocks) {
    let at = top
    for (const name of block.folder.split('/').filter(Boolean)) {
      let next = at.folders.find((f) => f.name === name)
      if (!next) {
        next = { name, path: at.path ? `${at.path}/${name}` : name, folders: [], blocks: [] }
        at.folders.push(next)
      }
      at = next
    }
    at.blocks.push(block)
  }
  return top
}

const pathOf = (block: UiBlock): string => (block.folder ? `${block.folder}/${block.name}` : block.name)

/** The picture a UI block is shown by: its own, else its first state's. */
const pictureOf = (block: UiBlock): string => block.shot || block.states.find((s) => s.shot)?.shot || ''

const Tile = ({ block, picked, onPick }: { block: UiBlock; picked: boolean; onPick: () => void }) => {
  const picture = pictureOf(block)
  return (
    <button type="button" className="design-token ui-block" data-ui-block={pathOf(block)} aria-pressed={picked} onClick={onPick}>
      {picture ? (
        <img className="ui-block-shot" src={picture} alt={`${block.name} as its tests last saw it`} />
      ) : (
        <div className="ui-block-shot ui-block-shot--none">No picture yet</div>
      )}
      <span className="design-token-name">{block.name}</span>
      {block.says ? <span className="ui-block-says">{block.says}</span> : null}
      <span className="design-token-value">
        {block.options.length} {block.options.length === 1 ? 'option' : 'options'}
        {block.states.length ? ` · ${block.states.length} ${block.states.length === 1 ? 'state' : 'states'}` : ''}
      </span>
    </button>
  )
}

const FolderView = ({ folder, pickedPath, onPick }: { folder: Folder; pickedPath: string; onPick: (path: string) => void }) => (
  <>
    {folder.blocks.length ? (
      <div className="design-tiles">
        {folder.blocks.map((b) => (
          <Tile key={pathOf(b)} block={b} picked={pathOf(b) === pickedPath} onPick={() => onPick(pathOf(b) === pickedPath ? '' : pathOf(b))} />
        ))}
      </div>
    ) : null}
    {folder.folders.map((f) => (
      <details key={f.path} className="ui-block-folder" open>
        <summary aria-label={`Folder ${f.path}`}>{f.name}</summary>
        <FolderView folder={f} pickedPath={pickedPath} onPick={onPick} />
      </details>
    ))}
  </>
)

/** What a person has set an option to in the live view, as it is sent to
 *  the page: a boolean or number where the code's type is one. */
type Given = Record<string, string | number | boolean>

const asSent = (option: UiOption, raw: string): string | number | boolean =>
  option.type === 'boolean' ? raw === 'true' : option.type === 'number' || (option.values.length && !/['"]/.test(option.type)) ? Number(raw) : raw

/** The control for one option while the block is live: a list for one with
 *  choices, a box for text or a number, and nothing for one only code can
 *  give, like a child element or a function. */
const OptionControl = ({ option, set, onSet }: { option: UiOption; set: Given; onSet: (name: string, value: string) => void }) => {
  const now = option.name in set ? String(set[option.name]) : ''
  const label = `Option ${option.name}`
  if (option.values.length)
    return (
      <select className="ds-input" aria-label={label} value={now} onChange={(e) => onSet(option.name, e.target.value)}>
        <option value="">As the code sets it</option>
        {option.values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    )
  if (option.type === 'string' || option.type === 'number')
    return (
      <input
        className="ds-input"
        aria-label={label}
        type={option.type === 'number' ? 'number' : 'text'}
        value={now}
        placeholder="As the code sets it"
        onChange={(e) => onSet(option.name, e.target.value)}
      />
    )
  return <span className="ds-hint">Only code can give this one.</span>
}

/** One UI block up close: its name to point an agent at, what it is for,
 *  each option and what its choices mean, and its states. While it is live,
 *  each option it can be given has a control. */
const PickedBlock = ({
  block,
  live,
  onLive,
  set,
  onSet,
  stateShown,
}: {
  block: UiBlock
  live: boolean
  onLive: (on: boolean) => void
  set: Given
  onSet: (name: string, value: string) => void
  stateShown: string
}) => {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(pathOf(block))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <aside className="design-picked" aria-label={`UI block ${pathOf(block)}`}>
      <div className="ds-row" style={{ justifyContent: 'space-between' }}>
        <span className="design-picked-name">{pathOf(block)}</span>
        <Badge>UI block</Badge>
      </div>
      {block.says ? <p className="ui-block-about">{block.says}</p> : null}
      <div className="ds-row">
        <Button onClick={() => void copy()}>{copied ? 'Copied' : 'Copy its name'}</Button>
        <span className="ds-hint">to tell your agent which one</span>
      </div>
      {block.live ? (
        <Button look={live ? 'bare' : 'normal'} onClick={() => onLive(!live)}>
          {live ? 'Back to the pictures' : 'See it live'}
        </Button>
      ) : (
        <span className="ds-hint">
          To see it live, name its container's dev server in codegraph.config.json, as <code>"dev": "http://localhost:5173"</code>.
        </span>
      )}
      <dl className="design-parts">
        <div>
          <dt>File</dt>
          <dd>{block.file}</dd>
        </div>
      </dl>
      <div className="ui-block-options">
        <span className="ds-label">Options</span>
        {block.options.length === 0 ? <span className="ds-hint">None the reader could find.</span> : null}
        {block.options.map((o) => (
          <div key={o.name} className="ui-block-option" data-option={o.name}>
            <div className="ui-block-option-head">
              <span className="ui-block-option-name">
                {o.name}
                {o.optional ? <span className="ds-hint"> optional</span> : null}
              </span>
              <code className="ui-block-option-type">{o.type}</code>
            </div>
            {o.says ? <span className="ui-block-option-says">{o.says}</span> : null}
            {live ? (
              stateShown ? (
                <span className="ds-hint">The state shown sets its own options.</span>
              ) : (
                <OptionControl option={o} set={set} onSet={onSet} />
              )
            ) : null}
            {o.values.length ? (
              <ul className="ui-block-values">
                {o.values.map((v) => (
                  <li key={v}>
                    <code>{v}</code>
                    {o.valueSays[v] ? <span> {o.valueSays[v]}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
      <div className="ui-block-states">
        <span className="ds-label">States</span>
        {block.states.length === 0 ? (
          <span className="ds-hint">None yet. A file beside it tagged `states {block.name}` gives them.</span>
        ) : null}
        {block.states.map((s) => (
          <figure key={s.name} className="ui-block-state" data-state={s.name}>
            {s.shot ? (
              <img className="ui-block-shot" src={s.shot} alt={`${block.name} ${s.name}`} />
            ) : (
              <div className="ui-block-shot ui-block-shot--none">No picture yet</div>
            )}
            <figcaption>{s.name}</figcaption>
          </figure>
        ))}
      </div>
    </aside>
  )
}

/** The UI block an agent says it is working on, by folder and name, and
 *  its words. */
export type AgentAtBlock = { uiBlock: string; words: string }

/** Where the live view finds a UI block: in a state, or with the options a
 *  person has set (ADR 0024). */
const liveAddress = (block: UiBlock, state: string, set: Given): string =>
  state
    ? `${block.live}&state=${encodeURIComponent(state)}`
    : Object.keys(set).length
      ? `${block.live}&options=${encodeURIComponent(JSON.stringify(set))}`
      : block.live

/** A software system's UI blocks, in their folders, each with its picture,
 *  and one picked up close (ADR 0024). A picked block with a dev server can
 *  be seen live: running from the repo's own code, in any of its states, or
 *  with its options set by hand. */
export const UiBlocksView = ({ blocks, agent = null }: { blocks: UiBlock[]; agent?: AgentAtBlock | null }) => {
  const [pickedPath, setPickedPath] = useState(agent?.uiBlock ?? '')
  const [live, setLive] = useState(Boolean(agent?.uiBlock))
  const [stateShown, setStateShown] = useState('')
  const [set, setSet] = useState<Given>({})
  const picked = blocks.find((b) => pathOf(b) === pickedPath)
  const pick = (path: string): void => {
    setPickedPath(path)
    setStateShown('')
    setSet({})
  }
  // Wherever the agent says it is working, the view goes too, live; the
  // dev server then redraws the block as the agent changes its files.
  useEffect(() => {
    if (!agent?.uiBlock) return
    pick(agent.uiBlock)
    setLive(true)
  }, [agent?.uiBlock])
  const setOne = (name: string, raw: string): void => {
    const option = picked?.options.find((o) => o.name === name)
    if (!option) return
    const next = { ...set }
    if (raw === '') delete next[name]
    else next[name] = asSent(option, raw)
    setSet(next)
  }
  const showingLive = live && picked && picked.live
  return (
    <div className="design-body">
      <div className="design-groups">
        {showingLive ? (
          <section className="live-stage" aria-label={`${picked.name}, live`}>
            {agent?.uiBlock === pathOf(picked) ? (
              <div className="live-agent" role="status" aria-label="The agent is working on this UI block">
                <span className="live-agent-who">Your agent is working on this</span>
                {agent.words ? <span>{agent.words}</span> : null}
              </div>
            ) : null}
            <div className="live-states" role="group" aria-label="Show it">
              <button type="button" aria-pressed={stateShown === ''} onClick={() => setStateShown('')}>
                With the options set
              </button>
              {picked.states.map((s) => (
                <button key={s.name} type="button" aria-pressed={stateShown === s.name} onClick={() => setStateShown(s.name)}>
                  {s.name}
                </button>
              ))}
            </div>
            <LiveFrame address={liveAddress(picked, stateShown, set)} title={`${picked.name}, running`} />
          </section>
        ) : blocks.length === 0 ? (
          <div className="ds-empty">
            No UI blocks yet. A file names one with a tag like <code>codegraph: ui block forms/DatePicker</code>.
          </div>
        ) : (
          <section className="design-group" aria-label="UI blocks by folder">
            <FolderView folder={treeOf(blocks)} pickedPath={pickedPath} onPick={pick} />
          </section>
        )}
      </div>
      {picked ? (
        <PickedBlock block={picked} live={Boolean(showingLive)} onLive={setLive} set={set} onSet={setOne} stateShown={stateShown} />
      ) : null}
    </div>
  )
}
