// codegraph: component zoom-bar
import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Glyph } from './kind-glyph.js'
import type { WireStyle } from './square-wires.js'

/** Zoom and out a level, bottom left of the board. The scale is shown as a
 *  number because a person on a canvas with no number has to guess, and
 *  clicking it opens a menu to fit the level to the window or go to a set
 *  scale, so fitting is found by looking. How wires are drawn is a choice
 *  for the whole board, made from the board's own menu; it shows here, set
 *  apart, only while that menu does not offer it. */
export const ZoomBar = ({
  scale,
  atTop,
  parent,
  onIn,
  onOut,
  onFit,
  onScale,
  onUp,
  wires,
  onWires,
}: {
  scale: number
  atTop: boolean
  /** The name of the level a step out goes to, if it is known. */
  parent?: string
  onIn: () => void
  onOut: () => void
  onFit: () => void
  /** Goes to a set scale, 1 being 100%. Left out, the menu only fits. */
  onScale?: (k: number) => void
  onUp: () => void
  wires?: WireStyle
  onWires?: (style: WireStyle) => void
}) => {
  const [menu, setMenu] = useState<'' | 'scale' | 'wires'>('')
  const box = useRef<HTMLDivElement>(null)
  const percent = Math.round(scale * 100)
  const up = atTop ? 'You are at the top' : parent ? `Up to ${parent}` : 'Out a level'

  // A click anywhere else, or Esc, puts the menu away.
  useEffect(() => {
    if (!menu) return
    const away = (event: PointerEvent): void => {
      if (!box.current?.contains(event.target as Node)) setMenu('')
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setMenu('')
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [menu])

  const choice = (style: WireStyle, name: string, hint: string) => (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={wires === style}
      className={wires === style ? 'map-menu-item map-menu-item--on' : 'map-menu-item'}
      title={hint}
      onClick={() => {
        onWires?.(style)
        setMenu('')
      }}
    >
      <span className="map-menu-glyph">
        <Glyph of={style === 'curved' ? 'curvedWires' : 'squareWires'} size={15} />
      </span>
      <span className="map-menu-name">{name}</span>
      <span className="map-menu-keys">{wires === style ? '✓' : ''}</span>
    </button>
  )

  return (
    <div ref={box} className="map-zoom" role="group" aria-label="Zoom">
      <button type="button" className="map-zoom-button" aria-label="Zoom out" title="Zoom out (−)" onClick={onOut}>
        <Glyph of="out" size={16} />
      </button>
      <button
        type="button"
        className={menu === 'scale' ? 'map-zoom-scale map-zoom-button--on' : 'map-zoom-scale'}
        aria-label={`Zoom ${percent}%`}
        aria-haspopup="menu"
        aria-expanded={menu === 'scale'}
        title="Fit to screen, or pick a scale"
        onClick={() => setMenu(menu === 'scale' ? '' : 'scale')}
      >
        <span>{percent}%</span>
        <Glyph of="down" size={12} />
      </button>
      {menu === 'scale' ? (
        <div className="map-menu map-zoom-menu map-zoom-menu--scale" role="menu" aria-label="Zoom">
          <button
            type="button"
            role="menuitem"
            className="map-menu-item"
            onClick={() => {
              onFit()
              setMenu('')
            }}
          >
            <span className="map-menu-glyph">
              <Glyph of="fit" size={15} />
            </span>
            <span className="map-menu-name">Fit to screen</span>
            <span className="map-menu-keys">0</span>
          </button>
          {onScale ? (
            <>
              <span className="map-menu-rule" role="separator" />
              {[0.5, 1, 2].map((k) => (
                <button
                  key={k}
                  type="button"
                  role="menuitemradio"
                  aria-checked={percent === k * 100}
                  className={percent === k * 100 ? 'map-menu-item map-menu-item--on' : 'map-menu-item'}
                  onClick={() => {
                    onScale(k)
                    setMenu('')
                  }}
                >
                  <span className="map-menu-glyph">{percent === k * 100 ? <Check size={15} aria-hidden="true" /> : null}</span>
                  <span className="map-menu-name">{k * 100}%</span>
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
      <button type="button" className="map-zoom-button" aria-label="Zoom in" title="Zoom in (+)" onClick={onIn}>
        <Glyph of="in" size={16} />
      </button>
      <span className="map-zoom-sep" />
      <button type="button" className="map-zoom-button" aria-label={up} title={up} disabled={atTop} onClick={onUp}>
        <Glyph of="up" size={16} />
      </button>
      {wires && onWires ? (
        <>
          <span className="map-zoom-sep" />
          <button
            type="button"
            className={menu === 'wires' ? 'map-zoom-button map-zoom-last map-zoom-button--on' : 'map-zoom-button map-zoom-last'}
            aria-label="How wires are drawn"
            aria-haspopup="menu"
            aria-expanded={menu === 'wires'}
            title="How wires are drawn"
            onClick={() => setMenu(menu === 'wires' ? '' : 'wires')}
          >
            <Glyph of={wires === 'curved' ? 'curvedWires' : 'squareWires'} size={16} />
          </button>
          {menu === 'wires' ? (
            <div className="map-menu map-zoom-menu" role="menu" aria-label="How wires are drawn">
              {choice('curved', 'Curved wires', 'Curved wires')}
              {choice('square', 'Right-angle wires', 'Right-angle wires: pick one to move its pieces')}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
