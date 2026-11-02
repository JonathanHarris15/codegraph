// codegraph: component codebase-row
import type { CodebaseView } from '../../features/list-projects.js'
import { Badge } from '../design-system/kit.js'

const cloudWords = (
  codebase: CodebaseView,
): { tone: 'plain' | 'good' | 'warn' | 'bad'; words: string } => {
  switch (codebase.cloud) {
    case 'level':
      return { tone: 'good', words: 'level with GitHub' }
    case 'behind':
      return { tone: 'warn', words: `${codebase.behind} behind GitHub` }
    case 'ahead':
      return { tone: 'plain', words: `${codebase.ahead} to push` }
    case 'diverged':
      return { tone: 'warn', words: `${codebase.behind} behind, ${codebase.ahead} to push` }
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

const missingBits = (codebase: CodebaseView): string => {
  const missing: string[] = []
  if (!codebase.toolsOn) missing.push('the plugin is not on in this repo')
  if (!codebase.rulesWritten) missing.push('CLAUDE.md has no codegraph rules')
  if (codebase.taggedFiles === 0) missing.push('no file carries a tag')
  return missing.join('; ')
}

export const CodebaseRow = ({ codebase }: { codebase: CodebaseView }) => {
  const cloud = cloudWords(codebase)
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
        <span style={{ fontWeight: 500 }}>{codebase.name}</span>
        {codebase.branch ? <span className="ds-mono">{codebase.branch}</span> : null}
      </div>
      <div className="ds-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {codebase.setUp ? (
          <Badge tone="good">
            codegraph on · {codebase.taggedFiles}/{codebase.sourceFiles} tagged
          </Badge>
        ) : (
          <span title={missingBits(codebase)}>
            <Badge tone="warn">needs setup</Badge>
          </span>
        )}
        <Badge tone={cloud.tone}>{cloud.words}</Badge>
        {codebase.dirty ? <Badge>uncommitted changes</Badge> : null}
      </div>
      <span className="ds-mono">{codebase.path}</span>
    </div>
  )
}
