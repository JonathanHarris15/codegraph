// codegraph: component point-picker
import type { Point } from '../../modules/reader/index.js'

const keyOf = (point: Point): string =>
  point.kind === 'live' ? 'live' : point.kind === 'branch' ? `branch:${point.name}` : `commit:${point.sha}`

const wordsFor = (point: Point): string =>
  point.kind === 'live'
    ? 'Live folder, with what is not committed'
    : point.kind === 'branch'
      ? point.name
      : `${point.sha.slice(0, 7)}  ${point.title}`

/** Picks where in a software system's history the map is read. */
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
  const all = points.some((p) => keyOf(p) === keyOf(point)) ? points : [point, ...points]
  const branches = all.filter((p) => p.kind === 'branch')
  const commits = all.filter((p) => p.kind === 'commit')
  return (
    <label className="map-picker">
      <span className="ds-label">{system} at</span>
      <select
        className="ds-input"
        aria-label={`Where to read ${system}`}
        value={keyOf(point)}
        onChange={(event) => {
          const picked = all.find((p) => keyOf(p) === event.target.value)
          if (picked) onPick(picked)
        }}
      >
        <option value="live">{wordsFor({ kind: 'live' })}</option>
        {branches.length ? (
          <optgroup label="Branches">
            {branches.map((p) => (
              <option key={keyOf(p)} value={keyOf(p)}>
                {wordsFor(p)}
              </option>
            ))}
          </optgroup>
        ) : null}
        {commits.length ? (
          <optgroup label="Commits">
            {commits.map((p) => (
              <option key={keyOf(p)} value={keyOf(p)}>
                {wordsFor(p)}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </label>
  )
}
