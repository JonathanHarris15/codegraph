// codegraph: component together
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentInSketch } from '../../features/show-agents.js'
import type { Looking } from '../../features/say-looking.js'
import type { Together } from './map-canvas.js'
import type { Other } from './together-layer.js'

/** The colour an agent's cursor is drawn in: one no member is given. */
export const AGENT_COLOR = '#d97757'

/** While a cursor shows, how often the window asks whether it has gone. */
const ASK_AGAIN_MS = 1_000

/** The ids from the top of a card down to one inside it, or [] if it is not there. */
export const pathTo = (card: { id: string; children: { id: string; children: unknown[] }[] }, id: string): string[] => {
  if (card.id === id) return [card.id]
  for (const child of card.children) {
    const below = pathTo(child as typeof card, id)
    if (below.length) return [card.id, ...below]
  }
  return []
}

/** The agents drawing on a library's sketches, heard as they move, and every
 *  change made to those sketches on this computer. `onChange` is told of each,
 *  so the page can read again whatever it has open. */
export const useAgents = (library: string, onChange: () => void): AgentInSketch[] => {
  const [agents, setAgents] = useState<AgentInSketch[]>([])
  const told = useRef(onChange)
  told.current = onChange
  useEffect(() => {
    if (!library) return
    let live = true
    let said = ''
    let again: ReturnType<typeof setTimeout> | undefined
    const read = (): void => {
      void window.codegraph.showAgents(library).then((found) => {
        if (!live) return
        // A cursor that stops moving goes, though nothing else changes: while
        // one shows, ask again soon. The folder is watched for a new one.
        clearTimeout(again)
        if (found.length) again = setTimeout(read, ASK_AGAIN_MS)
        // Nothing redraws when no agent has moved.
        const now = JSON.stringify(found)
        if (now === said) return
        said = now
        setAgents(found)
      })
    }
    read()
    const stop = window.codegraph.watchSketches(library, () => {
      read()
      told.current()
    })
    return () => {
      live = false
      stop()
      clearTimeout(again)
      setAgents([])
    }
  }, [library])
  return agents
}

/** An agent on one sketch, as the canvas draws others. */
export const agentsAsOthers = (agents: AgentInSketch[], sketchId: string): Other[] =>
  agents
    .filter((a) => a.sketchId === sketchId)
    .map((a) => ({
      id: `agent:${a.sketchId}`,
      name: a.who,
      color: AGENT_COLOR,
      inside: a.inside,
      ...(a.x !== undefined ? { x: a.x } : {}),
      ...(a.y !== undefined ? { y: a.y } : {}),
      dragging: [],
      agent: { target: a.target, words: a.words },
    }))

/** Goes where the agent is drawing whenever it moves to another level, so the
 *  person watches it work. Moving away themselves is respected until it moves
 *  again. */
export const useFollowAgent = (agent: AgentInSketch | undefined, root: { id: string; children: { id: string; children: unknown[] }[] } | null, go: (path: string[]) => void): void => {
  const followed = useRef('')
  const inside = agent?.inside ?? ''
  useEffect(() => {
    if (!agent || !root || inside === followed.current) return
    followed.current = inside
    const to = pathTo(root, inside)
    if (to.length) go(to)
  }, [inside, root === null])
}

const SAY_EVERY_MS = 200
const STILL_THERE_MS = 60_000

/** Tells the person's agent what they are looking at in a sketch, no more than
 *  a few times a second, again every minute while it stays open, and that they
 *  have left it when they go. Hands back what the canvas calls as they look. */
export const useLooking = (sketch: { library: string; id: string; name: string; trail: string[] } | null): NonNullable<Together['onLooking']> => {
  const last = useRef<Omit<Looking, 'at'> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sentAt = useRef(0)
  const about = useRef(sketch)
  about.current = sketch
  const sent = useRef('')
  /** Sends what changed; `again` sends it anyway, to say the window is still open. */
  const send = useCallback((again = false): void => {
    timer.current = null
    if (!last.current) return
    const now = JSON.stringify(last.current)
    if (now === sent.current && !again) return
    sent.current = now
    sentAt.current = Date.now()
    void window.codegraph.sayLooking(last.current)
  }, [])
  const key = sketch ? `${sketch.library}/${sketch.id}` : ''
  useEffect(() => {
    if (!key) return
    const every = setInterval(() => send(true), STILL_THERE_MS)
    return () => {
      clearInterval(every)
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      last.current = null
      sent.current = ''
      void window.codegraph.sayLooking(null)
    }
  }, [key, send])
  return useCallback(
    (seen) => {
      const now = about.current
      if (!now) return
      last.current = { library: now.library, sketchId: now.id, sketchName: now.name, trail: now.trail, ...seen }
      if (timer.current) return
      timer.current = setTimeout(() => send(), Math.max(0, SAY_EVERY_MS - (Date.now() - sentAt.current)))
    },
    [send],
  )
}
