// codegraph: module card-types
// codegraph: store card-types as CardType
import type { CardShape } from '../sketches/schema.js'

/** A type of card a person made up and saved to use again: what it is called,
 *  which is not the name of any one card, and how it looks. */
export type CardType = {
  id: string
  name: string
  icon: string
  shape: CardShape
  color: string
}
