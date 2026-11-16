// codegraph: component overview
import { lookOf } from './card-looks.js'
import { Glyph, kindClass, lookClass } from './kind-glyph.js'
import { boundsOf, type Box, type Placed } from './map-layout.js'

const H = 128
const PAD = 8

const holds = (outer: Box, inner: Box): boolean =>
  outer !== inner &&
  outer.w * outer.h > inner.w * inner.h &&
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h

/** Where you are on the board: every card on it a block in its kind colour,
 *  the viewport a ring around them. A card that holds others, like an open
 *  one, is drawn as an outline under them, so its insides still show. */
export const Overview = ({
  of: name,
  placed,
  view,
  shut,
  onToggle,
  onGo,
}: {
  of: string
  placed: Placed[]
  /** What the window covers, in the same space the cards are laid out in. */
  view: Box
  shut: boolean
  onToggle: () => void
  onGo: (at: { x: number; y: number }) => void
}) => {
  if (shut)
    return (
      <div className="map-overview map-overview--shut">
        <button type="button" className="map-zoom-button" aria-label="Show the overview" onClick={onToggle}>
          <Glyph of="overview" size={16} />
        </button>
      </div>
    )

  const all = boundsOf([...placed.map((p) => p.box), view])
  const width = 208 - PAD * 2
  const k = all.w === 0 ? 1 : Math.min(width / all.w, (H - PAD * 2) / all.h)
  const onto = (box: Box) => ({
    left: PAD + (box.x - all.x) * k,
    top: PAD + (box.y - all.y) * k,
    width: Math.max(2, box.w * k),
    height: Math.max(2, box.h * k),
  })

  return (
    <div className="map-overview">
      <div className="map-overview-head">
        <span>{name}</span>
        <button type="button" className="map-zoom-button" aria-label="Hide the overview" onClick={onToggle}>
          <Glyph of="close" size={14} />
        </button>
      </div>
      <div
        className="map-overview-body"
        role="presentation"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          onGo({
            x: all.x + (event.clientX - box.left - PAD) / k,
            y: all.y + (event.clientY - box.top - PAD) / k,
          })
        }}
      >
        {placed
          .map((p) => ({ p, frame: placed.some((q) => holds(p.box, q.box)) }))
          .sort((a, b) => Number(b.frame) - Number(a.frame) || b.p.box.w * b.p.box.h - a.p.box.w * a.p.box.h)
          .map(({ p, frame }) => {
            const look = lookOf(p.card)
            return (
              <span
                key={p.card.id}
                className={`map-overview-block${frame ? ' map-overview-block--frame' : ''} ${kindClass(p.card.kind)}${look ? ` ${lookClass(look)}` : ''}`}
                style={onto(p.box)}
              />
            )
          })}
        <span className="map-overview-box" style={onto(view)} />
      </div>
    </div>
  )
}
