// codegraph: shell
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './design-system/theme.css'
import { ProjectsPage } from './pages/projects.js'

const root = document.getElementById('root')
if (!root) throw new Error('the window has no root to draw in')

createRoot(root).render(
  <StrictMode>
    <ProjectsPage />
  </StrictMode>,
)
