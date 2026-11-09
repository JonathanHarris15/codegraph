// codegraph: component recipes-view
import { useState } from 'react'
import type { RecipeShown } from '../../features/show-map.js'
import { Badge, Button } from '../design-system/kit.js'
import { LiveFrame } from './live-view.js'

/** One recipe up close: its words beside its reference page as it really
 *  looks, the UI blocks it is built from, and the pages that follow it. */
const PickedRecipe = ({ recipe }: { recipe: RecipeShown }) => {
  const [live, setLive] = useState(false)
  return (
  <section className="recipe-open" aria-label={`Recipe ${recipe.name}`}>
    <div className="recipe-words">
      <div className="ds-row" style={{ justifyContent: 'space-between' }}>
        <h3 className="design-title">{recipe.name}</h3>
        <span className="ds-hint">{recipe.file}</span>
      </div>
      {recipe.useWhen ? (
        <p className="recipe-when">
          <span className="ds-label">Use when</span> {recipe.useWhen}
        </p>
      ) : null}
      {recipe.notFor ? (
        <p className="recipe-when">
          <span className="ds-label">Not for</span> {recipe.notFor}
        </p>
      ) : null}
      {recipe.blocks.length ? (
        <div className="recipe-blocks">
          <span className="ds-label">Built from</span>
          {recipe.blocks.map((b) => (
            <Badge key={b}>{b}</Badge>
          ))}
        </div>
      ) : null}
      {recipe.sections.map((s) => (
        <div key={s.heading} className="design-words">
          <span className="ds-label">{s.heading}</span>
          {/^skeleton$/i.test(s.heading) && recipe.skeleton ? <pre className="recipe-skeleton">{recipe.skeleton}</pre> : <p>{s.words}</p>}
        </div>
      ))}
    </div>
    <aside className="recipe-reference" aria-label={`Reference page for ${recipe.name}`}>
      <div className="ds-row" style={{ justifyContent: 'space-between' }}>
        <span className="ds-label">Reference page{recipe.referenceName ? `: ${recipe.referenceName}` : ''}</span>
        {recipe.live ? (
          <Button look="bare" onClick={() => setLive(!live)}>
            {live ? 'Back to the screenshot' : 'See it live'}
          </Button>
        ) : null}
      </div>
      {live && recipe.live ? (
        <LiveFrame address={recipe.live} title={`${recipe.referenceName}, running`} />
      ) : recipe.referenceShot ? (
        <img className="recipe-shot" src={recipe.referenceShot} alt={`${recipe.referenceName} as it looks`} />
      ) : (
        <div className="ui-block-shot ui-block-shot--none recipe-shot">{recipe.reference ? 'No screenshot yet' : 'No reference page named'}</div>
      )}
      {recipe.reference ? <span className="ds-hint">{recipe.reference}</span> : null}
      <span className="ds-label">Followed by</span>
      <span className="recipe-pages">{recipe.pageNames.length ? recipe.pageNames.join(', ') : 'No page yet'}</span>
    </aside>
  </section>
  )
}

/** A software system's recipes: how each kind of its pages lays itself out
 *  (ADR 0024). */
export const RecipesView = ({ recipes }: { recipes: RecipeShown[] }) => {
  const [pickedName, setPickedName] = useState(recipes[0]?.name ?? '')
  const picked = recipes.find((r) => r.name === pickedName) ?? recipes[0]
  if (!picked)
    return (
      <div className="design-body">
        <div className="design-groups">
          <div className="ds-empty">
            No recipes yet. Each is a Markdown file in <code>recipes/</code>, and a page says <code>follows</code> one in its tag.
          </div>
        </div>
      </div>
    )
  return (
    <div className="design-body">
      <nav className="recipe-list" aria-label="Recipes">
        {recipes.map((r) => (
          <button
            key={r.name}
            type="button"
            className="recipe-pick"
            aria-current={r.name === picked.name ? 'true' : undefined}
            onClick={() => setPickedName(r.name)}
          >
            <span className="design-token-name">{r.name}</span>
            <span className="design-token-value">
              {r.pageNames.length} {r.pageNames.length === 1 ? 'page' : 'pages'}
            </span>
          </button>
        ))}
      </nav>
      <PickedRecipe key={picked.name} recipe={picked} />
    </div>
  )
}
