// codegraph: component together-layer
import type { DrawnCard } from './map-layout.js'

type Box = { x: number; y: number; w: number; h: number }

/** One other member on this map, as the canvas draws them. */
export type Other = {
  id: string
  name: string
  color: string
  /** The card they are inside. */
  inside: string
  /** Their cursor, in that card's own space. */
  x?: number
  y?: number
  /** Where things they are dragging have got to, in that same space. */
  dragging: { id: string; x: number; y: number }[]
}

/** Others on the board: the cursor of anyone inside the same card; a badge on
 *  any card someone is inside, which takes you there; and a ring round whatever
 *  someone has hold of. Laid over the board, in its own space and scale. */
export const TogetherLayer = ({
  others,
  heldBy,
  focusId,
  shift,
  k,
  placed,
  contains,
  onGo,
}: {
  others: Other[]
  /** What others have hold of, and whose name to show. */
  heldBy: Map<string, string>
  focusId: string
  shift: { x: number; y: number }
  k: number
  placed: { card: DrawnCard; box: Box }[]
  /** Whether a card holds another, however deep. */
  contains: (cardId: string, inside: string) => boolean
  onGo: (inside: string) => void
}) => {
  const atScreenSize = { transform: `scale(${1 / k})`, transformOrigin: 'top left' }
  return (
    <div className="together-layer">
      {placed.map(({ card, box }) => {
        const holder = heldBy.get(card.id)
        const within = others.filter((o) => o.inside !== focusId && contains(card.id, o.inside))
        if (!holder && !within.length) return null
        return (
          <div key={card.id}>
            {holder ? (
              <div className="together-held" style={{ left: box.x - 3, top: box.y - 3, width: box.w + 6, height: box.h + 6 }} role="status" aria-label={`${holder} has hold of ${card.name}`}>
                <span style={atScreenSize}>{holder}</span>
              </div>
            ) : null}
            {within.length ? (
              <div className="together-badges" style={{ left: box.x + box.w, top: box.y, ...atScreenSize }}>
                {within.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="together-badge"
                    style={{ background: o.color }}
                    title={`${o.name} is inside ${card.name}. Click to go there.`}
                    aria-label={`Go to ${o.name}, inside ${card.name}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      onGo(o.inside)
                    }}
                  >
                    {o.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
      {others
        .filter((o) => o.inside === focusId && o.x !== undefined && o.y !== undefined)
        .map((o) => (
          <div key={o.id} className="together-cursor" role="status" aria-label={`${o.name}'s cursor`} style={{ left: (o.x ?? 0) + shift.x, top: (o.y ?? 0) + shift.y, ...atScreenSize }}>
            <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden="true">
              <path d="M1 1 L1 16 L5 12.5 L8 19 L11 17.5 L8 11.5 L14 11 Z" fill={o.color} stroke="white" strokeWidth="1" />
            </svg>
            <span style={{ background: o.color }}>{o.name}</span>
          </div>
        ))}
    </div>
  )
}
