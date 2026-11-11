// codegraph: start page projects at /
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
import { DeleteProjectSheet, RenameProjectSheet } from '../components/project-sheets.js'
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
  /** The project clicked last: the one a second click opens. */
  const [picked, setPicked] = useState('')

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

  return (
    <div className="ds-page" onMouseDown={() => setPicked('')}>
      <div className="ds-head">
        <div>
          <h1 className="ds-title">Projects</h1>
          <div className="ds-sub">
            A project holds the software systems you work on together, each one a git repo.
            Double-click a project to see its map.
          </div>
        </div>
        <div className="ds-row">
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
          <Button look="bare" onClick={() => (window.location.hash = '#/settings')}>
            Settings
          </Button>
          <ThemeSwitch />
          <Button onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? 'Checking GitHub…' : 'Refresh'}
          </Button>
          {needsSignIn ? null : (
            <Button look="loud" onClick={() => setNaming(true)}>
              New project
            </Button>
          )}
        </div>
      </div>

      <div className="gallery-tabs" role="tablist">
        <Button look="bare" onClick={() => setTab('projects')} label="Projects tab">
          <span className={tab === 'projects' ? 'gallery-tab--on' : ''}>Projects</span>
        </Button>
        <Button look="bare" onClick={() => setTab('sketches')} label="Sketches tab">
          <span className={tab === 'sketches' ? 'gallery-tab--on' : ''}>Sketches</span>
        </Button>
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
          <div>Your own sketches still open from the Sketches tab.</div>
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
              picked={picked === project.id}
              onPick={() => setPicked(project.id)}
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

      {open === 'agent' ? <AgentWindow connection={agent} onClose={() => setOpen('')} /> : null}

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
