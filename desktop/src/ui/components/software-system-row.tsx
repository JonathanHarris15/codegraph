// codegraph: component software-system-row
import type { SoftwareSystemView } from '../../features/list-projects.js'
import { Badge } from '../design-system/kit.js'

const cloudWords = (
  system: SoftwareSystemView,
): { tone: 'plain' | 'good' | 'warn' | 'bad'; words: string } => {
  switch (system.cloud) {
    case 'level':
      return { tone: 'good', words: 'level with GitHub' }
    case 'behind':
      return { tone: 'warn', words: `${system.behind} behind GitHub` }
    case 'ahead':
      return { tone: 'plain', words: `${system.ahead} to push` }
    case 'diverged':
      return { tone: 'warn', words: `${system.behind} behind, ${system.ahead} to push` }
    case 'no-upstream':
      return { tone: 'plain', words: 'branch not on GitHub yet' }
    case 'no-remote':
      return { tone: 'plain', words: 'no GitHub copy' }
    case 'untracked':
      return { tone: 'bad', words: 'not tracked by git' }
    case 'missing':
      return { tone: 'bad', words: 'folder not found' }
  }
}

const missingBits = (system: SoftwareSystemView): string =>
  `${system.mainLine || 'The main line'} has no codegraph.config.json yet. Ask your agent to set this repo up with codegraph.`

const SetupBadge = ({ system, project }: { system: SoftwareSystemView; project: string }) => {
  if (system.setUp && !system.namesThisProject)
    return (
      <span
        title={`Its codegraph.config.json does not list "${project}" in its projects. Add it there, so the repo says it serves this project.`}
      >
        <Badge tone="warn">does not name this project</Badge>
      </span>
    )
  if (system.setUp)
    return (
      <Badge tone="good">
        set up · {system.taggedFiles}/{system.sourceFiles} tagged
      </Badge>
    )
  if (system.setUpHere)
    return (
      <span
        title={`Codegraph is on in ${system.branch} but not yet on ${
          system.mainLine || 'the main line'
        }. Merge it and the repo is set up.`}
      >
        <Badge tone="warn">set up on this branch only</Badge>
      </span>
    )
  return (
    <span title={missingBits(system)}>
      <Badge tone="warn">needs setup</Badge>
    </span>
  )
}

export const SoftwareSystemRow = ({ system, project }: { system: SoftwareSystemView; project: string }) => {
  const cloud = cloudWords(system)
  return (
    <div className="project-repo">
      <div className="ds-row" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 500 }}>{system.name}</span>
        {system.branch ? <span className="ds-mono">{system.branch}</span> : null}
      </div>
      <div className="ds-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        <SetupBadge system={system} project={project} />
        <Badge tone={cloud.tone}>{cloud.words}</Badge>
        {system.dirty ? <Badge>uncommitted changes</Badge> : null}
      </div>
      <span className="ds-mono">{system.path}</span>
    </div>
  )
}
