// codegraph: component map-canvas
import { useState, type PointerEvent, type ReactNode } from 'react'
import type { Said } from '../../modules/wording/index.js'
import { CARD_SHAPES, drawnShape, lookOf } from './card-looks.js'
import { Glyph, KindGlyph, LookGlyph, isStore, keeps, kindClass, lookClass } from './kind-glyph.js'
import { FIELDS_SHOWN, isFrame, type DrawnCard, type Placed, type Side, type Spot } from './map-layout.js'
import { seamOf, textAreaOf } from './shape-outline.js'

/** How the faces on the board are drawn: a card, and a wire's sentence. They
 *  only show what they are handed and say what was pressed; the canvas decides
 *  what that does. */

/** The word a card's type is shown in. */
export const kindWords = (card: DrawnCard): string => card.kind || card.level

/** A store's fields, a line each: its name, what it holds, and the store it
 *  points at. A field every record has is in bold. An open store ends with
 *  what any other field may hold. */
const Fields = ({ card }: { card: DrawnCard }) => {
  const fields = card.fields ?? []
  const more = fields.length - FIELDS_SHOWN
  return (
    <ul className="map-fields" aria-label={`Fields of ${card.name}`}>
      {fields.slice(0, FIELDS_SHOWN).map((field) => (
        <li key={field.name} className="map-field">
          <span className={`map-field-name${field.needed ? ' map-field-name--needed' : ''}`}>{field.name}</span>
          {field.pointsAt ? (
            <span className="map-field-holds map-field-points">→ {field.pointsAt}</span>
          ) : (
            <span className="map-field-holds">{field.holds}</span>
          )}
        </li>
      ))}
      {more > 0 ? <li className="map-more">and {more} more</li> : null}
      {card.others ? (
        <li className="map-field">
          <span className="map-field-name map-more">any other</span>
          <span className="map-field-holds">{card.others}</span>
        </li>
      ) : null}
    </ul>
  )
}

/** What a field can be made to hold straight on its card. Choices and lists
 *  are set in the store's design beside it. */
const QUICK_TYPES = ['text', 'number', 'whole number', 'yes or no', 'date', 'a record', 'anything']

/** A field written on a store's card itself: a button, then a row to name the
 *  field and say what it holds. Enter adds it and leaves the row ready for the
 *  next; Escape, or moving away with nothing typed, puts the button back. */
const AddField = ({ store, onAdd }: { store: string; onAdd: (field: { name: string; holds: string }) => void }) => {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [holds, setHolds] = useState('text')
  const keep = (event: { stopPropagation: () => void }): void => event.stopPropagation()
  const add = (): void => {
    if (name.trim()) onAdd({ name: name.trim(), holds })
    setName('')
  }
  if (!open)
    return (
      <button
        type="button"
        className="map-add-field"
        aria-label={`Add a field to ${store || 'this store'}`}
        onPointerDown={keep}
        onDoubleClick={keep}
        onClick={(event) => {
          keep(event)
          setOpen(true)
        }}
      >
        + Add a field
      </button>
    )
  return (
    <div
      className="map-add-field-row"
      onPointerDown={keep}
      onClick={keep}
      onDoubleClick={keep}
      onBlur={(event) => {
        // Moving out of the row adds what was typed, and closes it.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        add()
        setOpen(false)
      }}
    >
      <input
        className="map-add-field-name"
        aria-label={`Name of a new field of ${store || 'this store'}`}
        placeholder="fieldName"
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') add()
          if (event.key === 'Escape') {
            setName('')
            setOpen(false)
          }
        }}
      />
      <select
        className="map-add-field-holds"
        aria-label={`What the new field of ${store || 'this store'} holds`}
        value={holds}
        onChange={(event) => setHolds(event.target.value)}
      >
        {QUICK_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
    </div>
  )
}

const Chips = ({ card }: { card: DrawnCard }) => (
  <div className="map-chips">
    {card.children.slice(0, 6).map((child) => (
      <span key={child.id} className={`map-chip${isStore(child.kind) ? ' map-chip--store' : ''}`}>
        {child.name}
      </span>
    ))}
    {card.children.length > 6 ? <span className="map-chip map-more">+{card.children.length - 6}</span> : null}
  </div>
)

const Inside = ({ card, onAddField }: { card: DrawnCard; onAddField?: (field: { name: string; holds: string }) => void }) => {
  if (isStore(card.kind))
    return (
      <>
        {card.fields ? <Fields card={card} /> : null}
        {onAddField ? <AddField store={card.name} onAdd={onAddField} /> : null}
        {card.children.length ? <Chips card={card} /> : null}
      </>
    )
  if (card.level === 'code')
    return (
      <ul className="map-names">
        {card.names.slice(0, 8).map((name) => (
          <li key={name}>{name}</li>
        ))}
        {card.names.length > 8 ? <li className="map-more">and {card.names.length - 8} more</li> : null}
      </ul>
    )
  if (card.children.length === 0) return null
  return <Chips card={card} />
}

const SIDES: Side[] = ['n', 'e', 's', 'w']

/** What a card's mark says, drawn over the map by a proposal. */
const STATE_WORDS: Record<string, string> = { proposed: 'To build', built: 'Built', gone: 'To remove' }

export const CardFace = ({
  placed,
  picture,
  opens,
  selected,
  up,
  linked,
  passing,
  target,
  handles,
  movable,
  drawing,
  agent,
  extra,
  onIcon,
  onType,
  onOpen,
  onPress,
  onHandle,
  onEdit,
  onAddField,
}: {
  placed: Placed
  picture: string
  /** Something the page puts on the card, such as a software system's
   *  branch; pressing it never opens or moves the card. */
  extra?: ReactNode
  /** The agent says it is working here, or inside here: its words. */
  agent?: string
  opens: boolean
  selected: boolean
  /** How many levels out from the one in hand it is. Past none, it cannot be
   *  touched until a person has backed out to it. */
  up: number
  /** Under the pointer, or wired to what is. */
  linked?: 'self' | 'wired'
  /** Fading away as a card opens, or back as it closes. */
  passing?: 'leaving' | 'arriving'
  /** Clicked its icon, or the word for its type, to change them. */
  onIcon?: () => void
  onType?: () => void
  /** A wire being drawn would land here. */
  target: boolean
  /** Show the dots a wire can be drawn from. */
  handles: boolean
  /** It can be dragged somewhere else. */
  movable?: boolean
  drawing: boolean
  onOpen: () => void
  onPress?: (event: PointerEvent<HTMLDivElement>) => void
  onHandle?: (side: Side, event: PointerEvent<HTMLSpanElement>) => void
  /** Double-clicked one of its fields: its name, or what it is for. */
  onEdit?: (says?: boolean) => void
  /** A store being drawn: a field written straight onto its card. */
  onAddField?: (field: { name: string; holds: string }) => void
}) => {
  const { card, box } = placed
  const locked = up > 0
  const reachable = !locked && (opens || drawing)
  const shape = drawnShape(card)
  const look = lookOf(card)
  const area = shape ? textAreaOf(CARD_SHAPES[shape].d) : null
  const classes = ['map-card', `map-card--${card.level}`, kindClass(card.kind)]
  if (look) classes.push(lookClass(look))
  if (shape) classes.push('map-card--shaped', `map-card--shape-${shape}`)
  if (linked) classes.push(`map-card--${linked === 'self' ? 'hovered' : 'wired'}`)
  if (passing) classes.push(`map-${passing}`)
  if (keeps(card.kind) || isStore(card.kind)) classes.push('map-card--keeps')
  if (!card.setUp || card.kind === 'shallow software system') classes.push('map-card--bare')
  if (card.kind === 'person') classes.push('map-card--person')
  if (isFrame(card)) classes.push('map-frame')
  if (card.outOfReach) classes.push('map-card--out-of-reach')
  if (selected) classes.push('map-card--selected')
  if (locked) classes.push('map-up', `map-up--${Math.min(up, 3)}`)
  if (target) classes.push('map-card--target')
  if (drawing) classes.push('map-card--drawn')
  if (movable && !locked) classes.push('map-card--movable')
  if (card.state) classes.push(`map-card--${card.state}`)
  if (agent !== undefined) classes.push('map-card--agent')
  const mockup = drawing ? '' : (card.mockup ?? '')
  const onField = (says: boolean) =>
    drawing && onEdit && !locked
      ? (event: { stopPropagation: () => void }): void => {
          event.stopPropagation()
          onEdit(says)
        }
      : undefined
  const words = (
    <>
      <div className="map-kind">
        {onIcon ? (
          <button
            type="button"
            className="map-glyph map-restyle"
            aria-label={`Change the icon of ${card.name || 'this card'}`}
            title="Change the icon"
            onClick={(event) => {
              event.stopPropagation()
              onIcon()
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {look ? <LookGlyph icon={look.icon} /> : <KindGlyph kind={card.kind} />}
          </button>
        ) : (
          <span className="map-glyph">{look ? <LookGlyph icon={look.icon} /> : <KindGlyph kind={card.kind} />}</span>
        )}
        {onType ? (
          <button
            type="button"
            className="map-kind-word map-restyle"
            aria-label={`Change the type of ${card.name || 'this card'}`}
            title="Change the type"
            onClick={(event) => {
              event.stopPropagation()
              onType()
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {kindWords(card)}
          </button>
        ) : (
          <span className="map-kind-word">{kindWords(card)}</span>
        )}
      </div>
      <div className="map-name" onDoubleClick={onField(false)}>
        {card.name || <span className="map-more">Unnamed</span>}
      </div>
      {card.says ? (
        <div className="map-says" onDoubleClick={onField(true)}>
          {card.says}
        </div>
      ) : null}
      {shape ? null : <Inside card={card} onAddField={onAddField} />}
    </>
  )
  return (
    <div
      className={classes.join(' ')}
      data-card={card.id}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      role={reachable ? 'button' : undefined}
      aria-label={drawing ? card.name || 'Unnamed card' : opens ? `Open ${card.name}` : card.name}
      aria-pressed={drawing && !locked ? selected : undefined}
      aria-disabled={locked || undefined}
      tabIndex={reachable ? 0 : undefined}
      onPointerDown={locked ? undefined : onPress}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation()
        if (opens && !locked) onOpen()
      }}
      onKeyDown={(event) => {
        // Enter is the way in without a mouse. While drawing it does nothing:
        // a card's fields open with a double-click.
        if (!drawing && opens && !locked && event.key === 'Enter') onOpen()
      }}
    >
      {shape ? (
        <svg className="map-card-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={CARD_SHAPES[shape].d} vectorEffect="non-scaling-stroke" />
        </svg>
      ) : null}
      {isFrame(card) ? (
        <>
          <div className="map-frame-bar">
            <span className="map-dot" />
            <span className="map-dot" />
            <span className="map-dot" />
            {card.at ? (
              <span className="map-frame-at">{card.at}</span>
            ) : (
              <span className="map-frame-at map-frame-at--none">no address</span>
            )}
          </div>
          {mockup && picture ? (
            <div className="map-shots">
              <figure className="map-shots-one">
                <img className="map-shot map-shot--real" src={picture} alt={`${card.name} as it looks`} draggable={false} />
                <figcaption>Now</figcaption>
              </figure>
              <figure className="map-shots-one">
                <img className="map-shot map-shot--real" src={mockup} alt={`${card.name} as proposed`} draggable={false} />
                <figcaption>Proposed</figcaption>
              </figure>
            </div>
          ) : mockup ? (
            <img className="map-shot map-shot--real" src={mockup} alt={`${card.name} as proposed`} draggable={false} />
          ) : picture ? (
            <img className="map-shot map-shot--real" src={picture} alt={`${card.name} as it looks`} draggable={false} />
          ) : (
            <div className="map-shot">{drawing ? 'No mockup yet' : 'No screenshot yet'}</div>
          )}
          <div className="map-frame-name" onDoubleClick={onField(false)}>
            <span className="map-kind-word">{kindWords(card)}</span>
            {card.start ? (
              <span className="map-start" title="The start page">
                <Glyph of="start" size={10} />
              </span>
            ) : null}
            <span className="map-name">{card.name || <span className="map-more">Unnamed</span>}</span>
            {card.recipe ? (
              <span className="map-recipe" title={`Follows the recipe ${card.recipe}`}>
                {card.recipe}
              </span>
            ) : null}
          </div>
        </>
      ) : area ? (
        <div
          className="map-card-words"
          style={{ left: `${area.x * 100}%`, top: `${area.y * 100}%`, width: `${area.w * 100}%`, height: `${area.h * 100}%` }}
        >
          {words}
        </div>
      ) : (
        words
      )}
      {extra ? (
        <span
          className="map-card-extra"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          {extra}
        </span>
      ) : null}
      {card.state ? (
        <span className={`map-state map-state--${card.state}`}>{STATE_WORDS[card.state]}</span>
      ) : null}
      {agent !== undefined ? (
        <span className="map-agent" role="status" aria-label={`The agent is working here${agent ? `: ${agent}` : ''}`}>
          <span className="map-agent-dot" />
          {agent || 'Agent working here'}
        </span>
      ) : null}
      {handles && onHandle && !locked
        ? SIDES.map((side) => (
            <span
              key={side}
              className={`map-handle map-handle--${side}`}
              // On a shape, a dot sits on the shape's real edge.
              style={
                shape
                  ? (() => {
                      const seam = seamOf(CARD_SHAPES[shape].d, { x: 0, y: 0, w: box.w, h: box.h }, side)
                      return { left: seam.x, top: seam.y }
                    })()
                  : undefined
              }
              title="Click to add a card here, wired; drag to wire it to another card"
              onPointerDown={(event) => {
                event.stopPropagation()
                onHandle(side, event)
              }}
            />
          ))
        : null}
    </div>
  )
}

/** A wire read aloud, in a chip on its own curve: who acts, how, on what,
 *  and what for. On a level too busy for that, the verb alone. */
export const Sentence = ({
  said,
  verb,
  at,
  state,
  small,
  missing,
  unfinished,
  selected,
  pickable,
  lit,
  up,
  movable,
  hidden,
  measure,
  onPick,
  onEdit,
}: {
  said: Said
  verb: string
  at: Spot
  /** How the wire stands against a proposal. */
  state?: string
  small: boolean
  /** On the map, the code gave this wire no words: a problem to show. */
  missing: boolean
  /** On a sketch, nobody has said what this wire is for yet. */
  unfinished: boolean
  selected: boolean
  pickable: boolean
  /** The card at one end of its wire is under the pointer. */
  lit: boolean
  /** How many levels out from the one in hand it is. */
  up: number
  /** It can be dragged out of the way. */
  movable: boolean
  hidden: boolean
  measure: (element: HTMLDivElement | null) => void
  onPick: (event: PointerEvent<HTMLDivElement>) => void
  onEdit: () => void
}) => {
  const classes = ['map-sentence']
  if (state) classes.push(`map-sentence--${state}`)
  if (small) classes.push('map-sentence--small')
  if (missing) classes.push('map-sentence--missing')
  if (selected) classes.push('map-sentence--selected')
  if (pickable) classes.push('map-sentence--pickable')
  if (movable) classes.push('map-sentence--movable')
  if (lit) classes.push('map-sentence--lit')
  if (up > 0) classes.push('map-up', `map-up--${Math.min(up, 3)}`)
  const words = said.map((part) => part.text).join('')
  return (
    <div
      ref={measure}
      className={classes.join(' ')}
      style={{ left: at.x, top: at.y, visibility: hidden ? 'hidden' : undefined }}
      role={pickable ? 'button' : undefined}
      aria-label={`Wire: ${words}`}
      title={small ? words : undefined}
      onPointerDown={(event) => {
        if (!pickable && !movable) return
        onPick(event)
      }}
      onDoubleClick={(event) => {
        if (!pickable) return
        event.stopPropagation()
        onEdit()
      }}
    >
      {small ? (
        <span className="map-said-verb">{verb}</span>
      ) : (
        <span className="map-said">
          {said.map((part, i) => (
            <span key={i} className={`map-said-${part.role}`}>
              {part.text}
            </span>
          ))}
          {missing ? <span className="map-said-missing"> · no words yet</span> : null}
          {unfinished ? (
            <span
              className="map-said-missing map-said-ask"
              role="button"
              aria-label="Say what the wire is for"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onEdit()
              }}
            >
              {' '}
              · what for?
            </span>
          ) : null}
        </span>
      )}
    </div>
  )
}
