// codegraph: component github-shelf
import { useState } from 'react'
import type { CloudView } from '../../features/list-github-software-systems.js'
import { Badge, Button, Card, Field } from '../design-system/kit.js'

export const GithubShelf = ({
  cloud,
  busy,
  onConnect,
  onSignOut,
  onMakeProject,
}: {
  cloud: CloudView | null
  busy: boolean
  onConnect: (token: string) => Promise<string>
  onSignOut: () => void
  /** Makes a project for a short name a repo names that this computer lacks. */
  onMakeProject: (shortName: string) => void
}) => {
  const [token, setToken] = useState('')
  const [problem, setProblem] = useState('')

  const connect = async (): Promise<void> => {
    setProblem('')
    const refusal = await onConnect(token)
    if (refusal) setProblem(refusal)
    else setToken('')
  }

  if (!cloud || !cloud.signedIn) {
    return (
      <div className="ds-section">
        <h2 style={{ fontSize: 17 }}>Your repos on GitHub</h2>
        <p className="ds-sub" style={{ maxWidth: 620 }}>
          Sign in and codegraph can show the repos you are part of that are already set up for
          it, including ones that are not on this computer.
        </p>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520 }}>
            <Field
              label="GitHub personal access token"
              value={token}
              placeholder="ghp_…"
              password
              onChange={setToken}
              onEnter={() => void connect()}
            />
            <div className="ds-hint">
              GitHub → Settings → Developer settings → Personal access tokens. It needs the{' '}
              <span className="ds-mono">repo</span> scope to see private repos. It is kept on this
              computer only.
            </div>
            {problem ? <div className="ds-problem">{problem}</div> : null}
            <div>
              <Button look="loud" onClick={() => void connect()} disabled={busy || !token.trim()}>
                {busy ? 'Checking…' : 'Sign in'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const elsewhere = cloud.systems.filter((system) => !system.here)
  const already = cloud.systems.length - elsewhere.length

  return (
    <div className="ds-section">
      <div className="ds-head" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 17 }}>Your repos on GitHub</h2>
          <div className="ds-sub">
            Signed in as {cloud.account || 'GitHub'}
            {cloud.tokenSafe ? '' : ' · token is not in a keystore on this computer'}
          </div>
        </div>
        <Button look="bare" onClick={onSignOut}>
          Sign out
        </Button>
      </div>

      {cloud.problem ? <div className="ds-problem">{cloud.problem}</div> : null}

      {cloud.systems.length === 0 && !cloud.problem ? (
        <div className="ds-hint">
          None of the repos you can reach are set up for codegraph yet.
        </div>
      ) : null}

      {elsewhere.length > 0 ? (
        <>
          <div className="ds-hint" style={{ marginBottom: 10 }}>
            {elsewhere.length} set up for codegraph but not on this computer
            {already > 0 ? ` · ${already} already in a project here` : ''}
          </div>
          <div className="ds-grid">
            {elsewhere.map((system) => (
              <Card key={system.fullName} quiet>
                <div className="ds-card-top" style={{ marginBottom: 6 }}>
                  <div className="ds-card-name">{system.name}</div>
                  <Badge>not on this computer</Badge>
                </div>
                <div className="ds-mono">{system.fullName}</div>
                {system.projectsHere.length ? (
                  <div className="ds-hint" style={{ marginTop: 6 }}>
                    serves {system.projectsHere.join(', ')}
                  </div>
                ) : null}
                {system.projectsNew.map((short) => (
                  <div key={short} className="ds-row" style={{ marginTop: 6, gap: 8 }}>
                    <span className="ds-hint">
                      serves <span className="ds-mono">{short}</span>, which is not a project here
                    </span>
                    <Button look="bare" onClick={() => onMakeProject(short)}>
                      Make it
                    </Button>
                  </div>
                ))}
                {system.private ? (
                  <div className="ds-hint" style={{ marginTop: 6 }}>
                    private
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
          <div className="ds-hint" style={{ marginTop: 12 }}>
            Cloning one into a project is not built yet: clone it yourself, then link it.
          </div>
        </>
      ) : null}
    </div>
  )
}
