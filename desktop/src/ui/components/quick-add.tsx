// codegraph: component quick-add
import { useEffect, useRef, useState } from 'react'
import { CardMark } from './kind-glyph.js'
import type { CardChoice } from './sketch-edits.js'

/** Asks what to put at a spot on the board: after a wire is dragged onto
 *  empty board, or a double-click on it. Type to narrow the list, arrows and
 *  Enter to pick, Escape to leave it. */
export const QuickAdd = ({
  choices,
  at,
  wired,
  onPick,
  onNote,
  onClose,
}: {
  /** What can be put here. */
  choices: CardChoice[]
  /** Where on the screen to open, in the board's own pixels. */
  at: { x: number; y: number }
  /** A wire is waiting for the card at its end. */
  wired: boolean
  onPick: (key: string) => void
  onNote?: () => void
  onClose: () => void
}) => {
  const [typed, setTyped] = useState('')
  const [on, setOn] = useState(0)
  const box = useRef<HTMLInputElement>(null)
  const showing = choices.filter((choice) => choice.kind.toLowerCase().includes(typed.trim().toLowerCase()))
  const notes = !wired && onNote && 'note'.includes(typed.trim().toLowerCase())
  const rows: CardChoice[] = [...showing, ...(notes ? [{ key: 'note', kind: 'note', hint: '' }] : [])]

  // Focusing must not scroll the board under the menu.
  useEffect(() => box.current?.focus({ preventScroll: true }), [])
  useEffect(() => setOn(0), [typed])

  const choose = (row: CardChoice): void => (row.key === 'note' && notes ? onNote!() : onPick(row.key))

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
            key={row.key}
            type="button"
            role="option"
            aria-selected={i === on}
            className={i === on ? 'map-quick-row map-quick-row--on' : 'map-quick-row'}
            onPointerEnter={() => setOn(i)}
            onClick={() => choose(row)}
          >
            <CardMark kind={row.kind} look={row.look} size={14} />
            {row.kind}
          </button>
        ))}
      </div>
    </div>
  )
}
