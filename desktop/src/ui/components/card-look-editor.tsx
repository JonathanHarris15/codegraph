// codegraph: component card-look-editor
import { CARD_SHAPES, LOOK_COLORS, SHAPE_NAMES, type CardLook } from './card-looks.js'
import { LOOK_ICONS, LookGlyph, lookClass } from './kind-glyph.js'

/** Says what a card of a person's own type is and how it looks: its type's
 *  name, which is not the card's own name, then an icon, a shape and a colour.
 *  The card library uses it to make a type, the side panel to change a card. */
export const CardLookEditor = ({
  kind,
  look,
  canSave = false,
  onKind,
  onLook,
  onSave,
}: {
  kind: string
  look: CardLook
  /** There is something new here worth keeping as a type. */
  canSave?: boolean
  onKind: (kind: string) => void
  onLook: (look: CardLook) => void
  onSave?: () => void
}) => (
  <div className="map-look">
    <label className="ds-field">
      <span className="ds-label">Type</span>
      <input
        className="ds-input"
        aria-label="Type name"
        placeholder="e.g. queue, gateway, worker"
        value={kind === 'card' ? '' : kind}
        onChange={(event) => onKind(event.target.value)}
      />
    </label>
    <div className="map-look-group" role="radiogroup" aria-label="Icon">
      <span className="ds-label">Icon</span>
      <div className="map-look-grid">
        {Object.keys(LOOK_ICONS).map((icon) => (
          <button
            key={icon}
            type="button"
            role="radio"
            aria-checked={look.icon === icon}
            aria-label={`Icon: ${icon}`}
            title={icon}
            className={look.icon === icon ? 'map-look-pick map-look-pick--on' : 'map-look-pick'}
            onClick={() => onLook({ ...look, icon })}
          >
            <LookGlyph icon={icon} size={15} />
          </button>
        ))}
      </div>
    </div>
    <div className="map-look-group" role="radiogroup" aria-label="Shape">
      <span className="ds-label">Shape</span>
      <div className="map-look-grid">
        {SHAPE_NAMES.map((shape) => (
          <button
            key={shape}
            type="button"
            role="radio"
            aria-checked={look.shape === shape}
            aria-label={`Shape: ${CARD_SHAPES[shape].name}`}
            title={CARD_SHAPES[shape].name}
            className={look.shape === shape ? 'map-look-pick map-look-pick--on' : 'map-look-pick'}
            onClick={() => onLook({ ...look, shape })}
          >
            <svg viewBox="0 0 100 100" width="16" height="16" aria-hidden="true">
              <path d={CARD_SHAPES[shape].d} vectorEffect="non-scaling-stroke" />
            </svg>
          </button>
        ))}
      </div>
    </div>
    <div className="map-look-group" role="radiogroup" aria-label="Colour">
      <span className="ds-label">Colour</span>
      <div className="map-look-grid">
        {LOOK_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={look.color === color}
            aria-label={`Colour: ${color}`}
            title={color}
            className={`map-look-color ${lookClass({ color })}${look.color === color ? ' map-look-color--on' : ''}`}
            onClick={() => onLook({ ...look, color })}
          />
        ))}
      </div>
    </div>
    {canSave && onSave ? (
      <button type="button" className="ds-button" onClick={onSave}>
        Save as a card type
      </button>
    ) : null}
  </div>
)
