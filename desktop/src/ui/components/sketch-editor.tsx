// codegraph: component sketch-editor
import { useState } from 'react'
import type { Sketch, SketchCard } from '../../modules/sketches/index.js'
import { Button, Field, Select } from '../design-system/kit.js'
import { MapCanvas, walk } from './map-canvas.js'
import {
  addWire,
  changeAt,
  changeCard,
  changeNote,
  changeWire,
  kindsAt,
  makeRoom,
  moveThing,
  pick,
  placeCard,
  placeNote,
  remove,
  wireKinds,
} from './sketch-edits.js'

/** Draws on a sketch: the canvas with its tools, and a panel for whatever is
 *  picked. Every change goes straight back to the page, which keeps it.
 *  Nothing here has a save button. */
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
  const [selected, setSelected] = useState('')

  const focus = walk(sketch.root, path).at(-1)!
  const here = walk(sketch.root, path).map((c) => c.id)
  const change = (next: (focus: SketchCard) => SketchCard): void =>
    onChange({ ...sketch, root: changeAt(sketch.root, here, (f) => makeRoom(next(f))) })
  const picked = pick(focus, selected)

  /** A wire reads as a sentence: who acts, how, on what, and what for. The
   *  panel shows it as it is written, so a person sees the whole thing. */
  const sentence = (from: string, kind: string, to: string, words: string) => (
    <div className="sketch-sentence">
      {focus.children.find((c) => c.id === from)?.name || 'something'} <b>{kind}</b>{' '}
      {focus.children.find((c) => c.id === to)?.name || 'something'}
      {words ? ` — ${words}` : ' — …'}
    </div>
  )

  return (
    <div className="sketch-area">
      <MapCanvas
        root={sketch.root}
        path={path}
        onPath={onPath}
        drawing={{
          selected,
          mockups,
          onSelect: setSelected,
          onPlace: (at, arrangement, kind) => {
            const [next, id] = placeCard(focus, at, arrangement, kind)
            change(() => next)
            setSelected(id)
          },
          onNote: (at, arrangement) => {
            const [next, id] = placeNote(focus, at, arrangement)
            change(() => next)
            setSelected(id)
          },
          onMove: (id, at, arrangement) => change((f) => moveThing(f, id, at, arrangement)),
          onWire: (from, to) => {
            const [next, id] = addWire(focus, from, to)
            change(() => next)
            setSelected(id)
          },
          onMockup: (id) => onAddMockup(id),
        }}
      />

      {picked ? (
        <aside className="sketch-panel" aria-label="What is picked">
          {picked.kind === 'card' ? (
            <>
              <div className="ds-label">A {picked.card.level === 'system' ? 'software system' : picked.card.level}</div>
              <Field
                label="Name"
                focus
                value={picked.card.name}
                onChange={(name) => change((f) => changeCard(f, picked.card.id, { name }))}
              />
              <Select
                label="Kind"
                value={picked.card.kind}
                options={[...new Set([picked.card.kind, ...kindsAt[picked.card.level]])].filter(Boolean)}
                onChange={(kind) => change((f) => changeCard(f, picked.card.id, { kind }))}
              />
              <Field
                label="What it is for"
                value={picked.card.says}
                onChange={(says) => change((f) => changeCard(f, picked.card.id, { says }))}
              />
              {picked.card.kind === 'page' ? (
                <>
                  <Field
                    label="Address"
                    placeholder="/notes/new"
                    value={picked.card.at}
                    onChange={(at) => change((f) => changeCard(f, picked.card.id, { at }))}
                  />
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
              {sentence(picked.wire.from, picked.wire.kind, picked.wire.to, picked.wire.words)}
              <Select
                label="Kind"
                value={picked.wire.kind}
                options={wireKinds}
                onChange={(kind) => change((f) => changeWire(f, picked.wire.id, { kind }))}
              />
              <Field
                label="What it is for"
                focus
                placeholder="saves the note"
                value={picked.wire.words}
                onChange={(words) => change((f) => changeWire(f, picked.wire.id, { words }))}
              />
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
                onChange={(event) => change((f) => changeNote(f, picked.note.id, { text: event.target.value }))}
              />
            </>
          )}
          <hr className="sketch-rule" />
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
