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
  svg: string
}

declare module 'claude-code' {
  interface PluginState {
    codegraph: { map: Summary | null; status: string }
  }
}
