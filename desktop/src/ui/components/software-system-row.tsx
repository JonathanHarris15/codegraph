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

const missingBits = (system: SoftwareSystemView): string => {
  const missing: string[] = []
  if (!system.toolsOn) missing.push('the plugin is not on in this repo')
  if (!system.rulesWritten) missing.push('CLAUDE.md has no codegraph rules')
  if (system.toolsOn && system.rulesWritten) missing.push('no file carries a tag')
  const on = system.mainLine || 'the main line'
  return `On ${on}: ${missing.join('; ')}`
}

const SetupBadge = ({ system }: { system: SoftwareSystemView }) => {
  if (system.setUp)
    return (
      <Badge tone="good">
        codegraph on · {system.taggedFiles}/{system.sourceFiles} tagged
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

export const SoftwareSystemRow = ({ system }: { system: SoftwareSystemView }) => {
  const cloud = cloudWords(system)
  return (
    <div
      style={{
        borderTop: '1px solid var(--edge)',
        paddingTop: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div className="ds-row" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 500 }}>{system.name}</span>
        {system.branch ? <span className="ds-mono">{system.branch}</span> : null}
      </div>
      <div className="ds-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        <SetupBadge system={system} />
        <Badge tone={cloud.tone}>{cloud.words}</Badge>
        {system.dirty ? <Badge>uncommitted changes</Badge> : null}
      </div>
      <span className="ds-mono">{system.path}</span>
    </div>
  )
}
