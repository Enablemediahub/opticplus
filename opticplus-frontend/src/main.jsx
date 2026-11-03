import { Component, lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './components/PublicRegistrationPage.css'
import './components/PublicPatientIdCard.css'

const isPublicRegistration = window.location.pathname.replace(/\/+$/, '') === '/registration'
const ApplicationEntry = lazy(() => isPublicRegistration
  ? import('./components/PublicRegistrationPage.jsx')
  : import('./App.jsx'))

class StartupErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('OPTICPLUS startup error:', error)
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: '#07111f',
          color: '#e2e8f0',
          fontFamily: '"Segoe UI", sans-serif',
        }}
      >
        <section
          style={{
            width: 'min(760px, 100%)',
            padding: '24px',
            borderRadius: '20px',
            border: '1px solid rgba(148, 163, 184, 0.22)',
            background: 'rgba(15, 23, 42, 0.92)',
            boxShadow: '0 24px 60px rgba(2, 6, 23, 0.35)',
          }}
        >
          <p style={{ margin: 0, color: '#93c5fd', fontSize: '0.84rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            OPTICPLUS Startup Error
          </p>
          <h1 style={{ margin: '10px 0 12px', fontSize: '1.8rem' }}>
            OPTICPLUS could not open this page.
          </h1>
          <p style={{ margin: '0 0 16px', color: '#cbd5e1' }}>
            Your files are still present. This screen is here so startup failures never appear as a silent blank page again.
          </p>
          <pre
            style={{
              margin: 0,
              padding: '16px',
              overflowX: 'auto',
              borderRadius: '14px',
              background: '#020617',
              color: '#f8fafc',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </pre>
        </section>
      </main>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StartupErrorBoundary>
      <Suspense fallback={<main className="public-registration-loading">Opening Bealet Optical Center registration…</main>}>
        <ApplicationEntry />
      </Suspense>
    </StartupErrorBoundary>
  </StrictMode>,
)
