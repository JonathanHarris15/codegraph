// codegraph: component live-view
import { useEffect, useState } from 'react'
import { Button } from '../design-system/kit.js'

type Reached = { state: 'checking' } | { state: 'up' } | { state: 'down'; problem: string }

/** A page of the repo's own code, running on its own dev server, framed
 *  beside the canvas (ADR 0024). It asks first whether the server is up, so
 *  a stopped one reads as "start it", not as a blank box. The page is held
 *  in a frame of its own origin: it cannot reach codegraph's window, and an
 *  address that would share the window's origin is refused. */
export const LiveFrame = ({ address, title }: { address: string; title: string }) => {
  const [reached, setReached] = useState<Reached>({ state: 'checking' })
  const [round, setRound] = useState(0)
  const origin = (() => {
    try {
      return new URL(address).origin
    } catch {
      return ''
    }
  })()

  useEffect(() => {
    let current = true
    setReached({ state: 'checking' })
    void window.codegraph.reachDevServer(origin).then((done) => {
      if (current) setReached(done.up ? { state: 'up' } : { state: 'down', problem: done.problem })
    })
    return () => {
      current = false
    }
  }, [origin, round])

  if (!origin || origin === window.location.origin)
    return (
      <div className="live-frame live-frame--off" role="status">
        This address cannot be shown here: it would share codegraph's own window.
      </div>
    )

  return (
    <div className="live-frame">
      <div className="live-bar">
        <span className="live-dot" data-state={reached.state} aria-hidden="true" />
        <code className="live-address" title={address}>
          {address}
        </code>
        <Button look="bare" onClick={() => setRound(round + 1)}>
          Reload
        </Button>
      </div>
      {reached.state === 'up' ? (
        <iframe
          key={`${address}#${round}`}
          className="live-page"
          title={title}
          src={address}
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      ) : (
        <div className="live-frame--off" role="status">
          {reached.state === 'checking' ? (
            'Looking for the dev server…'
          ) : (
            <>
              <span>{reached.problem}</span>
              <Button onClick={() => setRound(round + 1)}>Try again</Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
