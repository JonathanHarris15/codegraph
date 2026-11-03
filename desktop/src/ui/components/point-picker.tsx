// codegraph: component point-picker
import { useState } from 'react'
import type { Point } from '../../modules/reader/index.js'
import { Glyph } from './kind-glyph.js'

const keyOf = (point: Point): string =>
  point.kind === 'live' ? 'live' : point.kind === 'branch' ? `branch:${point.name}` : `commit:${point.sha}`

/** What the control says it is reading now: short, and in mono where it came
 *  out of git. */
const shortly = (point: Point): string =>
  point.kind === 'live' ? 'the live folder' : point.kind === 'branch' ? point.name : point.sha.slice(0, 7)

const titleOf = (point: Point): string => (point.kind === 'commit' ? point.title : '')

/** Picks where in a software system's history the map is read (ADR 0003).
 *  It reads as a sentence — "web at main" — and opens a list, because a
 *  select cannot group branches from commits or show a commit's title. */
export const PointPicker = ({
  system,
  points,
  point,
  onPick,
}: {
  system: string
  points: Point[]
  point: Point
  onPick: (point: Point) => void
}) => {
  const [open, setOpen] = useState(false)
  const all = points.some((p) => keyOf(p) === keyOf(point)) ? points : [point, ...points]
  const branches = all.filter((p) => p.kind === 'branch')
  const commits = all.filter((p) => p.kind === 'commit')

  const row = (one: Point, words: string, says: string) => (
    <button
      key={keyOf(one)}
      type="button"
      onClick={() => {
        onPick(one)
        setOpen(false)
      }}
    >
      <span className={one.kind === 'live' ? '' : 'map-picker-where'}>{words}</span>
      {says ? <span className="ds-hint">{says}</span> : null}
    </button>
  )

  return (
    <span className="sketch-menu">
      <button
        type="button"
        className="map-picker"
        aria-label={`Where to read ${system}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{system} at</span>
        <span className="map-picker-where">{shortly(point)}</span>
        {titleOf(point) ? <span className="map-picker-title">{titleOf(point)}</span> : null}
        <Glyph of="down" size={14} />
      </button>
      {open ? (
        <div className="sketch-menu-list" style={{ minWidth: 300 }}>
          {row({ kind: 'live' }, 'Live folder', 'with what is not committed')}
          {branches.length ? <div className="map-flyout-group">Branches</div> : null}
          {branches.map((p) => row(p, p.kind === 'branch' ? p.name : '', ''))}
          {commits.length ? <div className="map-flyout-group">Commits</div> : null}
          {commits.map((p) => row(p, p.kind === 'commit' ? p.sha.slice(0, 7) : '', titleOf(p)))}
        </div>
      ) : null}
    </span>
  )
}
