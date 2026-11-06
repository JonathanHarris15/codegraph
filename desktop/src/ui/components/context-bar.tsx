// codegraph: component context-bar
import { useState, type ReactNode } from 'react'
import type { Level } from '../../features/show-map.js'
import type { CardLook } from '../../modules/sketches/schema.js'
import { CardMark, Glyph, type ToolGlyph } from './kind-glyph.js'
import { wireKinds, type Alignment, type CardChoice } from './sketch-edits.js'

/** What is picked, as the bar over it needs to know. */
export type Picking =
  | { what: 'card'; id: string; kind: string; look?: CardLook; level: Level; page: boolean; opens: boolean }
  | { what: 'wire'; id: string; kind: string }
  | { what: 'note'; id: string }
  | { what: 'many'; ids: string[]; cards: number }

const Act = ({
  glyph,
  name,
  onAct,
  danger = false,
  children,
}: {
  glyph?: ToolGlyph
  name: string
  onAct: () => void
  danger?: boolean
  children?: ReactNode
}) => (
  <button
    type="button"
    className={danger ? 'map-act map-act--danger' : 'map-act'}
    title={name}
    aria-label={name}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={onAct}
  >
    {glyph ? <Glyph of={glyph} size={16} /> : null}
    {children}
  </button>
)

/** The few things a person most often does to what they picked, floating
 *  just over it: change its kind, write its words, draw inside it, line a
 *  group up, take it away. The panel at the side has the rest. */
export const ContextBar = ({
  picking,
  at,
  below = false,
  choices: cardChoices,
  onKind,
  onEdit,
  onOpen,
  onMockup,
  onAlign,
  onRemove,
  locked = false,
  removeName = 'Take it off the sketch',
}: {
  picking: Picking
  /** Where on the screen the bar's bottom middle sits, or its top middle
   *  when it hangs below what is picked. */
  at: { x: number; y: number }
  below?: boolean
  /** What a card here can be changed to. */
  choices: CardChoice[]
  onKind: (id: string, kind: string, look?: CardLook) => void
  onEdit: (id: string) => void
  onOpen: (id: string) => void
  onMockup: (id: string) => void
  onAlign: (ids: string[], how: Alignment) => void
  onRemove: (ids: string[]) => void
  /** From the code: it keeps its kind and words, and can only be crossed out. */
  locked?: boolean
  removeName?: string
}) => {
  const [kinds, setKinds] = useState(false)
  const choices: CardChoice[] =
    picking.what === 'card'
      ? cardChoices
      : picking.what === 'wire'
        ? wireKinds.map((kind) => ({ key: kind, kind, hint: '' }))
        : []

  return (
    <div
      className={below ? 'map-context map-context--below' : 'map-context'}
      style={{ left: at.x, top: at.y }}
      role="toolbar"
      aria-label="What to do with what is picked"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {(picking.what === 'card' || picking.what === 'wire') && !locked ? (
        <span className="map-context-kind">
          <button
            type="button"
            className="map-act map-act--wide"
            aria-label={`Kind: ${picking.kind}`}
            aria-expanded={kinds}
            onClick={() => setKinds(!kinds)}
          >
            {picking.what === 'card' ? <CardMark kind={picking.kind} look={picking.look} size={12} small /> : null}
            <span>{picking.kind}</span>
            <Glyph of="down" size={12} />
          </button>
          {kinds ? (
            <div className="map-context-list" role="menu">
              {choices.map((choice) => (
                <button
                  key={choice.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={choice.kind === picking.kind}
                  className={choice.kind === picking.kind ? 'map-quick-row map-quick-row--on' : 'map-quick-row'}
                  onClick={() => {
                    onKind(picking.id, choice.kind, choice.look)
                    setKinds(false)
                  }}
                >
                  {picking.what === 'card' ? <CardMark kind={choice.kind} look={choice.look} size={14} /> : null}
                  {choice.kind}
                </button>
              ))}
            </div>
          ) : null}
        </span>
      ) : null}

      {picking.what !== 'many' && !locked ? (
        <Act
          glyph="edit"
          name={picking.what === 'card' ? 'Rename' : picking.what === 'wire' ? 'Say what it is for' : 'Edit the note'}
          onAct={() => onEdit(picking.id)}
        />
      ) : null}
      {picking.what === 'card' && picking.opens ? (
        <Act glyph="inside" name="Draw inside it" onAct={() => onOpen(picking.id)} />
      ) : null}
      {picking.what === 'card' && picking.page ? (
        <Act glyph="mockup" name="Add a mockup" onAct={() => onMockup(picking.id)} />
      ) : null}

      {picking.what === 'many' && picking.cards > 1 ? (
        <>
          <span className="map-context-words">{picking.ids.length} picked</span>
          <span className="map-context-rule" />
          <Act glyph="alignLeft" name="Line up their left edges" onAct={() => onAlign(picking.ids, 'left')} />
          <Act glyph="alignCenter" name="Line up their centres, down" onAct={() => onAlign(picking.ids, 'center')} />
          <Act glyph="alignRight" name="Line up their right edges" onAct={() => onAlign(picking.ids, 'right')} />
          <span className="map-context-rule" />
          <Act glyph="alignTop" name="Line up their tops" onAct={() => onAlign(picking.ids, 'top')} />
          <Act glyph="alignMiddle" name="Line up their middles, across" onAct={() => onAlign(picking.ids, 'middle')} />
          <Act glyph="alignBottom" name="Line up their bottoms" onAct={() => onAlign(picking.ids, 'bottom')} />
          {picking.cards > 2 ? (
            <>
              <span className="map-context-rule" />
              <Act glyph="spaceAcross" name="Space them evenly across" onAct={() => onAlign(picking.ids, 'across')} />
              <Act glyph="spaceDown" name="Space them evenly down" onAct={() => onAlign(picking.ids, 'down')} />
            </>
          ) : null}
        </>
      ) : picking.what === 'many' ? (
        <span className="map-context-words">{picking.ids.length} picked</span>
      ) : null}

      <span className="map-context-rule" />
      <Act
        glyph="bin"
        danger
        name={`${removeName} (Delete)`}
        onAct={() => onRemove(picking.what === 'many' ? picking.ids : [picking.id])}
      />
    </div>
  )
}
