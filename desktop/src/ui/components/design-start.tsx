// codegraph: component design-start
import { useState } from 'react'
import { Button } from '../design-system/kit.js'

/** The words a person can hand their agent to set the whole thing up. */
const ASK = 'Set up the design system for codegraph.'

/** What is missing, and how to start it, for one part of a design system or
 *  for all of it (ADR 0024). The design page is never just empty: it always
 *  says what to do next. */
export const DesignStart = ({ part }: { part: 'all' | 'tokens' | 'blocks' | 'recipes' }) => {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(ASK)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  const missing = {
    all: 'This software system has no design system yet.',
    tokens: 'This repo has no DESIGN.md yet, so there are no tokens to show.',
    blocks: 'No UI blocks are named in this repo yet.',
    recipes: 'This repo has no recipes yet.',
  }[part]
  return (
    <div className="design-body">
      <div className="design-groups">
        <section className="design-start" aria-label="How to start the design system">
          <h3 className="design-title">{missing}</h3>
          <p className="design-start-why">
            A design system is three things codegraph shows here: the tokens in <code>DESIGN.md</code> (every colour,
            space, corner and type style), the UI blocks pages are built from, and the recipes that say how each kind of
            page is laid out.
          </p>

          <div className="design-start-way">
            <span className="ds-label">The quick way: ask your agent</span>
            <div className="design-start-ask">
              <code>{ASK}</code>
              <Button onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</Button>
            </div>
            <p className="ds-hint">
              It reads codegraph&rsquo;s <code>design-system</code> instructions and does it all on a branch: tokens from
              the values the app really uses, its UI blocks and their states, its recipes, and the page the live view
              opens. It records how the app looks now, and changes nothing anyone sees.
            </p>
          </div>

          <div className="design-start-way">
            <span className="ds-label">Or start it yourself</span>
            <ol className="design-start-steps">
              {part === 'all' || part === 'tokens' ? (
                <li>
                  Put a <code>DESIGN.md</code> at the root of the repo, its tokens in yaml at the top:
                  <pre className="recipe-skeleton">{`---\nname: My app\ncolors:\n  ink: "#1c1a17"\nspacing:\n  md: 16px\nrounded:\n  md: 8px\n---`}</pre>
                </li>
              ) : null}
              {part === 'all' || part === 'blocks' ? (
                <li>
                  Name a UI block with a tag in its file, beside the file&rsquo;s own tag:{' '}
                  <code>{'// codegraph: ui block forms/DatePicker'}</code>
                </li>
              ) : null}
              {part === 'all' || part === 'recipes' ? (
                <li>
                  Write a recipe as a Markdown file in <code>recipes/</code>, and say on each page that follows it:{' '}
                  <code>{'// codegraph: page account at /account follows settings-page'}</code>
                </li>
              ) : null}
            </ol>
            <p className="ds-hint">This page fills in as soon as the files are saved.</p>
          </div>
        </section>
      </div>
    </div>
  )
}
