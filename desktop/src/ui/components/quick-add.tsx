// codegraph: component quick-add
import { useEffect, useRef, useState } from 'react'
import type { Level } from '../../features/show-map.js'
import { KindGlyph, kindClass } from './kind-glyph.js'
import { kindGroups } from './sketch-edits.js'

/** Asks what to put at a spot on the board: after a wire is dragged onto
 *  empty board, or a double-click on it. Type to narrow the list, arrows and
 *  Enter to pick, Escape to leave it. */
export const QuickAdd = ({
  level,
  at,
  wired,
  onPick,
  onNote,
  onClose,
}: {
  level: Level
  /** Where on the screen to open, in the board's own pixels. */
  at: { x: number; y: number }
  /** A wire is waiting for the card at its end. */
  wired: boolean
  onPick: (kind: string) => void
  onNote?: () => void
  onClose: () => void
}) => {
  const [typed, setTyped] = useState('')
  const [on, setOn] = useState(0)
  const box = useRef<HTMLInputElement>(null)
  const kinds = kindGroups(level).flatMap((group) => group.kinds)
  const showing = kinds.filter((kind) => kind.includes(typed.trim().toLowerCase()))
  const notes = !wired && onNote && 'note'.includes(typed.trim().toLowerCase())
  const rows = [...showing, ...(notes ? ['note'] : [])]

  // Focusing must not scroll the board under the menu.
  useEffect(() => box.current?.focus({ preventScroll: true }), [])
  useEffect(() => setOn(0), [typed])

  const choose = (row: string): void => (row === 'note' && notes ? onNote!() : onPick(row))

  return (
    <div
      className="map-quick"
      style={{ left: at.x, top: at.y }}
      role="dialog"
      aria-label={wired ? 'What does the wire reach?' : 'Add to the board'}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="map-quick-head">{wired ? 'What does it reach?' : 'Add here'}</div>
      <input
        ref={box}
        className="map-quick-find"
        aria-label="Find a kind of card"
        placeholder="Type to find…"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') onClose()
          if (event.key === 'ArrowDown') setOn((n) => Math.min(n + 1, rows.length - 1))
          if (event.key === 'ArrowUp') setOn((n) => Math.max(n - 1, 0))
          if (event.key === 'Enter' && rows[on]) {
            // The Enter that picks a row is spent here, and does not go on
            // into whatever opens for writing next.
            event.preventDefault()
            choose(rows[on]!)
          }
        }}
        onBlur={(event) => {
          // Leaving the menu by clicking elsewhere closes it; picking a row
          // in it does not.
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) onClose()
        }}
      />
      <div className="map-quick-list" role="listbox">
        {rows.length === 0 ? <div className="map-quick-none">Nothing by that name here</div> : null}
        {rows.map((row, i) => (
          <button
            key={row}
            type="button"
            role="option"
            aria-selected={i === on}
            className={i === on ? 'map-quick-row map-quick-row--on' : 'map-quick-row'}
            onPointerEnter={() => setOn(i)}
            onClick={() => choose(row)}
          >
            <span className={`map-palette-swatch ${row === 'note' ? 'kind-of--note' : kindClass(row)}`}>
              <KindGlyph kind={row === 'note' ? 'note' : row} size={14} />
            </span>
            {row}
          </button>
        ))}
      </div>
    </div>
  )
}
