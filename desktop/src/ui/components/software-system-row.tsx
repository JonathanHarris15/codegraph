// codegraph: component software-system-row
import type { SoftwareSystemView } from '../../features/list-projects.js'
import type { Point } from '../../modules/reader/index.js'
import { useEffect, useState } from 'react'
import { Badge } from '../design-system/kit.js'
import { BranchPicker } from './branch-picker.js'
import { CopyButton, setupPrompt, WaitingButton } from './hand-to-agent.js'

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
    case 'not-here':
      return { tone: 'plain', words: 'no working copy here' }
  }
}

const missingBits = (system: SoftwareSystemView): string =>
  `${system.mainLine || 'The main line'} has no codegraph.config.json yet. Ask your agent to set this repo up with codegraph.`

const SetupBadge = ({ system, project }: { system: SoftwareSystemView; project: string }) => {
  if (!system.path) return null
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

/** What is left before the repo is set up for this project, if anything. */
const leftToDo = (system: SoftwareSystemView): 'setup' | 'name' | 'merge' | '' =>
  !system.path ? '' : system.setUp ? (system.namesThisProject ? '' : 'name') : system.setUpHere ? 'merge' : 'setup'

/** The hand-off for setup: the words for the person's agent, and once they
 *  are copied, a wait that lasts until the row's state moves on. */
const SetupHandOff = ({ system, project }: { system: SoftwareSystemView; project: string }) => {
  const left = leftToDo(system)
  const [waitingOn, setWaitingOn] = useState('')
  // A new state is the agent's answer: the wait ends with it.
  useEffect(() => {
    if (waitingOn && waitingOn !== left) setWaitingOn('')
  }, [left, waitingOn])
  if (!left) return null
  const prompt = setupPrompt(system.name, system.path, project, left, system.branch)
  return (
    <div className="project-repo-handoff">
      {waitingOn === left ? (
        <WaitingButton
          text={prompt}
          title="Copied. Paste it into your coding agent; this row changes once it is done. Click to copy again."
        />
      ) : (
        <CopyButton text={prompt} words="Copy setup prompt" onCopied={() => setWaitingOn(left)} />
      )}
    </div>
  )
}

/** A folder's path cut to its last two parts, the ones a person knows it by. */
const shortPath = (path: string): string => {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : path
}

export const SoftwareSystemRow = ({
  system,
  project,
  onChoose,
}: {
  system: SoftwareSystemView
  project: string
  /** A person picked the branch the map opens on. */
  onChoose: (point: Point) => void
}) => {
  const cloud = cloudWords(system)
  return (
    <div className="project-repo">
      <div className="ds-row" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 500 }}>{system.name}</span>
        {system.tracked ? (
          <BranchPicker system={system.name} points={system.branches} point={system.point} onPick={onChoose} compact />
        ) : null}
      </div>
      <div className="ds-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        <SetupBadge system={system} project={project} />
        <Badge tone={cloud.tone}>{cloud.words}</Badge>
        {system.dirty ? <Badge>uncommitted changes</Badge> : null}
      </div>
      {system.path && system.setUp && !system.namesThisProject ? (
        <span className="project-repo-hint">
          Add <span className="ds-mono">{project}</span> to the projects in its codegraph.config.json, or hand it to your agent.
        </span>
      ) : system.path && !system.setUp && system.setUpHere ? (
        <span className="project-repo-hint">
          Set up on {system.branch} only. Merge it into {system.mainLine || 'the main line'} and the repo is set up.
        </span>
      ) : system.path && !system.setUp ? (
        <span className="project-repo-hint">
          No <span className="ds-mono">codegraph.config.json</span> on {system.mainLine || 'the main line'} yet. Your
          agent sets it up: copy the words below and paste them into it.
        </span>
      ) : null}
      <SetupHandOff system={system} project={project} />
      {system.path ? (
        <span className="project-repo-path" title={system.path}>
          {shortPath(system.path)}
        </span>
      ) : null}
    </div>
  )
}
