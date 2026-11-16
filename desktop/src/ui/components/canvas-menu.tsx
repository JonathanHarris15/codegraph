// codegraph: component canvas-menu
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { keysFor } from './hotkeys.js'
import { Glyph, type ToolGlyph } from './kind-glyph.js'

/** How far a menu keeps from the edge of the window. */
const EDGE = 8

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
  // Where it really goes: where it was asked for, turned back in from any
  // edge it would run past, so it is never squeezed against one.
  const [spot, setSpot] = useState(at)
  useLayoutEffect(() => {
    const menu = box.current
    const room = menu?.offsetParent
    if (!menu || !(room instanceof HTMLElement)) return setSpot(at)
    const w = menu.offsetWidth
    const h = menu.offsetHeight
    const inside = room.getBoundingClientRect()
    // The window is the real edge: the menu's parent may be smaller than it.
    const right = Math.min(room.clientWidth, window.innerWidth - inside.left) - EDGE
    const bottom = Math.min(room.clientHeight, window.innerHeight - inside.top) - EDGE
    const x = at.x + w > right ? Math.max(EDGE - inside.left, right - w) : at.x
    const y = at.y + h > bottom ? Math.max(EDGE - inside.top, bottom - h) : at.y
    setSpot({ x, y })
  }, [at.x, at.y])

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

  // A menu with no pictures at all leaves no room for them; one with some
  // keeps the room on every row, so the words line up.
  const pictured = items.some((item) => item !== 'rule' && item.glyph)

  return (
    <div
      ref={box}
      className={pictured ? 'map-menu' : 'map-menu map-menu--bare'}
      role="menu"
      aria-label="What to do here"
      style={{ left: spot.x, top: spot.y }}
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
            {pictured ? <span className="map-menu-glyph">{item.glyph ? <Glyph of={item.glyph} size={15} /> : null}</span> : null}
            <span className="map-menu-name">{item.name}</span>
            {item.keys ? <span className="map-menu-keys">{keysFor(item.keys)}</span> : null}
          </button>
        ),
      )}
    </div>
  )
}
