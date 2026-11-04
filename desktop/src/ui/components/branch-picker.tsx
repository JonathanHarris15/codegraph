// codegraph: component branch-picker
import { ArrowDown, ArrowUp, ChevronDown, Cloud, GitBranch, GitCommitHorizontal, Laptop } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Point } from '../../modules/reader/index.js'

type BranchPoint = Extract<Point, { kind: 'branch' }>

const keyOf = (point: Point): string =>
  point.kind === 'live' ? 'live' : point.kind === 'branch' ? `branch:${point.name}` : `commit:${point.sha}`

/** Where a branch is: on this computer, on GitHub, or both. */
const Where = ({ branch }: { branch: BranchPoint }) =>
  branch.where === 'cloud' ? (
    <span className="map-branch-where" title="Only on GitHub">
      <Cloud size={12} aria-hidden="true" /> cloud
    </span>
  ) : branch.where === 'both' ? (
    <span className="map-branch-where" title="On this computer and on GitHub">
      <Laptop size={12} aria-hidden="true" /> <Cloud size={12} aria-hidden="true" /> local and cloud
    </span>
  ) : branch.where === 'local' ? (
    <span className="map-branch-where" title="Only on this computer">
      <Laptop size={12} aria-hidden="true" /> local
    </span>
  ) : null

/** How far a branch here is from its copy on GitHub; nothing when level. */
const Apart = ({ branch }: { branch: BranchPoint }) =>
  branch.ahead || branch.behind ? (
    <span className="map-branch-apart">
      {branch.ahead ? (
        <span title={`${branch.ahead} commit${branch.ahead === 1 ? '' : 's'} here that GitHub has not got`}>
          <ArrowUp size={11} aria-hidden="true" />
          {branch.ahead} ahead
        </span>
      ) : null}
      {branch.behind ? (
        <span title={`${branch.behind} commit${branch.behind === 1 ? '' : 's'} on GitHub not here yet`}>
          <ArrowDown size={11} aria-hidden="true" />
          {branch.behind} behind
        </span>
      ) : null}
    </span>
  ) : branch.where === 'both' ? (
    <span className="map-branch-apart map-branch-apart--level">level</span>
  ) : null

/** The branch a software system's map is read from, in the bar, and a menu
 *  of its branches: where each is, how far it is from GitHub, and which is
 *  checked out. The checked-out one is read from the folder, with what is
 *  not committed; any other is read from git, leaving the folder alone
 *  (ADR 0003). Older commits are a step further down. */
export const BranchPicker = ({
  system,
  points,
  point,
  onPick,
}: {
  system: string
  points: Point[]
  point: Point
  onPick: (point: Point) => void
}) => {
  const [open, setOpen] = useState(false)
  const [older, setOlder] = useState(false)
  const box = useRef<HTMLSpanElement>(null)

  // A click anywhere else, or Escape, shuts the menu.
  useEffect(() => {
    if (!open) return
    const away = (event: MouseEvent): void => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const keys = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', keys)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', keys)
    }
  }, [open])

  const live = points.find((p): p is Extract<Point, { kind: 'live' }> => p.kind === 'live')
  const branches = points.filter((p): p is BranchPoint => p.kind === 'branch')
  const commits = points.filter((p): p is Extract<Point, { kind: 'commit' }> => p.kind === 'commit')
  const checkedOut = live?.branch ?? ''
  const showing = point.kind === 'live' ? branches.find((b) => b.current) : point.kind === 'branch' ? branches.find((b) => b.name === point.name) : undefined

  const pick = (one: Point): void => {
    onPick(one)
    setOpen(false)
  }

  return (
    <span className="sketch-menu" ref={box}>
      <button
        type="button"
        className="map-branch"
        aria-label={`Branch of ${system}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {point.kind === 'commit' ? <GitCommitHorizontal size={14} aria-hidden="true" /> : <GitBranch size={14} aria-hidden="true" />}
        <span className="map-branch-name">
          {point.kind === 'live' ? checkedOut || 'this folder' : point.kind === 'branch' ? point.name : point.sha.slice(0, 7)}
        </span>
        {point.kind === 'commit' ? <span className="map-picker-title">{point.title}</span> : null}
        {point.kind !== 'live' ? <span className="map-branch-note">not checked out</span> : null}
        {showing ? <Apart branch={showing} /> : null}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open ? (
        <div className="map-branch-menu" role="menu" aria-label={`Branches of ${system}`}>
          <div className="map-flyout-group">Branches of {system}</div>
          {branches.map((branch) => {
            const here = branch.current
            const chosen = here ? point.kind === 'live' : keyOf(point) === keyOf(branch)
            return (
              <button
                key={branch.name}
                type="button"
                role="menuitemradio"
                aria-checked={chosen}
                className={chosen ? 'map-branch-row map-branch-row--on' : 'map-branch-row'}
                onClick={() => pick(here ? (live ?? { kind: 'live' }) : branch)}
              >
                <span className="map-branch-row-name">
                  <GitBranch size={13} aria-hidden="true" />
                  {branch.name}
                  {here ? <span className="map-branch-here">checked out</span> : null}
                </span>
                <span className="map-branch-row-facts">
                  <Where branch={branch} />
                  <Apart branch={branch} />
                </span>
              </button>
            )
          })}
          {branches.length === 0 ? (
            <button type="button" className="map-branch-row" onClick={() => pick({ kind: 'live' })}>
              <span className="map-branch-row-name">This folder</span>
            </button>
          ) : null}
          {commits.length ? (
            <>
              <button type="button" className="map-branch-older" aria-expanded={older} onClick={() => setOlder(!older)}>
                {older ? 'Hide earlier commits' : `Earlier commits on ${checkedOut || 'this branch'}`}
              </button>
              {older
                ? commits.map((c) => (
                    <button key={c.sha} type="button" className="map-branch-row" onClick={() => pick(c)}>
                      <span className="map-branch-row-name">
                        <GitCommitHorizontal size={13} aria-hidden="true" />
                        <span className="ds-mono">{c.sha.slice(0, 7)}</span>
                      </span>
                      <span className="map-branch-row-facts">{c.title}</span>
                    </button>
                  ))
                : null}
            </>
          ) : null}
          <div className="map-branch-foot">
            The checked-out branch shows what is not committed yet. Any other is read from git; your folder stays as it is.
          </div>
        </div>
      ) : null}
    </span>
  )
}
