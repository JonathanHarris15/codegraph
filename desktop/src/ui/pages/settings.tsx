// codegraph: page settings at /settings
import { useEffect, useState } from 'react'
import type { InstructionsView } from '../../features/show-instructions.js'
import { Badge, Button, Card, Lines } from '../design-system/kit.js'

const when = (at: string): string => {
  const moment = new Date(at)
  return Number.isNaN(moment.getTime()) ? at : moment.toLocaleString()
}

const howItWent = (how: string): string => (how === 'reset' ? 'Default put back' : 'Edited')

/** Settings: the words codegraph tells a person's agents, theirs to change.
 *  Every edit is kept, so nothing they write is ever lost and the words
 *  codegraph ships with are always one click away (ADR 0022). */
export const SettingsPage = ({ onLeave }: { onLeave: () => void }) => {
  const [all, setAll] = useState<InstructionsView[] | null>(null)
  const [topic, setTopic] = useState('')
  const [draft, setDraft] = useState('')
  const [reading, setReading] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const shown = await window.codegraph.showInstructions()
      setAll(shown)
      const first = shown[0]
      if (first) {
        setTopic(first.topic)
        setDraft(first.text)
      }
    })()
  }, [])

  const reload = async (which: string): Promise<void> => {
    const shown = await window.codegraph.showInstructions()
    setAll(shown)
    const one = shown.find((each) => each.topic === which)
    if (one) setDraft(one.text)
  }

  const choose = (one: InstructionsView): void => {
    setTopic(one.topic)
    setDraft(one.text)
    setReading('')
  }

  const chosen = all?.find((one) => one.topic === topic) ?? null
  const changed = chosen !== null && draft !== chosen.text

  const keep = async (text: string): Promise<void> => {
    setBusy(true)
    await window.codegraph.editInstructions(topic, text)
    await reload(topic)
    setReading('')
    setBusy(false)
  }

  const putDefaultBack = async (): Promise<void> => {
    setBusy(true)
    await window.codegraph.resetInstructions(topic)
    await reload(topic)
    setReading('')
    setBusy(false)
  }

  return (
    <div className="ds-page">
      <div className="ds-head">
        <div>
          <h1 className="ds-title">Settings</h1>
          <div className="ds-sub">
            What codegraph tells your agents, by topic. They read these through the codegraph MCP,
            so a change here changes how every agent works in your repos.
          </div>
        </div>
        <div className="ds-row">
          <Button look="bare" onClick={onLeave}>
            Back to projects
          </Button>
        </div>
      </div>

      {all === null ? (
        <div className="ds-empty">Reading your instructions…</div>
      ) : (
        <div className="settings">
          <div className="settings-topics" role="group" aria-label="Topics">
            {all.map((one) => (
              <button
                key={one.topic}
                type="button"
                className="settings-topic"
                aria-label={`Instructions for ${one.topic}`}
                aria-current={one.topic === topic}
                onClick={() => choose(one)}
              >
                <span className="ds-row" style={{ justifyContent: 'space-between' }}>
                  <span>{one.topic}</span>
                  {one.edited ? <Badge tone="good">Yours</Badge> : null}
                </span>
                <span className="settings-topic-about">{one.about}</span>
              </button>
            ))}
          </div>

          {chosen === null ? null : (
            <div className="settings-pane">
              <Card>
                <h2 className="ds-title">{chosen.topic}</h2>
                <div className="ds-sub">{chosen.about}</div>
                <Lines
                  label="What your agents are told"
                  value={draft}
                  mono
                  rows={22}
                  onChange={setDraft}
                />
                <div className="ds-row" style={{ justifyContent: 'space-between' }}>
                  <div className="ds-row">
                    <Button look="loud" onClick={() => void keep(draft)} disabled={!changed || busy}>
                      Save
                    </Button>
                    <Button look="bare" onClick={() => setDraft(chosen.text)} disabled={!changed}>
                      Undo changes
                    </Button>
                  </div>
                  <Button
                    onClick={() => void putDefaultBack()}
                    disabled={!chosen.edited || busy}
                    title={
                      chosen.edited
                        ? 'Your words stay in the history below'
                        : 'These are already the words codegraph ships with'
                    }
                  >
                    Put the default back
                  </Button>
                </div>
              </Card>

              <Card quiet>
                <h3 className="ds-label">Edit history</h3>
                {chosen.edits.length === 0 ? (
                  <div className="ds-sub">
                    No edits yet. Your agents are told the words codegraph ships with.
                  </div>
                ) : (
                  <div className="settings-edits">
                    {[...chosen.edits].reverse().map((edit, index) => (
                      <div className="settings-edit" key={edit.id}>
                        <div className="settings-edit-head">
                          <span className="ds-row">
                            <span>{howItWent(edit.how)}</span>
                            <span className="settings-when">{when(edit.at)}</span>
                            {index === 0 ? <Badge tone="good">In force now</Badge> : null}
                          </span>
                          <span className="ds-row">
                            <Button
                              look="bare"
                              onClick={() => setReading(reading === edit.id ? '' : edit.id)}
                            >
                              {reading === edit.id ? 'Hide' : 'Read'}
                            </Button>
                            {index === 0 ? null : (
                              <Button onClick={() => void keep(edit.text)} disabled={busy}>
                                Put this back
                              </Button>
                            )}
                          </span>
                        </div>
                        {reading === edit.id ? (
                          <Lines
                            label={`What it said on ${when(edit.at)}`}
                            value={edit.text}
                            mono
                            rows={14}
                            readOnly
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
