// codegraph: test ui design system
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Prose } from '../src/ui/design-system/prose.js'

const shown = (text: string): string => renderToStaticMarkup(createElement(Prose, { text }))

describe('words a person wrote in Markdown, shown as they read', () => {
  it('keeps paragraphs apart, and lines within one together', () => {
    expect(shown('One thought\nstill going.\n\nAnother.')).toBe('<div class="ds-prose"><p>One thought still going.</p><p>Another.</p></div>')
  })

  it('makes bold, italic and code of their marks', () => {
    expect(shown('**Outfits** are made by *the stylist*, see `outfit.ts`.')).toBe(
      '<div class="ds-prose"><p><strong>Outfits</strong> are made by <em>the stylist</em>, see <code>outfit.ts</code>.</p></div>',
    )
  })

  it('shows a list as a list, and a heading as a heading', () => {
    expect(shown('Rules:\n- **Not deterministic.** Ask again.\n- One per slot\n  and layer.\n\n### Amendment, Nov 23\nWas: one.')).toBe(
      '<div class="ds-prose"><p>Rules:</p><ul><li><strong>Not deterministic.</strong> Ask again.</li><li>One per slot and layer.</li></ul><h4>Amendment, Nov 23</h4><p>Was: one.</p></div>',
    )
  })

  it('numbers a numbered list', () => {
    expect(shown('1. First\n2. Second')).toBe('<div class="ds-prose"><ol><li>First</li><li>Second</li></ol></div>')
  })

  it('keeps a code block as it was typed', () => {
    expect(shown('```ts\nconst a = **1**\n```')).toBe('<div class="ds-prose"><pre><code>const a = **1**</code></pre></div>')
  })

  it('shows a link as its words, and markup as plain text', () => {
    expect(shown('See [the plan](https://example.com) and <b>this</b>.')).toBe('<div class="ds-prose"><p>See the plan and &lt;b&gt;this&lt;/b&gt;.</p></div>')
  })

  it('leaves a lone star or underscore alone', () => {
    expect(shown('2 * 3 and snake_case_name')).toBe('<div class="ds-prose"><p>2 * 3 and snake_case_name</p></div>')
  })
})
