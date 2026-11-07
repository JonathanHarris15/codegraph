// codegraph: feature list-my-sketches in workspace
// codegraph: uses sketches, members
import { whoIsIn } from '../modules/members/index.js'
import { listSketches, LOOSE, readSketch, SHARED_WITH_ME, type Sketch } from '../modules/sketches/index.js'

export type LooseListed = Pick<Sketch, 'id' | 'name' | 'createdAt' | 'updatedAt' | 'from' | 'projectId'> & {
  /** Someone else's: it needs a connection to open, unless copied. */
  theirs: boolean
  /** Who owns it, if it is shared. */
  owner: string
  /** How many others it is shared with. */
  sharedWith: number
  role: 'owner' | 'collaborator' | 'viewer'
}

/** A member's own sketch library, outside any project, and what others have
 *  shared with them. */
export const listMySketches = async (): Promise<LooseListed[]> => {
  const me = whoIsIn()
  const of = (projectId: string, theirs: boolean): LooseListed[] =>
    listSketches(projectId).flatMap((listed) => {
      const sketch = readSketch(projectId, listed.id)
      if (!sketch) return []
      const members = sketch.members ?? []
      return [
        {
          ...listed,
          projectId,
          theirs,
          owner: members.find((m) => m.role === 'owner')?.name ?? '',
          sharedWith: Math.max(0, members.length - 1),
          role: (theirs ? (members.find((m) => m.id === me?.id)?.role ?? 'viewer') : 'owner') as LooseListed['role'],
        },
      ]
    })
  return [...of(LOOSE, false), ...(me ? of(SHARED_WITH_ME, true) : [])]
}
