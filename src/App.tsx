import Panel from './renderer/Panel'
import Onboarding from './renderer/Onboarding'

// Hash-based routing: main process loads /#onboarding for the onboarding window
// and the default (no hash) for the main panel. Keeps a single Vite entry point.
export default function App() {
  const hash = window.location.hash
  if (hash === '#onboarding') return <Onboarding />
  return <Panel />
}
