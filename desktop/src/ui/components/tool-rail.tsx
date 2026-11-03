// codegraph: component tool-rail
import { useEffect, useState } from 'react'
import type { Level } from '../../features/show-map.js'
import { Tool } from '../design-system/kit.js'
import { Glyph, KindGlyph, kindClass } from './kind-glyph.js'
import type { Tool as Which } from './map-canvas.js'
import { kindGroups, levelInside } from './sketch-edits.js'

/** The tools, down the left, part of the frame rather than a floating strip,
 *  so the board never slides under them and a card never hides behind them.
 *  Each one carries its name: a rail of mystery glyphs is how a prototype
 *  stays a prototype. */
export const ToolRail = ({
  tool,
  sketch,
  level,
  kind,
  onTool,
  onKind,
  onStartSketch,
  onFit,
  onOverview,
}: {
  tool: Which
  /** On the map the drawing tools are not there at all. */
  sketch: boolean
  /** The level being drawn on, which says which kinds a card can be. */
  level: Level
  /** The last kind placed at this level, which the Card tool remembers. */
  kind: string
  onTool: (tool: Which) => void
  onKind: (kind: string) => void
  onStartSketch: () => void
  onFit: () => void
  onOverview: () => void
}) => {
  const [kinds, setKinds] = useState(false)
  const groups = kindGroups(levelInside[level])

  // The kinds only make sense while Card is the tool: placing a card puts
  // the tool back to Pick, and the list goes with it.
  useEffect(() => {
    if (tool !== 'card') setKinds(false)
  }, [tool])

  return (
    <div className="map-rail" role="toolbar" aria-label="Tools">
      <div className="map-rail-group">
        <Tool name="Pick" on={tool === 'pick'} hint="Pick and drag; double-click a card to open it" onPick={() => onTool('pick')}>
          <Glyph of="pick" />
        </Tool>
        <Tool name="Pan" on={tool === 'pan'} hint="Drag the board" onPick={() => onTool('pan')}>
          <Glyph of="pan" />
        </Tool>
        <Tool name="Area" on={tool === 'area'} hint="Drag a box to zoom to it" onPick={() => onTool('area')}>
          <Glyph of="area" />
        </Tool>
      </div>

      <span className="map-rail-rule" />

      {sketch ? (
        <div className="map-rail-group">
          <Tool
            name="Card"
            on={tool === 'card'}
            more
            hint="Place a card — opens the kinds for this level"
            onPick={() => {
              onTool('card')
              setKinds(!kinds)
            }}
          >
            {kind ? <KindGlyph kind={kind} size={18} /> : <Glyph of="card" />}
          </Tool>
          <Tool name="Wire" on={tool === 'wire'} hint="Drag from one card to another" onPick={() => onTool('wire')}>
            <Glyph of="wire" />
          </Tool>
          <Tool name="Note" on={tool === 'note'} hint="Leave words anywhere" onPick={() => onTool('note')}>
            <Glyph of="note" />
          </Tool>
          <Tool name="Mockup" on={tool === 'mockup'} hint="Put a picture on a page" onPick={() => onTool('mockup')}>
            <Glyph of="mockup" />
          </Tool>
          {kinds ? (
            <div className="map-flyout" role="menu" aria-label="Kinds of card for this level">
              {groups.map((group) => (
                <div key={group.name || 'all'}>
                  {group.name ? <div className="map-flyout-group">{group.name}</div> : null}
                  {group.kinds.map((one) => (
                    <button
                      key={one}
                      type="button"
                      role="menuitem"
                      className="map-flyout-item"
                      onClick={() => {
                        onKind(one)
                        setKinds(false)
                      }}
                    >
                      <span className={`map-glyph ${kindClass(one)}`}>
                        <KindGlyph kind={one} />
                      </span>
                      <span>{one}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        /* Greyed-out drawing tools tell a person they did something wrong.
           This tells them what to do instead. */
        <div className="map-rail-group">
          <Tool
            name="Sketch"
            on={false}
            hint="The map is read from the code. Start a sketch to draw."
            onPick={onStartSketch}
          >
            <Glyph of="card" />
          </Tool>
        </div>
      )}

      <span className="map-rail-rule" />

      <div className="map-rail-group">
        <Tool name="Fit" on={false} hint="Fit the level to the window" onPick={onFit}>
          <Glyph of="fit" />
        </Tool>
        <Tool name="Overview" on={false} hint="Show where you are" onPick={onOverview}>
          <Glyph of="overview" />
        </Tool>
      </div>
    </div>
  )
}
