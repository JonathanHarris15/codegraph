// codegraph: component members-sheet
import { useCallback, useEffect, useState } from 'react'
import type { ProjectView } from '../../features/list-projects.js'
import type { Role } from '../../modules/members/index.js'
import { Button, Field, Select, Sheet } from '../design-system/kit.js'

type Givable = Exclude<Role, 'owner'>

const ROLES: Givable[] = ['co-owner', 'collaborator', 'viewer']

/** Who is on a project, and, for those who may, inviting them by GitHub username,
 *  changing what they can do, and handing the project over or deleting it. */
export const MembersSheet = ({ projectId, onClose, onChanged }: { projectId: string; onClose: () => void; onChanged?: () => void }) => {
  const [project, setProject] = useState<ProjectView | null>(null)
  const [me, setMe] = useState('')
  const [login, setLogin] = useState('')
  const [role, setRole] = useState<Givable>('collaborator')
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async (): Promise<void> => {
    const [all, session] = await Promise.all([window.codegraph.listProjects(), window.codegraph.showSession()])
    setProject(all.find((p) => p.id === projectId) ?? null)
    setMe(session.member?.id ?? '')
  }, [projectId])
  useEffect(() => {
    void load()
  }, [load])

  const act = async (work: () => Promise<{ ok: boolean; problem?: string }>): Promise<boolean> => {
    setBusy(true)
    const done = await work()
    setBusy(false)
    setProblem(done.problem ?? '')
    if (done.ok) {
      await load()
      onChanged?.()
    }
    return done.ok
  }

  const canInvite = project?.role === 'owner' || project?.role === 'co-owner'
  const isOwner = project?.role === 'owner'

  return (
    <Sheet title={project ? `Members of ${project.name}` : 'Members'} onClose={onClose}>
      {project?.members.map((m) => (
        <div key={m.id} className="member-row">
          <span>
            {m.avatar ? <img className="member-face" src={m.avatar} alt="" /> : null}
            {m.name} <span className="ds-hint">@{m.login}</span>
          </span>
          {m.role === 'owner' ? (
            <span className="ds-hint">Owner</span>
          ) : canInvite ? (
            <span className="ds-row">
              <Select label={`Role of ${m.name}`} value={m.role} options={ROLES} onChange={(next) => void act(() => window.codegraph.changeRole(projectId, m.id, next as Givable))} />
              {isOwner ? (
                <Button look="bare" onClick={() => void act(() => window.codegraph.handOverProject(projectId, m.id))}>
                  Hand over
                </Button>
              ) : null}
              <Button look="bare" onClick={() => void act(() => window.codegraph.removeMember(projectId, m.id))}>
                Take off
              </Button>
            </span>
          ) : (
            <span className="ds-row">
              <span className="ds-hint">{m.role}</span>
              {m.id === me ? (
                <Button
                  look="bare"
                  onClick={() =>
                    void act(() => window.codegraph.removeMember(projectId, m.id)).then((ok) => {
                      if (ok) onClose()
                    })
                  }
                >
                  Leave
                </Button>
              ) : null}
            </span>
          )}
        </div>
      ))}
      {canInvite ? (
        <>
          <Field label="Invite by GitHub username" value={login} placeholder="their-username" onChange={setLogin} />
          <Select label="What they can do" value={role} options={ROLES} onChange={(next) => setRole(next as Givable)} />
          <div className="ds-hint">A co-owner can invite people. A collaborator can draw and edit. A viewer can look and point.</div>
          <div className="ds-hint">They will see it when they sign in, even if they have never opened Codegraph. To open its maps they also need access to its repos on GitHub.</div>
        </>
      ) : null}
      {problem ? (
        <div className="ds-hint" role="alert">
          {problem}
        </div>
      ) : null}
      <div className="ds-sheet-actions">
        {isOwner ? (
          <Button
            look="bare"
            onClick={() =>
              void act(() => window.codegraph.deleteProject(projectId)).then((ok) => {
                if (ok) {
                  onClose()
                  window.location.hash = ''
                }
              })
            }
          >
            Delete the project
          </Button>
        ) : null}
        <Button look="bare" onClick={onClose}>
          Done
        </Button>
        {canInvite ? (
          <Button
            look="loud"
            disabled={!login.trim() || busy}
            onClick={() =>
              void act(() => window.codegraph.inviteMember(projectId, login, role)).then((ok) => {
                if (ok) setLogin('')
              })
            }
          >
            Invite
          </Button>
        ) : null}
      </div>
    </Sheet>
  )
}
