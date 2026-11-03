// codegraph: start page projects at /
import { useCallback, useEffect, useState } from 'react'
import type { AgentConnection } from '../../features/connect-agent.js'
import type { CloudView } from '../../features/list-github-software-systems.js'
import type { ProjectView } from '../../features/list-projects.js'
import { Button, Card, Field, Sheet } from '../design-system/kit.js'
import { AgentShelf } from '../components/agent-shelf.js'
import { GithubShelf } from '../components/github-shelf.js'
import { ProjectCard } from '../components/project-card.js'

export const ProjectsPage = ({ onOpen }: { onOpen: (projectId: string) => void }) => {
  const [projects, setProjects] = useState<ProjectView[] | null>(null)
  const [cloud, setCloud] = useState<CloudView | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [linking, setLinking] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [busyWithGithub, setBusyWithGithub] = useState(false)
  const [note, setNote] = useState('')
  const [agent, setAgent] = useState<AgentConnection | null>(null)

  const load = useCallback(async (fetchFirst = false): Promise<void> => {
    setProjects(await window.codegraph.listProjects(fetchFirst))
  }, [])

  const loadCloud = useCallback(async (): Promise<void> => {
    setCloud(await window.codegraph.listGithubSoftwareSystems())
  }, [])

  useEffect(() => {
    void load()
    void loadCloud()
    void window.codegraph.connectAgent().then(setAgent)
  }, [load, loadCloud])

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
    if (connected.ok) await loadCloud()
    setBusyWithGithub(false)
    return connected.problem ?? ''
  }

  const signOut = async (): Promise<void> => {
    await window.codegraph.signOutGithub()
    await loadCloud()
  }

  return (
    <div className="ds-page">
      <div className="ds-head">
        <div>
          <h1 className="ds-title">Projects</h1>
          <div className="ds-sub">
            A project holds the software systems you work on together. Each one is a git repo with
            codegraph turned on.
          </div>
        </div>
        <div className="ds-row">
          <Button onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? 'Checking GitHub…' : 'Refresh'}
          </Button>
          <Button look="loud" onClick={() => setNaming(true)}>
            New project
          </Button>
        </div>
      </div>

      {note ? (
        <Card>
          <div className="ds-row" style={{ justifyContent: 'space-between' }}>
            <span>{note}</span>
            <Button look="bare" onClick={() => setNote('')}>
              Dismiss
            </Button>
          </div>
        </Card>
      ) : null}

      {projects === null ? (
        <div className="ds-empty">Reading your projects…</div>
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
              linking={linking === project.id}
            />
          ))}
        </div>
      )}

      <GithubShelf
        cloud={cloud}
        busy={busyWithGithub}
        onConnect={connect}
        onSignOut={() => void signOut()}
      />

      <AgentShelf connection={agent} />

      {naming ? (
        <Sheet>
          <h2 style={{ fontSize: 17 }}>New project</h2>
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
    </div>
  )
}
