// codegraph: component card-palette
import { useState, type PointerEvent } from 'react'
import type { CardType } from '../../modules/card-types/schema.js'
import { CardLookEditor } from './card-look-editor.js'
import { BLANK_LOOK, type CardLook } from './card-looks.js'
import { CardMark, Glyph } from './kind-glyph.js'
import type { CardChoice } from './sketch-edits.js'

/** The cards a sketch can have at the level being drawn, docked beside the
 *  tools the way a diagram tool keeps its shapes: drag one onto the board, or
 *  click it and then click where it goes. */
export const CardPalette = ({
  groups,
  canMakeTypes,
  types,
  armed,
  onArm,
  onLift,
  onTypes,
  onClose,
}: {
  /** What can be placed on the level, in groups. */
  groups: { name: string; choices: CardChoice[] }[]
  /** On this level a person can make up their own types of card. */
  canMakeTypes: boolean
  types: CardType[]
  /** What is waiting to be placed with a click, if anything. */
  armed: string
  onArm: (key: string) => void
  /** Something picked up to be dragged onto the board. */
  onLift: (key: string, event: PointerEvent<HTMLElement>) => void
  onTypes: (types: CardType[]) => void
  onClose: () => void
}) => {
  // Each card shows the key that picks it, counting down the whole list.
  const all = groups.flatMap((group) => group.choices.map((choice) => choice.key))
  const [making, setMaking] = useState<{ name: string; look: CardLook } | null>(null)
  return (
    <aside className="map-palette" aria-label="Cards">
      <div className="map-palette-head">
        <span>Cards</span>
        <button type="button" className="map-palette-close" aria-label="Hide the cards" onClick={onClose}>
          <Glyph of="close" size={14} />
        </button>
      </div>
      <div className="map-palette-hint">Drag onto the board, or click then place.</div>
      {groups.map((group) => (
        <div key={group.name || 'all'} className="map-palette-group">
          {group.name ? <div className="map-flyout-group">{group.name}</div> : null}
          {group.choices.map((choice) => (
            <span key={choice.key} className="map-palette-row">
              <button
                type="button"
                className={armed === choice.key ? 'map-palette-item map-palette-item--armed' : 'map-palette-item'}
                aria-pressed={armed === choice.key}
                aria-label={`Card: ${choice.kind}`}
                title={`${choice.kind}: ${choice.hint}`}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  onLift(choice.key, event)
                }}
                onClick={() => onArm(armed === choice.key ? '' : choice.key)}
              >
                <CardMark kind={choice.kind} look={choice.look} />
                <span className="map-palette-words">
                  <span className="map-palette-name">{choice.kind}</span>
                  <span className="map-palette-says">{choice.hint}</span>
                </span>
                {all.indexOf(choice.key) < 9 ? <kbd className="map-palette-key">{all.indexOf(choice.key) + 1}</kbd> : null}
              </button>
              {choice.key.startsWith('type:') ? (
                <button
                  type="button"
                  className="map-palette-forget"
                  aria-label={`Forget the type ${choice.kind}`}
                  title="Forget this type. Cards already drawn keep their look."
                  onClick={() => onTypes(types.filter((type) => `type:${type.id}` !== choice.key))}
                >
                  <Glyph of="close" size={12} />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ))}
      {canMakeTypes ? (
        making ? (
          <form
            className="map-palette-making"
            aria-label="New card type"
            onSubmit={(event) => {
              event.preventDefault()
              const name = making.name.trim()
              if (!name) return
              onTypes([...types.filter((type) => type.name !== name), { id: crypto.randomUUID(), name, ...making.look }])
              setMaking(null)
            }}
          >
            <CardLookEditor
              kind={making.name}
              look={making.look}
              onKind={(name) => setMaking({ ...making, name })}
              onLook={(look) => setMaking({ ...making, look })}
            />
            <div className="map-palette-making-acts">
              <button type="button" className="ds-button" onClick={() => setMaking(null)}>
                Cancel
              </button>
              <button type="submit" className="ds-button ds-button--primary" disabled={!making.name.trim()}>
                Save type
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="map-palette-new" onClick={() => setMaking({ name: '', look: BLANK_LOOK })}>
            New card type…
          </button>
        )
      ) : null}
    </aside>
  )
}
