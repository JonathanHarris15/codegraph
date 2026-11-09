// codegraph: test module reader
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { live, readMap, type SystemMap, type UiBlock } from '../src/modules/reader/index.js'
import { aMappedRepo, aPicture, closeYard, openYard, type Yard } from './yard.js'

/** UI blocks read from a repo's code (ADR 0024): named in a tag, their
 *  options read from the props the code takes, what each means from the
 *  code's own doc comments, and their states from a file beside them. */
let yard: Yard
let repo = ''
let map: SystemMap

const put = (files: Record<string, string | Buffer>): void => {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true })
    writeFileSync(join(repo, path), text)
  }
}

const block = (name: string): UiBlock | undefined => map.uiBlocks.find((b) => b.name === name)

beforeAll(async () => {
  yard = openYard('ui-blocks')
  repo = aMappedRepo(yard)
  put({
    'app/modules/design-system/settings-row.tsx': [
      '// codegraph: module design-system',
      '// codegraph: ui block settings/SettingsRow',
      "import type { ReactNode } from 'react'",
      '/** One setting: its label on the left, its control on the right. */',
      "export const SettingsRow = ({ label, hint, tone = 'plain', control }: {",
      '  /** What the setting is called. */',
      '  label: string',
      '  /** A line under the label, never under the control. */',
      '  hint?: string',
      '  /**',
      '   * How loud the row is.',
      '   * plain: most settings',
      '   * danger: only inside the danger zone',
      '   */',
      "  tone?: 'plain' | 'danger'",
      '  control: ReactNode',
      '}) => null',
      '',
    ].join('\n'),
    'app/modules/design-system/settings-row.states.tsx': [
      '// codegraph: states SettingsRow',
      'export const loading = () => null',
      'export const noPermission = () => null',
      '',
    ].join('\n'),
    'app/modules/design-system/date-picker.tsx': [
      '// codegraph: module design-system',
      '// codegraph: ui block forms/inputs/DatePicker',
      'export interface DatePickerProps {',
      '  /** The day picked. */',
      '  value: string',
      '  open?: boolean',
      '}',
      'export function DatePicker(props: DatePickerProps) {',
      '  return null',
      '}',
      '',
    ].join('\n'),
    'codegraph-screenshots/ui-blocks/SettingsRow.loading.png': aPicture(),
  })
  map = await readMap(repo, live)
})

afterAll(() => closeYard(yard))

describe('reading UI blocks', () => {
  it('reads each UI block, its folder, and the component it lives in, in folder order', () => {
    expect(map.uiBlocks.map((b) => [b.folder, b.name, b.file, b.component])).toEqual([
      ['forms/inputs', 'DatePicker', 'app/modules/design-system/date-picker.tsx', 'web:module:design-system'],
      ['settings', 'SettingsRow', 'app/modules/design-system/settings-row.tsx', 'web:module:design-system'],
    ])
    expect(map.problems).toEqual([])
  })

  it('says what a UI block is for, from the doc comment on it', () => {
    expect(block('SettingsRow')?.says).toBe('One setting: its label on the left, its control on the right.')
    expect(block('DatePicker')?.says).toBe('')
  })

  it('reads its options from the props it takes, written in place or as a type of their own', () => {
    expect(block('SettingsRow')?.options.map((o) => [o.name, o.type, o.optional])).toEqual([
      ['label', 'string', false],
      ['hint', 'string', true],
      ['tone', "'plain' | 'danger'", true],
      ['control', 'ReactNode', false],
    ])
    expect(block('DatePicker')?.options.map((o) => [o.name, o.type, o.optional, o.says])).toEqual([
      ['value', 'string', false, 'The day picked.'],
      ['open', 'boolean', true, ''],
    ])
  })

  it('lists the choices an option has, and what each one means', () => {
    const tone = block('SettingsRow')?.options.find((o) => o.name === 'tone')
    expect(tone).toMatchObject({
      values: ['plain', 'danger'],
      says: 'How loud the row is.',
      valueSays: { plain: 'most settings', danger: 'only inside the danger zone' },
    })
    expect(block('DatePicker')?.options.find((o) => o.name === 'open')?.values).toEqual(['true', 'false'])
  })

  it('reads its states from the file beside it, with a screenshot where its tests took one', () => {
    const states = block('SettingsRow')?.states ?? []
    expect(states.map((s) => [s.name, s.file])).toEqual([
      ['loading', 'app/modules/design-system/settings-row.states.tsx'],
      ['noPermission', 'app/modules/design-system/settings-row.states.tsx'],
    ])
    expect(states[0]?.shot).toMatch(/^data:image\/png;base64,/)
    expect(states[1]?.shot).toBe('')
    expect(block('DatePicker')?.states).toEqual([])
  })

  it('keeps a states file out of the components, as it does a test', () => {
    expect(map.components.flatMap((c) => c.files.map((f) => f.path))).not.toContain('app/modules/design-system/settings-row.states.tsx')
  })
})

describe('UI blocks that do not hold together', () => {
  it('says when a UI block is not a name its file has, or lives in no component', async () => {
    put({
      'app/modules/design-system/ghost.tsx': '// codegraph: module design-system\n// codegraph: ui block Ghost\nexport const Other = () => null\n',
      'app/loose.tsx': '// codegraph: ui block Loose\nexport const Loose = () => null\n',
      'app/modules/design-system/nobody.states.tsx': '// codegraph: states Nobody\nexport const empty = () => null\n',
    })
    const now = await readMap(repo, live)
    expect(now.problems).toEqual([
      'app/loose.tsx names the UI block Loose, but says no component it belongs to',
      'app/modules/design-system/ghost.tsx names the UI block Ghost, but has no Ghost in it',
      'app/modules/design-system/nobody.states.tsx gives states of Nobody, which is not a UI block',
    ])
  })
})
