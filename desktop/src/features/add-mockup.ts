// codegraph: feature add-mockup in workspace
// codegraph: uses sketches, machine
import { askForPicture } from '../modules/machine/index.js'
import { keepMockup, mockupUrl } from '../modules/sketches/index.js'

export type MockupAdded = { ok: boolean; name: string; url: string }

/** A person picks a picture of how a page should look, and it is kept with
 *  the sketch. The page puts its name on the card; nothing else changes. */
export const addMockup = async (projectId: string, sketchId: string, cardId: string): Promise<MockupAdded> => {
  const picture = await askForPicture()
  if (!picture) return { ok: false, name: '', url: '' }
  const name = keepMockup(projectId, sketchId, cardId, picture)
  return { ok: true, name, url: mockupUrl(projectId, sketchId, name) }
}
