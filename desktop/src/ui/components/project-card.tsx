// codegraph: component project-card
import { ArrowRight, FolderPlus, MoreHorizontal } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ProjectView } from '../../features/list-projects.js'
import type { Point } from '../../modules/reader/index.js'
import { Button } from '../design-system/kit.js'
import { CanvasMenu, type MenuItem } from './canvas-menu.js'
import { SoftwareSystemRow } from './software-system-row.js'

/** How many repos, which is not how many software systems: one can be kept
 *  in several (ADR 0028). */
const countWords = (many: number): string => (many === 0 ? 'no repos yet' : many === 1 ? '1 repo' : `${many} repos`)

/** One project: a click on its head opens its map, and the head says so.
 *  The repos fill its lower half, with a quiet last line to link another;
 *  with none yet, linking the first is the one thing it asks.
 *  Its ... holds what is done to the project itself. */
export const ProjectCard = ({
  project,
  onLink,
  onOpen,
  onChoose,
  linking,
  onPutOnline,
  onMembers,
  onRename,
  onDelete,
  rowBusy,
  onLinkHere,
  onClone,
  onForget,
  onUnlink,
}: {
  project: ProjectView
  onLink: (projectId: string) => void
  onOpen: (projectId: string) => void
  /** A person chose the branch one of its repos' maps opens on. */
  onChoose: (systemId: string, point: Point) => void
  linking: boolean
  /** Only on this computer, with an online side to go to. */
  onPutOnline?: () => void
  /** Online: who is on it. */
  onMembers?: () => void
  /** Each only for those who may. */
  onRename?: () => void
  onDelete?: () => void
  /** The repo row busy linking or cloning, if any. */
  rowBusy: { systemId: string; what: 'link' | 'clone' } | null
  /** Link a folder as a repo's working copy here: the one given, or one picked. */
  onLinkHere: (systemId: string, path?: string) => void
  onClone: (systemId: string) => void
  /** Unlink this computer's folder; the repo stays on the project. */
  onForget: (systemId: string) => void
  /** Take a repo off the project for everyone; only for those who may. */
  onUnlink?: (systemId: string) => void
}) => {
  const card = useRef<HTMLDivElement>(null)
  const more = useRef<HTMLButtonElement>(null)
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const [rowMenu, setRowMenu] = useState<{ systemId: string; x: number; y: number; opener: HTMLButtonElement } | null>(null)
  const rowItems = (systemId: string): MenuItem[] => {
    const system = project.systems.find((s) => s.id === systemId)
    if (!system) return []
    const own: MenuItem[] = [
      ...(system.path ? [{ name: 'Unlink this folder', act: () => onForget(systemId) }] : []),
      ...(system.present ? [{ name: 'Link a different folder…', act: () => onLinkHere(systemId) }] : []),
    ]
    if (!onUnlink) return own
    return [...own, ...(own.length ? ['rule' as const] : []), { name: 'Take off the project…', danger: true, act: () => onUnlink(systemId) }]
  }
  const openRowMenu = (systemId: string, opener: HTMLButtonElement): void => {
    const box = card.current?.getBoundingClientRect()
    const at = opener.getBoundingClientRect()
    if (!box) return
    setRowMenu(rowMenu?.systemId === systemId ? null : { systemId, x: at.right - box.left - 200, y: at.bottom - box.top + 4, opener })
  }
  const canInvite = project.role === 'owner' || project.role === 'co-owner'
  const items: MenuItem[] = [
    ...(onRename ? [{ name: 'Rename', act: onRename }] : []),
    ...(onMembers ? [{ name: canInvite ? 'Add people' : 'Members', act: onMembers }] : []),
    ...(onPutOnline ? [{ name: 'Put online to add people', act: onPutOnline }] : []),
    ...(onDelete ? ['rule' as const, { name: 'Delete…', danger: true, act: onDelete }] : []),
  ]
  const openMenu = (): void => {
    const box = card.current?.getBoundingClientRect()
    const at = more.current?.getBoundingClientRect()
    if (!box || !at) return
    setMenuAt({ x: at.right - box.left - 180, y: at.bottom - box.top + 4 })
  }

  return (
  <div ref={card} className="ds-card project-card">
    <div
      className="project-card-top"
      role="button"
      tabIndex={0}
      aria-label={`Open ${project.name}`}
      data-to={`/projects/${project.id}`}
      onClick={() => onOpen(project.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(project.id)
        }
      }}
    >
      <div className="ds-card-name">{project.name}</div>
      <div className="ds-hint" title="The name this project goes by in its repos' codegraph.config.json">
        {countWords(project.systems.length)} · short name <span className="ds-mono">{project.shortName}</span>
      </div>
      <span className="project-card-open" aria-hidden="true">
        Open map <ArrowRight size={13} />
      </span>
      {items.length ? (
        <button
          ref={more}
          type="button"
          className="project-card-more"
          aria-label={`More for ${project.name}`}
          aria-haspopup="menu"
          aria-expanded={menuAt !== null}
          onClick={(event) => {
            event.stopPropagation()
            if (menuAt) setMenuAt(null)
            else openMenu()
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <MoreHorizontal size={16} />
        </button>
      ) : null}
    </div>
    {menuAt ? (
      <div onKeyDown={(event) => event.stopPropagation()}>
        <CanvasMenu
          at={menuAt}
          items={items}
          opener={more}
          onClose={() => setMenuAt(null)}
        />
      </div>
    ) : null}

    {onMembers || onPutOnline ? (
      <div className="ds-row project-card-people">
        {onMembers ? (
          <button type="button" className="ds-badge project-card-members" onClick={onMembers} aria-label={`Members of ${project.name}`}>
            {project.members.length === 1 ? 'Just you' : `${project.members.length} members`}
            {project.role && project.role !== 'owner' ? ` · you are a ${project.role}` : ''}
          </button>
        ) : null}
        {onPutOnline ? (
          <button type="button" className="map-notice" onClick={onPutOnline}>
            Only on this computer · Put online
          </button>
        ) : null}
      </div>
    ) : null}

    {rowMenu ? (
      <div onKeyDown={(event) => event.stopPropagation()}>
        <CanvasMenu
          at={{ x: rowMenu.x, y: rowMenu.y }}
          items={rowItems(rowMenu.systemId)}
          opener={{ current: rowMenu.opener }}
          onClose={() => setRowMenu(null)}
        />
      </div>
    ) : null}

    <div className="project-repos" aria-label={`Repos in ${project.name}`}>
      {project.systems.map((system) => (
        <SoftwareSystemRow
          key={system.id}
          system={system}
          project={project.shortName}
          onChoose={(point) => onChoose(system.id, point)}
          busy={rowBusy?.systemId === system.id ? rowBusy.what : ''}
          onLink={(path) => onLinkHere(system.id, path)}
          onClone={() => onClone(system.id)}
          {...(rowItems(system.id).length ? { onMore: (button: HTMLButtonElement) => openRowMenu(system.id, button) } : {})}
        />
      ))}
      {project.systems.length === 0 ? (
        <div className="project-repos-empty">
          <span>Link the git repos this project is made of. Each one's map is read from its code.</span>
          <Button onClick={() => onLink(project.id)} disabled={linking}>
            <FolderPlus size={14} aria-hidden="true" />
            {linking ? 'Linking…' : 'Link a repo'}
          </Button>
        </div>
      ) : (
        <button type="button" className="project-repos-link" onClick={() => onLink(project.id)} disabled={linking}>
          {linking ? 'Linking…' : '+ Link a repo'}
        </button>
      )}
    </div>
  </div>
  )
}
