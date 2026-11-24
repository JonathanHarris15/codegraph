// codegraph: component software-system-row
import type { SoftwareSystemView } from '../../features/list-projects.js'
import type { Point } from '../../modules/reader/index.js'
import { MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge, Button } from '../design-system/kit.js'
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

/** codegraph's skills in this repo (ADR 0037), said only when something needs doing. */
const SkillsBadge = ({ system }: { system: SoftwareSystemView }) => {
  if (!system.present || !system.setUp) return null
  if (system.skills.behind)
    return (
      <span title="The codegraph skills installed on this computer are older than this app. Run claude plugin update codegraph-app@codegraph in a terminal, then start a new session.">
        <Badge tone="warn">skills {system.skills.installed} · update</Badge>
      </span>
    )
  if (system.skills.on && !system.skills.installed)
    return (
      <span title="This repo turns codegraph's skills on for everyone on it, but they are not installed on this computer. Run claude plugin install codegraph-app@codegraph --scope project in the repo once.">
        <Badge tone="warn">skills not installed here</Badge>
      </span>
    )
  return null
}

const SetupBadge = ({ system, project }: { system: SoftwareSystemView; project: string }) => {
  if (!system.present) return null
  if (system.setUp && !system.namesThisProject)
    return (
      <span
        title={`Its codegraph.config.json does not list "${project}" in its projects. Add it there, so the repo says it serves this project.`}
      >
        <Badge tone="warn">does not name this project</Badge>
      </span>
    )
  if (system.setUp && system.setup.behind)
    return (
      <span title={olderSetup(system)}>
        <Badge tone="warn">set up by an older codegraph</Badge>
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

/** What hovering a repo set up by an older codegraph says (ADR 0039). */
const olderSetup = (system: SoftwareSystemView): string =>
  [
    system.setup.version ? `Set up by codegraph's setup ${system.setup.version}, and this app's is newer.` : 'Set up before codegraph said which setup a repo got.',
    system.setup.leftOver.length ? `Still has ${system.setup.leftOver.join(', ')}.` : '',
    'Copy the setup prompt for your agent to set it up again.',
  ]
    .filter(Boolean)
    .join(' ')

/** What is left before the repo is set up for this project, if anything. */
const leftToDo = (system: SoftwareSystemView): 'setup' | 'name' | 'merge' | 'again' | '' =>
  !system.present
    ? ''
    : system.setUp
      ? !system.namesThisProject
        ? 'name'
        : system.setup.behind
          ? 'again'
          : ''
      : system.setUpHere
        ? 'merge'
        : 'setup'

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

/** What a row with no working copy here asks for: link the one found beside
 *  the project's other repos, or pick one, or clone one. */
const NoWorkingCopy = ({
  system,
  busy,
  onLink,
  onClone,
}: {
  system: SoftwareSystemView
  busy: '' | 'link' | 'clone'
  onLink: (path?: string) => void
  onClone: () => void
}) => (
  <>
    <span className="project-repo-hint">
      {system.found ? (
        <>
          Found a working copy beside the project's other repos, at{' '}
          <span className="ds-mono" title={system.found}>
            {shortPath(system.found)}
          </span>
          .
        </>
      ) : system.path ? (
        <>Its folder is not where it was. Pick where it is now, or clone it again.</>
      ) : (
        <>Linked on another computer. Pick its folder here, or clone it.</>
      )}
    </span>
    <div className="project-repo-handoff ds-row" style={{ gap: 6 }}>
      {system.found ? (
        <Button look="loud" disabled={busy !== ''} onClick={() => onLink(system.found)}>
          {busy === 'link' ? 'Linking…' : 'Link it'}
        </Button>
      ) : null}
      <Button disabled={busy !== ''} onClick={() => onLink()}>
        {busy === 'link' && !system.found ? 'Linking…' : system.found ? 'Pick another…' : 'Link folder…'}
      </Button>
      {system.remote ? (
        <Button disabled={busy !== ''} onClick={onClone}>
          {busy === 'clone' ? 'Cloning…' : 'Clone here…'}
        </Button>
      ) : null}
    </div>
  </>
)

export const SoftwareSystemRow = ({
  system,
  project,
  onChoose,
  busy = '',
  onLink,
  onClone,
  onMore,
}: {
  system: SoftwareSystemView
  project: string
  /** A person picked the branch the map opens on. */
  onChoose: (point: Point) => void
  /** What the row is doing for the person right now. */
  busy?: '' | 'link' | 'clone'
  /** Link a folder as its working copy: the one given, or one picked. */
  onLink: (path?: string) => void
  onClone: () => void
  /** Opens what is done to this repo, under the button given; left out when
   *  there is nothing. */
  onMore?: (button: HTMLButtonElement) => void
}) => {
  const cloud = cloudWords(system)
  const more = useRef<HTMLButtonElement>(null)
  return (
    <div className="project-repo">
      <div className="ds-row" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 500 }}>{system.name}</span>
        <div className="ds-row" style={{ gap: 4 }}>
          {system.tracked ? (
            <BranchPicker system={system.name} points={system.branches} point={system.point} onPick={onChoose} compact />
          ) : null}
          {onMore ? (
            <button
              ref={more}
              type="button"
              className="project-repo-more"
              aria-label={`More for ${system.name}`}
              aria-haspopup="menu"
              onClick={() => more.current && onMore(more.current)}
            >
              <MoreHorizontal size={15} />
            </button>
          ) : null}
        </div>
      </div>
      <div className="ds-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        <SetupBadge system={system} project={project} />
        <SkillsBadge system={system} />
        <Badge tone={cloud.tone}>{cloud.words}</Badge>
        {system.dirty ? <Badge>uncommitted changes</Badge> : null}
      </div>
      {!system.present ? (
        <NoWorkingCopy system={system} busy={busy} onLink={onLink} onClone={onClone} />
      ) : system.path && system.setUp && !system.namesThisProject ? (
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
      {system.present ? <SetupHandOff system={system} project={project} /> : null}
      {system.path ? (
        <span className="project-repo-path" title={system.path}>
          {shortPath(system.path)}
        </span>
      ) : null}
    </div>
  )
}
