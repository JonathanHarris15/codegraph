// codegraph: component design-view
import { useEffect, useState, type CSSProperties } from 'react'
import type { DesignSystem, RecipeShown, Token, TokenGroup, UiBlock } from '../../features/show-map.js'
import { Badge, Button } from '../design-system/kit.js'
import { DesignStart } from './design-start.js'
import { RecipesView } from './recipes-view.js'
import { UiBlocksView, type AgentAtBlock } from './ui-blocks-view.js'

/** The groups in the order a person reads a design system, each with what
 *  it is called on screen. */
const GROUPS: { group: TokenGroup; title: string }[] = [
  { group: 'colors', title: 'Colours' },
  { group: 'typography', title: 'Type' },
  { group: 'spacing', title: 'Spacing' },
  { group: 'rounded', title: 'Corners' },
  { group: 'components', title: 'UI block tokens' },
]

const TIER: Record<Token['tier'], string> = { raw: 'Raw', purpose: 'Purpose', block: 'UI block' }

const DIMENSION = /^-?\d*\.?\d+(px|em|rem)$/

/** A value is only put on the page when it can be nothing but a value: no
 *  url() reaching out of the app, nothing that is not a plain CSS word. */
const safe = (value: string): string | undefined =>
  value && !/url\s*\(|[;{}<>]/i.test(value) ? value : undefined

/** What a block token's parts make, as CSS; a type style it names lends its
 *  own parts. */
const blockStyle = (token: Token, byId: Map<string, Token>): CSSProperties => {
  const style: Record<string, string | undefined> = {}
  for (const part of token.parts) {
    const value = safe(part.value)
    if (part.name === 'backgroundColor') style.background = value
    else if (part.name === 'textColor') style.color = value
    else if (part.name === 'rounded') style.borderRadius = value
    else if (part.name === 'padding') style.padding = value
    else if (part.name === 'height' || part.name === 'width') style[part.name] = value
    else if (part.name === 'size') style.minHeight = value
    else if (part.name === 'typography') {
      const named = byId.get(part.value.replace(/^\{|\}$/g, ''))
      if (named) Object.assign(style, typeStyle(named))
    }
  }
  return style as CSSProperties
}

const typeStyle = (token: Token): CSSProperties => {
  const style: Record<string, string | undefined> = {}
  for (const part of token.parts)
    if (['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].includes(part.name))
      style[part.name] = safe(part.value)
  return style as CSSProperties
}

const reads = (contrast: number): string =>
  contrast >= 4.5 ? 'Reads at any size' : contrast >= 3 ? 'Reads only when large' : 'Hard to read'

/** A token drawn as what it is: a swatch, a space, a corner, a line of type,
 *  or what a UI block's tokens make together. */
const Sample = ({ token, byId, big = false }: { token: Token; byId: Map<string, Token>; big?: boolean }) => {
  const value = safe(token.value)
  const unknown = <div className="design-sample design-unknown">not known</div>
  switch (token.group) {
    case 'colors':
      return value ? <div className="design-sample design-swatch" style={{ background: value }} /> : unknown
    case 'spacing':
      return value && DIMENSION.test(value) ? (
        <div className="design-space-track">
          <div className="design-sample design-space" style={{ width: value }} />
        </div>
      ) : (
        <div className="design-sample design-count">{token.value || 'not known'}</div>
      )
    case 'rounded':
      return value ? <div className="design-sample design-corner" style={{ borderRadius: value }} /> : unknown
    case 'typography':
      return (
        <div className="design-sample design-type" style={typeStyle(token)}>
          {big ? 'The quick brown fox jumps over the lazy dog' : 'The quick brown fox'}
        </div>
      )
    case 'components':
      return (
        <div className="design-block-stage">
          <div className="design-sample design-block" style={blockStyle(token, byId)}>
            {token.name}
          </div>
        </div>
      )
  }
}

const valueLine = (token: Token): string => {
  if (token.group === 'typography')
    return ['fontFamily', 'fontSize', 'fontWeight'].map((n) => token.parts.find((p) => p.name === n)?.value).filter(Boolean).join(' · ')
  if (token.group === 'components') return token.contrast === null ? '' : `${token.contrast.toFixed(1)}:1 text on background`
  return token.value || 'not known'
}

const Links = ({ title, ids, onPick }: { title: string; ids: string[]; onPick: (id: string) => void }) =>
  ids.length ? (
    <div className="design-links">
      <span className="ds-label">{title}</span>
      {ids.map((id) => (
        <Button key={id} look="bare" onClick={() => onPick(id)}>
          {id}
        </Button>
      ))}
    </div>
  ) : null

/** What a person can do to the tokens, when the map is of their own working
 *  copy: change one, and hear back where it went. */
export type Changing = (tokenId: string, value: string) => Promise<{ ok: boolean; branch: string; problem: string }>

const SIX_HEX = /^#[0-9a-f]{6}$/i
const PIXELS = /^(\d+(?:\.\d+)?)px$/

/** The controls for one token's value: a picker for a colour, a slider for
 *  a size in pixels, a list of the tokens a purpose token could name, and
 *  the value as text for anything else. Nothing is written until Save. */
const Editor = ({
  token,
  tokens,
  draft,
  onDraft,
  onChange,
}: {
  token: Token
  tokens: Token[]
  draft: string
  onDraft: (value: string) => void
  onChange: Changing
}) => {
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState('')
  const [problem, setProblem] = useState('')
  useEffect(() => {
    setSaid('')
    setProblem('')
  }, [token.id])
  const save = async (): Promise<void> => {
    setBusy(true)
    const done = await onChange(token.id, draft)
    setBusy(false)
    setProblem(done.problem)
    setSaid(done.ok ? `Saved to DESIGN.md on ${done.branch}. The code still has the old value until it is brought along.` : '')
  }
  const pixels = draft.match(PIXELS)
  const max = token.group === 'rounded' ? 48 : 96
  const others = tokens.filter((t) => t.group === token.group && t.id !== token.id && !t.parts.length)
  return (
    <div className="design-editor">
      <span className="ds-label">Change it</span>
      {token.tier === 'purpose' ? (
        <select
          className="ds-input"
          aria-label={`Token ${token.id} names`}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
        >
          {draft.startsWith('{') && !others.some((t) => `{${t.id}}` === draft) ? <option value={draft}>{draft}</option> : null}
          {others.map((t) => (
            <option key={t.id} value={`{${t.id}}`}>
              {`{${t.id}}`} {t.value}
            </option>
          ))}
        </select>
      ) : null}
      {token.tier === 'raw' && token.group === 'colors' && SIX_HEX.test(draft) ? (
        <input
          type="color"
          className="design-colour"
          aria-label={`Pick a colour for ${token.id}`}
          value={draft.toLowerCase()}
          onChange={(e) => onDraft(e.target.value)}
        />
      ) : null}
      {token.tier === 'raw' && (token.group === 'spacing' || token.group === 'rounded') && pixels ? (
        <input
          type="range"
          className="design-slider"
          aria-label={`Drag ${token.id}`}
          min={0}
          max={Math.max(max, Number(pixels[1]))}
          step={1}
          value={Number(pixels[1])}
          onChange={(e) => onDraft(`${e.target.value}px`)}
        />
      ) : null}
      <input
        className="ds-input design-value"
        aria-label={`Value of ${token.id}`}
        value={draft}
        spellCheck={false}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft !== token.written) void save()
        }}
      />
      <div className="ds-row">
        <Button onClick={() => void save()} disabled={busy || draft === token.written}>
          {busy ? 'Saving…' : 'Save to DESIGN.md'}
        </Button>
        {draft !== token.written ? (
          <Button look="bare" onClick={() => onDraft(token.written)}>
            Put back
          </Button>
        ) : null}
      </div>
      <span className="ds-hint">Saving never writes on the main line: there it starts a branch first.</span>
      {problem ? (
        <span className="ds-problem" role="alert">
          {problem}
        </span>
      ) : null}
      {said ? (
        <span className="ds-hint" role="status">
          {said}
        </span>
      ) : null}
    </div>
  )
}

/** One token up close: how it is written, what it comes to, what it names,
 *  and everything it feeds; and, where the person may, a way to change it. */
const Picked = ({
  token,
  byId,
  onPick,
  onChange,
  why,
}: {
  token: Token
  byId: Map<string, Token>
  onPick: (id: string) => void
  onChange?: Changing | undefined
  why: string
}) => {
  const named = new Set(token.namedBy)
  const [draft, setDraft] = useState(token.written)
  useEffect(() => setDraft(token.written), [token.id, token.written])
  const target = draft.match(/^\{([^{}]+)\}$/)?.[1]
  const shown: Token = draft === token.written ? token : { ...token, written: draft, value: target ? (byId.get(target)?.value ?? '') : draft }
  return (
    <aside className="design-picked" aria-label={`Token ${token.id}`}>
      <div className="ds-row" style={{ justifyContent: 'space-between' }}>
        <span className="design-picked-name">{token.id}</span>
        <Badge>{TIER[token.tier]}</Badge>
      </div>
      <Sample token={shown} byId={byId} big />
      {onChange && !token.parts.length ? (
        <Editor token={token} tokens={[...byId.values()]} draft={draft} onDraft={setDraft} onChange={onChange} />
      ) : null}
      {!onChange && why ? <span className="ds-hint">{why}</span> : null}
      {token.parts.length ? (
        <dl className="design-parts">
          {token.parts.map((p) => (
            <div key={p.name}>
              <dt>{p.name}</dt>
              <dd>
                {p.written}
                {p.written !== p.value ? <span className="ds-hint"> {p.value ? `which is ${p.value}` : 'not known'}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <dl className="design-parts">
          <div>
            <dt>Written as</dt>
            <dd>{token.written}</dd>
          </div>
          {token.written !== token.value ? (
            <div>
              <dt>Comes to</dt>
              <dd>{token.value || 'not known'}</dd>
            </div>
          ) : null}
        </dl>
      )}
      {token.contrast !== null ? (
        <div className="design-contrast">
          <span className="design-contrast-ratio">{token.contrast.toFixed(1)}:1</span>
          <Badge tone={token.contrast >= 4.5 ? 'good' : token.contrast >= 3 ? 'waiting' : 'problem'}>{reads(token.contrast)}</Badge>
        </div>
      ) : null}
      <Links title="Names" ids={token.names} onPick={onPick} />
      <Links title="Named by" ids={token.namedBy} onPick={onPick} />
      <Links title="Also feeds, through those" ids={token.feeds.filter((id) => !named.has(id))} onPick={onPick} />
      {!token.feeds.length && token.tier !== 'block' ? <span className="ds-hint">No other token names this one.</span> : null}
    </aside>
  )
}

/** Every token in DESIGN.md as what it is, by group, and the one picked. */
const TokensBody = ({ design, onChange, why }: { design: DesignSystem; onChange?: Changing | undefined; why: string }) => {
  const [pickedId, setPickedId] = useState('')
  const byId = new Map(design.tokens.map((t) => [t.id, t]))
  const picked = byId.get(pickedId)
  return (
      <div className="design-body">
        <div className="design-groups">
          {design.problems.length ? (
            <div className="design-problems" role="alert">
              <span className="ds-label">DESIGN.md does not hold together</span>
              <ul>
                {design.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {GROUPS.map(({ group, title }) => {
            const tokens = design.tokens.filter((t) => t.group === group)
            if (!tokens.length) return null
            return (
              <section key={group} className={`design-group design-group--${group}`} aria-label={title}>
                <h3 className="design-group-title">{title}</h3>
                <div className="design-tiles">
                  {tokens.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      data-token={t.id}
                      className="design-token"
                      aria-pressed={t.id === pickedId}
                      onClick={() => setPickedId(t.id === pickedId ? '' : t.id)}
                    >
                      <Sample token={t} byId={byId} />
                      <span className="design-token-name">{t.name}</span>
                      <span className="design-token-value">{valueLine(t)}</span>
                      {t.tier === 'purpose' ? <span className="design-token-tier">{t.written}</span> : null}
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
          {design.sections.filter((s) => s.words).length ? (
            <section className="design-group" aria-label="Why">
              <h3 className="design-group-title">Why</h3>
              {design.sections
                .filter((s) => s.words)
                .map((s) => (
                  <div key={s.heading} className="design-words">
                    <span className="ds-label">{s.heading}</span>
                    <p>{s.words}</p>
                  </div>
                ))}
            </section>
          ) : null}
        </div>
        {picked ? <Picked token={picked} byId={byId} onPick={setPickedId} onChange={onChange} why={why} /> : null}
      </div>
  )
}

/** A software system's design system, drawn: its DESIGN.md with every token
 *  as what it is, never as text, and its UI blocks in their folders (ADR
 *  0024). Given a way to change tokens, the picked one can be changed;
 *  without, the view only looks. */
export const DesignView = ({
  design,
  uiBlocks,
  recipes,
  agent = null,
  onClose,
  onChange,
  why = '',
}: {
  design: DesignSystem | null
  uiBlocks: UiBlock[]
  recipes: RecipeShown[]
  /** The UI block an agent says it is working on, which the view follows. */
  agent?: AgentAtBlock | null
  onClose: () => void
  onChange?: Changing | undefined
  /** Why tokens cannot be changed here, when they cannot. */
  why?: string
}) => {
  const [tab, setTab] = useState<'tokens' | 'blocks' | 'recipes'>(
    agent ? 'blocks' : design ? 'tokens' : uiBlocks.length ? 'blocks' : 'recipes',
  )
  useEffect(() => {
    if (agent?.uiBlock) setTab('blocks')
  }, [agent?.uiBlock])

  useEffect(() => {
    const keys = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [onClose])

  // With nothing at all yet, the page is one panel saying how to start.
  const nothing = !design && uiBlocks.length === 0 && recipes.length === 0

  return (
    <section className="design-view" aria-label={design?.name ? `Design system ${design.name}` : 'Design system'}>
      <header className="design-head">
        <div>
          <h2 className="design-title">{design?.name || 'Design system'}</h2>
          {design?.description ? <p className="design-says">{design.description}</p> : null}
        </div>
        {nothing ? null : (
          <div className="design-tabs" role="tablist" aria-label="What to look at">
            <button type="button" role="tab" aria-selected={tab === 'tokens'} onClick={() => setTab('tokens')}>
              Tokens{design ? ` (${design.tokens.length})` : ''}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'blocks'} onClick={() => setTab('blocks')}>
              UI blocks ({uiBlocks.length})
            </button>
            <button type="button" role="tab" aria-selected={tab === 'recipes'} onClick={() => setTab('recipes')}>
              Recipes ({recipes.length})
            </button>
          </div>
        )}
        <Button look="bare" onClick={onClose}>
          Close
        </Button>
      </header>
      {nothing ? (
        <DesignStart part="all" />
      ) : tab === 'blocks' ? (
        uiBlocks.length ? <UiBlocksView blocks={uiBlocks} agent={agent} /> : <DesignStart part="blocks" />
      ) : tab === 'recipes' ? (
        recipes.length ? <RecipesView recipes={recipes} /> : <DesignStart part="recipes" />
      ) : design ? (
        <TokensBody design={design} onChange={onChange} why={why} />
      ) : (
        <DesignStart part="tokens" />
      )}
    </section>
  )
}
