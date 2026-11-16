// codegraph: test module sketch-steps
import { applyStep, type Step } from '../src/modules/sketch-steps/index.js'
import { blankCard, newSketch, type Sketch } from '../src/modules/sketches/index.js'

/** A messy level as an agent leaves it, for the tidy tests to clean up. */

export const run = (sketch: Sketch, steps: Step[]): Sketch =>
  steps.reduce((s, step, i) => {
    const done = applyStep(s, step)
    if (!done.ok) throw new Error(`step ${i + 1} (${step.do}): ${done.problem}`)
    return done.sketch
  }, sketch)

export const blank = (): Sketch => newSketch('p', 'Wardrobe', blankCard('p', 'Wardrobe', 'project', 'project'), '')

/** A messy level like an agent leaves it: the wardrobe server's parts flung
 *  about at hand-picked spots, wired every which way, with notes and a frame. */
const PARTS: [string, string, string, number, number][] = [
  ['api', 'Wardrobe API', 'feature', 420, 60],
  ['signin', 'Sign-in', 'module', 700, 60],
  ['outfits', 'Outfits Manager', 'module', 40, 270],
  ['users', 'Users Manager', 'module', 180, 340],
  ['guides', 'Style Guides Manager', 'module', 340, 350],
  ['garments', 'Garments Manager', 'module', 160, 490],
  ['closet', 'Closet Manager', 'module', 620, 430],
  ['images', 'Image Storage', 'module', 490, 350],
  ['tagger', 'Tagger', 'module', 740, 330],
  ['ai', 'AI Model Client', 'module', 1010, 290],
  ['reader', 'Style Guide Reader', 'module', 890, 180],
  ['maker', 'Outfit Maker', 'module', 40, 410],
  ['firestore', 'Firestore', 'module', 660, 570],
  ['storage', 'Cloud Storage', 'module', 920, 570],
  ['usage', 'Usage Counter', 'module', 60, 780],
  ['dupes', 'Duplicate Check', 'module', 160, 780],
  ['rules', 'Access Rules', 'module', 370, 780],
]
const WIRES: [string, string, string][] = [
  ['api', 'signin', 'uses'],
  ['api', 'outfits', 'uses'],
  ['api', 'users', 'uses'],
  ['api', 'guides', 'uses'],
  ['api', 'garments', 'uses'],
  ['api', 'closet', 'uses'],
  ['outfits', 'maker', 'uses'],
  ['outfits', 'users', 'reads'],
  ['outfits', 'firestore', 'uses'],
  ['users', 'firestore', 'uses'],
  ['guides', 'reader', 'uses'],
  ['guides', 'images', 'reads'],
  ['guides', 'firestore', 'uses'],
  ['reader', 'ai', 'uses'],
  ['tagger', 'ai', 'uses'],
  ['garments', 'tagger', 'starts'],
  ['garments', 'images', 'uses'],
  ['garments', 'firestore', 'uses'],
  ['garments', 'dupes', 'starts'],
  ['closet', 'firestore', 'uses'],
  ['closet', 'garments', 'calls'],
  ['images', 'storage', 'uses'],
  ['usage', 'firestore', 'uses'],
  ['dupes', 'images', 'uses'],
  ['rules', 'firestore', 'uses'],
  ['maker', 'guides', 'reads'],
  // One that runs back against the flow.
  ['firestore', 'usage', 'starts'],
]

export const messy = (): Sketch =>
  run(blank(), [
    { do: 'card', name: 'Wardrobe', kind: 'software system', id: 'wardrobe' },
    { do: 'card', name: 'Wardrobe Backend', kind: 'server', in: 'wardrobe', id: 'server' },
    ...PARTS.map(([id, name, kind, x, y]): Step => ({ do: 'card', name, kind, in: 'server', id, x, y })),
    ...WIRES.map(([from, to, kind]): Step => ({ do: 'wire', from, to, kind })),
    { do: 'note', text: 'Every call is tested from the terminal client', in: 'server', x: 360, y: 40 },
    { do: 'note', text: 'Simple picker for the demo', near: 'maker' },
    { do: 'frame', text: 'After the demo', around: ['usage', 'dupes', 'rules'] },
  ])

