// codegraph: component tool-rail
import { Tool } from '../design-system/kit.js'
import { Glyph } from './kind-glyph.js'
import type { Tool as Which } from './map-canvas.js'

/** The tools, down the left, part of the frame rather than a floating strip,
 *  so the board never slides under them and a card never hides behind them.
 *  Each one carries its name, and the key that picks it. */
export const ToolRail = ({
  tool,
  sketch,
  palette,
  canUndo,
  canRedo,
  onTool,
  onPalette,
  onUndo,
  onRedo,
  onStartSketch,
  onFit,
  onOverview,
}: {
  tool: Which
  /** On the map the drawing tools are not there at all. */
  sketch: boolean
  /** The card library beside the rail is open. */
  palette: boolean
  canUndo: boolean
  canRedo: boolean
  onTool: (tool: Which) => void
  onPalette: () => void
  onUndo: () => void
  onRedo: () => void
  onStartSketch: () => void
  onFit: () => void
  onOverview: () => void
}) => (
  <div className="map-rail" role="toolbar" aria-label="Tools">
    <div className="map-rail-group">
      <Tool
        name="Pick"
        on={tool === 'pick'}
        hint={sketch ? 'Pick, drag a box to pick many, drag to move (V)' : 'Pick; click a card to open it'}
        onPick={() => onTool('pick')}
      >
        <Glyph of="pick" />
      </Tool>
      <Tool name="Pan" on={tool === 'pan'} hint="Drag the board (H, or hold Space)" onPick={() => onTool('pan')}>
        <Glyph of="pan" />
      </Tool>
      {sketch ? null : (
        <Tool name="Area" on={tool === 'area'} hint="Drag a box to zoom to it" onPick={() => onTool('area')}>
          <Glyph of="area" />
        </Tool>
      )}
    </div>

    <span className="map-rail-rule" />

    {sketch ? (
      <div className="map-rail-group">
        <Tool name="Cards" on={palette} hint="Show or hide the cards to drag in (C)" onPick={onPalette}>
          <Glyph of="cards" />
        </Tool>
        <Tool name="Wire" on={tool === 'wire'} hint="Drag from one card to another (W)" onPick={() => onTool('wire')}>
          <Glyph of="wire" />
        </Tool>
        <Tool name="Note" on={tool === 'note'} hint="Click to leave a note (N)" onPick={() => onTool('note')}>
          <Glyph of="note" />
        </Tool>
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

    <span className="map-rail-rule" />

    {sketch ? (
      <>
        <div className="map-rail-group">
          <Tool name="Undo" on={false} hint="Undo (Ctrl+Z)" disabled={!canUndo} onPick={onUndo}>
            <Glyph of="undo" />
          </Tool>
          <Tool name="Redo" on={false} hint="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onPick={onRedo}>
            <Glyph of="redo" />
          </Tool>
        </div>
        <span className="map-rail-rule" />
      </>
    ) : null}

    <div className="map-rail-group">
      <Tool name="Fit" on={false} hint="Fit the level to the window (0)" onPick={onFit}>
        <Glyph of="fit" />
      </Tool>
      <Tool name="Overview" on={false} hint="Show where you are" onPick={onOverview}>
        <Glyph of="overview" />
      </Tool>
    </div>
  </div>
)
