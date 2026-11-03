// codegraph: component sketch-editor
import { useState } from 'react'
import type { Sketch, SketchCard } from '../../modules/sketches/index.js'
import { Button } from '../design-system/kit.js'
import { MapCanvas, walk, type Tool } from './map-canvas.js'
import {
  addWire,
  changeAt,
  changeCard,
  changeNote,
  changeWire,
  kindsAt,
  moveThing,
  pick,
  placeCard,
  placeNote,
  remove,
  wireKinds,
} from './sketch-edits.js'

const TOOLS: { tool: Tool; words: string; hint: string }[] = [
  { tool: 'select', words: 'Select', hint: 'Pick and drag; double-click a card to draw inside it' },
  { tool: 'card', words: 'Card', hint: 'Click the canvas to place a card' },
  { tool: 'wire', words: 'Wire', hint: 'Drag from one card to another' },
  { tool: 'note', words: 'Note', hint: 'Click the canvas to leave a note' },
]

/** Draws on a sketch: the canvas with tools, and a panel for whatever is
 *  picked. Every change goes straight back to the page, which keeps it. */
export const SketchEditor = ({
  sketch,
  mockups,
  path,
  onPath,
  onChange,
  onAddMockup,
}: {
  sketch: Sketch
  mockups: Record<string, string>
  path: string[]
  onPath: (path: string[]) => void
  onChange: (sketch: Sketch) => void
  onAddMockup: (cardId: string) => void
}) => {
  const [tool, setTool] = useState<Tool>('select')
  const [selected, setSelected] = useState('')

  const focus = walk(sketch.root, path).at(-1)!
  const here = walk(sketch.root, path).map((c) => c.id)
  const change = (next: (focus: SketchCard) => SketchCard): void =>
    onChange({ ...sketch, root: changeAt(sketch.root, here, next) })
  const picked = pick(focus, selected)

  return (
    <div className="sketch-area">
      <div className="sketch-tools" role="toolbar" aria-label="Drawing tools">
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            type="button"
            className={tool === t.tool ? 'sketch-tool sketch-tool--on' : 'sketch-tool'}
            aria-pressed={tool === t.tool}
            title={t.hint}
            onClick={() => setTool(t.tool)}
          >
            {t.words}
          </button>
        ))}
      </div>

      <MapCanvas
        root={sketch.root}
        path={path}
        onPath={onPath}
        drawing={{
          tool,
          selected,
          mockups,
          onSelect: setSelected,
          onPlace: (at, arrangement) => {
            const [next, id] =
              tool === 'note' ? placeNote(focus, at, arrangement) : placeCard(focus, at, arrangement)
            change(() => next)
            setSelected(id)
            setTool('select')
          },
          onMove: (id, at, arrangement) => change((f) => moveThing(f, id, at, arrangement)),
          onWire: (from, to) => {
            const [next, id] = addWire(focus, from, to)
            change(() => next)
            setSelected(id)
          },
        }}
      />

      {picked ? (
        <aside className="sketch-panel" aria-label="What is picked">
          {picked.kind === 'card' ? (
            <>
              <div className="ds-label">A {picked.card.level === 'system' ? 'software system' : picked.card.level}</div>
              <label className="ds-field">
                <span className="ds-label">Name</span>
                <input
                  className="ds-input"
                  autoFocus
                  value={picked.card.name}
                  onChange={(e) => change((f) => changeCard(f, picked.card.id, { name: e.target.value }))}
                />
              </label>
              <label className="ds-field">
                <span className="ds-label">Kind</span>
                <select
                  className="ds-input"
                  aria-label="Kind"
                  value={picked.card.kind}
                  onChange={(e) => change((f) => changeCard(f, picked.card.id, { kind: e.target.value }))}
                >
                  {[...new Set([picked.card.kind, ...kindsAt[picked.card.level]])].filter(Boolean).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ds-field">
                <span className="ds-label">What it is for</span>
                <input
                  className="ds-input"
                  value={picked.card.says}
                  onChange={(e) => change((f) => changeCard(f, picked.card.id, { says: e.target.value }))}
                />
              </label>
              {picked.card.kind === 'page' ? (
                <>
                  <label className="ds-field">
                    <span className="ds-label">Address</span>
                    <input
                      className="ds-input"
                      placeholder="/notes/new"
                      value={picked.card.at}
                      onChange={(e) => change((f) => changeCard(f, picked.card.id, { at: e.target.value }))}
                    />
                  </label>
                  <Button onClick={() => onAddMockup(picked.card.id)}>
                    {picked.card.mockup ? 'Change the mockup' : 'Add a mockup'}
                  </Button>
                </>
              ) : null}
              <div className="ds-hint">Double-click the card to draw what is inside it.</div>
            </>
          ) : picked.kind === 'wire' ? (
            <>
              <div className="ds-label">A wire</div>
              <label className="ds-field">
                <span className="ds-label">Kind</span>
                <select
                  className="ds-input"
                  aria-label="Kind"
                  value={picked.wire.kind}
                  onChange={(e) => change((f) => changeWire(f, picked.wire.id, { kind: e.target.value }))}
                >
                  {wireKinds.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ds-field">
                <span className="ds-label">What it is for</span>
                <input
                  className="ds-input"
                  autoFocus
                  placeholder="saves the note"
                  value={picked.wire.words}
                  onChange={(e) => change((f) => changeWire(f, picked.wire.id, { words: e.target.value }))}
                />
              </label>
            </>
          ) : (
            <>
              <div className="ds-label">A note</div>
              <textarea
                className="ds-input sketch-note-text"
                aria-label="Note"
                autoFocus
                rows={5}
                value={picked.note.text}
                onChange={(e) => change((f) => changeNote(f, picked.note.id, { text: e.target.value }))}
              />
            </>
          )}
          <Button
            look="bare"
            onClick={() => {
              change((f) => remove(f, selected))
              setSelected('')
            }}
          >
            Take it off the sketch
          </Button>
        </aside>
      ) : null}
    </div>
  )
}
