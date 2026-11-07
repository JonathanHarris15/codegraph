// codegraph: component project-card
import type { ProjectView } from '../../features/list-projects.js'
import type { Point } from '../../modules/reader/index.js'
import { SoftwareSystemRow } from './software-system-row.js'

const countWords = (many: number): string =>
  many === 0 ? 'no software systems yet' : many === 1 ? '1 software system' : `${many} software systems`

/** One project: double-click anywhere on it, but its list of repos, to open
 *  its map. The repos fill its lower half, with a quiet last line to link
 *  another. */
export const ProjectCard = ({
  project,
  onLink,
  onOpen,
  onChoose,
  linking,
  onPutOnline,
  onMembers,
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
}) => (
  <div className="ds-card project-card" onDoubleClick={() => onOpen(project.id)}>
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
    </div>

    {onMembers || onPutOnline ? (
      <div className="ds-row" style={{ padding: '0 var(--space-3, 12px)', gap: 6 }} onDoubleClick={(event) => event.stopPropagation()}>
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
