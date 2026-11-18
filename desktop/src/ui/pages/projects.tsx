// codegraph: start page projects at /
import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { AgentConnection } from '../../features/connect-agent.js'
import type { CloudView } from '../../features/list-github-software-systems.js'
import type { ProjectView } from '../../features/list-projects.js'
import type { Session } from '../../features/show-session.js'
import type { DeviceSignIn } from '../../modules/github/index.js'
import { Button, Card, Field, Sheet, ThemeSwitch, Waiting } from '../design-system/kit.js'
import { AgentWindow } from '../components/agent-window.js'
import { GithubWindow } from '../components/github-window.js'
import { MembersSheet } from '../components/members-sheet.js'
import { DeleteProjectSheet, RenameProjectSheet, UnlinkRepoSheet } from '../components/project-sheets.js'
import { MySketches } from '../components/my-sketches.js'
import { ProjectCard } from '../components/project-card.js'
import { UpdateNotice } from '../components/update-notice.js'

export const ProjectsPage = ({ onOpen, onOpenSketch }: { onOpen: (projectId: string) => void; onOpenSketch: (library: string, sketchId: string) => void }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [tab, setTab] = useState<'projects' | 'sketches'>(() => (window.location.hash === '#/sketches' ? 'sketches' : 'projects'))
  const [typing, setTyping] = useState<DeviceSignIn | null>(null)
  const [signInProblem, setSignInProblem] = useState('')
  const [offering, setOffering] = useState(false)
  const [membersOf, setMembersOf] = useState('')
  const [renaming, setRenaming] = useState('')
  const [deleting, setDeleting] = useState('')
  const [unlinking, setUnlinking] = useState<{ projectId: string; systemId: string } | null>(null)
  const [rowBusy, setRowBusy] = useState<{ systemId: string; what: 'link' | 'clone' } | null>(null)
  const [projects, setProjects] = useState<ProjectView[] | null>(null)
  const [cloud, setCloud] = useState<CloudView | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [linking, setLinking] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [busyWithGithub, setBusyWithGithub] = useState(false)
  const [note, setNote] = useState('')
  const [agent, setAgent] = useState<AgentConnection | null>(null)
  /** Which small window is open over the page, if any. */
  const [open, setOpen] = useState<'' | 'github' | 'agent'>('')

  const load = useCallback(async (fetchFirst = false): Promise<void> => {
    setProjects(await window.codegraph.listProjects(fetchFirst))
  }, [])

  const loadCloud = useCallback(async (): Promise<void> => {
    setCloud(await window.codegraph.listGithubSoftwareSystems())
  }, [])

  const loadSession = useCallback(async (): Promise<Session> => {
    const now = await window.codegraph.showSession()
    setSession(now)
    return now
  }, [])

  useEffect(() => {
    void load()
    void loadCloud()
    void loadSession()
    void window.codegraph.connectAgent().then(setAgent)
  }, [load, loadCloud, loadSession])

  // A change made by someone else reaches this page.
  useEffect(() => window.codegraph.heardChange(() => void load()), [load])
  // An agent may have linked a working copy while the person was in its
  // window: coming back reads the projects again.
  useEffect(() => {
    const again = (): void => void load()
    window.addEventListener('focus', again)
    return () => window.removeEventListener('focus', again)
  }, [load])

  // Coming back from an agent's window, the repos are read again: setup
  // handed to an agent shows here once it is done.
  useEffect(() => {
    const back = (): void => void load()
    window.addEventListener('focus', back)
    return () => window.removeEventListener('focus', back)
  }, [load])

  const signedIn = async (): Promise<void> => {
    await loadSession()
    await load()
    await loadCloud()
    setOffering(true)
  }

  /** Signing in by typing a code on GitHub; until that is set up, a pasted token. */
  const signIn = async (): Promise<void> => {
    setSignInProblem('')
    const started = await window.codegraph.startSignIn()
    if (!started.ok) {
      if (session?.canTypeCode) setSignInProblem(started.problem)
      else setOpen('github')
      return
    }
    setTyping(started.started)
    window.open(started.started.url)
    const done = await window.codegraph.finishSignIn(started.started)
    setTyping(null)
    if (done.ok) await signedIn()
    else setSignInProblem(done.problem ?? 'That did not work. Try again.')
  }

  const create = async (): Promise<void> => {
    await window.codegraph.createProject(name)
    setName('')
    setNaming(false)
    await load()
  }

  const link = async (projectId: string): Promise<void> => {
    setLinking(projectId)
    setNote('')
    const linked = await window.codegraph.linkSoftwareSystem(projectId)
    if (linked.problem) setNote(linked.problem)
    else if (linked.ok && linked.needsSetup)
      setNote(
        `${linked.name ?? 'That repo'} is linked, but it is not set up for codegraph yet. Ask your agent to set it up; the codegraph MCP tells it how.`,
      )
    if (linked.ok) {
      await load()
      await loadCloud()
    }
    setLinking('')
  }

  /** Gives a repo on a project its working copy here: a folder picked or
   *  found, or a fresh clone. */
  const placeCopy = async (projectId: string, systemId: string, what: 'link' | 'clone', path?: string): Promise<void> => {
    setRowBusy({ systemId, what })
    setNote('')
    const done =
      what === 'clone'
        ? await window.codegraph.cloneWorkingCopy(projectId, systemId)
        : await window.codegraph.linkWorkingCopy(projectId, systemId, path)
    if (done.problem) setNote(done.problem)
    else if (done.ok && done.needsSetup)
      setNote(`${done.name ?? 'That repo'} is linked, but it is not set up for codegraph yet. Ask your agent to set it up; the codegraph MCP tells it how.`)
    if (done.ok) await load()
    setRowBusy(null)
  }

  const forget = async (projectId: string, systemId: string): Promise<void> => {
    const done = await window.codegraph.forgetWorkingCopy(projectId, systemId)
    if (!done.ok) setNote(done.problem ?? '')
    await load()
  }

  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    await load(true)
    await loadCloud()
    setRefreshing(false)
  }

  const connect = async (token: string): Promise<string> => {
    setBusyWithGithub(true)
    const connected = await window.codegraph.connectGithub(token)
    if (connected.ok) await (session?.online ? signedIn() : loadCloud())
    setBusyWithGithub(false)
    return connected.problem ?? ''
  }

  const makeFromGithub = async (shortName: string): Promise<void> => {
    await window.codegraph.createProject(shortName, shortName)
    await load()
    await loadCloud()
  }

  const signOut = async (): Promise<void> => {
    await window.codegraph.signOutGithub()
    await loadCloud()
    await loadSession()
    await load()
  }

  const needsSignIn = Boolean(session?.online && !session.member)
  const onlyHere = session?.online && session.member ? (projects ?? []).filter((p) => !p.online) : []

  const tabs = [
    { id: 'projects' as const, name: 'Projects' },
    { id: 'sketches' as const, name: 'My sketches' },
  ]
  const goTab = (next: 'projects' | 'sketches'): void => {
    setTab(next)
    // Kept in the address, so coming back from a sketch lands here again.
    window.history.replaceState(null, '', next === 'sketches' ? '#/sketches' : '#')
  }

  return (
    <div className="ds-page">
      <div className="ds-head">
        <div>
          <div className="projects-title">
            <h1 className="ds-title">{tab === 'projects' ? 'Projects' : 'My sketches'}</h1>
            <div className="design-tabs projects-tabs" role="tablist" aria-label="What to show">
              {tabs.map((each) => (
                <button
                  key={each.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === each.id}
                  onClick={() => goTab(each.id)}
                >
                  {each.name}
                </button>
              ))}
            </div>
          </div>
          <div className="ds-sub">
            {tab === 'projects'
              ? 'A project holds the software systems you work on together, each kept in one git repo or more. Click a project to open its map.'
              : 'Drawings of anything, outside any project. Yours alone until you share them, and they work offline.'}
          </div>
        </div>
        <div className="ds-row projects-actions">
          {session?.online ? (
            session.member ? (
              <>
                <span className="me-chip" title={`Signed in as @${session.member.login}`}>
                  {session.member.avatar ? <img className="member-face" src={session.member.avatar} alt="" /> : null}
                  {session.member.name || session.member.login}
                </span>
                {session.waiting ? <span className="ds-hint">{session.waiting} waiting to go up</span> : null}
                <Button look="bare" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </>
            ) : (
              <Button look="loud" onClick={() => void signIn()}>
                Sign in with GitHub
              </Button>
            )
          ) : (
            <Button look="bare" onClick={() => setOpen('github')} label="GitHub">
              GitHub
              {cloud?.signedIn ? <span className="ds-head-dot" title="Signed in" /> : null}
            </Button>
          )}
          <Button look="bare" onClick={() => setOpen('agent')}>
            Your agent
          </Button>
          <ThemeSwitch />
          {tab === 'projects' ? (
            <>
              <Button
                look="bare"
                onClick={() => void refresh()}
                disabled={refreshing}
                label="Check GitHub again"
                title="Check GitHub again for new commits and branches"
              >
                <RefreshCw size={15} aria-hidden="true" className={refreshing ? 'projects-refreshing' : undefined} />
                {refreshing ? 'Checking GitHub…' : null}
              </Button>
              {needsSignIn ? null : (
                <Button look="loud" onClick={() => setNaming(true)}>
                  New project
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {signInProblem ? (
        <div className="projects-note" role="alert">
          <Card>{signInProblem}</Card>
        </div>
      ) : null}

      {note ? (
        <div className="projects-note">
          <Card>
            <div className="ds-row" style={{ justifyContent: 'space-between' }}>
              <span>{note}</span>
              <Button look="bare" onClick={() => setNote('')}>
                Dismiss
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'sketches' ? (
        <MySketches projects={projects ?? []} signedIn={Boolean(session?.member)} onOpen={onOpenSketch} />
      ) : needsSignIn ? (
        <div className="ds-empty">
          <div style={{ fontSize: 16, color: 'var(--ink)', marginBottom: 6 }}>Sign in to see your projects</div>
          {session?.signedOutBecause ? <div style={{ marginBottom: 6 }}>{session.signedOutBecause}</div> : null}
          <div>Your own sketches still open from My sketches.</div>
          <div style={{ marginTop: 16 }}>
            <Button look="loud" onClick={() => void signIn()}>
              Sign in with GitHub
            </Button>
          </div>
        </div>
      ) : projects === null ? (
        <Waiting what="Reading your projects…" slow="Still going. Nothing is stuck; the files are just slow to read." />
      ) : projects.length === 0 ? (
        <div className="ds-empty">
          <div style={{ fontSize: 16, color: 'var(--ink)', marginBottom: 6 }}>
            No projects yet
          </div>
          <div>Make one, then link the repos that belong to it.</div>
          <div style={{ marginTop: 16 }}>
            <Button look="loud" onClick={() => setNaming(true)}>
              New project
            </Button>
          </div>
        </div>
      ) : (
        <div className="ds-grid">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onLink={(id) => void link(id)}
              onOpen={onOpen}
              onChoose={(systemId, point) => {
                const named = point.kind === 'branch' ? point.name : point.kind === 'live' ? point.branch : ''
                if (named) void window.codegraph.chooseBranch(project.id, systemId, named).then(() => load())
              }}
              linking={linking === project.id}
              rowBusy={rowBusy}
              onLinkHere={(systemId, path) => void placeCopy(project.id, systemId, 'link', path)}
              onClone={(systemId) => void placeCopy(project.id, systemId, 'clone')}
              onForget={(systemId) => void forget(project.id, systemId)}
              {...(!project.online || (project.role && project.role !== 'viewer') ? { onUnlink: (systemId: string) => setUnlinking({ projectId: project.id, systemId }) } : {})}
              {...(session?.online && session.member && !project.online ? { onPutOnline: () => void window.codegraph.putProjectOnline(project.id).then(() => load()) } : {})}
              {...(project.online ? { onMembers: () => setMembersOf(project.id) } : {})}
              {...(!project.online || (project.role && project.role !== 'viewer') ? { onRename: () => setRenaming(project.id) } : {})}
              {...(!project.online || project.role === 'owner' ? { onDelete: () => setDeleting(project.id) } : {})}
            />
          ))}
        </div>
      )}

      {open === 'github' ? (
        <GithubWindow
          cloud={cloud}
          busy={busyWithGithub}
          onConnect={connect}
          onSignOut={() => void signOut()}
          onMakeProject={(short) => void makeFromGithub(short)}
          onClose={() => setOpen('')}
        />
      ) : null}

      {membersOf ? (
        <MembersSheet
          projectId={membersOf}
          onClose={() => setMembersOf('')}
          onChanged={() => void load()}
          onDelete={() => {
            setDeleting(membersOf)
            setMembersOf('')
          }}
        />
      ) : null}
      {(() => {
        const project = projects?.find((p) => p.id === renaming)
        return project ? <RenameProjectSheet project={project} onClose={() => setRenaming('')} onDone={() => void load()} /> : null
      })()}
      {(() => {
        const project = projects?.find((p) => p.id === unlinking?.projectId)
        return project && unlinking ? (
          <UnlinkRepoSheet project={project} systemId={unlinking.systemId} onClose={() => setUnlinking(null)} onDone={() => void load().then(loadCloud)} />
        ) : null
      })()}
      {(() => {
        const project = projects?.find((p) => p.id === deleting)
        return project ? <DeleteProjectSheet project={project} onClose={() => setDeleting('')} onDone={() => void load()} /> : null
      })()}

      {typing ? (
        <Sheet title="Sign in with GitHub" onClose={() => setTyping(null)}>
          <div className="ds-hint">GitHub has opened in your browser. Type this code there.</div>
          <div className="signin-code">{typing.code}</div>
          <div className="ds-hint">Waiting for GitHub…</div>
        </Sheet>
      ) : null}

      {offering && onlyHere.length ? (
        <Sheet title="Put your projects online?" onClose={() => setOffering(false)}>
          <div className="ds-hint">These are only on this computer, so nobody else can reach them. Putting one online takes its sketches, notes and layouts with it, and the old files stay here as a backup.</div>
          {onlyHere.map((project) => (
            <div key={project.id} className="member-row">
              <span>{project.name}</span>
              <Button onClick={() => void window.codegraph.putProjectOnline(project.id).then(() => load())}>Put online</Button>
            </div>
          ))}
          <div className="ds-sheet-actions">
            <Button look="bare" onClick={() => setOffering(false)}>
              Not now
            </Button>
          </div>
        </Sheet>
      ) : null}

      {open === 'agent' ? (
        <AgentWindow connection={agent} onClose={() => setOpen('')} onInstructions={() => (window.location.hash = '#/settings')} />
      ) : null}

      {naming ? (
        <Sheet
          title="New project"
          onClose={() => {
            setNaming(false)
            setName('')
          }}
        >
          <Field
            label="What is it called?"
            value={name}
            placeholder="Mosaic Manager"
            onChange={setName}
            onEnter={() => void create()}
          />
          <div className="ds-sheet-actions">
            <Button
              look="bare"
              onClick={() => {
                setNaming(false)
                setName('')
              }}
            >
              Cancel
            </Button>
            <Button look="loud" onClick={() => void create()} disabled={!name.trim()}>
              Make it
            </Button>
          </div>
        </Sheet>
      ) : null}
      <UpdateNotice />
    </div>
  )
}
