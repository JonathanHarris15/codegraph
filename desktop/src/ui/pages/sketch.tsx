// codegraph: page sketch at /sketches/:library/:id
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '../../features/show-session.js'
import { LOOSE } from '../../modules/sketches/schema.js'
import type { Sketch } from '../../modules/sketches/index.js'
import { sameDoc } from '../../modules/together/index.js'
import { Button, ThemeSwitch } from '../design-system/kit.js'
import { MapCanvas } from '../components/map-canvas.js'
import { walk } from '../components/map-layout.js'
import { SketchEditor } from '../components/sketch-editor.js'
import { togetherOn, useRoom } from '../components/together.js'
import { AGENT_COLOR, agentsAsOthers, pathTo, useAgents, useFollowAgent, useLooking } from '../components/agents.js'
import { Trail } from '../components/trail.js'

const SAVE_AFTER_MS = 500

/** A sketch outside any project: one of a member's own, or one someone shared with
 *  them. Others it is shared with can be seen here. */
export const SketchPage = ({ library, sketchId, onLeave }: { library: string; sketchId: string; onLeave: () => void }) => {
  const [sketch, setSketch] = useState<Sketch | null>(null)
  const [mockups, setMockups] = useState<Record<string, string>>({})
  const [path, setPath] = useState<string[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [missing, setMissing] = useState(false)
  const seen = useRef<Sketch | null>(null)
  const latest = useRef<Sketch | null>(null)
  const saving = useRef<ReturnType<typeof setTimeout> | null>(null)

  const read = useCallback(async (): Promise<void> => {
    const opened = await window.codegraph.openSketch(library, sketchId)
    if (!opened) {
      setMissing(true)
      return
    }
    seen.current = opened.sketch
    latest.current = opened.sketch
    setSketch(opened.sketch)
    setMockups(opened.mockups)
    setPath((was) => (was.length ? was : [opened.sketch.root.id]))
  }, [library, sketchId])

  useEffect(() => {
    void read()
    void window.codegraph.showSession().then(setSession)
  }, [read])
  useEffect(
    () =>
      window.codegraph.heardChange((what) => {
        if (what.path.endsWith(`/${sketchId}`) && !saving.current) void read()
      }),
    [sketchId, read],
  )
  // An agent drawing here from outside the app: what it drew, and its cursor.
  const agents = useAgents(library, () => {
    if (saving.current) return
    void window.codegraph.openSketch(library, sketchId).then((opened) => {
      const now = latest.current
      if (!opened || saving.current || (now && sameDoc(opened.sketch.root, now.root) && sameDoc(opened.sketch.layers, now.layers) && opened.sketch.name === now.name)) return
      seen.current = opened.sketch
      latest.current = opened.sketch
      setSketch(opened.sketch)
      setMockups(opened.mockups)
    })
  })
  const agentHere = agents.find((a) => a.sketchId === sketchId)
  useFollowAgent(agentHere, sketch?.root ?? null, setPath)

  const saveNow = async (): Promise<void> => {
    const sent = latest.current
    if (!sent) return
    const merged = await window.codegraph.saveSketch(sent, seen.current ?? undefined)
    // Seen only counts once this window has it, or newer work reads as undoing it.
    if (latest.current !== sent) return
    seen.current = merged
    if (!(sameDoc(merged.root, sent.root) && sameDoc(merged.layers, sent.layers) && merged.name === sent.name)) {
      latest.current = merged
      setSketch(merged)
    }
  }
  const changed = (next: Sketch): void => {
    latest.current = next
    setSketch(next)
    if (saving.current) clearTimeout(saving.current)
    saving.current = setTimeout(() => {
      saving.current = null
      void saveNow()
    }, SAVE_AFTER_MS)
  }
  const leave = async (): Promise<void> => {
    if (saving.current) {
      clearTimeout(saving.current)
      saving.current = null
      // Kept on this computer either way, so leaving does not wait on the online side.
      await saveNow().catch(() => undefined)
    }
    onLeave()
  }

  const addMockup = async (cardId: string): Promise<void> => {
    if (!sketch) return
    const added = await window.codegraph.addMockup(library, sketch.id, cardId)
    if (!added.ok) return
    setMockups((m) => ({ ...m, [cardId]: added.url }))
    const setOn = (card: Sketch['root']): Sketch['root'] =>
      card.id === cardId ? { ...card, mockup: added.name } : { ...card, children: card.children.map(setOn) }
    changed({ ...sketch, root: setOn(sketch.root) })
  }

  const me = session?.member?.id ?? ''
  const shared = Boolean(sketch?.memberIds?.length)
  const room = useRoom(shared && me ? `sketch:${sketchId}` : '', me)
  useEffect(() => {
    if (shared) room.say({ sketch: sketchId, dragging: [] })
  }, [shared, sketchId])
  const myRole = sketch?.members?.find((m) => m.id === me)?.role
  const canDraw = library === LOOSE || myRole === 'owner' || myRole === 'collaborator'
  const trail = sketch ? walk(sketch.root, path) : []
  const onLooking = useLooking(sketch ? { library, id: sketch.id, name: sketch.name, trail: trail.map((c) => c.name) } : null)
  const together = {
    ...togetherOn({
      board: shared ? `sketch:${sketchId}` : '',
      room,
      me,
      others: [
        ...room.people.map((p) => ({ id: p.id, name: p.name, color: p.color, inside: p.where.inside ?? '', ...(p.where.x !== undefined ? { x: p.where.x } : {}), ...(p.where.y !== undefined ? { y: p.where.y } : {}), dragging: p.where.dragging ?? [] })),
        ...agentsAsOthers(agents, sketchId),
      ],
      onGo: (inside) => {
        if (!sketch) return
        const to = pathTo(sketch.root, inside)
        if (to.length) setPath(to)
      },
    }),
    onLooking,
  }

  return (
    <div className="map-page">
      <div className="map-bar">
        <Button look="bare" onClick={() => void leave()}>
          ← Sketches
        </Button>
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
        <Trail steps={trail.map((card) => ({ id: card.id, name: card.name, level: card.level }))} onGo={(i) => setPath(path.slice(0, i + 1))} />
        <div className="map-bar-end">
          {room.people.map((p) => (
            <span key={p.id} className="together-face" style={{ background: p.color }}>
              {p.name}
            </span>
          ))}
          {agentHere ? (
            <span className="together-face" style={{ background: AGENT_COLOR }} title={`${agentHere.who} is drawing here`}>
              {agentHere.who} is drawing
            </span>
          ) : null}
          <ThemeSwitch />
        </div>
      </div>
      <div className="map-body">
        {missing ? (
          <div className="ds-empty">That sketch is not on this computer.</div>
        ) : !sketch ? (
          <div className="ds-empty">Opening the sketch…</div>
        ) : canDraw ? (
          <SketchEditor key={sketch.id} sketch={sketch} mockups={mockups} path={path} onPath={setPath} onChange={changed} onAddMockup={(id) => void addMockup(id)} together={together} />
        ) : (
          <MapCanvas key={sketch.id} root={sketch.root as never} path={path} onPath={setPath} annotating={{ layers: sketch.layers ?? [], onChange: () => undefined, frozen: true }} together={together} />
        )}
      </div>
    </div>
  )
}
