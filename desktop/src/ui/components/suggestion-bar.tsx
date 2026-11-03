// codegraph: component suggestion-bar
import type { Card } from '../../features/show-map.js'
import { Button } from '../design-system/kit.js'

/** Names the code calls out to that the project has no card for. Each waits
 *  for a person to say what it is: a new shallow software system, or another
 *  name for one already there. */
export const SuggestionBar = ({
  suggestions,
  shallow,
  onAgree,
}: {
  suggestions: string[]
  shallow: Card[]
  onAgree: (name: string, sameAs: string) => void
}) => {
  if (suggestions.length === 0) return null
  return (
    <div className="map-suggestions" aria-label="Suggested software systems">
      {suggestions.map((name) => (
        <div key={name} className="map-suggestion">
          <span>
            The code calls <b>{name}</b>, which has no card here.
          </span>
          <Button onClick={() => onAgree(name, '')}>Add it</Button>
          {shallow.length ? (
            <select
              className="ds-input"
              aria-label={`${name} is the same as`}
              value=""
              onChange={(event) => {
                if (event.target.value) onAgree(name, event.target.value)
              }}
            >
              <option value="">Same as…</option>
              {shallow.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ))}
    </div>
  )
}
