// codegraph: component project-card
import { MoreHorizontal } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ProjectView } from '../../features/list-projects.js'
import type { Point } from '../../modules/reader/index.js'
import { CanvasMenu, type MenuItem } from './canvas-menu.js'
import { SoftwareSystemRow } from './software-system-row.js'

const countWords = (many: number): string =>
  many === 0 ? 'no software systems yet' : many === 1 ? '1 software system' : `${many} software systems`

/** One project: double-click anywhere on it, but its list of repos, to open
 *  its map. The repos fill its lower half, with a quiet last line to link
 *  another. Its ... holds what is done to the project itself. */
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
}: {
  project: ProjectView
  onLink: (projectId: string) => void
  onOpen: (projectId: string) => void
  /** A person picked the branch one of its repos' maps opens on. */
  onChoose: (systemId: string, point: Point) => void
  linking: boolean
  /** Only on this computer, with an online side to go to. */
  onPutOnline?: () => void
  /** Online: who is on it. */
  onMembers?: () => void
  /** Each only for those who may. */
  onRename?: () => void
  onDelete?: () => void
}) => {
  const card = useRef<HTMLDivElement>(null)
  const more = useRef<HTMLButtonElement>(null)
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
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
  <div ref={card} className="ds-card project-card" onDoubleClick={() => onOpen(project.id)}>
    <div
      className="project-card-top"
      role="button"
      tabIndex={0}
      aria-label={`Open ${project.name}`}
      data-to={`/projects/${project.id}`}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen(project.id)
      }}
    >
      <div className="ds-card-name">{project.name}</div>
      <div className="ds-hint">
        {countWords(project.systems.length)} · repos call it <span className="ds-mono">{project.shortName}</span>
      </div>
      <span className="project-card-open" aria-hidden="true">
        Double-click to open
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
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal size={16} />
        </button>
      ) : null}
    </div>
    {menuAt ? (
      <div onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <CanvasMenu
          at={menuAt}
          items={items}
          opener={more}
          onClose={() => setMenuAt(null)}
        />
      </div>
    ) : null}

    {onMembers || onPutOnline ? (
      <div className="ds-row project-card-people" onDoubleClick={(event) => event.stopPropagation()}>
        {onMembers ? (
          <button type="button" className="map-notice" onClick={onMembers} aria-label={`Members of ${project.name}`}>
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

    <div className="project-repos" aria-label={`Repos in ${project.name}`} onDoubleClick={(event) => event.stopPropagation()}>
      {project.systems.map((system) => (
        <SoftwareSystemRow
          key={system.id}
          system={system}
          project={project.shortName}
          onChoose={(point) => onChoose(system.id, point)}
        />
      ))}
      <button type="button" className="project-repos-link" onClick={() => onLink(project.id)} disabled={linking}>
        {linking
          ? 'Linking…'
          : project.systems.length === 0
            ? '+ Link a repo git already tracks'
            : '+ Link a new repo'}
      </button>
    </div>
  </div>
  )
}
