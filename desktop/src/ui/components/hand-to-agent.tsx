// codegraph: component hand-to-agent
import { Bot, Check, Copy, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../design-system/kit.js'

/** What to paste into an agent so it makes a proposal from a project's
 *  sketch and builds it. The words name what the MCP's `propose` tool takes. */
export const sketchPrompt = (sketch: string, project: string): string =>
  `Use codegraph: make a proposal from the sketch “${sketch}”${project ? ` in project ${project}` : ''}, then build it.`

/** What to paste into an agent so it builds the proposal already on a branch. */
export const proposalPrompt = (system: string, branch: string): string =>
  `Use codegraph: build the proposal on the ${branch ? `${branch} branch` : 'branch checked out'} of ${system}.`

/** What to paste into an agent so it sets a repo up for a project, or puts
 *  right the one thing setup left. The words name the MCP's `instructions`
 *  topic, so the agent reads how before it starts. */
export const setupPrompt = (
  repo: string,
  folder: string,
  project: string,
  left: 'setup' | 'name' | 'merge' | 'again' = 'setup',
  branch = '',
): string => {
  const where = folder ? `the repo ${repo} at ${folder}` : `the repo ${repo}`
  if (left === 'name') return `Use codegraph: add project ${project} to the projects in the codegraph.config.json of ${where}.`
  if (left === 'merge')
    return `Use codegraph: ${where} is set up on ${branch || 'a branch'} but not on its main line. Check it with \`check\`, then merge it.`
  if (left === 'again')
    return `Use codegraph: ${where} was set up by an older codegraph. Set it up again for project ${project}, which brings it up to date (call instructions with topic setup first).`
  return `Use codegraph: set up ${where} for project ${project} (call instructions with topic setup first).`
}

/** Words copied for an agent, and nothing come of them yet: the normal
 *  button, with a beating dot to carry the wait. A click copies them again. */
export const WaitingButton = ({ text, title }: { text: string; title: string }) => (
  <button
    type="button"
    className="ds-button hand-agent-waiting"
    title={title}
    onClick={() => void navigator.clipboard.writeText(text).catch(() => undefined)}
  >
    <span className="map-agent-dot" aria-hidden="true" />
    Waiting for your agent…
  </button>
)

/** A button that puts words on the clipboard, and says so for a moment. */
export const CopyButton = ({
  text,
  words = 'Copy',
  loud = false,
  onCopied,
}: {
  text: string
  words?: string
  loud?: boolean
  /** Told once the words are on the clipboard. */
  onCopied?: () => void
}) => {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const back = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(back)
  }, [copied])
  return (
    <Button
      look={loud ? 'loud' : 'normal'}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true)
            onCopied?.()
          },
          () => setCopied(false),
        )
      }}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {copied ? 'Copied' : words}
    </Button>
  )
}

/** The words to paste, set apart, with the button that copies them. */
export const PromptToCopy = ({ prompt, words = 'Copy', onCopied }: { prompt: string; words?: string; onCopied?: () => void }) => (
  <div className="design-start-ask hand-prompt">
    <code>{prompt}</code>
    <CopyButton text={prompt} words={words} {...(onCopied ? { onCopied } : {})} />
  </div>
)

/** How a handed-over sketch stands, once the app can tell: the proposal made
 *  from it and how far it is built, which goes to it on the map. */
export type HandedOver = { words: string; built: number; of: number; onGo: () => void }

/** The job a sketch is drawn for: handing it to the person's own agent to
 *  build. The app does not run the agent; it gives the words to paste. Once
 *  copied the button says it is waiting, and once a proposal comes of it the
 *  button becomes that proposal, so the hand-off leaves a trace. */
export const HandToAgent = ({
  prompt,
  onSetUp,
  waiting = false,
  onCopied,
  handed = null,
  children,
}: {
  /** The words to paste; '' when the sketch cannot be handed over as it is. */
  prompt: string
  /** Opens how to connect an agent, for someone who has not yet. */
  onSetUp?: () => void
  /** The words have been copied and nothing has come of them yet. */
  waiting?: boolean
  onCopied?: () => void
  /** The proposal made from it, once there is one. */
  handed?: HandedOver | null
  /** Said instead of the prompt when there is none. */
  children?: ReactNode
}) => {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)

  // A click anywhere else, or Escape, shuts it.
  useEffect(() => {
    if (!open) return
    const away = (event: PointerEvent): void => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', key)
    }
  }, [open])

  if (handed)
    return (
      <button
        type="button"
        className={handed.of > 0 && handed.built === handed.of ? 'map-proposal map-proposal--built' : 'map-proposal'}
        title="Go to it on the map"
        onClick={handed.onGo}
      >
        <span>{handed.words}</span>
        <span className="map-proposal-meter" aria-hidden="true">
          <span style={{ width: `${handed.of ? (handed.built / handed.of) * 100 : 100}%` }} />
        </span>
        <span>
          {handed.built} of {handed.of} built
        </span>
      </button>
    )

  return (
    <span ref={box} className="hand-agent">
      <button
        type="button"
        className={waiting ? 'ds-button hand-agent-waiting' : 'ds-button ds-button--loud'}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={waiting ? 'Copied. Once your agent makes a proposal from this sketch, it shows here.' : undefined}
        onClick={() => setOpen(!open)}
      >
        {waiting ? <span className="map-agent-dot" aria-hidden="true" /> : <Bot size={15} aria-hidden="true" />}
        {waiting ? 'Waiting for your agent…' : 'Hand to your agent'}
      </button>
      {open ? (
        <div className="hand-agent-pop" role="dialog" aria-label="Hand to your agent">
          <div className="hand-agent-head">
            <div className="hand-agent-title">Hand this sketch to your agent</div>
            <button type="button" className="ds-sheet-close" aria-label="Close" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </div>
          {prompt ? (
            <>
              <div className="ds-hint">
                Paste this into your coding agent, in the repo. It turns the sketch into a proposal on a branch of its
                own and builds it. The map shows how far it has got.
              </div>
              <PromptToCopy prompt={prompt} words="Copy" {...(onCopied ? { onCopied } : {})} />
            </>
          ) : (
            children
          )}
          {onSetUp ? (
            <div className="hand-agent-foot">
              <span className="ds-hint">Agent not connected yet?</span>
              <Button
                look="bare"
                onClick={() => {
                  setOpen(false)
                  onSetUp()
                }}
              >
                Connect your agent
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </span>
  )
}
