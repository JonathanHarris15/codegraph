// codegraph: component project-card
import type { ProjectView } from '../../features/list-projects.js'
import { Button, Card } from '../design-system/kit.js'
import { SoftwareSystemRow } from './software-system-row.js'

const countWords = (many: number): string =>
  many === 0 ? 'no software systems yet' : many === 1 ? '1 software system' : `${many} software systems`

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
  <Card>
    <div className="ds-card-top">
      <div>
        <div className="ds-card-name">{project.name}</div>
        <div className="ds-hint">{countWords(project.systems.length)}</div>
      </div>
      <div className="ds-row">
        <Button onClick={() => onLink(project.id)} disabled={linking}>
          {linking ? 'Linking…' : 'Link a repo'}
        </Button>
        <a
          className="ds-button ds-button--loud"
          href={`/projects/${project.id}`}
          onClick={(event) => {
            event.preventDefault()
            onOpen(project.id)
          }}
        >
          Open map
        </a>
      </div>
    </div>

    {project.systems.length === 0 ? (
      <div className="ds-hint">
        Link a repo that git already tracks. Your agent sets it up for codegraph through the
        codegraph MCP.
      </div>
    ) : (
      <div className="ds-rows">
        {project.systems.map((system) => (
          <SoftwareSystemRow key={system.id} system={system} />
        ))}
      </div>
    )}
  </Card>
)
