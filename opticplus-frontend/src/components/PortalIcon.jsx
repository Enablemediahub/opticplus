export default function PortalIcon({ name, className = '' }) {
  const commonProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    className,
  }

  switch (name) {
    case 'dashboard':
      return (
        <svg {...commonProps}>
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="5" rx="2" />
          <rect x="13" y="10" width="8" height="11" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
        </svg>
      )
    case 'calendar':
      return (
        <svg {...commonProps}>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      )
    case 'patients':
      return (
        <svg {...commonProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="3.5" />
          <path d="M21 21v-2a4 4 0 0 0-3-3.87M16 4.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    case 'receipt':
      return (
        <svg {...commonProps}>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      )
    case 'finance':
      return (
        <svg {...commonProps}>
          <path d="M12 3v18" />
          <path d="M17 7.5c0-1.93-2.24-3.5-5-3.5s-5 1.57-5 3.5 2.24 3.5 5 3.5 5 1.57 5 3.5-2.24 3.5-5 3.5-5-1.57-5-3.5" />
        </svg>
      )
    case 'shield':
      return (
        <svg {...commonProps}>
          <path d="M12 3l7 3v6c0 4.97-3.05 7.78-7 9-3.95-1.22-7-4.03-7-9V6l7-3Z" />
          <path d="m9.5 12 1.7 1.7 3.8-4.2" />
        </svg>
      )
    case 'inventory':
      return (
        <svg {...commonProps}>
          <path d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z" />
          <path d="M3 7.5V16.5L12 21l9-4.5V7.5" />
          <path d="M12 12v9" />
        </svg>
      )
    case 'clock':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      )
    case 'reports':
      return (
        <svg {...commonProps}>
          <path d="M4 19h16" />
          <path d="M7 16V9M12 16V5M17 16v-3" />
        </svg>
      )
    case 'support':
      return (
        <svg {...commonProps}>
          <path d="M5 14v-2a7 7 0 0 1 14 0v2" />
          <rect x="3" y="13" width="4" height="6" rx="2" />
          <rect x="17" y="13" width="4" height="6" rx="2" />
          <path d="M19 19a3 3 0 0 1-3 3h-4" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 .99-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51.99H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      )
    case 'money':
      return (
        <svg {...commonProps}>
          <rect x="3" y="6" width="18" height="12" rx="2.5" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M7 10h.01M17 14h.01" />
        </svg>
      )
    case 'trend':
      return (
        <svg {...commonProps}>
          <path d="M3 17 9 11l4 4 8-8" />
          <path d="M14 7h7v7" />
        </svg>
      )
    case 'alert':
      return (
        <svg {...commonProps}>
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        </svg>
      )
    case 'check-badge':
      return (
        <svg {...commonProps}>
          <path d="M12 3l2.1 2.4 3.2-.4.9 3.1 2.9 1.5-1.5 2.9 1.5 2.9-2.9 1.5-.9 3.1-3.2-.4L12 21l-2.1-2.4-3.2.4-.9-3.1-2.9-1.5 1.5-2.9L2.9 8.6l2.9-1.5.9-3.1 3.2.4Z" />
          <path d="m9.5 12.3 1.7 1.7 3.6-4" />
        </svg>
      )
    case 'glasses':
      return (
        <svg {...commonProps}>
          <path d="M3 12c0-1.1.9-2 2-2h3c1.7 0 3 1.3 3 3v1c0 1.1-.9 2-2 2H7c-2.2 0-4-1.8-4-4Z" />
          <path d="M21 12c0-1.1-.9-2-2-2h-3c-1.7 0-3 1.3-3 3v1c0 1.1.9 2 2 2h2c2.2 0 4-1.8 4-4Z" />
          <path d="M11 12h2M5 10 4 7M19 10l1-3" />
        </svg>
      )
    case 'message':
      return (
        <svg {...commonProps}>
          <path d="M4 5h16v10H8l-4 4V5Z" />
          <path d="M8 9h8M8 12h5" />
        </svg>
      )
    case 'layers':
      return (
        <svg {...commonProps}>
          <path d="M12 3 3 8l9 5 9-5-9-5Z" />
          <path d="m3 12 9 5 9-5" />
          <path d="m3 16 9 5 9-5" />
        </svg>
      )
    case 'briefcase':
      return (
        <svg {...commonProps}>
          <rect x="3" y="7" width="18" height="13" rx="2.5" />
          <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          <path d="M3 12h18" />
          <path d="M10 12v2h4v-2" />
        </svg>
      )
    case 'sun':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )
    case 'moon':
      return (
        <svg {...commonProps}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3c-.01.2-.01.39-.01.59A7 7 0 0 0 18.41 10.8c.2 0 .39 0 .59-.01Z" />
        </svg>
      )
    case 'chevron-down':
      return (
        <svg {...commonProps}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      )
    case 'logout':
      return (
        <svg {...commonProps}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      )
    case 'menu':
      return (
        <svg {...commonProps}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      )
    case 'close':
      return (
        <svg {...commonProps}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      )
    default:
      return null
  }
}
