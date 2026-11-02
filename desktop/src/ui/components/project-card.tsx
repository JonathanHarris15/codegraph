// codegraph: component project-card
import type { ProjectView } from '../../features/list-projects.js'
import { Button, Card } from '../design-system/kit.js'
import { CodebaseRow } from './codebase-row.js'

const countWords = (many: number): string =>
  many === 0 ? 'no codebases yet' : many === 1 ? '1 codebase' : `${many} codebases`

export const ProjectCard = ({
  project,
  onLink,
  linking,
}: {
  project: ProjectView
  onLink: (projectId: string) => void
  linking: boolean
}) => (
  <Card>
    <div className="ds-card-top">
      <div>
        <div className="ds-card-name">{project.name}</div>
        <div className="ds-hint">{countWords(project.codebases.length)}</div>
      </div>
      <Button onClick={() => onLink(project.id)} disabled={linking}>
        {linking ? 'Linking…' : 'Link a repo'}
      </Button>
    </div>

    {project.codebases.length === 0 ? (
      <div className="ds-hint">
        Link a repo that git already tracks. Codegraph is set up inside it with{' '}
        <span className="ds-mono">/codegraph:setup</span>.
      </div>
    ) : (
      <div className="ds-rows">
        {project.codebases.map((codebase) => (
          <CodebaseRow key={codebase.id} codebase={codebase} />
        ))}
      </div>
    )}
  </Card>
)
