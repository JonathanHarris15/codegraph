// codegraph: feature say-looking in workspace
// codegraph: uses agents
import { sayLooking as keepLooking, type Looking } from '../modules/agents/index.js'

export type { Looking, Seen } from '../modules/agents/index.js'

/** The window says which sketch the person has open and where they point, so
 *  their agent can ask; null when they leave it. Kept only on this computer. */
export const sayLooking = async (looking: Omit<Looking, 'at'> | null): Promise<void> => keepLooking(looking)
