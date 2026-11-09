// codegraph: module reader
// codegraph: front door DESIGN, changeToken, readDesign, DesignSystem, UiBlock, UiOption, UiState, RECIPES, Recipe, Token, TokenGroup, TokenPart, TokenTier, readMap, listPoints, pointFor, checkRepo, proposalProgress, measure, proposalFrom, changesAnything, blankProposal, idOfName, componentName, live, outsideId, storeId, holdsWords, PROPOSAL, PROPOSAL_FOLDER, storeName, shapeGaps, ProposedStore, ProposedField, Point, SystemMap, Component, Container, CodeFile, Store, Shape, Field, Holds, Wire, WireKind, ComponentKind, Mismatch, Proposal, ProposedContainer, ProposedComponent, ProposedWire, Progress, ProposalItem, ItemState, DrawnCard, FromDrawing
import { existsSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { buildMap, type Mismatch } from './build.js'
import { checkFiles } from './check.js'
import { measure, PROPOSAL_FOLDER, type Progress } from './proposal.js'
import { live as liveFolder, type Point, type SystemMap } from './schema.js'
import { baseOf, filesAt, pictureAt, pointsIn } from './source.js'

export { pointFor } from './source.js'

export { live, outsideId, storeId } from './schema.js'
export { blankProposal, componentName, idOfName, measure, PROPOSAL, PROPOSAL_FOLDER, shapeGaps, storeName } from './proposal.js'
export { changesAnything, proposalFrom } from './drawn.js'
export { holdsWords } from './shape.js'
export type { DrawnCard, FromDrawing } from './drawn.js'
export type { Mismatch } from './build.js'
export { changeToken, DESIGN, readDesign } from './design.js'
export type { UiBlock, UiOption, UiState } from './blocks.js'
export { RECIPES } from './recipes.js'
export type { Recipe } from './recipes.js'
export type { DesignSystem, Token, TokenGroup, TokenPart, TokenTier } from './design.js'
export type {
  CodeFile,
  Component,
  ComponentKind,
  Container,
  Field,
  Holds,
  Point,
  Shape,
  Store,
  SystemMap,
  Wire,
  WireKind,
} from './schema.js'
export type {
  ItemState,
  Progress,
  Proposal,
  ProposalItem,
  ProposedComponent,
  ProposedContainer,
  ProposedField,
  ProposedStore,
  ProposedWire,
} from './proposal.js'

/** Where a repo's UI tests leave a picture of each page they reach, named
 *  after the page. Not committed, so only the live folder has them. */
const SHOTS = 'codegraph-screenshots'

const KINDS: Record<string, string> = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.gif': 'gif', '.webp': 'webp' }
const asUrl = (bytes: Buffer, name: string): string =>
  `data:image/${KINDS[extname(name).toLowerCase()] ?? 'png'};base64,${bytes.toString('base64')}`

/** A commit never changes, so its map is read once. */
const commits = new Map<string, SystemMap>()

/** A software system's map, read from its repo at one point (ADR 0003). */
export const readMap = async (repo: string, point: Point): Promise<SystemMap> => {
  const kept = point.kind === 'commit' ? commits.get(`${repo}@${point.sha}`) : undefined
  if (kept) return { ...kept, point }

  const map = buildMap(point, await filesAt(repo, point))
  if (point.kind === 'live') {
    const shotOf = (...name: string[]): string => {
      const file = join(repo, SHOTS, ...name)
      return existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : ''
    }
    for (const page of map.components.filter((c) => c.kind === 'page')) page.shot = shotOf(`${page.name}.png`)
    // A UI block's own picture, and one for each of its states (ADR 0024).
    for (const block of map.uiBlocks) {
      block.shot = shotOf('ui-blocks', `${block.name}.png`)
      for (const state of block.states) state.shot = shotOf('ui-blocks', `${block.name}.${state.name}.png`)
    }
  }
  for (const c of map.proposal?.components ?? []) {
    if (!c.mockup || c.gone) continue
    const bytes = await pictureAt(repo, point, `${PROPOSAL_FOLDER}/${c.mockup}`)
    if (bytes) map.mockups[`${c.container}:${c.kind}:${c.name}`] = asUrl(bytes, c.mockup)
  }

  if (point.kind === 'commit') {
    if (commits.size > 40) commits.delete(commits.keys().next().value!)
    commits.set(`${repo}@${point.sha}`, map)
  }
  return map
}

/** Where a person can look: the live folder, its branches, its latest commits. */
export const listPoints = (repo: string): Promise<Point[]> => pointsIn(repo)

/** Every place a repo's code does not fit its tags and config, read at one
 *  point: the live folder unless asked otherwise. */
export const checkRepo = async (repo: string, point: Point = liveFolder): Promise<Mismatch[]> =>
  checkFiles(await filesAt(repo, point), point)

/** How far a repo has got toward the proposal on its branch, held to the
 *  commit it was drawn on; null when there is no proposal. A map already
 *  read can be handed in. */
export const proposalProgress = async (repo: string, map?: SystemMap): Promise<Progress | null> => {
  const now = map ?? (await readMap(repo, liveFolder))
  if (!now.proposal) return null
  const sha = await baseOf(repo, now.proposal.base)
  const base = sha ? await readMap(repo, { kind: 'commit', sha, title: '' }) : null
  return measure(now, now.proposal, base?.setUp ? base : null, (path) => existsSync(join(repo, path)))
}
