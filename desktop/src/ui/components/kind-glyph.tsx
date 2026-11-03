// codegraph: component kind-glyph
import {
  AlarmClock,
  AppWindow,
  ArrowRight,
  Box,
  ChevronDown,
  ChevronRight,
  Cloud,
  CornerLeftUp,
  Database,
  Ellipsis,
  FileCode,
  Globe,
  Hand,
  HardDrive,
  ImagePlus,
  Layers,
  LayoutPanelTop,
  Map as MapGlyph,
  Maximize,
  Minus,
  Monitor,
  MousePointer2,
  Package,
  Play,
  Plus,
  Scan,
  Server,
  Smartphone,
  SquareFunction,
  SquarePlus,
  SquareTerminal,
  StickyNote,
  Star,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'

/** The glyph for each kind of card, so what a card is never rests on its
 *  colour alone. Every kind in `kindsAt` is here, and `person`, which is
 *  drawn and never read. */
const GLYPHS: Record<string, LucideIcon> = {
  project: Layers,
  person: UserRound,
  'software system': Box,
  'shallow software system': Cloud,
  'web app': Globe,
  'browser app': AppWindow,
  server: Server,
  'desktop app': Monitor,
  'mobile app': Smartphone,
  database: Database,
  'files on disk': HardDrive,
  function: SquareFunction,
  'command-line tool': SquareTerminal,
  page: LayoutPanelTop,
  feature: Play,
  module: Package,
  trigger: AlarmClock,
  file: FileCode,
}

/** The glyphs of the canvas itself: tools, and getting around. */
export const TOOL_GLYPHS = {
  pick: MousePointer2,
  pan: Hand,
  area: Scan,
  card: SquarePlus,
  wire: ArrowRight,
  note: StickyNote,
  mockup: ImagePlus,
  fit: Maximize,
  overview: MapGlyph,
  in: Plus,
  out: Minus,
  up: CornerLeftUp,
  down: ChevronDown,
  right: ChevronRight,
  close: X,
  more: Ellipsis,
  start: Star,
} as const

export type ToolGlyph = keyof typeof TOOL_GLYPHS

/** What a card of this kind is drawn in. The colour itself lives in the
 *  `kind-of--…` classes; this only says which cards are shaped like a store. */
export const keeps = (kind: string): boolean => /^(database|files on disk)$/.test(kind)

export const kindClass = (kind: string): string => `kind-of--${(kind || 'container').replace(/\s+/g, '-')}`

export const KindGlyph = ({ kind, size = 14 }: { kind: string; size?: number }) => {
  const Glyph = GLYPHS[kind] ?? Box
  return <Glyph size={size} strokeWidth={2} aria-hidden="true" />
}

export const Glyph = ({ of: name, size = 18 }: { of: ToolGlyph; size?: number }) => {
  const Drawn = TOOL_GLYPHS[name]
  return <Drawn size={size} strokeWidth={2} aria-hidden="true" />
}
