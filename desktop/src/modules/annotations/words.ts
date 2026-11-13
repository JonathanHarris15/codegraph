// codegraph: module annotations
import type { Annotation, AnnotationEnd, Layer, Pointer } from './schema.js'

/** What each kind of annotation is called, in words. */
const CALLED: Record<string, string> = {
  text: 'text',
  sticky: 'sticky note',
  callout: 'callout',
  arrow: 'arrow',
  line: 'line',
  dashed: 'dashed line',
  curve: 'bending line',
  wire: 'wire',
  frame: 'frame',
  lane: 'swimlane',
  column: 'column',
  list: 'list',
  code: 'code block',
  rect: 'box',
  diamond: 'diamond',
  terminator: 'start or end',
  database: 'database shape',
}

/** Shapes the library once listed twice. An annotation drawn under the old
 *  name still says what it always said. */
const WAS: Record<string, string> = { box: 'frame', process: 'rect', decision: 'diamond', connector: 'circle', preparation: 'hexagon' }

const called = (kind: string): string => CALLED[kind] ?? CALLED[WAS[kind] ?? ''] ?? `${WAS[kind] ?? kind} shape`

/** Which way an arrow goes out of its note, in words: it holds nothing, so
 *  the way it points is all there is to say. */
const wayOf = (a: Annotation, p: Pointer): string => {
  const dx = p.dx - a.w / 2
  const dy = p.dy - a.h / 2
  const across = Math.abs(dx) * 2 < Math.abs(dy) ? '' : dx < 0 ? 'left' : 'right'
  const down = Math.abs(dy) * 2 < Math.abs(dx) ? '' : dy < 0 ? 'up' : 'down'
  return [down, across].filter(Boolean).join(' and ')
}

const pointing = (a: Annotation): string => {
  const ways = (a.pointers ?? []).map((p) => wayOf(a, p))
  if (!ways.length) return ''
  return ways.length === 1 ? `, with an arrow pointing ${ways[0]}` : `, with arrows pointing ${ways.join('; ')}`
}

/** The annotations on some levels, in words an agent reads: what each is,
 *  what it says, the card it keeps beside, and what a line joins. Each
 *  level is named by the card it is drawn inside. Nothing here is part of
 *  the diagram; the words say so. */
export const annotationWords = (layers: Layer[], levels: string[], nameOf: (cardId: string) => string): string[] => {
  const all = layers.flatMap((layer) => layer.items.map((a) => ({ a, layer })))
  const byId = new Map(all.map(({ a }) => [a.id, a]))
  const about = (a: Annotation): string => `${called(a.kind)}${a.text ? ` "${a.text.replace(/\s+/g, ' ').trim()}"` : ''}`
  const end = (e: AnnotationEnd | undefined): string =>
    !e ? 'nowhere' : 'card' in e ? nameOf(e.card) : 'annotation' in e ? (byId.get(e.annotation) ? about(byId.get(e.annotation)!) : 'a note since removed') : 'an open spot'
  const out: string[] = []
  for (const level of levels) {
    const here = all.filter(({ a }) => a.at === level)
    if (!here.length) continue
    out.push(`On ${nameOf(level)}:`)
    for (const { a, layer } of here) {
      const what = a.from
        ? `${called(a.kind)} from ${end(a.from)} to ${end(a.to)}${a.text ? `, saying "${a.text}"` : ''}`
        : `${about(a)}${a.near ? `, beside ${nameOf(a.near.card)}` : ''}${a.around?.length ? `, round ${a.around.map(nameOf).join(', ')}` : ''}${pointing(a)}`
      out.push(`  ${what} (layer ${layer.name}${layer.shown ? '' : ', hidden'})`)
    }
  }
  return out.length
    ? ['Annotations: notes people drew over the diagram. They are not the architecture and never change the code.', ...out]
    : []
}
