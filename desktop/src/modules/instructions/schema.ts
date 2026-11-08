// codegraph: module instructions
// codegraph: store instructions as Instructions

/** One saved state of what codegraph tells an agent about a topic: the words
 *  as they stood, when they were kept, and whether a person wrote them or put
 *  the default back. Nothing is ever taken out, so a person can read back
 *  everything they have told their agents and put any of it back. */
export type Edit = {
  id: string
  /** When it was kept, as an ISO time. */
  at: string
  text: string
  how: 'edited' | 'reset'
}

/** Every edit a person has made, by topic, oldest first. The newest is what
 *  agents are told; a topic with none is told what codegraph ships with. */
export type Instructions = { topics: Record<string, Edit[]> }
