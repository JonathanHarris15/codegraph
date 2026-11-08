// codegraph: page canvas at /projects/:id
import { Pencil } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SketchListed } from '../../features/list-sketches.js'
import type { MapShown, SystemShown } from '../../features/show-map.js'
import type { Layer } from '../../modules/annotations/index.js'
import { forgetting, movedTo, type Arrangement } from '../../modules/arrangements/schema.js'
import { mergeItems, sameDoc, undoStep } from '../../modules/together/index.js'
import type { Point } from '../../modules/reader/index.js'
import type { Sketch } from '../../modules/sketches/index.js'
import { Button, ThemeSwitch } from '../design-system/kit.js'
import { MapCanvas, walk, type Together } from '../components/map-canvas.js'
import { BranchPicker } from '../components/branch-picker.js'
import { ProposalPanel } from '../components/proposal-panel.js'
import { SketchEditor } from '../components/sketch-editor.js'
import { SketchLibrary } from '../components/sketch-library.js'
import { SuggestionBar } from '../components/suggestion-bar.js'
import { Trail } from '../components/trail.js'
import { MembersSheet } from '../components/members-sheet.js'
import { RevisionsPanel } from '../components/revisions-panel.js'
import { togetherOn, useRoom } from '../components/together.js'

const SAVE_AFTER_MS = 500

/** The ids from the top of a card down to one inside it, or [] if it is not there. */
const pathTo = (card: { id: string; children: { id: string; children: unknown[] }[] }, id: string): string[] => {
  if (card.id === id) return [card.id]
  for (const child of card.children as (typeof card)[]) {
    const below = pathTo(child, id)
    if (below.length) return [card.id, ...below]
  }
  return []
}

/** One project's canvas: its map, read from the code, zoomed through level
 *  by level, with the proposal on a branch drawn over it; and the sketches
 *  kept with it, drawn on the same surface. */
export const CanvasPage = ({ projectId, onLeave }: { projectId: string; onLeave: () => void }) => {
  const [shown, setShown] = useState<MapShown | null>(null)
  const [path, setPath] = useState<string[]>([projectId])
  const [points, setPoints] = useState<Record<string, Point>>({})
  const [choices, setChoices] = useState<Point[]>([])
  const [problem, setProblem] = useState('')
  const [showProblems, setShowProblems] = useState(false)
  const [showProposal, setShowProposal] = useState(false)
  const [follow, setFollow] = useState(true)
  const followed = useRef('')

  const [library, setLibrary] = useState(false)
  const [sketches, setSketches] = useState<SketchListed[]>([])
  const [sketch, setSketch] = useState<Sketch | null>(null)
  const [mockups, setMockups] = useState<Record<string, string>>({})
  const [sketchPath, setSketchPath] = useState<string[]>([])
  const saving = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef<Sketch | null>(null)

  // The annotations over the map: kept as they change, with a history of their
  // own to undo, since the map itself never changes here. Undoing takes back only
  // what that step changed, whatever others have done since.
  const [mapLayers, setMapLayers] = useState<Layer[]>([])
  const layersPast = useRef<{ before: Layer[]; after: Layer[] }[]>([])
  const layersFuture = useRef<{ before: Layer[]; after: Layer[] }[]>([])
  const layersStep = useRef<{ step: string; at: number }>({ step: '', at: 0 })
  const layersNow = useRef<Layer[]>([])
  layersNow.current = mapLayers
  const layersSaving = useRef<ReturnType<typeof setTimeout> | null>(null)
  const layersSeen = useRef<Layer[]>([])
  /** The points of every map being looked at, for saying which map things are on. */
  const atNow = useRef<Record<string, Point>>({})
  /** The maps a save still to happen was drawn on, so it lands on those, whatever
   *  is being looked at by the time it goes. */
  const layersAt = useRef<Record<string, Point>>({})
  const saveLayersNow = async (): Promise<void> => {
    layersSaving.current = null
    const sent = layersNow.current
    const merged = await window.codegraph.saveAnnotations(projectId, sent, layersAt.current, layersSeen.current)
    // Seen only counts once this window has it. If more was drawn meanwhile, the
    // next save still works from the older one, so nothing reads as taken away.
    if (layersNow.current !== sent) return
    layersSeen.current = merged
    if (!sameDoc(merged, sent)) setMapLayers(merged)
  }
  const keepLayers = (next: Layer[]): void => {
    setMapLayers(next)
    layersNow.current = next
    layersAt.current = atNow.current
    if (layersSaving.current) clearTimeout(layersSaving.current)
    layersSaving.current = setTimeout(() => void saveLayersNow(), SAVE_AFTER_MS)
  }
  const flushLayers = async (): Promise<void> => {
    if (!layersSaving.current) return
    clearTimeout(layersSaving.current)
    await saveLayersNow()
  }
  const changeLayers = (next: Layer[], step = ''): void => {
    const joins =
      step === 'join' || (step !== '' && layersStep.current.step === step && Date.now() - layersStep.current.at < 900)
    const open = layersPast.current.at(-1)
    if (joins && open) layersPast.current = [...layersPast.current.slice(0, -1), { before: open.before, after: next }]
    else {
      layersPast.current = [...layersPast.current.slice(-199), { before: layersNow.current, after: next }]
      layersFuture.current = []
    }
    layersStep.current = { step, at: Date.now() }
    keepLayers(next)
  }

  // Where people have moved the map's cards and its wires' sentences, kept beside
  // the map: the code says nothing about where anything sits.
  const [spots, setSpots] = useState<Arrangement>([])
  const spotsSeen = useRef<Arrangement>([])
  const spotsNow = useRef<Arrangement>([])
  /** One save at a time. A save still on its way is this window's own, so the
   *  next one waits for it and works from what it kept: otherwise a card put back
   *  straight after a drag reads as someone else having moved it, and stays. */
  const spotsSaving = useRef<Promise<void>>(Promise.resolve())
  const spotsLast = useRef<Arrangement>([])
  const saveSpotsNow = async (next: Arrangement): Promise<void> => {
    // Moved again since: the save queued behind this one carries it.
    if (spotsLast.current !== next) return
    const merged = await window.codegraph.saveArrangement(projectId, next, atNow.current, spotsSeen.current)
    spotsSeen.current = merged
    if (spotsLast.current !== next) {
      // Moved again while it went: keep those moves on top of what it brought.
      keepSpots(mergeItems(next, spotsNow.current, merged))
      return
    }
    if (spotsNow.current === next && !sameDoc(merged, next)) {
      spotsNow.current = merged
      setSpots(merged)
    }
  }
  const keepSpots = (next: Arrangement): void => {
    setSpots(next)
    spotsNow.current = next
    spotsLast.current = next
    spotsSaving.current = spotsSaving.current.then(() => saveSpotsNow(next)).catch(() => undefined)
  }
  const rearrange = (moves: Arrangement, letGo: string[] = []): void => keepSpots(forgetting(movedTo(spots, moves), letGo))
  const forget = (ids: string[]): void => keepSpots(forgetting(spots, ids))

  const loadPlaces = useCallback(async (): Promise<void> => {
    const [layers, places] = await Promise.all([
      window.codegraph.showAnnotations(projectId, atNow.current),
      window.codegraph.showArrangement(projectId, atNow.current),
    ])
    // A save on its way will take in whatever this brought, so leave it be.
    if (!layersSaving.current) {
      layersSeen.current = layers
      layersNow.current = layers
      setMapLayers(layers)
    }
    spotsSeen.current = places
    spotsNow.current = places
    setSpots(places)
  }, [projectId])

  const pointsNow = useRef(points)
  pointsNow.current = points
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

  // The map follows the code: an edit, a checkout, a commit, or an agent
  // saying where it is redraws it.
  useEffect(
    () =>
      window.codegraph.watchProject(projectId, () => {
        void load(pointsNow.current)
      }),
    [projectId, load],
  )

  // Undo and redo for the map's annotations, while the map is what is shown.
  const onMap = !sketch
  useEffect(() => {
    if (!onMap) return
    const keys = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      const back = key === 'z' && !event.shiftKey
      const forward = key === 'y' || (key === 'z' && event.shiftKey)
      if (!back && !forward) return
      const from = back ? layersPast : layersFuture
      const to = back ? layersFuture : layersPast
      const step = from.current.at(-1)
      if (!step) return
      event.preventDefault()
      from.current = from.current.slice(0, -1)
      to.current = [...to.current, step]
      layersStep.current = { step: '', at: 0 }
      keepLayers(back ? undoStep(step.before, step.after, layersNow.current) : undoStep(step.after, step.before, layersNow.current))
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [onMap])

  const trail = shown ? walk(shown.card, path) : []
  const system = trail[1]
  const systemShown = shown?.systems.find((s) => s.id === system?.id)
  const working: SystemShown | undefined = shown?.systems.find((s) => s.agent)
  /** The software system whose branch the bar shows: the one being looked
   *  at, or the only one the project has. */
  /** The software system whose branch the bar shows: only the one opened.
   *  At the project level each software system's card carries its own. */
  const branchSystem = system
  const branchShown = shown?.systems.find((s) => s.id === branchSystem?.id)

  // Which maps are being looked at. When that changes, so do their layouts and
  // notes: each branch keeps its own (ADR 0019).
  const reachable = shown?.systems.filter((s) => s.reach === 'open') ?? []
  const mapsSaid = reachable.map((s) => `${s.id}@${s.mapKey}`).join(',')
  useEffect(() => {
    if (!shown) return
    atNow.current = Object.fromEntries(reachable.map((s) => [s.id, s.point]))
    // Steps taken on another map cannot be undone on this one.
    layersPast.current = []
    layersFuture.current = []
    void flushLayers().then(loadPlaces)
  }, [mapsSaid, shown === null, loadPlaces])

  // A change made by someone else reaches this window.
  const sketchNow = useRef<Sketch | null>(null)
  const refreshSketch = useRef<(id: string) => void>(() => undefined)
  useEffect(
    () =>
      window.codegraph.heardChange((what) => {
        if (what.projectId !== projectId) return
        if (what.path.includes('/sketches/')) {
          void loadSketches()
          const id = what.path.split('/').pop() ?? ''
          if (sketchNow.current?.id === id) refreshSketch.current(id)
          return
        }
        if (what.path.includes('/maps/')) void loadPlaces()
        else void load(pointsNow.current)
      }),
    [projectId, load, loadPlaces, loadSketches],
  )

  // GitHub maps refresh about once a minute, so a branch that moved on shows it.
  const online = shown?.online ?? false
  useEffect(() => {
    if (!online) return
    const every = setInterval(() => {
      void window.codegraph.refreshGithub(projectId).then(() => load(pointsNow.current))
    }, 60_000)
    return () => clearInterval(every)
  }, [online, projectId, load])

  // A new software system starts from nothing; the same one keeps what it
  // showed until its branches are read again, so the bar never blinks.
  useEffect(() => setChoices([]), [branchSystem?.id])
  useEffect(() => {
    if (!branchSystem || sketch) return
    void window.codegraph.listPoints(projectId, branchSystem.id).then(setChoices)
  }, [projectId, branchSystem?.id, sketch === null, shown])

  // Wherever the agent says it is working, the canvas goes too, unless the
  // person has said not to follow.
  useEffect(() => {
    const agent = working?.agent
    if (!shown || !agent || !follow || sketch || agent.card === followed.current) return
    followed.current = agent.card
    const to = pathTo(shown.card, agent.card)
    if (to.length > 1) setPath(to.slice(0, -1))
  }, [shown, working?.agent?.card, follow, sketch])

  /** Moves the repo's folder onto the branch being looked at; the map then
   *  reads the folder again, now on that branch. */
  const [switching, setSwitching] = useState(false)
  const [switchProblem, setSwitchProblem] = useState('')
  const switchFolder = async (): Promise<void> => {
    if (!branchSystem || branchShown?.point.kind !== 'branch') return
    setSwitching(true)
    setSwitchProblem('')
    const name = branchShown.point.name
    const done = await window.codegraph.switchBranch(projectId, branchSystem.id, name)
    setSwitching(false)
    if (!done.ok) {
      setSwitchProblem(done.problem)
      return
    }
    await window.codegraph.chooseBranch(projectId, branchSystem.id, name.replace(/^origin\//, ''))
    const next = { ...points }
    delete next[branchSystem.id]
    setPoints(next)
    await load(next)
  }

  /** Reads a software system at another branch or commit. A branch picked
   *  is where its map opens next time; a commit is a look back. */
  const pickFor = async (systemId: string, point: Point): Promise<void> => {
    setSwitchProblem('')
    const named = point.kind === 'branch' ? point.name : point.kind === 'live' ? point.branch : ''
    if (named) void window.codegraph.chooseBranch(projectId, systemId, named)
    const next = { ...pointsNow.current, [systemId]: point }
    setPoints(next)
    await load(next)
  }
  const pickPoint = async (point: Point): Promise<void> => {
    if (branchSystem) await pickFor(branchSystem.id, point)
  }

  // Every software system's branches, for the branch on each one's card.
  const [branchesOf, setBranchesOf] = useState<Record<string, Point[]>>({})
  const systemIds = shown?.systems.map((s) => s.id).join(',') ?? ''
  useEffect(() => {
    if (!shown || sketch) return
    for (const s of shown.systems)
      void window.codegraph.listPoints(projectId, s.id).then((found) => setBranchesOf((all) => ({ ...all, [s.id]: found })))
  }, [projectId, systemIds, sketch === null, shown])

  // A sketch is kept as it is drawn: each change waits a moment for the
  // next, then goes to disk. What others have changed in the meantime stays.
  const seenSketch = useRef<Sketch | null>(null)
  const saveNow = async (): Promise<void> => {
    const sent = latest.current
    if (!sent) return
    const merged = await window.codegraph.saveSketch(sent, seenSketch.current ?? undefined)
    // Seen only counts once this window has it, or newer work reads as undoing it.
    if (latest.current !== sent) return
    seenSketch.current = merged
    if (sketchNow.current?.id === merged.id && !(sameDoc(merged.root, sent.root) && sameDoc(merged.layers, sent.layers) && merged.name === sent.name)) {
      latest.current = merged
      setSketch(merged)
    }
  }
  const saveSoon = (next: Sketch): void => {
    latest.current = next
    if (saving.current) clearTimeout(saving.current)
    saving.current = setTimeout(() => {
      saving.current = null
      void saveNow().then(() => loadSketches())
    }, SAVE_AFTER_MS)
  }
  const flush = async (): Promise<void> => {
    if (!saving.current) return
    clearTimeout(saving.current)
    saving.current = null
    await saveNow()
  }
  sketchNow.current = sketch
  refreshSketch.current = (id) => {
    if (saving.current) return
    void window.codegraph.openSketch(projectId, id).then((opened) => {
      if (!opened || saving.current || sketchNow.current?.id !== id) return
      seenSketch.current = opened.sketch
      setSketch(opened.sketch)
      setMockups(opened.mockups)
    })
  }

  useEffect(
    () => () => {
      void flush()
    },
    [],
  )

  const openOne = async (id: string): Promise<void> => {
    await flush()
    const opened = await window.codegraph.openSketch(projectId, id)
    if (!opened) return
    seenSketch.current = opened.sketch
    setSketch(opened.sketch)
    setMockups(opened.mockups)
    setSketchPath([opened.sketch.root.id])
    setLibrary(false)
  }

  /** What a snapshot is named after: the branch the map is read from, or
   *  the project when there is none to name. */
  const snapshotOf = (): string => {
    const at = branchShown?.point
    if (at?.kind === 'branch') return at.name
    if (at?.kind === 'commit') return at.sha.slice(0, 7)
    const live = choices.find((c) => c.kind === 'live')
    return (live?.kind === 'live' && live.branch) || shown?.card.name || 'Map'
  }
  const today = (): string => {
    const d = new Date()
    const two = (n: number): string => String(n).padStart(2, '0')
    return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${two(d.getFullYear() % 100)}`
  }

  const startOne = async (fromMap: boolean, folderId = ''): Promise<void> => {
    const name = fromMap ? `${snapshotOf()} (sketch ${today()})` : 'New sketch'
    const started = await window.codegraph.startSketch(projectId, name, fromMap && shown ? shown.card : undefined)
    // Started inside a folder, it is kept there.
    if (folderId) await window.codegraph.fileSketch(projectId, started.id, folderId)
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

  // Who else is on this project, and what can be done here.
  const me = shown?.me ?? ''
  const room = useRoom(online ? `project:${projectId}` : '', me)
  const canDraw = !online || (shown?.role !== 'viewer' && shown?.role !== null && shown?.role !== undefined)
  const sharedMaps = Object.fromEntries(reachable.filter((s) => !s.mapKey.startsWith('local:')).map((s) => [s.id, s.mapKey]))
  const sharedSaid = JSON.stringify(sharedMaps)
  useEffect(() => {
    room.say({ maps: sharedMaps, sketch: sketch?.id ?? '', dragging: [] })
  }, [sharedSaid, sketch?.id])
  const inSystem = (cardId: string): SystemShown | undefined => shown?.systems.find((s) => cardId === s.id || cardId.startsWith(`${s.id}/`))
  const thereWith = room.people.filter((p) => {
    if (sketch) return p.where.sketch === sketch.id
    if (p.where.sketch) return false
    const in_ = inSystem(p.where.inside ?? '')
    if (!in_) return true
    return p.where.maps?.[in_.id] !== undefined && p.where.maps[in_.id] === sharedMaps[in_.id]
  })
  const others = thereWith.map((p) => ({ id: p.id, name: p.name, color: p.color, inside: p.where.inside ?? '', ...(p.where.x !== undefined ? { x: p.where.x } : {}), ...(p.where.y !== undefined ? { y: p.where.y } : {}), dragging: p.where.dragging ?? [] }))
  const focusId = (sketch ? walk(sketch.root, sketchPath) : trail).at(-1)?.id ?? ''
  const focusSystem = sketch ? undefined : inSystem(focusId)
  const board = !online ? '' : sketch ? `sketch:${sketch.id}` : focusSystem ? (sharedMaps[focusSystem.id] ? `${focusSystem.id}@${sharedMaps[focusSystem.id]}` : '') : 'project'
  const together: Together | undefined = online
    ? togetherOn({
        board,
        room,
        me,
        others,
        onGo: (inside) => {
          if (sketch) {
            const to = pathTo(sketch.root, inside)
            if (to.length) setSketchPath(to)
          } else if (shown) {
            const to = pathTo(shown.card, inside)
            if (to.length) setPath(to)
          }
        },
      })
    : undefined
  /** Moving things on a local map is always this member's own to do. */
  const canMoveHere = canDraw || (focusSystem !== undefined && !sharedMaps[focusSystem.id])
  const [showRevisions, setShowRevisions] = useState(false)
  const [showMembers, setShowMembers] = useState(false)

  const sketchTrail = sketch ? walk(sketch.root, sketchPath) : []
  const showing = sketch ? sketchTrail : trail
  const goTo = (i: number): void => (sketch ? setSketchPath(sketchPath.slice(0, i + 1)) : setPath(path.slice(0, i + 1)))
  const problems = systemShown?.problems ?? []
  const progress = systemShown?.proposal ?? null
  const builtCount = progress ? progress.items.filter((i) => i.state === 'built' || i.state === 'removed').length : 0

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
            readOnly={!canDraw}
            style={{ width: `${Math.min(Math.max(sketch.name.length + 3, 14), 44)}ch` }}
            value={sketch.name}
            onChange={(e) => changed({ ...sketch, name: e.target.value })}
          />
        ) : null}
        <Trail steps={showing.map((card) => ({ id: card.id, name: card.name, level: card.level }))} onGo={goTo} />
        <div className="map-bar-end">
          {online ? (
            <span className="together-bar" aria-label="Who is here">
              {room.people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={thereWith.includes(p) ? 'together-face' : 'together-face together-face--away'}
                  style={{ background: p.color }}
                  title={thereWith.includes(p) ? `${p.name} is here. Click to go to them.` : `${p.name} is looking at something else.`}
                  onClick={() => {
                    if (p.where.sketch) void openOne(p.where.sketch)
                    else if (p.where.inside && shown) {
                      setSketch(null)
                      const to = pathTo(shown.card, p.where.inside)
                      if (to.length) setPath(to)
                    }
                  }}
                >
                  {p.name}
                </button>
              ))}
              <Button look="bare" onClick={() => setShowMembers(true)}>
                Members
              </Button>
              <Button look="bare" onClick={() => setShowRevisions(!showRevisions)}>
                History
              </Button>
            </span>
          ) : null}
          {!sketch && systemShown?.proposalsElsewhere.length ? (
            <button
              type="button"
              className="map-notice"
              onClick={() => void pickPoint({ kind: 'branch', name: systemShown.proposalsElsewhere[0]!, where: systemShown.proposalsElsewhere[0]!.startsWith('origin/') ? 'cloud' : 'local' })}
            >
              {systemShown.proposalsElsewhere.length === 1 ? `1 proposal being built on ${systemShown.proposalsElsewhere[0]!.replace(/^origin\//, '')}` : `${systemShown.proposalsElsewhere.length} proposals being built`}
            </button>
          ) : null}
          {!sketch && systemShown?.sketchMoved ? <span className="map-notice map-notice--plain">The sketch has changed since this was started</span> : null}
          {!sketch && branchSystem && branchShown ? (
            <BranchPicker system={branchSystem.name} points={choices} point={branchShown.point} onPick={(p) => void pickPoint(p)} />
          ) : null}
          {!sketch && branchShown?.point.kind === 'branch' && branchShown.path ? (
            <Button onClick={() => void switchFolder()} disabled={switching}>
              {switching ? 'Switching…' : `Switch folder to ${branchShown.point.name.replace(/^origin\//, '')}`}
            </Button>
          ) : null}
          {!sketch && progress ? (
            <button
              type="button"
              className={progress.built ? 'map-proposal map-proposal--built' : 'map-proposal'}
              aria-expanded={showProposal}
              onClick={() => setShowProposal(!showProposal)}
            >
              <span>{progress.built ? 'Proposal built' : 'Proposal'}</span>
              <span className="map-proposal-meter" aria-hidden="true">
                <span style={{ width: `${progress.items.length ? (builtCount / progress.items.length) * 100 : 100}%` }} />
              </span>
              <span>
                {builtCount} of {progress.items.length}
              </span>
            </button>
          ) : null}
          {!sketch && working ? (
            <label className="map-follow">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
              Follow the agent
            </label>
          ) : null}
          {!sketch && problems.length > 0 ? (
            <button type="button" className="map-count" onClick={() => setShowProblems(!showProblems)}>
              {problems.length === 1
                ? '1 thing in this repo the map could not place'
                : `${problems.length} things in this repo the map could not place`}
            </button>
          ) : null}
          {sketch ? (
              <button
                type="button"
                className="map-sketching"
                aria-expanded={library}
                aria-label={`Sketches: working on ${sketch.name}`}
                onClick={() => setLibrary(!library)}
              >
                <Pencil size={13} aria-hidden="true" />
                <span>Sketching</span>
                <span className="map-sketching-count">{sketches.length}</span>
              </button>
            ) : (
              <Button onClick={() => setLibrary(!library)}>Sketches{sketches.length ? ` (${sketches.length})` : ''}</Button>
          )}
          <ThemeSwitch />
        </div>
      </div>

      <div className="map-body">
        {problem ? (
          <div className="ds-empty">{problem}</div>
        ) : sketch ? (
          canDraw ? (
            <SketchEditor
              key={sketch.id}
              sketch={sketch}
              mockups={mockups}
              path={sketchPath}
              onPath={setSketchPath}
              onChange={changed}
              onAddMockup={(cardId) => void addMockup(cardId)}
              {...(together ? { together } : {})}
            />
          ) : (
            <MapCanvas
              key={sketch.id}
              root={sketch.root as never}
              path={sketchPath}
              onPath={setSketchPath}
              annotating={{ layers: sketch.layers ?? [], onChange: () => undefined, frozen: true }}
              {...(together ? { together } : {})}
            />
          )
        ) : !shown ? (
          <div className="ds-empty">Reading the code…</div>
        ) : (
          <MapCanvas
            root={shown.card}
            path={path}
            onPath={setPath}
            rearranging={canMoveHere ? { spots, onMove: rearrange, onForget: forget } : { spots, onMove: () => undefined, onForget: () => undefined, frozen: true }}
            annotating={{ layers: mapLayers, onChange: changeLayers, ...(canMoveHere ? {} : { frozen: true }) }}
            {...(together ? { together } : {})}
            cardExtra={(card) => {
              const at = card.level === 'system' ? shown.systems.find((s) => s.id === card.id) : undefined
              if (!at || at.reach !== 'open' || !at.setUp || system?.id === card.id) return null
              return (
                <BranchPicker
                  system={at.name}
                  points={branchesOf[at.id] ?? []}
                  point={at.point}
                  onPick={(p) => void pickFor(at.id, p)}
                  compact
                />
              )
            }}
            agent={working?.agent ? { card: working.agent.card, words: working.agent.words } : null}
            {...(canDraw ? { onStartSketch: () => void startOne(true) } : {})}
          />
        )}

        {switchProblem ? (
          <div className="map-switch-problem" role="alert">
            <span>{switchProblem}</span>
            <Button look="bare" onClick={() => setSwitchProblem('')}>
              Dismiss
            </Button>
          </div>
        ) : null}

        {!sketch && shown && trail.length === 1 && canDraw ? (
          <SuggestionBar
            suggestions={shown.suggestions}
            shallow={shown.card.children.filter((c) => c.kind === 'shallow software system')}
            onAgree={(name, sameAs) =>
              void window.codegraph.agreeShallowSystem(projectId, name, sameAs).then(() => load(points))
            }
          />
        ) : null}

        {!sketch && showProposal && progress ? (
          <ProposalPanel progress={progress} agent={systemShown?.agent ?? null} onClose={() => setShowProposal(false)} />
        ) : null}

        {!sketch && showProblems && problems.length > 0 ? (
          <aside className="map-problems" aria-label="What the map could not place">
            <div className="ds-row" style={{ justifyContent: 'space-between' }}>
              <span className="ds-label">
                {problems.length === 1
                  ? '1 thing in this repo the map could not place'
                  : `${problems.length} things in this repo the map could not place`}
              </span>
              <Button look="bare" onClick={() => setShowProblems(false)}>
                Close
              </Button>
            </div>
            <ul>
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </aside>
        ) : null}

        {showRevisions ? (
          <RevisionsPanel
            projectId={projectId}
            canRestore={canDraw}
            onRestored={() => {
              void load(pointsNow.current)
              void loadPlaces()
              void loadSketches()
              if (sketch) refreshSketch.current(sketch.id)
            }}
            onClose={() => setShowRevisions(false)}
          />
        ) : null}

        {showMembers && shown ? <MembersSheet projectId={projectId} onClose={() => setShowMembers(false)} /> : null}

        {(
          <SketchLibrary
            library={projectId}
            shown={library}
            sketches={sketches}
            open={sketch?.id ?? ''}
            onOpen={(id) => void openOne(id)}
            canDraw={canDraw}
            {...(online ? { onCopy: (id: string) => void window.codegraph.copySketch(projectId, id) } : {})}
            onStartBlank={(folderId) => void startOne(false, folderId)}
            onStartFromMap={(folderId) => void startOne(true, folderId)}
            onFiled={() => void loadSketches()}
            onDelete={(id) => void deleteOne(id)}
            onClose={() => setLibrary(false)}
          />
        )}
      </div>
    </div>
  )
}
