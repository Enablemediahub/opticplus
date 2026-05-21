import { useState } from 'react'

function profileInitials(name) {
  return String(name || 'OP')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export default function SettingsSection({
  session,
  settingsProfileForm,
  setSettingsProfileForm,
  settingsPasswordForm,
  setSettingsPasswordForm,
  settingsError,
  settingsSuccess,
  isSavingSettingsProfile,
  isSavingSettingsPassword,
  companyProfileForm,
  setCompanyProfileForm,
  isSavingCompanyProfile,
  insuranceProviderCatalog,
  expenseCategoryCatalog,
  isLoadingSettingsCatalog,
  isSavingInsuranceProvider,
  isSavingExpenseCategory,
  isDeletingInsuranceProviderId,
  isDeletingExpenseCategoryId,
  saveSettingsProfile,
  saveSettingsPassword,
  saveCompanyProfile,
  saveInsuranceProvider,
  deleteInsuranceProvider,
  saveExpenseCategory,
  deleteExpenseCategory,
}) {
  const [insuranceProviderName, setInsuranceProviderName] = useState('')
  const [expenseCategoryName, setExpenseCategoryName] = useState('')
  const profilePreview = settingsProfileForm.profilePreview || session?.profile_image_url
  const profileImageName = settingsProfileForm.profileImage?.name || ''
  const loginWallpaperPreview =
    companyProfileForm.loginWallpaperPreview || companyProfileForm.login_wallpaper_url || ''
  const loginWallpaperName = companyProfileForm.loginWallpaperFile?.name || ''
  const canManageCompanyProfile = ['manager', 'ceo'].includes(session?.role)
  const canManageOperationsCatalogs = session?.role === 'manager'

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h3>Manage your portal identity and security</h3>
          <p className="header-copy">
            Update your profile picture, name, username, contact details, and password from one place.
          </p>
        </div>
      </div>

      {settingsError ? <div className="message-banner error">{settingsError}</div> : null}
      {settingsSuccess ? <div className="message-banner success">{settingsSuccess}</div> : null}

      <section className="settings-layout">
        <article className="panel settings-profile-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Profile</p>
              <h3>Public account details</h3>
            </div>
            <span className="panel-tag">{session?.staff_id || 'Staff ID unavailable'}</span>
          </div>

          <form className="settings-grid" onSubmit={saveSettingsProfile}>
            <div className="settings-avatar-block full-span">
              <div className="settings-avatar-frame">
                {profilePreview ? (
                  <img src={profilePreview} alt={`${session?.name || 'User'} profile`} className="settings-avatar-image" />
                ) : (
                  <span className="settings-avatar-fallback">{profileInitials(session?.name)}</span>
                )}
              </div>

              <div className="settings-avatar-copy">
                <strong>{session?.name}</strong>
                <span>{session?.job_title || session?.department || 'Portal staff account'}</span>
                <div className="memo-upload-field settings-upload-field">
                  <span className="memo-upload-label">Profile picture</span>
                  <label className="memo-upload-trigger">
                    <input
                      className="hidden-file-input"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null
                        setSettingsProfileForm((current) => ({
                          ...current,
                          profileImage: file,
                          profilePreview: file ? URL.createObjectURL(file) : current.profilePreview,
                        }))
                      }}
                    />
                    <strong>Upload profile image</strong>
                    <span>Choose a polished headshot or account avatar for your portal identity.</span>
                  </label>
                  {profileImageName ? (
                    <div className="memo-file-pill-list">
                      <span className="memo-file-pill">{profileImageName}</span>
                    </div>
                  ) : (
                    <p className="muted-copy">No new profile image selected yet.</p>
                  )}
                </div>
              </div>
            </div>

            <label>
              Full name
              <input
                value={settingsProfileForm.name}
                onChange={(event) => setSettingsProfileForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </label>

            <label>
              Username
              <input
                value={settingsProfileForm.username}
                onChange={(event) => setSettingsProfileForm((current) => ({ ...current, username: event.target.value }))}
                required
              />
            </label>

            <label>
              Email
              <input
                type="email"
                value={settingsProfileForm.email}
                onChange={(event) => setSettingsProfileForm((current) => ({ ...current, email: event.target.value }))}
                required
              />
            </label>

            <label>
              Phone
              <input
                value={settingsProfileForm.phone}
                onChange={(event) => setSettingsProfileForm((current) => ({ ...current, phone: event.target.value }))}
              />
            </label>

            <label>
              Role
              <input value={session?.role || ''} readOnly />
            </label>

            <label>
              Branch
              <input value={session?.branch || ''} readOnly />
            </label>

            <div className="filter-actions-row full-span">
              <button type="submit" className="primary-button" disabled={isSavingSettingsProfile}>
                {isSavingSettingsProfile ? 'Saving profile...' : 'Save profile'}
              </button>
            </div>
          </form>
        </article>

        <article className="panel settings-security-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Security</p>
              <h3>Change password</h3>
            </div>
          </div>

          <form className="settings-grid" onSubmit={saveSettingsPassword}>
            <label className="full-span">
              Current password
              <input
                type="password"
                value={settingsPasswordForm.current_password}
                onChange={(event) =>
                  setSettingsPasswordForm((current) => ({ ...current, current_password: event.target.value }))
                }
                required
              />
            </label>

            <label>
              New password
              <input
                type="password"
                value={settingsPasswordForm.password}
                onChange={(event) => setSettingsPasswordForm((current) => ({ ...current, password: event.target.value }))}
                required
              />
            </label>

            <label>
              Confirm new password
              <input
                type="password"
                value={settingsPasswordForm.password_confirmation}
                onChange={(event) =>
                  setSettingsPasswordForm((current) => ({ ...current, password_confirmation: event.target.value }))
                }
                required
              />
            </label>

            <div className="filter-actions-row full-span">
              <button type="submit" className="primary-button" disabled={isSavingSettingsPassword}>
                {isSavingSettingsPassword ? 'Updating password...' : 'Update password'}
              </button>
            </div>
          </form>
        </article>

        {canManageCompanyProfile ? (
          <article className="panel settings-security-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Company Profile</p>
                <h3>Clinic identity, contacts, and branch addresses</h3>
              </div>
            </div>

            <form className="settings-grid" onSubmit={saveCompanyProfile}>
              <label>
                Company name
                <input
                  value={companyProfileForm.company_name}
                  onChange={(event) => setCompanyProfileForm((current) => ({ ...current, company_name: event.target.value }))}
                  required
                />
              </label>

              <label>
                Company email
                <input
                  type="email"
                  value={companyProfileForm.company_email}
                  onChange={(event) => setCompanyProfileForm((current) => ({ ...current, company_email: event.target.value }))}
                  required
                />
              </label>

              <label>
                Primary phone
                <input
                  value={companyProfileForm.company_phone_primary}
                  onChange={(event) => setCompanyProfileForm((current) => ({ ...current, company_phone_primary: event.target.value }))}
                  required
                />
              </label>

              <label>
                Secondary phone
                <input
                  value={companyProfileForm.company_phone_secondary}
                  onChange={(event) => setCompanyProfileForm((current) => ({ ...current, company_phone_secondary: event.target.value }))}
                />
              </label>

              <label className="full-span">
                Tagline
                <input
                  value={companyProfileForm.tagline}
                  onChange={(event) => setCompanyProfileForm((current) => ({ ...current, tagline: event.target.value }))}
                />
              </label>

              <div className="settings-avatar-block full-span settings-wallpaper-block">
                <div className="settings-wallpaper-preview">
                  {loginWallpaperPreview ? (
                    <img src={loginWallpaperPreview} alt="Login wallpaper preview" className="settings-wallpaper-image" />
                  ) : (
                    <div className="settings-wallpaper-fallback">
                      <strong>Login wallpaper</strong>
                      <span>Upload a branded background for the Opticplus O+ sign-in page.</span>
                    </div>
                  )}
                </div>

                <div className="settings-avatar-copy">
                  <strong>Login interface wallpaper</strong>
                  <span>Visible on the public login page before users sign in.</span>
                  <div className="memo-upload-field settings-upload-field">
                    <span className="memo-upload-label">Wallpaper image</span>
                    <label className="memo-upload-trigger">
                      <input
                        className="hidden-file-input"
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null
                          setCompanyProfileForm((current) => ({
                            ...current,
                            loginWallpaperFile: file,
                            loginWallpaperPreview: file
                              ? URL.createObjectURL(file)
                              : current.login_wallpaper_url || '',
                          }))
                        }}
                      />
                      <strong>Upload login wallpaper</strong>
                      <span>Use a wide brand image that reads well behind the sign-in hero layout.</span>
                    </label>
                    {loginWallpaperName ? (
                      <div className="memo-file-pill-list">
                        <span className="memo-file-pill">{loginWallpaperName}</span>
                      </div>
                    ) : (
                      <p className="muted-copy">No new wallpaper image selected yet.</p>
                    )}
                  </div>
                </div>
              </div>

              <label className="full-span">
                Labadi branch address
                <input
                  value={companyProfileForm.labadi_address}
                  onChange={(event) => setCompanyProfileForm((current) => ({ ...current, labadi_address: event.target.value }))}
                  required
                />
              </label>

              <label className="full-span">
                Madina branch address
                <input
                  value={companyProfileForm.madina_address}
                  onChange={(event) => setCompanyProfileForm((current) => ({ ...current, madina_address: event.target.value }))}
                  required
                />
              </label>

              <div className="filter-actions-row full-span">
                <button type="submit" className="primary-button" disabled={isSavingCompanyProfile}>
                  {isSavingCompanyProfile ? 'Saving company profile...' : 'Save company profile'}
                </button>
              </div>
            </form>
          </article>
        ) : null}

        {canManageOperationsCatalogs ? (
          <article className="panel settings-security-panel settings-operations-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Operations Catalogs</p>
                <h3>Insurance companies and expense categories</h3>
              </div>
              <span className="panel-tag">General Manager only</span>
            </div>

            <div className="settings-catalog-grid">
              <section className="settings-catalog-card">
                <div className="settings-catalog-head">
                  <div>
                    <p className="eyebrow">Insurance Companies</p>
                    <h4>Signed insurance providers</h4>
                  </div>
                  <span className="panel-tag">{insuranceProviderCatalog.length}</span>
                </div>

                <form
                  className="settings-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    saveInsuranceProvider(insuranceProviderName)
                    setInsuranceProviderName('')
                  }}
                >
                  <label className="full-span">
                    Add insurance company
                    <input
                      value={insuranceProviderName}
                      onChange={(event) => setInsuranceProviderName(event.target.value)}
                      placeholder="e.g. GLICO, ACACIA, OTHER"
                      required
                    />
                  </label>
                  <div className="filter-actions-row full-span">
                    <button type="submit" className="primary-button" disabled={isSavingInsuranceProvider}>
                      {isSavingInsuranceProvider ? 'Saving...' : 'Add insurance company'}
                    </button>
                  </div>
                </form>

                <div className="settings-catalog-list">
                  {isLoadingSettingsCatalog ? <p className="muted-copy">Loading insurance companies...</p> : null}
                  {!isLoadingSettingsCatalog && insuranceProviderCatalog.length ? insuranceProviderCatalog.map((provider) => (
                    <div key={provider.id} className="settings-catalog-item">
                      <div>
                        <strong>{provider.name}</strong>
                        <span>{provider.created_at ? `Added ${new Date(provider.created_at).toLocaleDateString()}` : 'Existing provider'}</span>
                      </div>
                      <button
                        type="button"
                        className="ghost-button danger-outline"
                        disabled={isDeletingInsuranceProviderId === provider.id}
                        onClick={() => deleteInsuranceProvider(provider.id)}
                      >
                        {isDeletingInsuranceProviderId === provider.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  )) : null}
                  {!isLoadingSettingsCatalog && !insuranceProviderCatalog.length ? (
                    <p className="muted-copy">No insurance companies have been configured yet.</p>
                  ) : null}
                </div>
              </section>

              <section className="settings-catalog-card">
                <div className="settings-catalog-head">
                  <div>
                    <p className="eyebrow">Expense Categories</p>
                    <h4>Current category list</h4>
                  </div>
                  <span className="panel-tag">{expenseCategoryCatalog.length}</span>
                </div>

                <form
                  className="settings-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    saveExpenseCategory(expenseCategoryName)
                    setExpenseCategoryName('')
                  }}
                >
                  <label className="full-span">
                    Add expense category
                    <input
                      value={expenseCategoryName}
                      onChange={(event) => setExpenseCategoryName(event.target.value)}
                      placeholder="e.g. Utilities, Repairs, Optical Supplies"
                      required
                    />
                  </label>
                  <div className="filter-actions-row full-span">
                    <button type="submit" className="primary-button" disabled={isSavingExpenseCategory}>
                      {isSavingExpenseCategory ? 'Saving...' : 'Add expense category'}
                    </button>
                  </div>
                </form>

                <div className="settings-catalog-list">
                  {isLoadingSettingsCatalog ? <p className="muted-copy">Loading expense categories...</p> : null}
                  {!isLoadingSettingsCatalog && expenseCategoryCatalog.length ? expenseCategoryCatalog.map((category) => (
                    <div key={category.id} className="settings-catalog-item">
                      <div>
                        <strong>{category.name}</strong>
                        <span>{category.created_at ? `Added ${new Date(category.created_at).toLocaleDateString()}` : 'Active category'}</span>
                      </div>
                      <button
                        type="button"
                        className="ghost-button danger-outline"
                        disabled={isDeletingExpenseCategoryId === category.id}
                        onClick={() => deleteExpenseCategory(category.id)}
                      >
                        {isDeletingExpenseCategoryId === category.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  )) : null}
                  {!isLoadingSettingsCatalog && !expenseCategoryCatalog.length ? (
                    <p className="muted-copy">No expense categories are available yet.</p>
                  ) : null}
                </div>
              </section>
            </div>
          </article>
        ) : null}
      </section>
    </section>
  )
}
