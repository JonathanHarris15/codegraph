// codegraph: component annotation-layer
import { ChevronDown, ChevronRight, Eye, EyeOff, Magnet, Plus, Search, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { Layer } from '../../modules/annotations/index.js'
import { SHAPE_GROUPS, type AnnotationShape } from './annotation-shapes.js'

/** A shape as its library button draws it. It draws what the board draws —
 *  the outline, the strip and the strokes inside it, the dashed edge and
 *  name tab of a frame — so two shapes that differ on the board differ
 *  here, and two that look alike here are the same shape. */
export const ShapeIcon = ({ shape, size = 26 }: { shape: AnnotationShape; size?: number }) => (
  <svg width={size} height={size} viewBox="-6 -6 112 112" aria-hidden="true" className="map-anno-icon">
    {shape.kind === 'text' ? (
      <text x="50" y="74" textAnchor="middle" fontSize="78" fontFamily="serif">
        T
      </text>
    ) : shape.line ? (
      <>
        <path
          d={shape.bends ? 'M8 86 C58 86, 42 14, 92 14' : 'M8 92 L92 8'}
          strokeDasharray={shape.kind === 'dashed' ? '12 10' : undefined}
          markerEnd={shape.kind === 'arrow' || shape.bends ? 'url(#map-anno-icon-head)' : undefined}
        />
        {shape.kind === 'wire' ? <rect x="26" y="38" width="48" height="24" rx="6" className="map-anno-icon--words" /> : null}
      </>
    ) : (
      <>
        {shape.d ? (
          <path
            d={shape.d}
            className={shape.kind === 'sticky' ? 'map-anno-icon--sticky' : undefined}
            strokeDasharray={shape.behind ? '9 7' : undefined}
          />
        ) : null}
        {shape.band ? <path d={shape.band} className="map-anno-icon--band" /> : null}
        {/* A shape with no outline is its marks, so they are drawn as its edge. */}
        {shape.marks ? <path d={shape.marks} className={shape.d ? 'map-anno-icon--marks' : undefined} /> : null}
        {shape.hint ? <path d={shape.hint} className="map-anno-icon--hint" /> : null}
        {shape.strip === 'top' ? <path d="M2 2 H98 V22 H2 Z" className="map-anno-icon--band" /> : null}
        {shape.strip === 'left' ? <path d="M2 2 H22 V98 H2 Z" className="map-anno-icon--band" /> : null}
        {shape.title === 'tab' ? <path d="M2 2 H44 V20 H2 Z" className="map-anno-icon--band" /> : null}
      </>
    )}
  </svg>
)

/** The library of annotations, beside the tools, the way a diagram tool
 *  shows its shapes: grouped, and found by name. Picking one gets it ready
 *  to put down; Esc puts it back. */
export const AnnotationLibrary = ({
  armed,
  onArm,
  onClose,
}: {
  armed: string
  onArm: (kind: string) => void
  onClose: () => void
}) => {
  const [find, setFind] = useState('')
  const [shut, setShut] = useState<string[]>([])
  const wanted = find.trim().toLowerCase()
  const groups = SHAPE_GROUPS.map((g) => ({
    ...g,
    shapes: wanted ? g.shapes.filter((s) => `${s.name} ${s.kind} ${s.also ?? ''}`.toLowerCase().includes(wanted)) : g.shapes,
  })).filter((g) => g.shapes.length)

  return (
    <aside className="map-palette map-anno-library" aria-label="Annotations">
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <marker id="map-anno-icon-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
      </svg>
      <div className="map-palette-head">
        <span>Annotations</span>
        <button type="button" className="map-palette-close" aria-label="Close the annotations" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="map-palette-hint">Notes for people and agents, drawn over the diagram. They never change the code.</div>
      <label className="map-anno-search">
        <Search size={14} aria-hidden="true" />
        <input aria-label="Search shapes" placeholder="Search shapes" value={find} onChange={(e) => setFind(e.target.value)} />
      </label>
      <div className="map-anno-groups">
        {groups.map((g) => {
          const open = wanted !== '' || !shut.includes(g.name)
          return (
            <section key={g.name} className="map-anno-group">
              <button
                type="button"
                className="map-anno-group-head"
                aria-expanded={open}
                onClick={() => setShut(open ? [...shut, g.name] : shut.filter((n) => n !== g.name))}
              >
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {g.name}
              </button>
              {open ? <div className="map-anno-group-says">{g.says}</div> : null}
              {open ? (
                <div className="map-anno-grid">
                  {g.shapes.map((shape) => (
                    <button
                      key={shape.kind}
                      type="button"
                      className={armed === shape.kind ? 'map-anno-pick map-anno-pick--on' : 'map-anno-pick'}
                      aria-label={`Add ${shape.name.toLowerCase()}`}
                      aria-pressed={armed === shape.kind}
                      title={
                        shape.line
                          ? `${shape.name}: drag from one place to another`
                          : shape.behind
                            ? `${shape.name}: drag it round what it holds. It sits behind the cards and grows as they do.`
                            : `${shape.name}: click the board, or drag to size it`
                      }
                      onClick={() => onArm(armed === shape.kind ? '' : shape.kind)}
                    >
                      <ShapeIcon shape={shape} />
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          )
        })}
        {groups.length === 0 ? <div className="map-palette-hint">No shape by that name.</div> : null}
      </div>
    </aside>
  )
}

/** The annotation layers: which are shown, which one new annotations go
 *  on, and whether each lines up with the diagram's cards. */
export const LayersPanel = ({
  layers,
  active,
  onActive,
  onToggle,
  onSnaps,
  onRename,
  onAdd,
  onRemove,
  onClose,
}: {
  layers: Layer[]
  active: string
  onActive: (id: string) => void
  onToggle: (id: string) => void
  onSnaps: (id: string) => void
  onRename: (id: string, name: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onClose: () => void
}) => (
  <div className="map-layers" role="dialog" aria-label="Layers" onPointerDown={(event) => event.stopPropagation()}>
    <div className="map-layers-head">
      <span>Layers</span>
      <button type="button" className="map-palette-close" aria-label="Close the layers" onClick={onClose}>
        <X size={14} />
      </button>
    </div>
    <div className="map-layers-row map-layers-row--diagram">
      <span className="map-layers-dot" />
      <span className="map-layers-name">Diagram</span>
      <span className="ds-hint">always shown</span>
    </div>
    {[...layers].reverse().map((layer) => (
      <div key={layer.id} className={layer.id === active ? 'map-layers-row map-layers-row--on' : 'map-layers-row'}>
        <button
          type="button"
          className="map-layers-icon"
          aria-label={layer.shown ? `Hide ${layer.name}` : `Show ${layer.name}`}
          aria-pressed={layer.shown}
          onClick={() => onToggle(layer.id)}
        >
          {layer.shown ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <input
          className="map-layers-name"
          aria-label="Layer name"
          value={layer.name}
          onFocus={() => onActive(layer.id)}
          onChange={(e) => onRename(layer.id, e.target.value)}
        />
        <button
          type="button"
          className={layer.snaps ? 'map-layers-icon map-layers-icon--on' : 'map-layers-icon'}
          aria-label={layer.snaps ? `${layer.name} lines up with the diagram` : `${layer.name} ignores the diagram`}
          aria-pressed={layer.snaps}
          title={layer.snaps ? 'Lines up with and keeps beside the diagram’s cards' : 'Ignores the diagram’s cards'}
          onClick={() => onSnaps(layer.id)}
        >
          <Magnet size={14} />
        </button>
        <button
          type="button"
          className="map-layers-icon"
          aria-label={`Use ${layer.name} for new annotations`}
          aria-pressed={layer.id === active}
          onClick={() => onActive(layer.id)}
        >
          <span className={layer.id === active ? 'map-layers-radio map-layers-radio--on' : 'map-layers-radio'} />
        </button>
        <button
          type="button"
          className="map-layers-icon"
          aria-label={`Delete ${layer.name}`}
          title={layer.items.length ? `Delete it and its ${layer.items.length} annotation${layer.items.length === 1 ? '' : 's'}` : 'Delete it'}
          onClick={() => onRemove(layer.id)}
        >
          <Trash2 size={14} />
        </button>
      </div>
    ))}
    <button type="button" className="map-layers-add" onClick={onAdd}>
      <Plus size={14} /> New layer
    </button>
  </div>
)
