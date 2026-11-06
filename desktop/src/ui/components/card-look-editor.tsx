// codegraph: component card-look-editor
import { CARD_SHAPES, LOOK_COLORS, SHAPE_NAMES, type CardLook } from './card-looks.js'
import { LOOK_ICONS, LookGlyph, lookClass } from './kind-glyph.js'

/** The icons a card can have, to pick one. */
export const IconPick = ({ icon, onPick }: { icon: string; onPick: (icon: string) => void }) => (
  <div className="map-look-grid">
    {Object.keys(LOOK_ICONS).map((name) => (
      <button
        key={name}
        type="button"
        role="radio"
        aria-checked={icon === name}
        aria-label={`Icon: ${name}`}
        title={name}
        className={icon === name ? 'map-look-pick map-look-pick--on' : 'map-look-pick'}
        onClick={() => onPick(name)}
      >
        <LookGlyph icon={name} size={15} />
      </button>
    ))}
  </div>
)

/** The colours a card can be, to pick one. */
export const ColorPick = ({ color, onPick }: { color: string; onPick: (color: string) => void }) => (
  <div className="map-look-grid" role="radiogroup" aria-label="Colour">
    {LOOK_COLORS.map((name) => (
      <button
        key={name}
        type="button"
        role="radio"
        aria-checked={color === name}
        aria-label={`Colour: ${name}`}
        title={name}
        className={`map-look-color ${lookClass({ color: name })}${color === name ? ' map-look-color--on' : ''}`}
        onClick={() => onPick(name)}
      />
    ))}
  </div>
)

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
      <IconPick icon={look.icon} onPick={(icon) => onLook({ ...look, icon })} />
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
    <div className="map-look-group">
      <span className="ds-label">Colour</span>
      <ColorPick color={look.color} onPick={(color) => onLook({ ...look, color })} />
    </div>
    {canSave && onSave ? (
      <button type="button" className="ds-button" onClick={onSave}>
        Save as a card type
      </button>
    ) : null}
  </div>
)
