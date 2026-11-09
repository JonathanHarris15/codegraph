// codegraph: feature reach-dev-server in workspace
// codegraph: uses dev-server
import { answers, isOnThisComputer } from '../modules/dev-server/index.js'

export type DevServerReached = { up: boolean; problem: string }

/** Whether the dev server the live view would show a UI block or page from
 *  is answering, so the view can say to start it rather than show a blank
 *  frame (ADR 0024). Only an address on this computer is ever tried. */
export const reachDevServer = async (address: string): Promise<DevServerReached> => {
  if (!isOnThisComputer(address)) return { up: false, problem: 'The live view only shows a dev server on this computer.' }
  const base = new URL(address).origin
  return (await answers(base))
    ? { up: true, problem: '' }
    : { up: false, problem: `Nothing is answering at ${base}. Start the repo's dev server (often \`npm run dev\`), then try again.` }
}
