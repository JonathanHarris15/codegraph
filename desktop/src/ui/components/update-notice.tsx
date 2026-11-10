// codegraph: component update-notice
import { useEffect, useState } from 'react'
import type { UpdateCheck } from '../../features/check-for-update.js'
import { Button } from '../design-system/kit.js'

/** How often a window left open looks again. */
const EVERY = 6 * 60 * 60 * 1000

/** The version a person said "not now" to, kept until the window closes so
 *  coming back to the projects page does not ask again. */
const SAID_NOT_NOW = 'codegraph.update.not-now'
const notNowTo = (): string => {
  try {
    return window.sessionStorage.getItem(SAID_NOT_NOW) ?? ''
  } catch {
    return ''
  }
}

/** A quiet note in the corner of the projects page when a newer codegraph is
 *  out, with its installer one click away. Only there: on a map, every
 *  corner already holds something. "Not now" hides it until the app opens
 *  again. */
export const UpdateNotice = () => {
  const [seen, setSeen] = useState<UpdateCheck | null>(null)
  const [hidden, setHidden] = useState(notNowTo)

  const notNow = (version: string): void => {
    setHidden(version)
    try {
      window.sessionStorage.setItem(SAID_NOT_NOW, version)
    } catch {
      // Remembered for this page only, then.
    }
  }

  useEffect(() => {
    const look = (): void => {
      void window.codegraph.checkForUpdate().then(setSeen, () => undefined)
    }
    look()
    const timer = window.setInterval(look, EVERY)
    return () => window.clearInterval(timer)
  }, [])

  const newer = seen?.newer
  if (!newer || hidden === newer.version) return null
  return (
    <aside className="update-notice" role="status" aria-label="A newer codegraph is out">
      <div className="update-notice-words">
        <strong>Codegraph {newer.version} is out</strong>
        <span>
          You have {seen.current}.{' '}
          {newer.page && (
            <button type="button" className="update-notice-link" onClick={() => window.open(newer.page)}>
              What's new
            </button>
          )}
        </span>
      </div>
      <div className="update-notice-actions">
        <Button look="bare" onClick={() => notNow(newer.version)}>
          Not now
        </Button>
        <Button look="loud" onClick={() => window.open(newer.download)}>
          Download
        </Button>
      </div>
    </aside>
  )
}
