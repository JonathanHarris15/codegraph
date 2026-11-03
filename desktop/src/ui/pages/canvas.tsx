// codegraph: page canvas at /projects/:id
import { useCallback, useEffect, useState } from 'react'
import type { MapShown } from '../../features/show-map.js'
import type { Point } from '../../modules/reader/index.js'
import { Button } from '../design-system/kit.js'
import { MapCanvas, walk } from '../components/map-canvas.js'
import { PointPicker } from '../components/point-picker.js'
import { SuggestionBar } from '../components/suggestion-bar.js'

/** One project's canvas: its map, read from the code, zoomed through level
 *  by level. */
export const CanvasPage = ({ projectId, onLeave }: { projectId: string; onLeave: () => void }) => {
  const [shown, setShown] = useState<MapShown | null>(null)
  const [path, setPath] = useState<string[]>([projectId])
  const [points, setPoints] = useState<Record<string, Point>>({})
  const [choices, setChoices] = useState<Point[]>([])
  const [problem, setProblem] = useState('')

  const load = useCallback(
    async (at: Record<string, Point>): Promise<void> => {
      try {
        setShown(await window.codegraph.showMap(projectId, at))
      } catch {
        setProblem('That project could not be read.')
      }
    },
    [projectId],
  )

  useEffect(() => {
    void load({})
  }, [load])

  const trail = shown ? walk(shown.card, path) : []
  const system = trail[1]
  const systemShown = shown?.systems.find((s) => s.id === system?.id)

  useEffect(() => {
    setChoices([])
    if (!system) return
    void window.codegraph.listPoints(projectId, system.id).then(setChoices)
  }, [projectId, system?.id])

  const pick = async (point: Point): Promise<void> => {
    if (!system) return
    const next = { ...points, [system.id]: point }
    setPoints(next)
    await load(next)
  }

  return (
    <div className="map-page">
      <div className="map-bar">
        <Button look="bare" onClick={onLeave}>
          ← Projects
        </Button>
        <nav className="map-trail" aria-label="Where you are">
          {trail.map((card, i) => (
            <span key={card.id} className="map-trail-step">
              {i > 0 ? <span className="map-trail-gap">›</span> : null}
              <button
                type="button"
                className={i === trail.length - 1 ? 'map-trail-here' : 'map-trail-link'}
                onClick={() => setPath(path.slice(0, i + 1))}
              >
                {card.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="map-bar-end">
          {system && systemShown ? (
            <PointPicker system={system.name} points={choices} point={systemShown.point} onPick={(p) => void pick(p)} />
          ) : null}
        </div>
      </div>

      {problem ? (
        <div className="ds-empty">{problem}</div>
      ) : !shown ? (
        <div className="ds-empty">Reading the code…</div>
      ) : (
        <MapCanvas root={shown.card} path={path} onPath={setPath} />
      )}

      {shown && trail.length === 1 ? (
        <SuggestionBar
          suggestions={shown.suggestions}
          shallow={shown.card.children.filter((c) => c.kind === 'shallow software system')}
          onAgree={(name, sameAs) =>
            void window.codegraph.agreeShallowSystem(projectId, name, sameAs).then(() => load(points))
          }
        />
      ) : null}

      {systemShown && systemShown.problems.length > 0 ? (
        <details className="map-problems">
          <summary>
            {systemShown.problems.length === 1
              ? '1 thing in this repo the map could not place'
              : `${systemShown.problems.length} things in this repo the map could not place`}
          </summary>
          <ul>
            {systemShown.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
