// codegraph: component sketch-editor
import type { SketchCard, SketchField } from '../../modules/sketches/index.js'
import { Button, Select } from '../design-system/kit.js'
import { Glyph } from './kind-glyph.js'

/** What a field can hold, in the words its card shows. A field read from a
 *  schema may say something richer, like "male or female"; it keeps it. */
export const HOLDS = ['text', 'number', 'whole number', 'yes or no', 'date', 'a list of text', 'a record', 'anything']

const NOTHING = 'nothing'

/** A store's shape, edited beside the board: its fields, a row each, and
 *  whether a record may have others (ADR 0023). A new store is fixed. */
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
      {fields.length === 0 ? <div className="ds-hint">None yet.</div> : null}
      {fields.map((field, i) => (
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
            value={field.holds}
            options={[...new Set([field.holds, ...HOLDS])].filter(Boolean)}
            onChange={(holds) => put(i, { holds })}
          />
          <Select
            label={`What field ${i + 1} points at`}
            value={field.pointsAt || NOTHING}
            options={[...new Set([NOTHING, field.pointsAt, ...stores])].filter(Boolean)}
            onChange={(store) => put(i, { pointsAt: store === NOTHING ? '' : store })}
          />
          <label className="store-field-needed">
            <input type="checkbox" checked={field.needed} onChange={(event) => put(i, { needed: event.target.checked })} />
            Every record has it
          </label>
        </fieldset>
      ))}
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
          options={[...new Set([card.others, ...HOLDS])]}
          onChange={(others) => onChange({ others })}
        />
      ) : null}
    </div>
  )
}
