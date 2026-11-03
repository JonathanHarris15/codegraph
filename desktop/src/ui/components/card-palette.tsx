// codegraph: component card-palette
import type { PointerEvent } from 'react'
import type { Level } from '../../features/show-map.js'
import { Glyph, KindGlyph, kindClass } from './kind-glyph.js'
import { kindGroups, kindHints } from './sketch-edits.js'

/** The cards a sketch can have at the level being drawn, docked beside the
 *  tools the way a diagram tool keeps its shapes: drag one onto the board, or
 *  click it and then click where it goes. */
export const CardPalette = ({
  level,
  armed,
  onArm,
  onLift,
  onClose,
}: {
  /** The level the cards would be placed at. */
  level: Level
  /** The kind waiting to be placed with a click, if any. */
  armed: string
  onArm: (kind: string) => void
  /** A kind picked up to be dragged onto the board. */
  onLift: (kind: string, event: PointerEvent<HTMLElement>) => void
  onClose: () => void
}) => {
  const groups = kindGroups(level)
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
          {group.kinds.map((kind) => (
            <button
              key={kind}
              type="button"
              className={armed === kind ? 'map-palette-item map-palette-item--armed' : 'map-palette-item'}
              aria-pressed={armed === kind}
              aria-label={`Card: ${kind}`}
              title={`${kind}: ${kindHints[kind] ?? ''}`}
              onPointerDown={(event) => {
                if (event.button !== 0) return
                onLift(kind, event)
              }}
              onClick={() => onArm(armed === kind ? '' : kind)}
            >
              <span className={`map-palette-swatch ${kindClass(kind)}`}>
                <KindGlyph kind={kind} size={16} />
              </span>
              <span className="map-palette-words">
                <span className="map-palette-name">{kind}</span>
                <span className="map-palette-says">{kindHints[kind] ?? ''}</span>
              </span>
            </button>
          ))}
        </div>
      ))}
    </aside>
  )
}
