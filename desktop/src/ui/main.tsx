// codegraph: shell
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './design-system/theme.css'
import { wearTheme } from './design-system/kit.js'
import { CanvasPage } from './pages/canvas.js'
import { ProjectsPage } from './pages/projects.js'
import { SettingsPage } from './pages/settings.js'
import { SketchPage } from './pages/sketch.js'

/** Which page the window shows, kept in the address so a reload stays put. */
const projectInAddress = (): string => window.location.hash.match(/^#\/projects\/(.+)$/)?.[1] ?? ''
const settingsInAddress = (): boolean => window.location.hash === '#/settings'

const sketchInAddress = (): string => window.location.hash.match(/^#\/sketches\/(.+\/.+)$/)?.[1] ?? ''

const App = () => {
  const [project, setProject] = useState(projectInAddress)
  const [sketch, setSketch] = useState(sketchInAddress)
  const [settings, setSettings] = useState(settingsInAddress)
  useEffect(() => {
    const moved = (): void => {
      setProject(projectInAddress())
      setSketch(sketchInAddress())
      setSettings(settingsInAddress())
    }
    window.addEventListener('hashchange', moved)
    return () => window.removeEventListener('hashchange', moved)
  }, [])
  const [library = '', sketchId = ''] = sketch.split('/')
  if (settings) return <SettingsPage onLeave={() => (window.location.hash = '')} />
  return sketch ? (
    <SketchPage key={sketch} library={library} sketchId={sketchId} onLeave={() => (window.location.hash = '#/sketches')} />
  ) : project ? (
    <CanvasPage key={project} projectId={project} onLeave={() => (window.location.hash = '')} />
  ) : (
    <ProjectsPage onOpen={(id) => (window.location.hash = `#/projects/${id}`)} onOpenSketch={(from, id) => (window.location.hash = `#/sketches/${from}/${id}`)} />
  )
}

wearTheme()

const root = document.getElementById('root')
if (!root) throw new Error('the window has no root to draw in')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
