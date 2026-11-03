// codegraph: component zoom-bar
import { Glyph } from './kind-glyph.js'

/** Zoom, fit, and out a level, bottom left of the board. The scale is shown
 *  as a number because a person on a canvas with no number has to guess. */
export const ZoomBar = ({
  scale,
  atTop,
  onIn,
  onOut,
  onFit,
  onUp,
}: {
  scale: number
  atTop: boolean
  onIn: () => void
  onOut: () => void
  onFit: () => void
  onUp: () => void
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
  </div>
)
