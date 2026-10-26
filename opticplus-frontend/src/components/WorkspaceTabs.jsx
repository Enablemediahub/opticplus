function tabAbbreviation(label) {
  return String(label)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

export default function WorkspaceTabs({
  tabs,
  activeTab,
  onChange,
  ariaLabel,
  heading = 'Choose a workspace',
  description = 'Select a section to continue.',
  compact = false,
}) {
  const activeLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? tabs[0]?.label ?? ''

  return (
    <section className={`workspace-tabs-navigation${compact ? ' workspace-tabs-navigation--compact' : ''}`} aria-label={ariaLabel}>
      <div className="workspace-tabs-heading">
        <div>
          <p className="eyebrow">Workspace navigation</p>
          <h4>{heading}</h4>
          {description ? <p>{description}</p> : null}
        </div>
        <span className="workspace-tabs-current">
          <span className="workspace-tabs-current__dot" aria-hidden="true" />
          Currently open: <strong>{activeLabel}</strong>
        </span>
      </div>
      <div className="workspace-tabs-list" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`workspace-tab${isActive ? ' is-active' : ''}`}
              onClick={() => onChange(tab.id)}
            >
              <span className="workspace-tab__icon" aria-hidden="true">
                {tab.icon ?? tabAbbreviation(tab.label)}
              </span>
              <span className="workspace-tab__copy">
                <span className="workspace-tab__title">{tab.label}</span>
                {tab.description ? <span className="workspace-tab__description">{tab.description}</span> : null}
              </span>
              <span className="workspace-tab__meta">
                {tab.count !== undefined ? (
                  <span className="workspace-tab__count" aria-label={`${tab.count} ${tab.countLabel ?? 'items'}`}>
                    {tab.count}
                  </span>
                ) : null}
                {isActive ? (
                  <span className="workspace-tab__current">Currently open</span>
                ) : (
                  <span className="workspace-tab__arrow" aria-hidden="true">→</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
