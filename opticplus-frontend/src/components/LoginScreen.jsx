import { useState } from 'react'

export default function LoginScreen({
  theme,
  setTheme,
  credentials,
  setCredentials,
  companyProfile,
  handleLogin,
  isLoggingIn,
  loginError,
}) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const wallpaper = companyProfile?.loginWallpaperPreview || companyProfile?.login_wallpaper_url || ''

  return (
    <section
      className="login-shell login-shell-modern"
      style={wallpaper ? { '--login-wallpaper': `url("${wallpaper}")` } : undefined}
    >
      <div className="brand-panel brand-panel-modern">
        <div className="login-hero-copy">
          <div className="login-hero-logo-wrap">
            <img src="/opticplus-login-logo.png" alt="Opticplus logo" className="login-hero-logo" />
          </div>
          <h1>BEALET BUSINESS PORTAL</h1>
          <p className="login-hero-credit">
            Developed and Designed by DALE QUIST [Enable Technologies]
          </p>
        </div>
      </div>

      <div className="login-panel">
        <div className="panel-top">
          <div>
            <p className="eyebrow">Secure Access</p>
            <h2>Opticplus O+</h2>
            <p className="login-subtitle">Sign in to continue to the BEALET business workspace.</p>
          </div>
          <button
            type="button"
            className={`theme-toggle login-theme-toggle ${theme === 'dark' ? 'is-dark' : 'is-light'}`}
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span className="login-theme-toggle-track">
              <span className="login-theme-toggle-thumb" />
            </span>
          </button>
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          <div className="login-brand-stack">
            <div>
              <span className="login-brand-company">{companyProfile?.company_name || 'BEALET OPTICAL CENTER'}</span>
              <span>{companyProfile?.tagline || 'Professional Eye Care and Optical Services'}</span>
            </div>
          </div>

          <label>
            Username or Email
            <input
              type="text"
              value={credentials.login}
              onChange={(event) =>
                setCredentials((current) => ({ ...current, login: event.target.value }))
              }
              placeholder="user@bealet.com"
            />
          </label>

          <label>
            Password
            <div className="password-field">
              <input
                type={isPasswordVisible ? 'text' : 'password'}
                value={credentials.password}
                onChange={(event) =>
                  setCredentials((current) => ({ ...current, password: event.target.value }))
                }
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setIsPasswordVisible((current) => !current)}
                aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
              >
                {isPasswordVisible ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          {loginError ? <p className="form-error">{loginError}</p> : null}

          <button type="submit" className="primary-button" disabled={isLoggingIn}>
            {isLoggingIn ? 'Signing in...' : 'Open portal'}
          </button>
        </form>
      </div>
    </section>
  )
}
