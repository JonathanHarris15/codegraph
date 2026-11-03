// codegraph: page canvas at /projects/:id
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SketchListed } from '../../features/list-sketches.js'
import type { MapShown, SystemShown } from '../../features/show-map.js'
import type { Point } from '../../modules/reader/index.js'
import type { Sketch, SketchCard } from '../../modules/sketches/index.js'
import { Button, ThemeSwitch } from '../design-system/kit.js'
import { MapCanvas, walk } from '../components/map-canvas.js'
import { PointPicker } from '../components/point-picker.js'
import { ProposalPanel } from '../components/proposal-panel.js'
import { SketchEditor } from '../components/sketch-editor.js'
import { SketchLibrary } from '../components/sketch-library.js'
import { SuggestionBar } from '../components/suggestion-bar.js'
import { Trail } from '../components/trail.js'

const SAVE_AFTER_MS = 500

/** A proposal being drawn over one software system's map. */
type Drafting = {
  systemId: string
  branch: string
  sketch: Sketch
  known: string[]
  mockups: Record<string, string>
}

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

  const [drafting, setDrafting] = useState<Drafting | null>(null)
  const [draftPath, setDraftPath] = useState<string[]>([])
  const [asking, setAsking] = useState<{ systemId: string; branch: string; why: string } | null>(null)
  const draftSaving = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestDraft = useRef<Drafting | null>(null)

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
  // saying where it is redraws it. Not while drawing over it.
  const quiet = useRef(false)
  quiet.current = drafting !== null
  useEffect(
    () =>
      window.codegraph.watchProject(projectId, () => {
        if (!quiet.current) void load(pointsNow.current)
      }),
    [projectId, load],
  )

  const trail = shown ? walk(shown.card, path) : []
  const system = trail[1]
  const systemShown = shown?.systems.find((s) => s.id === system?.id)
  const working: SystemShown | undefined = shown?.systems.find((s) => s.agent)

  useEffect(() => {
    setChoices([])
    if (!system || sketch) return
    void window.codegraph.listPoints(projectId, system.id).then(setChoices)
  }, [projectId, system?.id, sketch === null])

  // Wherever the agent says it is working, the canvas goes too, unless the
  // person has said not to follow.
  useEffect(() => {
    const agent = working?.agent
    if (!shown || !agent || !follow || sketch || drafting || agent.card === followed.current) return
    followed.current = agent.card
    const to = pathTo(shown.card, agent.card)
    if (to.length > 1) setPath(to.slice(0, -1))
  }, [shown, working?.agent?.card, follow, sketch, drafting])

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

  // So is a proposal, into the repo, on its branch.
  const saveDraft = (draft: Drafting): Promise<unknown> =>
    window.codegraph.saveProposal(projectId, draft.systemId, draft.sketch.root, draft.sketch.name)
  const saveDraftSoon = (next: Drafting): void => {
    latestDraft.current = next
    if (draftSaving.current) clearTimeout(draftSaving.current)
    draftSaving.current = setTimeout(() => {
      draftSaving.current = null
      if (latestDraft.current) void saveDraft(latestDraft.current)
    }, SAVE_AFTER_MS)
  }
  const flushDraft = async (): Promise<void> => {
    if (!draftSaving.current) return
    clearTimeout(draftSaving.current)
    draftSaving.current = null
    if (latestDraft.current) await saveDraft(latestDraft.current)
  }
  useEffect(
    () => () => {
      void flush()
      void flushDraft()
    },
    [],
  )

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

  /** Opens the proposal on a software system's branch to draw on; on the
   *  main line it first asks what to call the branch it goes on. */
  const propose = async (systemId: string, branch = ''): Promise<void> => {
    const opened = await window.codegraph.openProposal(projectId, systemId, branch)
    if (!opened.ok) {
      if (opened.why === 'main line' || opened.why === 'no branch')
        setAsking({ systemId, branch: branch || 'proposal', why: opened.why })
      else setProblem(opened.why === 'not set up' ? 'That repo is not set up for codegraph yet.' : 'That repo could not be read.')
      return
    }
    setAsking(null)
    const now = new Date().toISOString()
    setDrafting({
      systemId,
      branch: opened.branch,
      known: opened.known,
      mockups: opened.mockups,
      sketch: { id: `proposal-${systemId}`, projectId, name: opened.says, createdAt: now, updatedAt: now, from: 'the map', root: opened.draft },
    })
    // It opens where the person was looking, as far down as a proposal goes.
    const here = walk(opened.draft, path.slice(1)).map((c) => c.id)
    setDraftPath(here.length && here[0] === opened.draft.id ? here.slice(0, 2) : [opened.draft.id])
  }

  const draftChanged = (next: Sketch): void => {
    if (!drafting) return
    const draft = { ...drafting, sketch: next }
    setDrafting(draft)
    saveDraftSoon(draft)
  }

  const doneDrafting = async (): Promise<void> => {
    await flushDraft()
    setDrafting(null)
    await load(points)
  }

  const addProposalMockup = async (cardId: string): Promise<void> => {
    if (!drafting) return
    const find = (card: SketchCard): SketchCard | undefined =>
      card.id === cardId ? card : card.children.map(find).find(Boolean)
    const page = find(drafting.sketch.root)
    if (!page) return
    const added = await window.codegraph.addProposalMockup(projectId, drafting.systemId, page.name || 'page')
    if (!added.ok) return
    const setOn = (card: SketchCard): SketchCard =>
      card.id === cardId ? { ...card, mockup: added.name } : { ...card, children: card.children.map(setOn) }
    const draft = { ...drafting, mockups: { ...drafting.mockups, [cardId]: added.url }, sketch: { ...drafting.sketch, root: setOn(drafting.sketch.root) } }
    setDrafting(draft)
    saveDraftSoon(draft)
  }

  const sketchTrail = sketch ? walk(sketch.root, sketchPath) : []
  const draftTrail = drafting ? walk(drafting.sketch.root, draftPath) : []
  const showing = drafting ? draftTrail : sketch ? sketchTrail : trail
  const goTo = (i: number): void =>
    drafting
      ? setDraftPath(draftPath.slice(0, i + 1))
      : sketch
        ? setSketchPath(sketchPath.slice(0, i + 1))
        : setPath(path.slice(0, i + 1))
  const problems = systemShown?.problems ?? []
  const progress = systemShown?.proposal ?? null
  const builtCount = progress ? progress.items.filter((i) => i.state === 'built' || i.state === 'removed').length : 0
  const canPropose = Boolean(system && systemShown && systemShown.setUp && systemShown.point.kind === 'live' && systemShown.path)

  return (
    <div className="map-page">
      <div className="map-bar">
        {drafting ? (
          <Button look="bare" onClick={() => void doneDrafting()}>
            ← Done
          </Button>
        ) : sketch ? (
          <Button look="bare" onClick={() => void backToMap()}>
            ← Map
          </Button>
        ) : (
          <Button look="bare" onClick={onLeave}>
            ← Projects
          </Button>
        )}
        {drafting ? (
          <input
            className="ds-input map-sketch-name"
            aria-label="What this change is for"
            placeholder="What this change is for"
            value={drafting.sketch.name}
            onChange={(e) => draftChanged({ ...drafting.sketch, name: e.target.value })}
          />
        ) : sketch ? (
          <input
            className="ds-input map-sketch-name"
            aria-label="Sketch name"
            value={sketch.name}
            onChange={(e) => changed({ ...sketch, name: e.target.value })}
          />
        ) : null}
        <Trail steps={showing.map((card) => ({ id: card.id, name: card.name, level: card.level }))} onGo={goTo} />
        <div className="map-bar-end">
          {drafting ? <span className="map-follow">Proposal on {drafting.branch}</span> : null}
          {!sketch && !drafting && system && systemShown ? (
            <PointPicker system={system.name} points={choices} point={systemShown.point} onPick={(p) => void pickPoint(p)} />
          ) : null}
          {!sketch && !drafting && progress ? (
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
          {!sketch && !drafting && working ? (
            <label className="map-follow">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
              Follow the agent
            </label>
          ) : null}
          {!sketch && !drafting && problems.length > 0 ? (
            <button type="button" className="map-count" onClick={() => setShowProblems(!showProblems)}>
              {problems.length === 1
                ? '1 thing in this repo the map could not place'
                : `${problems.length} things in this repo the map could not place`}
            </button>
          ) : null}
          {!sketch && !drafting && canPropose && system ? (
            <Button onClick={() => void propose(system.id)}>{progress ? 'Change the proposal' : 'Propose a change'}</Button>
          ) : null}
          {!drafting ? (
            <Button onClick={() => setLibrary(!library)}>Sketches{sketches.length ? ` (${sketches.length})` : ''}</Button>
          ) : null}
          <ThemeSwitch />
        </div>
      </div>

      <div className="map-body">
        {problem ? (
          <div className="ds-empty">{problem}</div>
        ) : drafting ? (
          <SketchEditor
            key={drafting.sketch.id}
            sketch={drafting.sketch}
            mockups={drafting.mockups}
            path={draftPath}
            onPath={setDraftPath}
            onChange={draftChanged}
            onAddMockup={(cardId) => void addProposalMockup(cardId)}
            known={drafting.known}
          />
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
          <MapCanvas
            root={shown.card}
            path={path}
            onPath={setPath}
            agent={working?.agent ? { card: working.agent.card, words: working.agent.words } : null}
            onStartSketch={() => void startOne(true)}
          />
        )}

        {asking ? (
          <form
            className="map-branch-ask"
            aria-label="Make a branch for the proposal"
            onSubmit={(event) => {
              event.preventDefault()
              void propose(asking.systemId, asking.branch)
            }}
          >
            <div className="sketch-panel-head">A proposal goes on a branch of its own</div>
            <div className="ds-hint">
              {asking.why === 'no branch'
                ? `Git would not make a branch called “${asking.branch}”. Try another name.`
                : 'This repo is on its main line. Name a branch for the change; the app makes it and moves the repo onto it, taking any changes along.'}
            </div>
            <input
              className="ds-input"
              aria-label="Branch name"
              autoFocus
              value={asking.branch}
              onChange={(e) => setAsking({ ...asking, branch: e.target.value })}
            />
            <div className="ds-row" style={{ justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <Button look="bare" onClick={() => setAsking(null)}>
                Not now
              </Button>
              <Button look="loud" onClick={() => void propose(asking.systemId, asking.branch)}>
                Make the branch
              </Button>
            </div>
          </form>
        ) : null}

        {!sketch && !drafting && shown && trail.length === 1 ? (
          <SuggestionBar
            suggestions={shown.suggestions}
            shallow={shown.card.children.filter((c) => c.kind === 'shallow software system')}
            onAgree={(name, sameAs) =>
              void window.codegraph.agreeShallowSystem(projectId, name, sameAs).then(() => load(points))
            }
          />
        ) : null}

        {!sketch && !drafting && showProposal && progress ? (
          <ProposalPanel progress={progress} agent={systemShown?.agent ?? null} onClose={() => setShowProposal(false)} />
        ) : null}

        {!sketch && !drafting && showProblems && problems.length > 0 ? (
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

        {library && !drafting ? (
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
      </div>
    </div>
  )
}
