// codegraph: component sketch-editor
import { useState } from 'react'
import { isStore, type SketchCard, type SketchField } from '../../modules/sketches/schema.js'
import { Button, Select } from '../design-system/kit.js'
import { Glyph } from './kind-glyph.js'

/** The plain kinds of thing a field can hold, in the words its card shows. */
const PLAIN = ['text', 'number', 'whole number', 'yes or no', 'date', 'a record', 'anything']

/** What a field can be picked to hold. Choices and lists say more below. */
const TYPES = ['text', 'number', 'whole number', 'yes or no', 'date', 'choices', 'a list', 'a record', 'anything']

/** What a field holds, in the words its card shows, read back into a type and
 *  what goes with it: the choices, or what a list holds. A field read from a
 *  schema may say something richer; it is kept as it is. */
export const typeOf = (holds: string): { type: string; of: string; choices: string[] } => {
  if (holds.startsWith('a list of ')) return { type: 'a list', of: holds.slice('a list of '.length), choices: [] }
  if (holds.startsWith('a record')) return { type: 'a record', of: '', choices: [] }
  if (PLAIN.includes(holds)) return { type: holds, of: '', choices: [] }
  return { type: 'choices', of: '', choices: holds.split(/, | or /).map((c) => c.trim()).filter(Boolean) }
}

/** Choices said the way the map says them: "draft, sent or paid". */
export const choiceWords = (choices: string[]): string =>
  choices.length > 1 ? `${choices.slice(0, -1).join(', ')} or ${choices[choices.length - 1]}` : (choices[0] ?? '')

/** Choices a field starts with, to be typed over. Not "yes or no", which is a
 *  type of its own. */
const NEW_CHOICES = ['one', 'two']

const holdsFor = (type: string, was: { of: string; choices: string[] }): string =>
  type === 'a list' ? `a list of ${was.of || 'text'}` : type === 'choices' ? choiceWords(was.choices.length ? was.choices : NEW_CHOICES) : type

/** Choices are typed with commas between; they are kept as typed until the
 *  person moves on, so a comma can be typed before the next choice. */
const ChoicesInput = ({ label, choices, onChoices }: { label: string; choices: string[]; onChoices: (choices: string[]) => void }) => {
  const [typed, setTyped] = useState(choices.join(', '))
  return (
    <label className="ds-field">
      <span className="ds-label">{label}</span>
      <input
        className="ds-input"
        aria-label={label}
        placeholder="draft, sent, paid"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={() => {
          const list = typed.split(',').map((c) => c.trim()).filter(Boolean)
          if (list.length) onChoices(list)
        }}
      />
    </label>
  )
}

/** A store's shape, edited beside the board or in the panel: its fields, a row
 *  each, and whether a record may have others (ADR 0023). A new store is fixed. */
export const StoreFields = ({
  card,
  stores,
  onChange,
}: {
  card: SketchCard
  /** The names of the other stores drawn, for a field to point at. */
  stores: string[]
  onChange: (change: { fields?: SketchField[] | null; others?: string }) => void
}) => {
  if (!card.fields)
    return (
      <div className="store-fields">
        <div className="ds-hint">Its shape is unknown: no schema says it.</div>
        <Button onClick={() => onChange({ fields: [], others: '' })}>Write its fields</Button>
      </div>
    )
  const fields = card.fields
  const put = (i: number, field: Partial<SketchField>): void =>
    onChange({ fields: fields.map((one, at) => (at === i ? { ...one, ...field } : one)) })
  return (
    <div className="store-fields" aria-label={`The shape of ${card.name || 'this store'}`}>
      <div className="ds-label">Fields</div>
      {fields.length === 0 ? <div className="ds-hint">None yet. Every record of it will hold the fields you add.</div> : null}
      {fields.map((field, i) => {
        const is = typeOf(field.holds)
        return (
          <fieldset key={i} className="store-field" aria-label={`Field ${i + 1}`}>
            <div className="store-field-head">
              <input
                className="ds-input store-field-name"
                aria-label={`Name of field ${i + 1}`}
                placeholder="fieldName"
                value={field.name}
                onChange={(event) => put(i, { name: event.target.value })}
              />
              <button
                type="button"
                className="store-field-drop"
                aria-label={`Take off field ${field.name || i + 1}`}
                title="Take this field off"
                onClick={() => onChange({ fields: fields.filter((_, at) => at !== i) })}
              >
                <Glyph of="close" size={12} />
              </button>
            </div>
            <Select
              label={`What field ${i + 1} holds`}
              value={is.type}
              options={TYPES}
              onChange={(type) => put(i, { holds: holdsFor(type, is) })}
            />
            {is.type === 'a list' ? (
              <Select
                label={`Each item of field ${i + 1} is`}
                value={is.of}
                options={[...new Set([is.of, ...PLAIN])].filter(Boolean)}
                onChange={(of) => put(i, { holds: `a list of ${of}` })}
              />
            ) : null}
            {is.type === 'choices' ? (
              <ChoicesInput
                // Choices changed anywhere else start this box afresh.
                key={field.holds}
                label={`Choices for field ${i + 1}, split by commas`}
                choices={is.choices}
                onChoices={(choices) => put(i, { holds: choiceWords(choices) })}
              />
            ) : null}
            <Select
              label={`What field ${i + 1} points at`}
              value={field.pointsAt || 'nothing'}
              options={[...new Set(['nothing', field.pointsAt, ...stores])].filter(Boolean)}
              onChange={(store) => put(i, { pointsAt: store === 'nothing' ? '' : store })}
            />
            <label className="store-field-needed">
              <input type="checkbox" checked={field.needed} onChange={(event) => put(i, { needed: event.target.checked })} />
              Every record has it
            </label>
          </fieldset>
        )
      })}
      <Button onClick={() => onChange({ fields: [...fields, { name: '', holds: 'text', needed: false, pointsAt: '' }] })}>
        Add a field
      </Button>
      <div className="store-fields-rest" role="radiogroup" aria-label="Other fields">
        <label>
          <input type="radio" checked={!card.others} onChange={() => onChange({ others: '' })} />
          Fixed: a record has only these
        </label>
        <label>
          <input type="radio" checked={Boolean(card.others)} onChange={() => onChange({ others: card.others || 'anything' })} />
          Open: a record may have others
        </label>
      </div>
      {card.others ? (
        <Select
          label="Any other field holds"
          value={card.others}
          options={[...new Set([card.others, ...PLAIN])]}
          onChange={(others) => onChange({ others })}
        />
      ) : null}
    </div>
  )
}

/** The stores a card holds, by name, and a way to add one: a database's stores,
 *  or the inner stores that live inside each record of a store. */
const StoresInside = ({ card, onAdd }: { card: SketchCard; onAdd: (name: string) => void }) => {
  const [name, setName] = useState('')
  const inner = isStore(card.kind)
  const held = card.children.filter((c) => isStore(c.kind))
  const add = (): void => {
    if (!name.trim()) return
    onAdd(name.trim())
    setName('')
  }
  return (
    <div className="store-inside" aria-label={inner ? `Inner stores of ${card.name || 'this store'}` : `Stores in ${card.name || 'this database'}`}>
      <div className="ds-label">{inner ? 'Inner stores' : 'Stores'}</div>
      <div className="ds-hint">
        {inner
          ? 'A store that lives inside each record of this one, and goes with it, like a sub-collection.'
          : 'Each kind of record this database keeps.'}
      </div>
      {held.length ? (
        <ul className="store-inside-list">
          {held.map((c) => (
            <li key={c.id}>{c.name || 'Unnamed'}</li>
          ))}
        </ul>
      ) : null}
      <div className="store-inside-add">
        <input
          className="ds-input"
          aria-label={inner ? 'Name of a new inner store' : 'Name of a new store'}
          placeholder={inner ? 'comments' : 'people'}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') add()
          }}
        />
        <Button onClick={add} disabled={!name.trim()}>
          {inner ? 'Add an inner store' : 'Add a store'}
        </Button>
      </div>
    </div>
  )
}

/** Everything for designing a store, or a database's stores, beside the card on
 *  the board: what each record holds, and the stores inside it. */
export const StoreEditor = ({
  card,
  stores,
  onChange,
  onAdd,
  onClose,
}: {
  card: SketchCard
  stores: string[]
  onChange: (change: { fields?: SketchField[] | null; others?: string }) => void
  /** Adds a store inside the card, by name. */
  onAdd: (name: string) => void
  onClose: () => void
}) => (
  <div className="store-editor" role="dialog" aria-label={`Design ${card.name || 'this store'}`}>
    <div className="store-editor-head">
      <span>{isStore(card.kind) ? card.name || 'Unnamed store' : `${card.name || 'This database'}'s stores`}</span>
      <button type="button" className="store-field-drop" aria-label="Close" onClick={onClose}>
        <Glyph of="close" size={14} />
      </button>
    </div>
    {isStore(card.kind) ? <StoreFields card={card} stores={stores} onChange={onChange} /> : null}
    <StoresInside card={card} onAdd={onAdd} />
  </div>
)
