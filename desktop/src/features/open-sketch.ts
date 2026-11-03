// codegraph: feature open-sketch in workspace
// codegraph: uses sketches
import { mockupUrl, readSketch, type Sketch, type SketchCard } from '../modules/sketches/index.js'

export type SketchOpened = {
  sketch: Sketch
  /** Each mockup, by the card it is on, ready for the page to show. */
  mockups: Record<string, string>
}

/** One sketch, with its mockups, for the canvas to draw and edit. */
export const openSketch = async (projectId: string, sketchId: string): Promise<SketchOpened | null> => {
  const sketch = readSketch(projectId, sketchId)
  if (!sketch) return null
  const mockups: Record<string, string> = {}
  const walk = (card: SketchCard): void => {
    const url = mockupUrl(projectId, sketchId, card.mockup)
    if (url) mockups[card.id] = url
    card.children.forEach(walk)
  }
  walk(sketch.root)
  return { sketch, mockups }
}
