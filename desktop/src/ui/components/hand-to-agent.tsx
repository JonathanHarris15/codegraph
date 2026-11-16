// codegraph: component hand-to-agent
import { Bot, Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../design-system/kit.js'

/** What to paste into an agent so it makes a proposal from a project's
 *  sketch and builds it. The words name what the MCP's `propose` tool takes. */
export const sketchPrompt = (sketch: string, project: string): string =>
  `Use codegraph: make a proposal from the sketch “${sketch}”${project ? ` in project ${project}` : ''}, then build it.`

/** What to paste into an agent so it builds the proposal already on a branch. */
export const proposalPrompt = (system: string, branch: string): string =>
  `Use codegraph: build the proposal on the ${branch ? `${branch} branch` : 'branch checked out'} of ${system}.`

/** A button that puts words on the clipboard, and says so for a moment. */
export const CopyButton = ({ text, words = 'Copy', loud = false }: { text: string; words?: string; loud?: boolean }) => {
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
          () => setCopied(true),
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
export const PromptToCopy = ({ prompt, words = 'Copy' }: { prompt: string; words?: string }) => (
  <div className="design-start-ask hand-prompt">
    <code>{prompt}</code>
    <CopyButton text={prompt} words={words} />
  </div>
)

/** The job a sketch is drawn for: handing it to the person's own agent to
 *  build. The app does not run the agent; it gives the words to paste. */
export const HandToAgent = ({
  prompt,
  onSetUp,
  children,
}: {
  /** The words to paste; '' when the sketch cannot be handed over as it is. */
  prompt: string
  /** Opens how to connect an agent, for someone who has not yet. */
  onSetUp?: () => void
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

  return (
    <span ref={box} className="hand-agent">
      <button
        type="button"
        className="ds-button ds-button--loud"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        <Bot size={15} aria-hidden="true" />
        Hand to your agent
      </button>
      {open ? (
        <div className="hand-agent-pop" role="dialog" aria-label="Hand to your agent">
          <div className="hand-agent-title">Hand this sketch to your agent</div>
          {prompt ? (
            <>
              <div className="ds-hint">
                Paste this into your coding agent, in the repo. It turns the sketch into a proposal on a branch of its
                own and builds it. The map shows how far it has got.
              </div>
              <PromptToCopy prompt={prompt} words="Copy" />
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
