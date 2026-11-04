// codegraph: component project-card
import type { ProjectView } from '../../features/list-projects.js'
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
  linking,
}: {
  project: ProjectView
  onLink: (projectId: string) => void
  onOpen: (projectId: string) => void
  linking: boolean
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

    <div className="project-repos" aria-label={`Repos in ${project.name}`} onDoubleClick={(event) => event.stopPropagation()}>
      {project.systems.map((system) => (
        <SoftwareSystemRow key={system.id} system={system} project={project.shortName} />
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
