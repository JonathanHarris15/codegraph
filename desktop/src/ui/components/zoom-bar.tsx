// codegraph: component zoom-bar
import { Glyph } from './kind-glyph.js'
import type { WireStyle } from './square-wires.js'

/** Zoom, fit, and out a level, bottom left of the board, and how its wires
 *  are drawn. The scale is shown as a number because a person on a canvas
 *  with no number has to guess. */
export const ZoomBar = ({
  scale,
  atTop,
  onIn,
  onOut,
  onFit,
  onUp,
  wires,
  onWires,
}: {
  scale: number
  atTop: boolean
  onIn: () => void
  onOut: () => void
  onFit: () => void
  onUp: () => void
  wires: WireStyle
  onWires: (style: WireStyle) => void
}) => (
  <div className="map-zoom" role="group" aria-label="Zoom">
    <button type="button" className="map-zoom-button" aria-label="Zoom out" onClick={onOut}>
      <Glyph of="out" size={16} />
    </button>
    <button type="button" className="map-zoom-scale" aria-label="Fit to the level" onClick={onFit}>
      {Math.round(scale * 100)}%
    </button>
    <button type="button" className="map-zoom-button" aria-label="Zoom in" onClick={onIn}>
      <Glyph of="in" size={16} />
    </button>
    <span className="map-zoom-sep" />
    <button type="button" className="map-zoom-button" aria-label="Fit" title="Fit to the level" onClick={onFit}>
      <Glyph of="fit" size={16} />
    </button>
    <button
      type="button"
      className="map-zoom-button"
      aria-label="Out a level"
      title={atTop ? 'You are at the top' : 'Out a level'}
      disabled={atTop}
      onClick={onUp}
    >
      <Glyph of="up" size={16} />
    </button>
    <span className="map-zoom-sep" />
    <button
      type="button"
      className={`map-zoom-button${wires === 'curved' ? ' map-zoom-button--on' : ''}`}
      aria-label="Curved wires"
      aria-pressed={wires === 'curved'}
      title="Curved wires"
      onClick={() => onWires('curved')}
    >
      <Glyph of="curvedWires" size={16} />
    </button>
    <button
      type="button"
      className={`map-zoom-button${wires === 'square' ? ' map-zoom-button--on' : ''}`}
      aria-label="Right-angle wires"
      aria-pressed={wires === 'square'}
      title="Right-angle wires: pick one to move its pieces"
      onClick={() => onWires('square')}
    >
      <Glyph of="squareWires" size={16} />
    </button>
  </div>
)
