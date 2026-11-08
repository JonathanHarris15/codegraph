// codegraph: module instructions
// codegraph: front door instructionsFor, defaultFor, topics, editsOf, keepEdit, putBackDefault, useFolder, Topic, Edit
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import proposals from './proposals.md?raw'
import setup from './setup.md?raw'
import tags from './tags.md?raw'
import workingHere from './working-here.md?raw'
import type { Edit, Instructions } from './schema.js'

export type { Edit } from './schema.js'

/** Everything codegraph tells an agent lives here, and only here, so it is
 *  served the same way to whichever agent asks (ADR 0004). A person may write
 *  their own words for any topic, and those are served instead (ADR 0022). */
const texts = {
  setup: { about: 'How to set a repo up for codegraph, in one sweep', text: setup },
  tags: { about: 'The config, the tags and the words on wires, and what the check holds code to', text: tags },
  proposals: {
    about: 'What a proposal is, how to make one from a sketch, and how to build one until the check passes',
    text: proposals,
  },
  'working-here': {
    about: "The block for a set-up repo's CLAUDE.md or AGENTS.md: how to work in it",
    text: workingHere,
  },
} as const

export type Topic = keyof typeof texts

export const topics = (): { topic: Topic; about: string }[] =>
  (Object.keys(texts) as Topic[]).map((topic) => ({ topic, about: texts[topic].about }))

let folder = ''

/** The shell says where this computer keeps codegraph's files; the MCP says
 *  the same folder, so an agent is told whatever the person last wrote. */
export const useFolder = (where: string): void => {
  folder = where
}

const fileOf = (): string => join(folder, 'instructions.json')

/** What a person has written, or nothing at all: with no folder chosen, and
 *  on a computer where nobody has edited anything, every topic is still the
 *  words codegraph ships with. */
const kept = (): Instructions => {
  if (!folder) return { topics: {} }
  try {
    const read = JSON.parse(readFileSync(fileOf(), 'utf8')) as { topics?: Record<string, Edit[]> }
    return { topics: read.topics && typeof read.topics === 'object' ? read.topics : {} }
  } catch {
    return { topics: {} }
  }
}

/** Written to a neighbour first, then moved over, so a crash cannot shred it. */
const write = (all: Instructions): void => {
  const file = fileOf()
  mkdirSync(dirname(file), { recursive: true })
  const beside = `${file}.${randomUUID().slice(0, 8)}`
  writeFileSync(beside, JSON.stringify(all, null, 2), 'utf8')
  renameSync(beside, file)
}

/** Every edit a person has made to a topic, oldest first. */
export const editsOf = (topic: string): Edit[] => {
  const edits = kept().topics[topic]
  return Array.isArray(edits) ? edits.filter((edit) => edit && typeof edit.text === 'string') : []
}

/** The words codegraph ships with for a topic. */
export const defaultFor = (topic: string): string | null => (topic in texts ? texts[topic as Topic].text : null)

/** What an agent asking about a topic is told: the newest edit, or the words
 *  codegraph ships with where there is none. */
export const instructionsFor = (topic: string): string | null => {
  if (!(topic in texts)) return null
  const edits = editsOf(topic)
  return edits[edits.length - 1]?.text ?? texts[topic as Topic].text
}

/** Keeps a person's own words for a topic, and hands back the edit. The same
 *  words again change nothing. An unknown topic is not written. */
export const keepEdit = (topic: string, text: string, how: Edit['how'] = 'edited'): Edit | null => {
  if (!(topic in texts) || !folder) return null
  if (text === instructionsFor(topic)) return editsOf(topic)[editsOf(topic).length - 1] ?? null
  const edit: Edit = { id: randomUUID(), at: new Date().toISOString(), text, how }
  const all = kept()
  write({ topics: { ...all.topics, [topic]: [...editsOf(topic), edit] } })
  return edit
}

/** Puts the words codegraph ships with back in force, as an edit of its own,
 *  so what a person wrote is still there to read and to put back. */
export const putBackDefault = (topic: string): Edit | null => {
  const words = defaultFor(topic)
  return words === null ? null : keepEdit(topic, words, 'reset')
}
