// codegraph: module annotations
import type { Annotation, AnnotationEnd, Layer } from './schema.js'

/** What each kind of annotation is called, in words. */
const CALLED: Record<string, string> = {
  text: 'text',
  sticky: 'sticky note',
  callout: 'callout',
  arrow: 'arrow',
  line: 'line',
  dashed: 'dashed line',
  frame: 'frame',
  list: 'list',
  code: 'code block',
  decision: 'decision',
  terminator: 'start or end',
  database: 'database shape',
}

const called = (kind: string): string => CALLED[kind] ?? `${kind} shape`

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
        : `${about(a)}${a.near ? `, beside ${nameOf(a.near.card)}` : ''}`
      out.push(`  ${what} (layer ${layer.name}${layer.shown ? '' : ', hidden'})`)
    }
  }
  return out.length
    ? ['Annotations: notes people drew over the diagram. They are not the architecture and never change the code.', ...out]
    : []
}
