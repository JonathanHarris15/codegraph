// codegraph: feature save-card-types in workspace
// codegraph: uses card-types
import { writeCardTypes, type CardType } from '../modules/card-types/index.js'

/** Keeps the types of card a person has saved. A card already drawn keeps its
 *  own look, so forgetting a type changes no drawing. */
export const saveCardTypes = async (types: CardType[]): Promise<void> => writeCardTypes(types)
