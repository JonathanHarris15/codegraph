// What `codegraph.py --summary` prints: the map as the pane draws it.

export type FeatureBrief = {
  id: string
  name: string
  uses: string[]
  triggers: string[]
  files: string[]
}

export type UnitBrief = {
  id: string
  name: string
  files: string[]
  door?: string[]
  stores?: string[]
  reads?: string[]
  route?: string
  start?: boolean
}

export type StoreBrief = { id: string; name: string; owner: string; fields: string[] }

// One card on a view: a unit on the map, or a file inside a unit.
export type ViewNode = {
  id: string
  label: string
  kind: string
  col: number
  row: number
  dir?: string
  own?: boolean
  system?: string
  door?: string[]
  uses?: string[]
  route?: string
  start?: boolean
  fields?: string[]
  owner?: string
}

// One wire; `bad` holds the rules it breaks.
export type ViewEdge = { from: string; to: string; kind: string; bad?: string[] }

export type View = { title: string; columns: string[]; nodes: ViewNode[]; edges: ViewEdge[] }

// One mismatch, pinned to the map card and the file it belongs to.
export type Issue = {
  text: string
  rel: string
  line: number
  line_text: string
  group: string
  file: string
  card: string
}

export type IssueGroup = { id: string; label: string }

export type Summary = {
  root: string
  source: 'tags' | 'draft' | 'none'
  systems: { name: string; features: FeatureBrief[] }[]
  modules: UnitBrief[]
  pages: UnitBrief[]
  components: UnitBrief[]
  stores: StoreBrief[]
  mismatches: string[]
  unknown: string[]
  issues: Issue[]
  groups: IssueGroup[]
  views: Record<string, View>
}

// Where the person is on the map: the views they went into, the card they
// picked, how far in they zoomed, and which mismatch lists they folded away.
export type Nav = {
  trail: string[]
  selected: string | null
  zoom: number
  cx: number | null
  cy: number | null
  issuesOpen: boolean
  closed: string[]
  more: string[]
}

declare module 'claude-code' {
  interface PluginState {
    codegraph: { map: Summary | null; status: string; nav: Nav }
  }
}
