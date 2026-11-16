// codegraph: component sketch-editor
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Sketch, SketchCard, SketchField } from '../../modules/sketches/index.js'
import { undoStep } from '../../modules/together/index.js'
import { sentenceOf } from '../../modules/wording/index.js'
import { Button, Field } from '../design-system/kit.js'
import type { CardType } from '../../modules/card-types/schema.js'
import { isStore, wireOfHub, type CardLook } from '../../modules/sketches/schema.js'
import { CardLookEditor } from './card-look-editor.js'
import { BLANK_LOOK, TEMPLATES, lookOf } from './card-looks.js'
import { Glyph } from './kind-glyph.js'
import { MapCanvas, remember, remembered, type Together } from './map-canvas.js'
import { StoreEditor, StoreFields, StoresInside } from './store-fields.js'
import { walk } from './map-layout.js'
import {
  addWire,
  align,
  changeAt,
  changeCard,
  changeNote,
  changeWire,
  bendWire,
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
  setFields,
  wireAllStores,
  addStoreInside,
  type Clip,
} from './sketch-edits.js'

/** The names of every store drawn in a sketch, for a field to point at. */
const storesIn = (card: SketchCard): string[] => [
  ...new Set([...(isStore(card.kind) && card.name.trim() ? [card.name.trim()] : []), ...card.children.flatMap(storesIn)]),
]

/** What Copy last held, for as long as the window is open, so a person can
 *  copy from one sketch, or one level, and paste into another. */
let clipboard: Clip | null = null

/** How long a run of the same change, like typing into one field, still
 *  counts as one step to undo. */
const ONE_STEP_MS = 900
const HISTORY = 200
/** How far the floating panel keeps from the board's edges. */
/** How much of the board's right the panel covers: its width, its gap from the
 *  edge, and room to breathe. */
const PANEL_COVERS = 320 + 12 + 16

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
  together,
}: {
  sketch: Sketch
  mockups: Record<string, string>
  path: string[]
  onPath: (path: string[]) => void
  onChange: (sketch: Sketch) => void
  onAddMockup: (cardId: string) => void
  /** Who else is drawing here, if anyone. */
  together?: Together
}) => {
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
  /** Each step keeps how the sketch stood either side of it, so undoing it takes
   *  back only what it changed, and whatever another member did since stays. */
  const past = useRef<{ before: Sketch; after: Sketch }[]>([])
  const future = useRef<{ before: Sketch; after: Sketch }[]>([])
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
      // A field pointing at a store is wired to it wherever the change was.
      const root = wireAllStores(changeAt(was.root, here, (f) => makeRoom(next(f))))
      keep({ ...was, root }, step, quiet)
    },
    [here.join('/'), onChange],
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
        const open = past.current.at(-1)
        if (joins && open) past.current = [...past.current.slice(0, -1), { before: open.before, after: changed }]
        else {
          past.current = [...past.current.slice(-HISTORY + 1), { before: was, after: changed }]
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
    (back: boolean): void => {
      const [from, to] = back ? [past, future] : [future, past]
      const step = from.current.at(-1)
      if (!step) return
      from.current = from.current.slice(0, -1)
      to.current = [...to.current, step]
      last.current = { step: '', at: 0 }
      const next = back ? undoStep(step.before, step.after, now.current) : undoStep(step.after, step.before, now.current)
      now.current = next
      onChange(next)
      setTick((n) => n + 1)
    },
    [onChange],
  )
  const undo = useCallback(() => travel(true), [travel])
  const redo = useCallback(() => travel(false), [travel])

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
          change((f) => remove(f, selected))
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
        change((f) => remove(f, selected))
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
    change((f) => remove(f, ids))
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

  /** The panel floats at the board's right edge, always in the same place; the
   *  board slides what is picked, and what it is wired to, out from under it. */
  const area = useRef<HTMLDivElement>(null)

  /** Changes a store's fields, wiring it to any store a field now points at, or
   *  whether it is fixed or open. Typing in one store's fields is one undo. */
  const changeStore = (id: string, { fields, others }: { fields?: SketchField[] | null; others?: string }): void =>
    change(
      (f) =>
        others !== undefined
          ? changeCard(f, id, fields !== undefined ? { fields, others } : { others })
          : setFields(f, id, fields ?? null),
      `fields:${id}`,
    )
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
    <div ref={area} className="sketch-area">
      <MapCanvas
        {...(picked && panel ? { cover: { right: PANEL_COVERS } } : {})}
        root={sketch.root}
        path={path}
        onPath={onPath}
        annotating={{ layers: sketch.layers ?? [], onChange: (layers, step) => keep({ ...now.current, layers }, step === 'pin' ? '' : (step ?? ''), step === 'pin') }}
        {...(together ? { together } : {})}
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
          onWire: (from, to, kind, sides) => {
            let id = ''
            change((f) => {
              const [next, made] = addWire(f, from, to, kind, sides)
              id = made
              return next
            })
            return id
          },
          onRewire: (id, end, card, side, share) => change((f) => rewire(f, id, end, card, side, share)),
          onBend: (id, bends, join) => change((f) => bendWire(f, id, bends), join ? 'join' : ''),
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
            change((f) => (pick(f, id)?.kind === 'wire' ? changeWire(f, id, { kind }) : changeCard(f, id, { kind, look })))
          },
          onLook: (id, look) => {
            change((f) => changeCard(f, id, { look }))
          },
          cardTypes,
          onCardTypes: keepCardTypes,
          onMockup: (id) => onAddMockup(id),
          // Each field added on the card is a step of its own to undo.
          onAddField: (id, field) =>
            change((f) => {
              const card = f.children.find((c) => c.id === id)
              return setFields(f, id, [...(card?.fields ?? []), { ...field, needed: false, pointsAt: '' }])
            }),
          // While the panel shows a store's fields, they are not opened again
          // beside it on the board; with the panel put away, they are.
          ...(panel
            ? {}
            : {
                storeEditor: (id: string, onClose: () => void) => {
                  const card = focus.children.find((c) => c.id === id)
                  if (!card) return null
                  return (
                    <StoreEditor
                      card={card}
                      stores={storesIn(sketch.root).filter((name) => name !== card.name)}
                      onChange={(shape) => changeStore(id, shape)}
                      onAdd={(name) => change((f) => addStoreInside(f, id, name)[0])}
                      onClose={onClose}
                    />
                  )
                },
              }),
          onRemove: (ids) => change((f) => remove(f, ids)),
          onAlign: (ids, how) => change((f) => align(f, ids, how)),
        }}
      />

      {/* The panel comes out only for one thing picked, floating over the
          board's edge so the board never shifts under it. How to draw is in
          the Keys list, not here. */}
      {picked && panel ? (
        <aside className="sketch-panel" aria-label="What is picked">
          <button type="button" className="sketch-panel-hide" aria-label="Hide this panel" title="Hide this panel" onClick={() => setPanel(false)}>
            <Glyph of="close" size={14} />
          </button>
          {/* Only this scrolls, so the panel's name and its close stay put. */}
          <div className="sketch-panel-body">
          {picked.kind === 'card' ? (
            <>
              <div className="sketch-panel-head">
                {/^[aeiou]/.test(picked.card.kind) ? 'An' : 'A'} {picked.card.kind || picked.card.level}
              </div>
              <Field
                label="Name"
                value={picked.card.name}
                onChange={(name) => change((f) => changeCard(f, picked.card.id, { name }), `name:${picked.card.id}`)}
              />
              <label className="ds-field">
                <span className="ds-label">What it is for</span>
                <textarea
                  className="ds-input sketch-says"
                  rows={2}
                  placeholder="One line on the job it does"
                  value={picked.card.says}
                  onChange={(event) =>
                    change((f) => changeCard(f, picked.card.id, { says: event.target.value }), `says:${picked.card.id}`)
                  }
                />
              </label>
              {isStore(picked.card.kind) ? (
                <>
                  <StoreFields
                    card={picked.card}
                    stores={storesIn(sketch.root).filter((name) => name !== picked.card.name)}
                    onChange={(shape) => changeStore(picked.card.id, shape)}
                  />
                  <StoresInside card={picked.card} onAdd={(name) => change((f) => addStoreInside(f, picked.card.id, name)[0])} />
                </>
              ) : picked.card.kind === 'database' ? (
                <StoresInside card={picked.card} onAdd={(name) => change((f) => addStoreInside(f, picked.card.id, name)[0])} />
              ) : ownTypesAt(picked.card.level) && picked.card.kind !== 'page' ? (
                /* Its type and colour are on the card and the bar over it;
                   its type's icon and shape are here. */
                <CardLookEditor
                  kind={picked.card.kind}
                  look={lookOf(picked.card) ?? BLANK_LOOK}
                  color={false}
                  typed={false}
                  canSave={Boolean(picked.card.kind.trim()) && picked.card.kind !== 'card' && !TEMPLATES[picked.card.kind] && !cardTypes.some((type) => type.name === picked.card.kind)}
                  onKind={(kind) => change((f) => changeCard(f, picked.card.id, { kind, look: lookOf(picked.card) ?? BLANK_LOOK }), `kind:${picked.card.id}`)}
                  onLook={(look: CardLook) => change((f) => changeCard(f, picked.card.id, { look }))}
                  onSave={() =>
                    keepCardTypes([...cardTypes, { id: crypto.randomUUID(), name: picked.card.kind.trim(), ...(lookOf(picked.card) ?? BLANK_LOOK) }])
                  }
                />
              ) : null}
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
            </>
          ) : picked.kind === 'wire' ? (
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
              <Field
                label="What it is for"
                placeholder="saves the note"
                value={picked.wire.words}
                onChange={(words) => change((f) => changeWire(f, picked.wire.id, { words }), `words:${picked.wire.id}`)}
              />
              <div className="ds-hint">Write it as the code would: “saves the note”, “sends a receipt”.</div>
            </>
          ) : picked.kind === 'note' ? (
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
          {/* Taking it away is on the bar over it, the Delete key and the
              board's menu, so the panel keeps to what it is. */}
          </div>
        </aside>
      ) : picked ? (
        <button type="button" className="sketch-panel-tab" aria-label="Show the panel" title="Show the panel" onClick={() => setPanel(true)}>
          <Glyph of="more" size={16} />
        </button>
      ) : null}
    </div>
  )
}
