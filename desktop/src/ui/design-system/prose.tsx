// codegraph: design system
import { type ReactNode } from 'react'

/** Words a person wrote in Markdown, shown as they read: paragraphs, lists,
 *  headings, code, bold and italic. Built as elements, never as HTML, so
 *  nothing in the words can reach the page; a link shows as its words alone,
 *  and every heading is one size, under whatever names the words. */
export const Prose = ({ text }: { text: string }) => <div className="ds-prose">{blocksOf(text).map(show)}</div>

type List = { kind: 'ul' | 'ol'; items: string[] }
type Block = { kind: 'p'; text: string } | { kind: 'h'; text: string } | { kind: 'pre'; text: string } | List

const HEADING = /^#{1,6}\s+(.*?)\s*#*\s*$/
const BULLET = /^\s*[-*+]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/
const FENCE = /^\s*```/

const blocksOf = (text: string): Block[] => {
  const blocks: Block[] = []
  let para: string[] = []
  let list = null as List | null
  let code: string[] | null = null
  const flush = (): void => {
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') })
    if (list) blocks.push(list)
    para = []
    list = null
  }
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (code) {
      if (FENCE.test(line)) {
        blocks.push({ kind: 'pre', text: code.join('\n') })
        code = null
      } else code.push(line)
      continue
    }
    const item = BULLET.exec(line) ?? NUMBERED.exec(line)
    const kind = BULLET.test(line) ? 'ul' : 'ol'
    if (FENCE.test(line)) {
      flush()
      code = []
    } else if (!line.trim()) flush()
    else if (HEADING.test(line)) {
      flush()
      blocks.push({ kind: 'h', text: HEADING.exec(line)![1]! })
    } else if (item) {
      if (para.length || list?.kind !== kind) flush()
      list ??= { kind, items: [] }
      list.items.push(item[1]!.trim())
    } else if (list) {
      // A line under an item carries on that item.
      const items = list.items
      items[items.length - 1] = `${items[items.length - 1]} ${line.trim()}`
    } else para.push(line.trim())
  }
  if (code) blocks.push({ kind: 'pre', text: code.join('\n') })
  flush()
  return blocks
}

const show = (b: Block, i: number): ReactNode => {
  if ('items' in b) {
    const Tag = b.kind
    return (
      <Tag key={i}>
        {b.items.map((t, j) => (
          <li key={j}>{inline(t)}</li>
        ))}
      </Tag>
    )
  }
  if (b.kind === 'pre')
    return (
      <pre key={i}>
        <code>{b.text}</code>
      </pre>
    )
  if (b.kind === 'h') return <h4 key={i}>{inline(b.text)}</h4>
  return <p key={i}>{inline(b.text)}</p>
}

// `code`, **bold**, __bold__, *italic*, _italic_ and [words](link). A mark
// only counts hard against words, so "2 * 3" and snake_case stay as typed.
const MARK =
  /`([^`]+)`|\*\*(?=\S)(.+?)(?<=\S)\*\*|__(?=\S)(.+?)(?<=\S)__|\*(?=\S)([^*]+?)(?<=\S)\*|(?<!\w)_(?=\S)([^_]+?)(?<=\S)_(?!\w)|\[([^\]]+)\]\([^)\s]*\)/g

const inline = (text: string): ReactNode[] => {
  const out: ReactNode[] = []
  let at = 0
  for (const m of text.matchAll(MARK)) {
    if (m.index > at) out.push(text.slice(at, m.index))
    const [, code, bold, bold2, em, em2, link] = m
    const k = m.index
    if (code !== undefined) out.push(<code key={k}>{code}</code>)
    else if (bold !== undefined || bold2 !== undefined) out.push(<strong key={k}>{inline((bold ?? bold2)!)}</strong>)
    else if (em !== undefined || em2 !== undefined) out.push(<em key={k}>{inline((em ?? em2)!)}</em>)
    else out.push(...inline(link!))
    at = m.index + m[0].length
  }
  if (at < text.length) out.push(text.slice(at))
  return out
}
