// codegraph: shell
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './design-system/theme.css'
import { CanvasPage } from './pages/canvas.js'
import { ProjectsPage } from './pages/projects.js'

/** Which page the window shows, kept in the address so a reload stays put. */
const projectInAddress = (): string => window.location.hash.match(/^#\/projects\/(.+)$/)?.[1] ?? ''

const App = () => {
  const [project, setProject] = useState(projectInAddress)
  useEffect(() => {
    const moved = (): void => setProject(projectInAddress())
    window.addEventListener('hashchange', moved)
    return () => window.removeEventListener('hashchange', moved)
  }, [])
  return project ? (
    <CanvasPage key={project} projectId={project} onLeave={() => (window.location.hash = '')} />
  ) : (
    <ProjectsPage onOpen={(id) => (window.location.hash = `#/projects/${id}`)} />
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('the window has no root to draw in')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
