// codegraph: module updates
// codegraph: front door newerRelease, isNewer, forgetLastLook, Update, Computer

/** Whether a newer codegraph is out, asked of the GitHub release it is
 *  published as. Asking needs no sign-in, and never fails loudly: a person
 *  who is offline, or past GitHub's limit, is simply told nothing. */

/** A newer codegraph, and where to get it. */
export type Update = {
  version: string
  /** What the release says changed, as written on GitHub. */
  notes: string
  /** The release's page on GitHub. */
  page: string
  /** The installer for this computer, or the release page if none fits. */
  download: string
}

/** What kind of computer the installer is for, as Node names it. */
export type Computer = { platform: string; arch: string }

type RawRelease = {
  tag_name?: string
  html_url?: string
  body?: string | null
  assets?: { name?: string; browser_download_url?: string }[]
}

/** The parts of a version, and whatever follows a dash (1.0.0-beta.1). */
const partsOf = (version: string): { numbers: number[]; early: string } | null => {
  const found = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/)
  if (!found) return null
  return { numbers: [Number(found[1]), Number(found[2]), Number(found[3])], early: found[4] ?? '' }
}

/** Whether `out` is a later version than `have`. A version with a dash after
 *  it comes before the same version without one. */
export const isNewer = (out: string, have: string): boolean => {
  const a = partsOf(out)
  const b = partsOf(have)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    const diff = (a.numbers[i] ?? 0) - (b.numbers[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  if (a.early === b.early) return false
  if (a.early === '') return true
  if (b.early === '') return false
  return a.early.localeCompare(b.early, undefined, { numeric: true }) > 0
}

/** How each installer is named in a release, by the computer it is for. */
const fitsComputer = (name: string, { platform, arch }: Computer): boolean => {
  if (platform === 'win32') return /windows-setup\.exe$/i.test(name)
  if (platform === 'darwin') return name.toLowerCase().endsWith(`mac-${arch}.dmg`)
  if (platform === 'linux') return /\.AppImage$/i.test(name)
  return false
}

const AN_HOUR = 60 * 60 * 1000
let lastLook: { url: string; at: number; release: RawRelease | null } | null = null

/** Starts afresh, as if GitHub had never been asked. */
export const forgetLastLook = (): void => {
  lastLook = null
}

/** The newest release, asked of GitHub at most once an hour; null if it could
 *  not be had. */
const latest = async (url: string): Promise<RawRelease | null> => {
  if (lastLook && lastLook.url === url && Date.now() - lastLook.at < AN_HOUR) return lastLook.release
  let release: RawRelease | null = null
  try {
    const answer = await fetch(url, {
      headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'codegraph-desktop' },
    })
    if (answer.ok) release = (await answer.json()) as RawRelease
  } catch {
    release = null
  }
  lastLook = { url, at: Date.now(), release }
  return release
}

/** The release at `url` if it is newer than `current`; null if not, or if
 *  there is no url to ask, or GitHub could not be asked. */
export const newerRelease = async (current: string, url: string, computer: Computer): Promise<Update | null> => {
  if (!url || !current) return null
  const release = await latest(url)
  const tag = release?.tag_name ?? ''
  if (!release || !isNewer(tag, current)) return null
  const page = release.html_url ?? ''
  const installer = (release.assets ?? []).find((asset) => fitsComputer(asset.name ?? '', computer))
  return {
    version: tag.replace(/^v/, ''),
    notes: (release.body ?? '').trim(),
    page,
    download: installer?.browser_download_url || page,
  }
}
