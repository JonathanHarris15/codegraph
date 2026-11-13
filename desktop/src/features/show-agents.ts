// codegraph: feature show-agents in workspace
// codegraph: uses agents
import { agentsInSketches, type AgentInSketch } from '../modules/agents/index.js'

export type { AgentInSketch } from '../modules/agents/index.js'

/** The agents at work on sketches in one library lately, and where, so the
 *  window can draw their cursors and say where they are drawing. */
export const showAgents = async (library: string): Promise<AgentInSketch[]> => agentsInSketches(library)
