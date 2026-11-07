// codegraph: component project-sheets
import { useState } from 'react'
import type { ProjectView } from '../../features/list-projects.js'
import { Button, Field, Sheet } from '../design-system/kit.js'

/** Gives a project a new name. Its short name, which repos name it by, stays. */
export const RenameProjectSheet = ({ project, onClose, onDone }: { project: ProjectView; onClose: () => void; onDone: () => void }) => {
  const [name, setName] = useState(project.name)
  const [problem, setProblem] = useState('')
  const save = async (): Promise<void> => {
    if (!name.trim() || name.trim() === project.name) return onClose()
    const done = await window.codegraph.renameProject(project.id, name)
    if (!done.ok) return setProblem(done.problem ?? '')
    onDone()
    onClose()
  }
  return (
    <Sheet title={`Rename ${project.name}`} onClose={onClose}>
      <Field label="Name" value={name} focus onChange={setName} onEnter={() => void save()} />
      <div className="ds-hint">
        Repos still call it <span className="ds-mono">{project.shortName}</span>, so none of them has to change.
      </div>
      {problem ? (
        <div className="ds-hint" role="alert">
          {problem}
        </div>
      ) : null}
      <div className="ds-sheet-actions">
        <Button look="bare" onClick={onClose}>
          Cancel
        </Button>
        <Button look="loud" disabled={!name.trim()} onClick={() => void save()}>
          Rename
        </Button>
      </div>
    </Sheet>
  )
}

/** Asks before a project goes, and makes the person type its name, so it never
 *  goes by a slip. */
export const DeleteProjectSheet = ({ project, onClose, onDone }: { project: ProjectView; onClose: () => void; onDone: () => void }) => {
  const [typed, setTyped] = useState('')
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  const sure = typed.trim() === project.name.trim()
  const others = project.members.length - 1
  const remove = async (): Promise<void> => {
    if (!sure || busy) return
    setBusy(true)
    const done = await window.codegraph.deleteProject(project.id)
    setBusy(false)
    if (!done.ok) return setProblem(done.problem ?? '')
    onDone()
    onClose()
  }
  return (
    <Sheet title={`Delete ${project.name}?`} onClose={onClose}>
      <div className="ds-hint">
        {project.online
          ? `This deletes it for everyone${others > 0 ? `, including the ${others === 1 ? 'other person' : `${others} other people`} on it` : ''}: its sketches, notes, layouts and history. It cannot be undone.`
          : 'This deletes it from this computer: its sketches, notes and layouts. It cannot be undone.'}{' '}
        Its repos are not touched.
      </div>
      <Field label={`Type ${project.name} to confirm`} value={typed} placeholder={project.name} focus onChange={setTyped} onEnter={() => void remove()} />
      {problem ? (
        <div className="ds-hint" role="alert">
          {problem}
        </div>
      ) : null}
      <div className="ds-sheet-actions">
        <Button look="bare" onClick={onClose}>
          Cancel
        </Button>
        <Button look="danger" disabled={!sure || busy} onClick={() => void remove()}>
          Delete the project
        </Button>
      </div>
    </Sheet>
  )
}
