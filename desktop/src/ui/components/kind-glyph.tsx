// codegraph: component kind-glyph
import {
  AlarmClock,
  Rows3,
  Table2,
  Bell,
  ChartColumn,
  Cpu,
  CreditCard,
  GitBranch,
  Lock,
  Mail,
  MessageSquare,
  Search,
  Settings,
  Shield,
  Users,
  Zap,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  Copy,
  Keyboard,
  Pencil,
  Redo2,
  Shapes,
  SquareArrowOutUpRight,
  Trash2,
  Undo2,
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
  store: Table2,
  'inner store': Rows3,
  function: SquareFunction,
  'command-line tool': SquareTerminal,
  page: LayoutPanelTop,
  feature: Play,
  module: Package,
  trigger: AlarmClock,
  file: FileCode,
  note: StickyNote,
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
  edit: Pencil,
  bin: Trash2,
  undo: Undo2,
  redo: Redo2,
  copy: Copy,
  inside: SquareArrowOutUpRight,
  cards: Shapes,
  keys: Keyboard,
  alignLeft: AlignStartVertical,
  alignCenter: AlignCenterVertical,
  alignRight: AlignEndVertical,
  alignTop: AlignStartHorizontal,
  alignMiddle: AlignCenterHorizontal,
  alignBottom: AlignEndHorizontal,
  spaceAcross: AlignHorizontalSpaceAround,
  spaceDown: AlignVerticalSpaceAround,
} as const

export type ToolGlyph = keyof typeof TOOL_GLYPHS

/** What a card of this kind is drawn in. The colour itself lives in the
 *  `kind-of--…` classes; this only says which cards are shaped like a store. */
export const keeps = (kind: string): boolean => kind === 'database'

/** A store, or one that lives inside another: its card lists its fields. */
export const isStore = (kind: string): boolean => kind === 'store' || kind === 'inner store'

export const kindClass = (kind: string): string => `kind-of--${(kind || 'container').replace(/\s+/g, '-')}`

export const KindGlyph = ({ kind, size = 14 }: { kind: string; size?: number }) => {
  const Glyph = GLYPHS[kind] ?? Box
  return <Glyph size={size} strokeWidth={2} aria-hidden="true" />
}

/** The icons a person's own type of card can have. A database's is not among
 *  them: a database is its own kind of card, not a look (ADR 0013). */
export const LOOK_ICONS: Record<string, LucideIcon> = {
  package: Package,
  box: Box,
  globe: Globe,
  window: AppWindow,
  server: Server,
  monitor: Monitor,
  phone: Smartphone,
  cloud: Cloud,
  function: SquareFunction,
  terminal: SquareTerminal,
  page: LayoutPanelTop,
  play: Play,
  clock: AlarmClock,
  file: FileCode,
  disk: HardDrive,
  shield: Shield,
  lock: Lock,
  mail: Mail,
  message: MessageSquare,
  bell: Bell,
  card: CreditCard,
  users: Users,
  person: UserRound,
  chip: Cpu,
  branch: GitBranch,
  search: Search,
  chart: ChartColumn,
  settings: Settings,
  bolt: Zap,
  star: Star,
}

export const LookGlyph = ({ icon, size = 14 }: { icon: string; size?: number }) => {
  const Drawn = LOOK_ICONS[icon] ?? Package
  return <Drawn size={size} strokeWidth={2} aria-hidden="true" />
}

/** The class that gives a person's own type of card its colour. */
export const lookClass = (look: { color: string }): string => `look--${look.color}`

/** The little mark for something a card can be made as. */
export const CardMark = ({ kind, look, size = 16, small = false }: { kind: string; look?: { icon: string; color: string }; size?: number; small?: boolean }) => (
  <span className={`map-palette-swatch${small ? ' map-palette-swatch--small' : ''} ${kindClass(kind)}${look ? ` ${lookClass(look)}` : ''}`}>
    {look ? <LookGlyph icon={look.icon} size={size} /> : <KindGlyph kind={kind} size={size} />}
  </span>
)

export const Glyph = ({ of: name, size = 18 }: { of: ToolGlyph; size?: number }) => {
  const Drawn = TOOL_GLYPHS[name]
  return <Drawn size={size} strokeWidth={2} aria-hidden="true" />
}
