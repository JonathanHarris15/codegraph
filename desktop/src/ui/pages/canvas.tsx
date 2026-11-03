// codegraph: page canvas at /projects/:id
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SketchListed } from '../../features/list-sketches.js'
import type { MapShown } from '../../features/show-map.js'
import type { Point } from '../../modules/reader/index.js'
import type { Sketch } from '../../modules/sketches/index.js'
import { Button } from '../design-system/kit.js'
import { MapCanvas, walk } from '../components/map-canvas.js'
import { PointPicker } from '../components/point-picker.js'
import { SketchEditor } from '../components/sketch-editor.js'
import { SketchLibrary } from '../components/sketch-library.js'
import { SuggestionBar } from '../components/suggestion-bar.js'

const SAVE_AFTER_MS = 500

/** One project's canvas: its map, read from the code, zoomed through level
 *  by level, and the sketches kept with it, drawn on the same surface. */
export const CanvasPage = ({ projectId, onLeave }: { projectId: string; onLeave: () => void }) => {
  const [shown, setShown] = useState<MapShown | null>(null)
  const [path, setPath] = useState<string[]>([projectId])
  const [points, setPoints] = useState<Record<string, Point>>({})
  const [choices, setChoices] = useState<Point[]>([])
  const [problem, setProblem] = useState('')

  const [library, setLibrary] = useState(false)
  const [sketches, setSketches] = useState<SketchListed[]>([])
  const [sketch, setSketch] = useState<Sketch | null>(null)
  const [mockups, setMockups] = useState<Record<string, string>>({})
  const [sketchPath, setSketchPath] = useState<string[]>([])
  const saving = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef<Sketch | null>(null)

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

  const loadSketches = useCallback(async (): Promise<void> => {
    setSketches(await window.codegraph.listSketches(projectId))
  }, [projectId])

  useEffect(() => {
    void load({})
    void loadSketches()
  }, [load, loadSketches])

  const trail = shown ? walk(shown.card, path) : []
  const system = trail[1]
  const systemShown = shown?.systems.find((s) => s.id === system?.id)

  useEffect(() => {
    setChoices([])
    if (!system || sketch) return
    void window.codegraph.listPoints(projectId, system.id).then(setChoices)
  }, [projectId, system?.id, sketch === null])

  const pickPoint = async (point: Point): Promise<void> => {
    if (!system) return
    const next = { ...points, [system.id]: point }
    setPoints(next)
    await load(next)
  }

  // A sketch is kept as it is drawn: each change waits a moment for the
  // next, then goes to disk.
  const saveSoon = (next: Sketch): void => {
    latest.current = next
    if (saving.current) clearTimeout(saving.current)
    saving.current = setTimeout(() => {
      saving.current = null
      if (latest.current) void window.codegraph.saveSketch(latest.current).then(() => loadSketches())
    }, SAVE_AFTER_MS)
  }
  const flush = async (): Promise<void> => {
    if (!saving.current) return
    clearTimeout(saving.current)
    saving.current = null
    if (latest.current) await window.codegraph.saveSketch(latest.current)
  }
  useEffect(() => () => void flush(), [])

  const openOne = async (id: string): Promise<void> => {
    await flush()
    const opened = await window.codegraph.openSketch(projectId, id)
    if (!opened) return
    setSketch(opened.sketch)
    setMockups(opened.mockups)
    setSketchPath([opened.sketch.root.id])
    setLibrary(false)
  }

  const startOne = async (fromMap: boolean): Promise<void> => {
    const name = fromMap ? `${trail.at(-1)?.name ?? 'Map'}, as it could be` : 'New sketch'
    const started = await window.codegraph.startSketch(projectId, name, fromMap && shown ? shown.card : undefined)
    await loadSketches()
    await openOne(started.id)
    // A sketch from the map opens at the level the person was looking at.
    if (fromMap) setSketchPath(walk(started.root, path).map((c) => c.id))
  }

  const deleteOne = async (id: string): Promise<void> => {
    await window.codegraph.deleteSketch(projectId, id)
    if (sketch?.id === id) setSketch(null)
    await loadSketches()
  }

  const backToMap = async (): Promise<void> => {
    await flush()
    setSketch(null)
  }

  const changed = (next: Sketch): void => {
    setSketch(next)
    saveSoon(next)
  }

  const addMockup = async (cardId: string): Promise<void> => {
    if (!sketch) return
    const added = await window.codegraph.addMockup(projectId, sketch.id, cardId)
    if (!added.ok) return
    setMockups((m) => ({ ...m, [cardId]: added.url }))
    const setOn = (card: Sketch['root']): Sketch['root'] =>
      card.id === cardId ? { ...card, mockup: added.name } : { ...card, children: card.children.map(setOn) }
    changed({ ...sketch, root: setOn(sketch.root) })
  }

  const sketchTrail = sketch ? walk(sketch.root, sketchPath) : []
  const showing = sketch ? sketchTrail : trail
  const goTo = (i: number): void => (sketch ? setSketchPath(sketchPath.slice(0, i + 1)) : setPath(path.slice(0, i + 1)))

  return (
    <div className="map-page">
      <div className="map-bar">
        {sketch ? (
          <Button look="bare" onClick={() => void backToMap()}>
            ← Map
          </Button>
        ) : (
          <Button look="bare" onClick={onLeave}>
            ← Projects
          </Button>
        )}
        {sketch ? (
          <input
            className="ds-input map-sketch-name"
            aria-label="Sketch name"
            value={sketch.name}
            onChange={(e) => changed({ ...sketch, name: e.target.value })}
          />
        ) : null}
        <nav className="map-trail" aria-label="Where you are">
          {showing.map((card, i) => (
            <span key={card.id} className="map-trail-step">
              {i > 0 ? <span className="map-trail-gap">›</span> : null}
              <button
                type="button"
                className={i === showing.length - 1 ? 'map-trail-here' : 'map-trail-link'}
                onClick={() => goTo(i)}
              >
                {card.name || 'Unnamed'}
              </button>
            </span>
          ))}
        </nav>
        <div className="map-bar-end">
          {!sketch && system && systemShown ? (
            <PointPicker system={system.name} points={choices} point={systemShown.point} onPick={(p) => void pickPoint(p)} />
          ) : null}
          <Button onClick={() => setLibrary(!library)}>Sketches{sketches.length ? ` (${sketches.length})` : ''}</Button>
        </div>
      </div>

      {problem ? (
        <div className="ds-empty">{problem}</div>
      ) : sketch ? (
        <SketchEditor
          key={sketch.id}
          sketch={sketch}
          mockups={mockups}
          path={sketchPath}
          onPath={setSketchPath}
          onChange={changed}
          onAddMockup={(cardId) => void addMockup(cardId)}
        />
      ) : !shown ? (
        <div className="ds-empty">Reading the code…</div>
      ) : (
        <MapCanvas root={shown.card} path={path} onPath={setPath} />
      )}

      {library ? (
        <SketchLibrary
          sketches={sketches}
          open={sketch?.id ?? ''}
          onOpen={(id) => void openOne(id)}
          onStartBlank={() => void startOne(false)}
          onStartFromMap={() => void startOne(true)}
          onDelete={(id) => void deleteOne(id)}
          onClose={() => setLibrary(false)}
        />
      ) : null}

      {!sketch && shown && trail.length === 1 ? (
        <SuggestionBar
          suggestions={shown.suggestions}
          shallow={shown.card.children.filter((c) => c.kind === 'shallow software system')}
          onAgree={(name, sameAs) =>
            void window.codegraph.agreeShallowSystem(projectId, name, sameAs).then(() => load(points))
          }
        />
      ) : null}

      {!sketch && systemShown && systemShown.problems.length > 0 ? (
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
