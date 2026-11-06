// codegraph: component sketch-editor
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CardState, Sketch, SketchCard } from '../../modules/sketches/index.js'
import { sentenceOf } from '../../modules/wording/index.js'
import { Button, Field, Select } from '../design-system/kit.js'
import type { CardType } from '../../modules/card-types/schema.js'
import { wireOfHub, type CardLook } from '../../modules/sketches/schema.js'
import { CardLookEditor } from './card-look-editor.js'
import { BLANK_LOOK } from './card-looks.js'
import { Glyph } from './kind-glyph.js'
import { MapCanvas, remember, remembered, walk } from './map-canvas.js'
import {
  addWire,
  align,
  changeAt,
  changeCard,
  changeNote,
  changeWire,
  choicesAt,
  copyOf,
  ownTypesAt,
  makeRoom,
  moveThings,
  nudge,
  paste,
  pick,
  pinAll,
  placeCard,
  placeNote,
  remove,
  retext,
  rewire,
  wireKinds,
  type Clip,
} from './sketch-edits.js'

/** What Copy last held, for as long as the window is open, so a person can
 *  copy from one sketch, or one level, and paste into another. */
let clipboard: Clip | null = null

/** How long a run of the same change, like typing into one field, still
 *  counts as one step to undo. */
const ONE_STEP_MS = 900
const HISTORY = 200

/** Drawing over the map, whatever is new on a level is marked as drawn
 *  new, all the way down, so it shows as still to build. */
const stampWith =
  (known: Set<string> | null) =>
  (card: SketchCard): SketchCard => {
    if (!known) return card
    const mark = (c: SketchCard): SketchCard => ({
      ...c,
      ...(c.state || known.has(c.id) ? {} : { state: 'proposed' as const }),
      children: c.children.map(mark),
      wires: c.wires.map((w) => (w.state || known.has(w.id) ? w : { ...w, state: 'proposed' as const })),
    })
    return {
      ...card,
      children: card.children.map(mark),
      wires: card.wires.map((w) => (w.state || known.has(w.id) ? w : { ...w, state: 'proposed' as const })),
    }
  }

/** Draws on a sketch: the canvas with its tools, and a panel for whatever is
 *  picked. Every change goes straight back to the page, which keeps it, and
 *  onto a history, so any of it can be undone. Nothing here has a save button. */
export const SketchEditor = ({
  sketch,
  mockups,
  path,
  onPath,
  onChange,
  onAddMockup,
  known,
}: {
  sketch: Sketch
  mockups: Record<string, string>
  path: string[]
  onPath: (path: string[]) => void
  onChange: (sketch: Sketch) => void
  onAddMockup: (cardId: string) => void
  /** Drawing a proposal over the map: the ids of what is in the code. They
   *  are crossed out rather than taken off, and keep their names; anything
   *  else drawn is new, to be built. */
  known?: string[]
}) => {
  const fromCode = new Set(known ?? [])
  const proposing = known !== undefined
  const stamp = stampWith(proposing ? fromCode : null)
  /** Takes things away: off a sketch, or, over the map, crossed out when
   *  they are in the code, and brought back when crossed out already. */
  const takeAway = (f: SketchCard, ids: string[]): SketchCard => {
    if (!proposing) return remove(f, ids)
    const toggle = <T extends { id: string; state?: CardState }>(x: T): T =>
      ids.includes(x.id) && fromCode.has(x.id)
        ? x.state === 'gone'
          ? (({ state: _, ...rest }) => rest as T)(x)
          : { ...x, state: 'gone' }
        : x
    const crossed = { ...f, children: f.children.map(toggle), wires: f.wires.map(toggle) }
    return remove(crossed, ids.filter((id) => !fromCode.has(id)))
  }
  const [selected, setSelected] = useState<string[]>([])
  /** The types of card a person has saved, for every sketch. */
  const [cardTypes, setCardTypes] = useState<CardType[]>([])
  useEffect(() => {
    void window.codegraph.showCardTypes().then(setCardTypes)
  }, [])
  const keepCardTypes = (types: CardType[]): void => {
    setCardTypes(types)
    void window.codegraph.saveCardTypes(types)
  }
  const past = useRef<Sketch[]>([])
  const future = useRef<Sketch[]>([])
  const last = useRef<{ step: string; at: number }>({ step: '', at: 0 })
  const [, setTick] = useState(0)
  /** The panel can be put away, to give the board the whole window. */
  const [panel, setPanelNow] = useState(() => remembered('codegraph-panel', true))
  const setPanel = (open: boolean): void => {
    remember('codegraph-panel', open)
    setPanelNow(open)
  }

  /** The level being worked on: the one last pressed, among the cards open. */
  const [levelId, setLevelId] = useState('')
  const levelAt = path.indexOf(levelId)
  const trail = walk(sketch.root, levelAt < 0 ? path : path.slice(0, levelAt + 1))
  const focus = trail.at(-1)!
  const here = trail.map((c) => c.id)

  // The latest sketch, for keys and handlers that outlive a render.
  const now = useRef(sketch)
  now.current = sketch

  /** One change to the level being drawn, kept as a step to undo. A change
   *  named the same as the last, soon after it, joins that step. */
  const change = useCallback(
    (next: (focus: SketchCard) => SketchCard, step = '', quiet = false): void => {
      const was = now.current
      const root = changeAt(was.root, here, (f) => stamp(makeRoom(next(f))))
      keep({ ...was, root }, step, quiet)
    },
    [here.join('/'), onChange, known],
  )

  /** A changed sketch kept, and as a step to undo unless it is quiet. A
   *  change named the same as the last, soon after it, joins that step. */
  const keep = useCallback(
    (changed: Sketch, step = '', quiet = false): void => {
      const was = now.current
      if (!quiet) {
        // 'join' joins whatever step came last, however long ago.
        const joins =
          step === 'join' || (step !== '' && last.current.step === step && Date.now() - last.current.at < ONE_STEP_MS)
        if (!joins) {
          past.current = [...past.current.slice(-HISTORY + 1), was]
          future.current = []
        }
        last.current = { step, at: Date.now() }
        setTick((n) => n + 1)
      }
      now.current = changed
      onChange(changed)
    },
    [onChange],
  )

  const travel = useCallback(
    (from: React.MutableRefObject<Sketch[]>, to: React.MutableRefObject<Sketch[]>): void => {
      const back = from.current.at(-1)
      if (!back) return
      from.current = from.current.slice(0, -1)
      to.current = [...to.current, now.current]
      last.current = { step: '', at: 0 }
      now.current = back
      onChange(back)
      setTick((n) => n + 1)
    },
    [onChange],
  )
  const undo = useCallback(() => travel(past, future), [travel])
  const redo = useCallback(() => travel(future, past), [travel])

  // Whatever is picked and has since gone, by undo or delete, is let go.
  useEffect(() => {
    const there = new Set([...focus.children.map((c) => c.id), ...focus.wires.map((w) => w.id), ...focus.notes.map((n) => n.id)])
    if (selected.some((id) => !there.has(id))) setSelected(selected.filter((id) => there.has(id)))
  }, [focus, selected])

  useEffect(() => {
    const typing = (target: EventTarget | null): boolean =>
      target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement
    const keys = (event: KeyboardEvent): void => {
      if (typing(event.target)) return
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (mod && key === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if (mod && key === 'a') {
        event.preventDefault()
        setSelected([...focus.children.map((c) => c.id), ...focus.notes.map((n) => n.id)])
        return
      }
      if (mod && (key === 'c' || key === 'x') && selected.length) {
        event.preventDefault()
        clipboard = copyOf(focus, selected)
        if (key === 'x') {
          change((f) => takeAway(f, selected))
          setSelected([])
        }
        return
      }
      if (mod && key === 'v' && clipboard) {
        event.preventDefault()
        const held = clipboard
        let ids: string[] = []
        change((f) => {
          const [next, made] = paste(f, held)
          ids = made
          return next
        })
        setSelected(ids)
        return
      }
      if (mod && key === 'd' && selected.length) {
        event.preventDefault()
        const held = copyOf(focus, selected)
        let ids: string[] = []
        change((f) => {
          const [next, made] = paste(f, held, 24)
          ids = made
          return next
        })
        setSelected(ids)
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected.length) {
        event.preventDefault()
        change((f) => takeAway(f, selected))
        setSelected([])
        return
      }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      const arrow = arrows[event.key]
      if (arrow && selected.length && !mod) {
        event.preventDefault()
        const by = event.shiftKey ? 24 : 4
        change((f) => nudge(f, selected, arrow[0] * by, arrow[1] * by), 'nudge')
      }
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [focus, selected, change, undo, redo])

  const copy = (ids: string[]): void => {
    clipboard = copyOf(focus, ids)
  }
  const cut = (ids: string[]): void => {
    copy(ids)
    change((f) => takeAway(f, ids))
    setSelected([])
  }
  /** Pastes what Copy holds: beside where it came from, or centred on a spot. */
  const pasteNow = (at?: { x: number; y: number }): string[] => {
    const held = clipboard
    if (!held) return []
    let ids: string[] = []
    change((f) => {
      let by = 32
      if (at && held.cards.length) {
        const first = held.cards[0]!
        by = 0
        const moved: Clip = {
          ...held,
          cards: held.cards.map((c) => ({ ...c, x: (c.x ?? 0) - (first.x ?? 0) + at.x - 120, y: (c.y ?? 0) - (first.y ?? 0) + at.y - 60 })),
          notes: held.notes,
        }
        const [next, made] = paste(f, moved, by)
        ids = made
        return next
      }
      const [next, made] = paste(f, held, by)
      ids = made
      return next
    })
    return ids
  }
  const duplicate = (ids: string[], by = 24): string[] => {
    const held = copyOf(focus, ids)
    let made: string[] = []
    change((f) => {
      const [next, copies] = paste(f, held, by)
      made = copies
      return next
    })
    return made
  }

  const picked = selected.length === 1 ? pick(focus, selected[0]!) : null
  const focusState = (id: string): string | undefined =>
    focus.children.find((c) => c.id === id)?.state ?? focus.wires.find((w) => w.id === id)?.state
  const lockedPick = picked !== null && selected.length === 1 && fromCode.has(selected[0]!)
  /** A card's name, or for a hub, the name of the card at the far end of its
   *  wire, however many hubs that takes. */
  const nameOf = (id: string, depth = trail.length - 1): string => {
    const hubWire = wireOfHub(id)
    if (!hubWire) return trail[depth]?.children.find((c) => c.id === id)?.name || 'unnamed'
    const outer = trail[depth - 1]
    const wire = outer?.wires.find((w) => w.id === hubWire)
    if (!outer || !wire) return 'unnamed'
    return nameOf(wire.to === trail[depth]!.id ? wire.from : wire.to, depth - 1)
  }

  return (
    <div className="sketch-area">
      <MapCanvas
        root={sketch.root}
        path={path}
        onPath={onPath}
        annotating={
          proposing
            ? undefined
            : { layers: sketch.layers ?? [], onChange: (layers, step) => keep({ ...now.current, layers }, step ?? '') }
        }
        drawing={{
          selected,
          mockups,
          canUndo: past.current.length > 0,
          canRedo: future.current.length > 0,
          onUndo: undo,
          onRedo: redo,
          onLevel: setLevelId,
          onRoom: (to, room, join) =>
            keep({ ...now.current, root: changeAt(now.current.root, to, (card) => ({ ...card, room })) }, join ? 'join' : ''),
          onSelect: setSelected,
          onPin: (arrangement) => change((f) => pinAll(f, arrangement), '', true),
          onPlace: (at, kind, from, hub, look) => {
            let id = ''
            change((f) => {
              const [next, made] = placeCard(f, at, kind, from, hub, look)
              id = made
              return next
            })
            return id
          },
          onNote: (at) => {
            let id = ''
            change((f) => {
              const [next, made] = placeNote(f, at)
              id = made
              return next
            })
            return id
          },
          onMove: (moves, join) => change((f) => moveThings(f, moves), join ? 'join' : ''),
          onWire: (from, to, kind) => {
            let id = ''
            change((f) => {
              const [next, made] = addWire(f, from, to, kind)
              id = made
              return next
            })
            return id
          },
          onRewire: (id, end, card) => change((f) => rewire(f, id, end, card)),
          onText: (id, text, first, field) =>
            change(
              (f) => (field === 'says' ? changeCard(f, id, { says: text }) : retext(f, id, text)),
              first ? 'join' : '',
            ),
          canPaste: clipboard !== null,
          onCopy: copy,
          onCut: cut,
          onPaste: pasteNow,
          onDuplicate: duplicate,
          onSelectAll: () => setSelected([...focus.children.map((c) => c.id), ...focus.notes.map((n) => n.id)]),
          onKind: (id, kind, look) => {
            if (fromCode.has(id)) return
            change((f) => (pick(f, id)?.kind === 'wire' ? changeWire(f, id, { kind }) : changeCard(f, id, { kind, look })))
          },
          cardTypes,
          onCardTypes: keepCardTypes,
          codeKinds: proposing,
          onMockup: (id) => onAddMockup(id),
          onRemove: (ids) => change((f) => takeAway(f, ids)),
          onAlign: (ids, how) => change((f) => align(f, ids, how)),
          ...(proposing
            ? { floor: 'component', locked: [...fromCode], removeName: 'Cross it out, or bring it back' }
            : {}),
        }}
      />

      {panel ? (
      <aside className="sketch-panel" aria-label="What is picked">
          <button type="button" className="sketch-panel-hide" aria-label="Hide this panel" title="Hide this panel" onClick={() => setPanel(false)}>
            <Glyph of="close" size={14} />
          </button>
          {selected.length === 0 ? (
            <>
              <div className="sketch-panel-head">{proposing ? 'Drawing a proposal' : 'Nothing picked'}</div>
              <div className="ds-hint">
                {proposing
                  ? 'Anything you add is for the agent to build. Pick something from the code and press Delete to cross it out; press it again to bring it back. It is kept on the branch as you draw.'
                  : 'Pick a card, a wire or a note to change it here.'}
              </div>
              <dl className="sketch-keys" aria-label="Ways to draw">
                <dt>Add a card</dt>
                <dd>Drag one in from the left, or double-click the board</dd>
                <dt>Wire two cards</dt>
                <dd>Drag from a dot on a card's side onto another</dd>
                <dt>Wire to a new card</dt>
                <dd>Drag from a dot and let go on empty board</dd>
                <dt>Write on it</dt>
                <dd>
                  Double-click its name, or pick it and start typing; <kbd>Enter</kbd> to finish
                </dd>
                <dt>Move things</dt>
                <dd>Drag a card, a note, or a wire's words out from under each other</dd>
                <dt>Pick many</dt>
                <dd>
                  <kbd>Shift</kbd> and drag a box on the board, or <kbd>Shift</kbd>-click
                </dd>
                <dt>Draw inside a card</dt>
                <dd>
                  Double-click it, and it grows to give you room. Drag its corners to resize it; carry a card past its edge
                  and it grows. The arrow by its name, or <kbd>Esc</kbd>, backs out
                </dd>
                <dt>Fill the screen with one card</dt>
                <dd>
                  Point at it and press <kbd>F</kbd>
                </dd>
                <dt>Move the board</dt>
                <dd>
                  Drag the empty board, or two fingers on a trackpad. With a mouse wheel, <kbd>Ctrl</kbd> scrolls up
                  and down and <kbd>Shift</kbd> across
                </dd>
                <dt>Zoom</dt>
                <dd>
                  The mouse wheel, or <kbd>Ctrl</kbd> and two fingers on a trackpad; <kbd>0</kbd> fits
                </dd>
                <dt>Undo, redo</dt>
                <dd>
                  <kbd>Ctrl</kbd>+<kbd>Z</kbd>, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>
                </dd>
                <dt>Copy, paste, duplicate</dt>
                <dd>
                  <kbd>Ctrl</kbd>+<kbd>C</kbd>, <kbd>V</kbd>, <kbd>D</kbd>
                </dd>
                <dt>Tools</dt>
                <dd>
                  <kbd>V</kbd> pick, <kbd>H</kbd> pan, <kbd>W</kbd> wire, <kbd>N</kbd> note, <kbd>C</kbd> cards
                </dd>
              </dl>
            </>
          ) : selected.length > 1 ? (
            <>
              <div className="sketch-panel-head">{selected.length} picked</div>
              <div className="ds-hint">
                Drag any of them to move them together. The bar over them lines them up or spaces them out.
              </div>
            </>
          ) : lockedPick && picked && picked.kind !== 'note' ? (
            <>
              <div className="sketch-panel-head">
                {picked.kind === 'card' ? `${picked.card.kind || picked.card.level} ${picked.card.name}` : 'A wire'}
              </div>
              {picked.kind === 'wire' ? (
                <div className="sketch-sentence">
                  {sentenceOf(nameOf(picked.wire.from), picked.wire.kind, nameOf(picked.wire.to), picked.wire.words).map(
                    (part, i) => (
                      <span key={i} className={`map-said-${part.role}`}>
                        {part.text}
                      </span>
                    ),
                  )}
                </div>
              ) : picked.card.says ? (
                <div className="ds-hint">{picked.card.says}</div>
              ) : null}
              <div className="ds-hint">
                {focusState(picked.kind === 'card' ? picked.card.id : picked.wire.id) === 'gone'
                  ? 'Crossed out: the agent takes it away when it builds the proposal.'
                  : 'This is in the code, so it keeps its name and kind. Cross it out to have it taken away.'}
              </div>
            </>
          ) : picked?.kind === 'card' ? (
            <>
              <div className="sketch-panel-head">
                {/^[aeiou]/.test(picked.card.kind) ? 'An' : 'A'} {picked.card.kind || picked.card.level}
              </div>
              <Field
                label="Name"
                value={picked.card.name}
                onChange={(name) => change((f) => changeCard(f, picked.card.id, { name }), `name:${picked.card.id}`)}
              />
              {ownTypesAt(picked.card.level) && !proposing ? (
                picked.card.kind === 'database' || picked.card.kind === 'page' ? (
                  <div className="ds-hint">
                    {picked.card.kind === 'database' ? 'A database is its own kind of card, not a look.' : 'A page holds a mockup, so it is its own kind of card.'}
                  </div>
                ) : (
                  <CardLookEditor
                    kind={picked.card.kind}
                    look={picked.card.look ?? BLANK_LOOK}
                    canSave={Boolean(picked.card.kind.trim()) && picked.card.kind !== 'card' && !cardTypes.some((type) => type.name === picked.card.kind)}
                    onKind={(kind) => change((f) => changeCard(f, picked.card.id, { kind, look: picked.card.look ?? BLANK_LOOK }), `kind:${picked.card.id}`)}
                    onLook={(look: CardLook) => change((f) => changeCard(f, picked.card.id, { look }))}
                    onSave={() =>
                      keepCardTypes([...cardTypes, { id: crypto.randomUUID(), name: picked.card.kind.trim(), ...(picked.card.look ?? BLANK_LOOK) }])
                    }
                  />
                )
              ) : (
                <Select
                  label="Kind"
                  value={picked.card.kind}
                  options={[
                    ...new Set([
                      picked.card.kind,
                      ...choicesAt(picked.card.level, [], proposing).flatMap((group) => group.choices.map((choice) => choice.kind)),
                    ]),
                  ].filter(Boolean)}
                  onChange={(kind) => change((f) => changeCard(f, picked.card.id, { kind }))}
                />
              )}
              <label className="ds-field">
                <span className="ds-label">What it is for</span>
                <textarea
                  className="ds-input sketch-says"
                  rows={3}
                  placeholder="One line on the job it does"
                  value={picked.card.says}
                  onChange={(event) =>
                    change((f) => changeCard(f, picked.card.id, { says: event.target.value }), `says:${picked.card.id}`)
                  }
                />
              </label>
              {picked.card.kind === 'page' ? (
                <>
                  <Field
                    label="Address"
                    placeholder="e.g. /notes/new"
                    value={picked.card.at}
                    onChange={(at) => change((f) => changeCard(f, picked.card.id, { at }), `at:${picked.card.id}`)}
                  />
                  <Button onClick={() => onAddMockup(picked.card.id)}>
                    {picked.card.mockup ? 'Change the mockup' : 'Add a mockup'}
                  </Button>
                </>
              ) : null}
              {picked.card.level !== 'code' ? (
                <div className="ds-hint">
                  To draw what is inside it, double-click it, or use the bar over the card.
                </div>
              ) : null}
            </>
          ) : picked?.kind === 'wire' ? (
            <>
              <div className="sketch-panel-head">A wire</div>
              <div className="sketch-sentence">
                {sentenceOf(nameOf(picked.wire.from), picked.wire.kind, nameOf(picked.wire.to), picked.wire.words).map(
                  (part, i) => (
                    <span key={i} className={`map-said-${part.role}`}>
                      {part.text}
                    </span>
                  ),
                )}
              </div>
              <Select
                label="Kind"
                value={picked.wire.kind}
                options={[...new Set([picked.wire.kind, ...wireKinds])]}
                onChange={(kind) => change((f) => changeWire(f, picked.wire.id, { kind }))}
              />
              <Field
                label="What it is for"
                placeholder="saves the note"
                value={picked.wire.words}
                onChange={(words) => change((f) => changeWire(f, picked.wire.id, { words }), `words:${picked.wire.id}`)}
              />
              <div className="ds-hint">Write it as the code would: “saves the note”, “sends a receipt”.</div>
            </>
          ) : picked?.kind === 'note' ? (
            <>
              <div className="sketch-panel-head">A note</div>
              <textarea
                className="ds-input sketch-note-text"
                aria-label="Note text"
                rows={5}
                value={picked.note.text}
                onChange={(event) =>
                  change((f) => changeNote(f, picked.note.id, { text: event.target.value }), `note:${picked.note.id}`)
                }
              />
            </>
          ) : null}
          {selected.length > 0 ? (
            <>
              <hr className="sketch-rule" />
              <Button
                look="bare"
                onClick={() => {
                  change((f) => takeAway(f, selected))
                  setSelected([])
                }}
              >
                {proposing
                  ? selected.every((id) => fromCode.has(id))
                    ? selected.every((id) => focusState(id) === 'gone')
                      ? 'Bring it back'
                      : 'Cross it out'
                    : 'Take it off the drawing'
                  : selected.length > 1
                    ? `Take these ${selected.length} off the sketch`
                    : 'Take it off the sketch'}
              </Button>
            </>
          ) : null}
        </aside>
      ) : (
        <button type="button" className="sketch-panel-tab" aria-label="Show the panel" title="Show the panel" onClick={() => setPanel(true)}>
          <Glyph of="more" size={16} />
        </button>
      )}
    </div>
  )
}
