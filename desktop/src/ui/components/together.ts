// codegraph: component together
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RoomNow } from '../../features/join-room.js'
import type { Whereabouts } from '../../features/say-where.js'
import type { Together } from './map-canvas.js'
import type { Other } from './together-layer.js'

const COLORS = ['#e5484d', '#3e63dd', '#30a46c', '#f76b15', '#8e4ec6', '#0091a8', '#d6409f', '#ad7f58']

/** The same colour for one member on every computer. */
export const colorOf = (id: string): string => COLORS[[...id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % COLORS.length]!

const EVERY_MS = 100

export type Person = { id: string; name: string; color: string; where: Whereabouts }

/** Being in a room with others: who is there, and what this member's hands and
 *  cursor tell them. With no room, there is nobody, and everything is free. */
export const useRoom = (room: string, me: string) => {
  const [now, setNow] = useState<RoomNow>({ people: [], held: {} })
  useEffect(() => {
    if (!room) return
    void window.codegraph.joinRoom(room, setNow)
    return () => {
      void window.codegraph.joinRoom('', () => undefined)
      setNow({ people: [], held: {} })
    }
  }, [room])

  const people = useMemo(
    (): Person[] =>
      now.people
        .filter((p) => p.member.id !== me)
        .map((p) => ({ id: p.member.id, name: p.member.name, color: colorOf(p.member.id), where: p.state as Whereabouts })),
    [now.people, me],
  )

  // What this member says is sent no more than ten times a second, and the last
  // of a burst is never lost.
  const said = useRef<Whereabouts>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sentAt = useRef(0)
  const say = useCallback((more: Whereabouts): void => {
    said.current = { ...said.current, ...more }
    if (timer.current) return
    const wait = Math.max(0, EVERY_MS - (Date.now() - sentAt.current))
    timer.current = setTimeout(() => {
      timer.current = null
      sentAt.current = Date.now()
      void window.codegraph.sayWhere(said.current)
    }, wait)
  }, [])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    },
    [],
  )

  return { people, held: now.held, say }
}

/** What the canvas needs to know of a room, on one board: `board` names what is
 *  being looked at, so things held on another branch or sketch are no one's here.
 *  An empty board is private, so nothing there needs holding. */
export const togetherOn = ({
  board,
  room,
  me,
  others,
  onGo,
}: {
  board: string
  room: ReturnType<typeof useRoom>
  me: string
  others: Other[]
  onGo: (inside: string) => void
}): Together => {
  const prefix = `${board}|`
  const heldBy = new Map<string, string>()
  for (const [item, by] of Object.entries(room.held)) {
    if (by === me || !board || !item.startsWith(prefix)) continue
    heldBy.set(item.slice(prefix.length), room.people.find((p) => p.id === by)?.name ?? 'Someone')
  }
  return {
    others,
    heldBy,
    onCursor: (inside, x, y) => room.say({ inside, x, y }),
    onDragging: (moves) => room.say({ dragging: moves }),
    onHold: async (ids) => (board ? (await window.codegraph.holdThings(ids.map((id) => prefix + id))).ok : true),
    onLetGo: () => void window.codegraph.letGoOfThings(),
    onGo,
  }
}
