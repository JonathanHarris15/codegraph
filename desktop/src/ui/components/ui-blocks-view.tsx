// codegraph: component ui-blocks-view
import { useState } from 'react'
import type { UiBlock } from '../../features/show-map.js'
import { Badge, Button } from '../design-system/kit.js'

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

/** One UI block up close: its name to point an agent at, what it is for,
 *  each option and what its choices mean, and its states. */
const PickedBlock = ({ block }: { block: UiBlock }) => {
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

/** A software system's UI blocks, in their folders, each with its picture,
 *  and one picked up close (ADR 0024). */
export const UiBlocksView = ({ blocks }: { blocks: UiBlock[] }) => {
  const [pickedPath, setPickedPath] = useState('')
  const picked = blocks.find((b) => pathOf(b) === pickedPath)
  return (
    <div className="design-body">
      <div className="design-groups">
        {blocks.length === 0 ? (
          <div className="ds-empty">
            No UI blocks yet. A file names one with a tag like <code>codegraph: ui block forms/DatePicker</code>.
          </div>
        ) : (
          <section className="design-group" aria-label="UI blocks by folder">
            <FolderView folder={treeOf(blocks)} pickedPath={pickedPath} onPick={setPickedPath} />
          </section>
        )}
      </div>
      {picked ? <PickedBlock block={picked} /> : null}
    </div>
  )
}
