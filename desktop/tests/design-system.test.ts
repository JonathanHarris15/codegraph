// codegraph: test module reader
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { live, readMap, type DesignSystem, type Token } from '../src/modules/reader/index.js'
import { aMappedRepo, closeYard, git, openYard, type Yard } from './yard.js'

let yard: Yard
let repo = ''
let design: DesignSystem

const DESIGN = `---
version: alpha
name: Daylight
description: Calm neutrals and one accent.
colors:
  blue-500: "#2563eb"
  ink: "#1a1c1e"
  paper: "#ffffff"
  action: "{colors.blue-500}"
typography:
  body-md:
    fontFamily: Public Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
rounded:
  md: 8px
---

# Daylight

## Overview

Quiet, so the work stands out.

## Layout

An 8px rhythm throughout.

\`\`\`yaml
spacing:
  sm: 8px
  md: 16px
\`\`\`

## Components

\`\`\`yaml
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: 12px
\`\`\`
`

const token = (id: string): Token | undefined => design.tokens.find((t) => t.id === id)

beforeAll(async () => {
  yard = openYard('design-system')
  repo = aMappedRepo(yard)
  writeFileSync(join(repo, 'DESIGN.md'), DESIGN)
  design = (await readMap(repo, live)).design!
})

afterAll(() => closeYard(yard))

describe('reading a DESIGN.md', () => {
  it('reads its name and what it says it is', () => {
    expect(design.name).toBe('Daylight')
    expect(design.description).toBe('Calm neutrals and one accent.')
    expect(design.problems).toEqual([])
  })

  it('reads tokens from the front matter and from yaml blocks in the sections', () => {
    expect(design.tokens.map((t) => t.id)).toEqual([
      'colors.blue-500',
      'colors.ink',
      'colors.paper',
      'colors.action',
      'typography.body-md',
      'rounded.md',
      'spacing.sm',
      'spacing.md',
      'components.button-primary',
    ])
  })

  it('tells each token its tier from how it is written', () => {
    expect(token('colors.blue-500')?.tier).toBe('raw')
    expect(token('colors.action')?.tier).toBe('purpose')
    expect(token('components.button-primary')?.tier).toBe('block')
    expect(token('typography.body-md')?.tier).toBe('raw')
  })

  it('follows every name through to the value it comes to', () => {
    expect(token('colors.action')).toMatchObject({ written: '{colors.blue-500}', value: '#2563eb', names: ['colors.blue-500'] })
    const button = token('components.button-primary')!
    expect(button.parts).toEqual([
      { name: 'backgroundColor', written: '{colors.action}', value: '#2563eb' },
      { name: 'textColor', written: '{colors.paper}', value: '#ffffff' },
      { name: 'rounded', written: '{rounded.md}', value: '8px' },
      { name: 'padding', written: '12px', value: '12px' },
    ])
    expect(button.names).toEqual(['colors.action', 'colors.paper', 'rounded.md'])
  })

  it('says which tokens name each one, so a raw value shows everything it feeds', () => {
    expect(token('colors.blue-500')?.namedBy).toEqual(['colors.action'])
    expect(token('colors.action')?.namedBy).toEqual(['components.button-primary'])
    expect(token('colors.ink')?.namedBy).toEqual([])
  })

  it('says everything a token feeds, through every token between', () => {
    expect(token('colors.blue-500')?.feeds).toEqual(['colors.action', 'components.button-primary'])
    expect(token('rounded.md')?.feeds).toEqual(['components.button-primary'])
    expect(token('components.button-primary')?.feeds).toEqual([])
  })

  it('measures how well a UI block token’s text reads on its background', () => {
    // #ffffff on #2563eb, by the WCAG sum.
    expect(token('components.button-primary')?.contrast).toBeCloseTo(5.17, 1)
    expect(token('colors.action')?.contrast).toBeNull()
  })

  it('keeps the words under each heading, without the yaml', () => {
    expect(design.sections).toEqual([
      { heading: 'Overview', words: 'Quiet, so the work stands out.' },
      { heading: 'Layout', words: 'An 8px rhythm throughout.' },
      { heading: 'Components', words: '' },
    ])
  })

  it('reads DESIGN.md at a commit as well as in the live folder', async () => {
    git(repo, 'add', 'DESIGN.md')
    git(repo, 'commit', '-m', 'Add the design system')
    writeFileSync(join(repo, 'DESIGN.md'), DESIGN.replace('#2563eb', '#dc2626'))
    const sha = git(repo, 'rev-parse', 'HEAD')
    const then = await readMap(repo, { kind: 'commit', sha, title: '' })
    const now = await readMap(repo, live)
    expect(then.design?.tokens.find((t) => t.id === 'colors.action')?.value).toBe('#2563eb')
    expect(now.design?.tokens.find((t) => t.id === 'colors.action')?.value).toBe('#dc2626')
  })
})

describe('a DESIGN.md that does not hold together', () => {
  const read = async (text: string): Promise<DesignSystem> => {
    writeFileSync(join(repo, 'DESIGN.md'), text)
    return (await readMap(repo, live)).design!
  }

  it('says when a token names one that is not there, and leaves its value unknown', async () => {
    const d = await read('---\nname: X\ncolors:\n  action: "{colors.blue}"\n---\n')
    expect(d.tokens[0]).toMatchObject({ id: 'colors.action', value: '' })
    expect(d.problems).toEqual(['colors.action names {colors.blue}, which is not a token'])
  })

  it('says when tokens name each other round in a circle', async () => {
    const d = await read('---\nname: X\ncolors:\n  a: "{colors.b}"\n  b: "{colors.a}"\n---\n')
    expect(d.problems).toEqual(['colors.a and colors.b name each other round in a circle'])
  })

  it('says when a group is written twice, as the format forbids', async () => {
    const d = await read('---\nname: X\ncolors:\n  a: "#000"\n---\n\n## Colors\n\n```yaml\ncolors:\n  b: "#fff"\n```\n')
    expect(d.problems).toEqual(['colors is written more than once'])
  })

  it('says when a colour is not one, or a radius has no unit', async () => {
    const d = await read('---\nname: X\ncolors:\n  a: "not a colour"\nrounded:\n  sm: 4\n---\n')
    expect(d.problems).toEqual(['colors.a is not a colour: "not a colour"', 'rounded.sm needs a unit (px, em or rem): "4"'])
  })

  it('leaves contrast unknown where a colour is not one it can measure', async () => {
    const d = await read('---\nname: X\ncomponents:\n  chip:\n    backgroundColor: "oklch(70% 0.1 200)"\n    textColor: "#000"\n---\n')
    expect(d.tokens[0]?.contrast).toBeNull()
  })

  it('says when the yaml cannot be read', async () => {
    const d = await read('---\nname: [X\n---\n')
    expect(d.tokens).toEqual([])
    expect(d.problems[0]).toMatch(/^DESIGN.md has yaml the reader cannot read/)
  })

  it('has no design system when there is no DESIGN.md', async () => {
    const other = aMappedRepo(yard, 'plain')
    expect((await readMap(other, live)).design).toBeNull()
  })
})
