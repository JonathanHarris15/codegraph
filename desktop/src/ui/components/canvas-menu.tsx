// codegraph: component canvas-menu
import { useEffect, useRef, type RefObject } from 'react'
import { Glyph, type ToolGlyph } from './kind-glyph.js'

export type MenuItem = { name: string; keys?: string; glyph?: ToolGlyph; danger?: boolean; act: () => void } | 'rule'

/** What a right-click offers, where it was clicked: the things a person most
 *  often does to what is under the pointer, with the keys that do them. */
export const CanvasMenu = ({
  at,
  items,
  onClose,
  opener,
}: {
  at: { x: number; y: number }
  items: MenuItem[]
  onClose: () => void
  /** The button that opened it, which closes it itself rather than counting as a
   *  click away. */
  opener?: RefObject<HTMLElement | null>
}) => {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    const away = (event: PointerEvent): void => {
      const target = event.target as Node
      if (!box.current?.contains(target) && !opener?.current?.contains(target)) onClose()
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [onClose, opener])

  return (
    <div
      ref={box}
      className="map-menu"
      role="menu"
      aria-label="What to do here"
      style={{ left: at.x, top: at.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, i) =>
        item === 'rule' ? (
          <span key={`rule${i}`} className="map-menu-rule" />
        ) : (
          <button
            key={item.name}
            type="button"
            role="menuitem"
            className={item.danger ? 'map-menu-item map-menu-item--danger' : 'map-menu-item'}
            onClick={() => {
              onClose()
              item.act()
            }}
          >
            <span className="map-menu-glyph">{item.glyph ? <Glyph of={item.glyph} size={15} /> : null}</span>
            <span className="map-menu-name">{item.name}</span>
            {item.keys ? <span className="map-menu-keys">{item.keys}</span> : null}
          </button>
        ),
      )}
    </div>
  )
}
