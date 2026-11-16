// codegraph: component tool-rail
import { Keyboard, Layers, PenTool } from 'lucide-react'
import { Tool } from '../design-system/kit.js'
import { keysFor } from './hotkeys.js'
import { Glyph } from './kind-glyph.js'
import type { Tool as Which } from './map-canvas.js'

/** The tools, down the left, part of the frame rather than a floating strip,
 *  so the board never slides under them and a card never hides behind them.
 *  Each one carries its name, and the key that picks it. A tool in use is
 *  ink; a button whose panel is open is sunken, so the two never read alike.
 *  Fitting and the overview live by the zoom, not here. */
export const ToolRail = ({
  tool,
  sketch,
  annotating = true,
  palette,
  canUndo,
  canRedo,
  onTool,
  onPalette,
  onUndo,
  onRedo,
  onStartSketch,
  annotations,
  layers,
  keys,
  onAnnotations,
  onLayers,
  onKeys,
}: {
  /** The annotation library is open, and the layers list. */
  annotations: boolean
  layers: boolean
  /** The list of keys is open. */
  keys: boolean
  onAnnotations: () => void
  onLayers: () => void
  onKeys: () => void
  tool: Which
  /** On the map the drawing tools are not there at all. */
  sketch: boolean
  /** Annotations can be drawn here. Where they cannot, as on a proposal, a
   *  plain note stands in for them. */
  annotating?: boolean
  /** The card library beside the rail is open. */
  palette: boolean
  canUndo: boolean
  canRedo: boolean
  onTool: (tool: Which) => void
  onPalette: () => void
  onUndo: () => void
  onRedo: () => void
  onStartSketch: () => void
}) => (
  <div className="map-rail" role="toolbar" aria-label="Tools">
    <div className="map-rail-group">
      <Tool
        name="Pick"
        on={tool === 'pick'}
        hint={
          sketch
            ? 'Pick; drag cards and words to move them, Shift and drag a box to pick many (V)'
            : 'Pick; drag a card or a wire’s words to move them, double-click a card to go in, F to fill the screen (V)'
        }
        onPick={() => onTool('pick')}
      >
        <Glyph of="pick" />
      </Tool>
      <Tool name="Pan" on={tool === 'pan'} hint="Drag the board (H, or hold Space)" onPick={() => onTool('pan')}>
        <Glyph of="pan" />
      </Tool>
      {sketch ? null : (
        <Tool name="Area" on={tool === 'area'} hint="Drag a box to zoom to it (Z)" onPick={() => onTool('area')}>
          <Glyph of="area" />
        </Tool>
      )}
    </div>

    <span className="map-rail-rule" />

    {sketch ? (
      <div className="map-rail-group">
        <Tool name="Cards" on={false} open={palette} hint="Show or hide the cards to drag in (C)" onPick={onPalette}>
          <Glyph of="cards" />
        </Tool>
        <Tool name="Wire" on={tool === 'wire'} hint="Drag from one card to another (W)" onPick={() => onTool('wire')}>
          <Glyph of="wire" />
        </Tool>
        {annotating ? null : (
          <Tool name="Note" on={tool === 'note'} hint="Click to leave a note (N)" onPick={() => onTool('note')}>
            <Glyph of="note" />
          </Tool>
        )}
      </div>
    ) : (
      /* Greyed-out drawing tools tell a person they did something wrong.
         This tells them what to do instead. */
      <div className="map-rail-group">
        <Tool name="Sketch" on={false} hint="The map is read from the code. Start a sketch to draw." onPick={onStartSketch}>
          <Glyph of="card" />
        </Tool>
      </div>
    )}

    {annotating ? (
      <>
        <span className="map-rail-rule" />
        {/* One way in to annotations, sticky notes first: N still puts one
            down straight away. */}
        <div className="map-rail-group">
          <Tool
            name="Annotate"
            on={tool === 'note'}
            open={annotations}
            hint="Sticky notes, text, shapes and lines over the diagram (Shift+A; N for a note)"
            onPick={onAnnotations}
          >
            <PenTool size={18} strokeWidth={2} aria-hidden="true" />
          </Tool>
          <Tool
            name="Layers"
            on={false}
            open={layers}
            hint="Show, hide and pick annotation layers (Shift+L, or [ and ] to step through them)"
            onPick={onLayers}
          >
            <Layers size={18} strokeWidth={2} aria-hidden="true" />
          </Tool>
        </div>
      </>
    ) : null}

    {sketch ? (
      <>
        <span className="map-rail-rule" />
        <div className="map-rail-group">
          <Tool name="Undo" on={false} hint={keysFor('Undo (Ctrl+Z)')} disabled={!canUndo} onPick={onUndo}>
            <Glyph of="undo" />
          </Tool>
          <Tool name="Redo" on={false} hint={keysFor('Redo (Ctrl+Shift+Z)')} disabled={!canRedo} onPick={onRedo}>
            <Glyph of="redo" />
          </Tool>
        </div>
      </>
    ) : null}

    {/* Keys sits at the foot, out of the way of the tools. */}
    <div className="map-rail-group map-rail-foot">
      <Tool name="Keys" on={false} open={keys} hint="Every key, and every way to draw (?)" onPick={onKeys}>
        <Keyboard size={18} strokeWidth={2} aria-hidden="true" />
      </Tool>
    </div>
  </div>
)
