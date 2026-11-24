// codegraph: feature borrow-term in agent
// codegraph: uses projects, reader, repo, machine
// codegraph: command borrow
import { sameFolder } from '../modules/machine/index.js'
import { listProjects } from '../modules/projects/index.js'
import { borrowTerm, live, readMap, termFileFor } from '../modules/reader/index.js'
import { fileAtHead, headOf, writeWorkingFile } from '../modules/repo/index.js'

/** Copies a term another repo of the project defines into this repo, pinned
 *  to the commit it was taken at, so this repo's code is held to the same word
 *  (ADR 0036). Says what it did, or why it did nothing, for the agent. */
export const borrow = async (repo: string, name: string, from = ''): Promise<string> => {
  const projects = listProjects().filter((p) => p.systems.some((s) => s.path && sameFolder(s.path, repo)))
  if (!projects.length)
    return 'This folder is not linked to a project on this computer, so codegraph cannot tell which repos it may borrow from. Call `link` first.'

  const here = (await readMap(repo, live)).ontology.terms.find((t) => t.name.toLowerCase() === name.toLowerCase())
  if (here && !here.borrowed)
    return `${here.name} is defined in this repo too. Decide with the person which repo defines it, then take it out of the other and borrow it there.`

  const others = projects.flatMap((p) => p.systems.filter((s) => s.path && !sameFolder(s.path, repo)))
  const address = (s: (typeof others)[number]): string => s.remote || s.name
  const wanted = others.filter((s) => !from || address(s).toLowerCase() === from.toLowerCase() || s.name.toLowerCase() === from.toLowerCase())
  const defining = (
    await Promise.all(
      wanted.map(async (system) => ({
        system,
        term: (await readMap(system.path, live)).ontology.terms.find((t) => !t.borrowed && t.name.toLowerCase() === name.toLowerCase()),
      })),
    )
  ).filter((d) => d.term)

  if (!defining.length)
    return `No repo of ${projects.map((p) => p.name).join(' or ')} on this computer defines ${name}. Read: ${wanted.map(address).join(', ') || 'none'}.`
  if (defining.length > 1)
    return `${name} is defined in ${defining.map((d) => address(d.system)).join(' and ')}. Say which with \`from\`, and tell the person: one of them should borrow it from the other.`

  const { system, term } = defining[0]!
  const text = await fileAtHead(system.path, term!.file)
  if (!text)
    return `${term!.name} in ${address(system)} is not committed yet. Commit it there first, so the copy can say which commit it came from.`
  const commit = (await headOf(system.path)).slice(0, 7)
  const file = here?.file ?? termFileFor(term!.name)
  writeWorkingFile(repo, file, borrowTerm(text, address(system), commit))
  return `Borrowed ${term!.name} from ${address(system)} at ${commit} into ${file}. Commit it with the change that uses it.`
}
