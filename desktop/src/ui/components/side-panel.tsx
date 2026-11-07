// codegraph: component side-panel
import { useRef, useState, type ReactNode } from 'react'

const NARROWEST = 180
const WIDEST = 560

const keptWidth = (name: string, otherwise: number): number => {
  try {
    const kept = Number(window.localStorage.getItem(`codegraph-panel-width-${name}`))
    return kept >= NARROWEST && kept <= WIDEST ? kept : otherwise
  } catch {
    return otherwise
  }
}

/** The panel beside the board, which a person can make wider or narrower by
 *  dragging its edge. Each panel remembers its own width. */
export const SidePanel = ({ name, start, children }: { name: string; start: number; children: ReactNode }) => {
  const [width, setWidth] = useState(() => keptWidth(name, start))
  const drag = useRef<{ x: number; from: number } | null>(null)
  return (
    <div className="map-side" style={{ width }}>
      {children}
      <div
        className="map-side-grip"
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize the ${name} panel`}
        aria-valuenow={width}
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { x: event.clientX, from: width }
        }}
        onPointerMove={(event) => {
          const now = drag.current
          if (!now) return
          setWidth(Math.min(WIDEST, Math.max(NARROWEST, now.from + event.clientX - now.x)))
        }}
        onPointerUp={() => {
          drag.current = null
          try {
            window.localStorage.setItem(`codegraph-panel-width-${name}`, String(width))
          } catch {
            // Not remembered; it is only a preference.
          }
        }}
        onDoubleClick={() => {
          setWidth(start)
          try {
            window.localStorage.removeItem(`codegraph-panel-width-${name}`)
          } catch {
            // Nothing kept to forget.
          }
        }}
      />
    </div>
  )
}
