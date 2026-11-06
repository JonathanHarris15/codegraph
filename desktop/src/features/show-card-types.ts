// codegraph: feature show-card-types in workspace
// codegraph: uses card-types
import { readCardTypes, type CardType } from '../modules/card-types/index.js'

/** The types of card a person has saved, for the card library to offer. */
export const showCardTypes = async (): Promise<CardType[]> => readCardTypes()
