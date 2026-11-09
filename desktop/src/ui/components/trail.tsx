// codegraph: component trail
import type { Level } from '../../features/show-map.js'
import { isStore } from './kind-glyph.js'

const LEVEL_WORD: Record<Level, string> = {
  project: 'project',
  system: 'software system',
  container: 'container',
  component: 'component',
  code: 'code',
}

/** Where you are. Each step goes back to it; the last one is where you are.
 *  The level word under each name teaches the five levels, which a person
 *  needs taught once, and answers why a project and its software system can
 *  carry the same name. A store says it is one: it is not a component.
 */
export const Trail = ({
  steps,
  onGo,
}: {
  steps: { id: string; name: string; level: Level; kind?: string }[]
  onGo: (i: number) => void
}) => (
  <nav className="map-trail" aria-label="Where you are">
    {steps.map((step, i) => {
      const here = i === steps.length - 1
      return (
        <span key={step.id} className="map-trail-step">
          {i > 0 ? (
            <span className="map-trail-gap" aria-hidden="true">
              ›
            </span>
          ) : null}
          <button
            type="button"
            className={here ? 'map-trail-here' : 'map-trail-link'}
            aria-current={here ? 'page' : undefined}
            onClick={() => onGo(i)}
          >
            <span>{step.name || 'Unnamed'}</span>
            <span className="map-trail-level">{step.kind && isStore(step.kind) ? step.kind : LEVEL_WORD[step.level]}</span>
          </button>
        </span>
      )
    })}
  </nav>
)
