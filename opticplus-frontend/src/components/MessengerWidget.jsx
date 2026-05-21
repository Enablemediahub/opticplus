import { useEffect, useMemo, useRef, useState } from 'react'
import PortalIcon from './PortalIcon.jsx'

function formatMessageTime(value) {
  if (!value) return ''

  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMessageDate(value) {
  if (!value) return ''

  return new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
}

function roleLabel(role) {
  return ({
    ceo: 'CEO',
    manager: 'General Manager',
    accountant: 'Accountant',
    optometrist: 'Optometrist',
    receptionist: 'Receptionist',
    technician: 'Technician',
  })[role] ?? role
}

function avatarInitials(name) {
  return String(name || 'OP')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Laravel often returns URLs using APP_URL; during Vite dev, resolve relative paths against API origin. */
function resolveProfileImageUrl(url) {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1')
    .replace(/\/api\/v1\/?$/i, '')
    .replace(/\/$/, '')
  return `${base}/${trimmed.replace(/^\//, '')}`
}

function MessengerAvatar({ name, profileImageUrl, size = 'md', className = '' }) {
  const [imgFailed, setImgFailed] = useState(false)
  const resolved = resolveProfileImageUrl(profileImageUrl)
  const px = size === 'lg' ? 52 : size === 'sm' ? 34 : size === 'xs' ? 28 : 42

  return (
    <div
      className={`messenger-avatar messenger-avatar-${size} ${className}`.trim()}
      style={{ width: px, height: px }}
    >
      {resolved && !imgFailed ? (
        <img src={resolved} alt="" onError={() => setImgFailed(true)} />
      ) : (
        <span>{avatarInitials(name)}</span>
      )}
    </div>
  )
}

function staffMetaLine(user) {
  return [
    user?.staff_id ? `Staff ID ${user.staff_id}` : null,
    roleLabel(user?.role),
    user?.branch,
  ]
    .filter(Boolean)
    .join(' - ')
}

export default function MessengerWidget({ apiFetch, token, session }) {
  const [accessDenied, setAccessDenied] = useState(false)
  const canUseMessenger = Boolean(token && session) && !accessDenied
  const [isOpen, setIsOpen] = useState(false)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [users, setUsers] = useState([])
  const [threads, setThreads] = useState([])
  const [selectedPeerId, setSelectedPeerId] = useState('')
  const [threadMessages, setThreadMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [isLoadingThread, setIsLoadingThread] = useState(false)
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [unreadTotal, setUnreadTotal] = useState(0)
  const [incomingToasts, setIncomingToasts] = useState([])
  const [sentToasts, setSentToasts] = useState([])
  const seenUnreadIdsRef = useRef(new Set())
  const hasPrimedUnreadRef = useRef(false)

  function enqueueIncomingToasts(messages) {
    if (!messages?.length) return

    setIncomingToasts((current) => {
      const existing = new Set(current.map((item) => item.id))
      const incoming = messages.filter((message) => !existing.has(message.id))
      if (!incoming.length) return current
      return [...incoming, ...current].slice(0, 6)
    })
  }

  const selectedPeer = useMemo(
    () => users.find((user) => String(user.id) === String(selectedPeerId))
      ?? threads.find((thread) => String(thread.peer.id) === String(selectedPeerId))?.peer
      ?? null,
    [selectedPeerId, threads, users],
  )

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return users

    return users.filter((user) =>
      [user.name, user.username, user.email, roleLabel(user.role), user.branch, user.staff_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    )
  }, [search, users])

  const inboxThreads = useMemo(
    () => threads.filter((thread) => thread.has_incoming_messages),
    [threads],
  )

  useEffect(() => {
    const availablePeerIds = new Set([
      ...threads.map((thread) => String(thread.peer?.id ?? '')),
      ...users.map((user) => String(user.id)),
    ].filter(Boolean))

    if (selectedPeerId && availablePeerIds.has(String(selectedPeerId))) {
      return
    }

    const nextPeerId = String(
      inboxThreads[0]?.peer?.id
      ?? threads[0]?.peer?.id
      ?? users[0]?.id
      ?? '',
    )

    if (nextPeerId !== String(selectedPeerId || '')) {
      setSelectedPeerId(nextPeerId)
    }
  }, [inboxThreads, selectedPeerId, threads, users])

  useEffect(() => {
    if (!canUseMessenger) return undefined

    let cancelled = false

    async function loadUsers() {
      setIsLoadingUsers(true)
      try {
        const response = await apiFetch('/messages/users', { token })
        if (!cancelled) {
          setAccessDenied(false)
          setUsers(response.users ?? [])
        }
      } catch (nextError) {
        if (!cancelled) {
          if (nextError?.status === 403) {
            setAccessDenied(true)
            return
          }
          setError(nextError.message)
        }
      } finally {
        if (!cancelled) setIsLoadingUsers(false)
      }
    }

    loadUsers()
    return () => {
      cancelled = true
    }
  }, [apiFetch, canUseMessenger, token])

  useEffect(() => {
    if (!canUseMessenger) return undefined

    let cancelled = false

    async function loadInbox() {
      try {
        const response = await apiFetch('/messages/inbox', { token })
        if (cancelled) return
        setAccessDenied(false)
        setThreads(response.threads ?? [])
        setUnreadTotal(Number(response.total_unread ?? 0))
        setSelectedPeerId((current) => current || String(response.threads?.[0]?.peer?.id ?? ''))
      } catch (nextError) {
        if (!cancelled) {
          if (nextError?.status === 403) {
            setAccessDenied(true)
            return
          }
          setError(nextError.message)
        }
      }
    }

    async function loadUnread() {
      try {
        const response = await apiFetch('/messages/unread', { token })
        if (cancelled) return
        setAccessDenied(false)
        setUnreadTotal(Number(response.total_unread ?? 0))
        const unreadMessages = response.messages ?? []
        const nextIds = new Set(unreadMessages.map((message) => message.id))

        if (hasPrimedUnreadRef.current) {
          const freshMessages = unreadMessages.filter((message) => !seenUnreadIdsRef.current.has(message.id))
          enqueueIncomingToasts(freshMessages)
        } else {
          hasPrimedUnreadRef.current = true
          if (unreadMessages.length && !isOpen) {
            enqueueIncomingToasts(unreadMessages.slice(0, 3))
          }
        }

        seenUnreadIdsRef.current = nextIds
      } catch (nextError) {
        if (!cancelled) {
          if (nextError?.status === 403) {
            setAccessDenied(true)
            return
          }
          setError(nextError.message)
        }
      }
    }

    loadInbox()
    loadUnread()
    const pollMs = isOpen ? 4500 : 11000
    const interval = window.setInterval(() => {
      loadInbox()
      loadUnread()
    }, pollMs)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [apiFetch, canUseMessenger, isOpen, token])

  useEffect(() => {
    if (!canUseMessenger || !selectedPeerId) return undefined

    let cancelled = false

    async function loadThread(markRead = true) {
      setIsLoadingThread(true)
      setError('')
      try {
        const response = await apiFetch(`/messages/threads/${selectedPeerId}`, { token })
        if (cancelled) return
        setAccessDenied(false)
        setThreadMessages(response.messages ?? [])
        if (markRead) {
          await apiFetch(`/messages/threads/${selectedPeerId}/read`, {
            method: 'POST',
            token,
          })
          const [inboxResponse, unreadResponse] = await Promise.all([
            apiFetch('/messages/inbox', { token }),
            apiFetch('/messages/unread', { token }),
          ])
          if (cancelled) return
          setThreads(inboxResponse.threads ?? [])
          setUnreadTotal(Number(unreadResponse.total_unread ?? 0))
          seenUnreadIdsRef.current = new Set((unreadResponse.messages ?? []).map((message) => message.id))
          setIncomingToasts((current) =>
            current.filter((item) => String(item.sender_id) !== String(selectedPeerId)),
          )
        }
      } catch (nextError) {
        if (!cancelled) {
          if (nextError?.status === 403) {
            setAccessDenied(true)
            return
          }
          setError(nextError.message)
        }
      } finally {
        if (!cancelled) setIsLoadingThread(false)
      }
    }

    loadThread(isOpen)
    const interval = window.setInterval(() => {
      if (isOpen) {
        loadThread(true)
      }
    }, 7000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [apiFetch, canUseMessenger, isOpen, selectedPeerId, token])

  async function sendMessage(event) {
    event.preventDefault()

    if (!selectedPeerId) {
      setError('Select a staff member before sending a message.')
      return
    }

    setIsSendingMessage(true)
    setError('')
    setSuccess('')

    try {
      const response = await apiFetch('/messages', {
        method: 'POST',
        token,
        body: {
          recipient_id: Number(selectedPeerId),
          message: draft,
        },
      })

      setDraft('')
      setSuccess(response.message || 'Message sent successfully.')
      const peerName = selectedPeer?.name || 'recipient'
      const sentId = `sent-${Date.now()}`
      setSentToasts((current) => [{ id: sentId, peerName }, ...current].slice(0, 4))
      window.setTimeout(() => {
        setSentToasts((current) => current.filter((item) => item.id !== sentId))
      }, 5000)

      const [threadResponse, inboxResponse, unreadResponse] = await Promise.all([
        apiFetch(`/messages/threads/${selectedPeerId}`, { token }),
        apiFetch('/messages/inbox', { token }),
        apiFetch('/messages/unread', { token }),
      ])
      setThreadMessages(threadResponse.messages ?? [])
      setThreads(inboxResponse.threads ?? [])
      setUnreadTotal(Number(unreadResponse.total_unread ?? 0))
    } catch (nextError) {
      if (nextError?.status === 403) {
        setAccessDenied(true)
        return
      }
      setError(nextError.message)
    } finally {
      setIsSendingMessage(false)
    }
  }

  function openIncomingToast(message) {
    setIsOpen(true)
    setSelectedPeerId(String(message.sender_id))
    setIsPickerOpen(false)
    setIncomingToasts((current) => current.filter((item) => item.id !== message.id))
  }

  if (!canUseMessenger) {
    return null
  }

  return (
    <>
      <div className="messenger-toast-stack" aria-live="polite">
        {sentToasts.map((toast) => (
          <div key={toast.id} className="messenger-toast messenger-toast-sent" role="status">
            <div className="messenger-toast-sent-icon" aria-hidden="true">✓</div>
            <div className="messenger-toast-copy">
              <strong>Message sent</strong>
              <span>Delivered to {toast.peerName}</span>
            </div>
          </div>
        ))}
        {incomingToasts.map((message) => (
          <button
            key={message.id}
            type="button"
            className="messenger-toast messenger-toast-incoming"
            onClick={() => openIncomingToast(message)}
          >
            <MessengerAvatar name={message.sender?.name} profileImageUrl={message.sender?.profile_image_url} size="sm" />
            <div className="messenger-toast-copy">
              <strong>{message.sender?.name || 'New message'}</strong>
              <span>{staffMetaLine(message.sender)}</span>
              <span className="messenger-toast-excerpt">{message.excerpt}</span>
            </div>
          </button>
        ))}
      </div>

      {isOpen ? (
        <section className="messenger-panel" aria-label="Internal messenger">
          <header className="messenger-panel-head">
            <div>
              <p className="eyebrow">Internal Messaging</p>
              <h3>Reach any staff member quickly</h3>
            </div>
            <button type="button" className="ghost-button" onClick={() => setIsOpen(false)}>
              Close
            </button>
          </header>

          {error ? <div className="message-banner error">{error}</div> : null}
          {success ? <div className="message-banner success">{success}</div> : null}

          <div className="messenger-search-row">
            <div className="messenger-picker-grid">
              <label className="full-span">
                Search staff
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name, staff ID, role, branch, or email"
                />
              </label>
              <label className="full-span">
                Choose staff
                <div className="messenger-picker">
                  <button
                    type="button"
                    className="messenger-picker-toggle"
                    onClick={() => setIsPickerOpen((current) => !current)}
                  >
                    {selectedPeer ? (
                      <span className="messenger-picker-toggle-inner">
                        <MessengerAvatar name={selectedPeer.name} profileImageUrl={selectedPeer.profile_image_url} size="xs" />
                        <span className="messenger-picker-toggle-text">
                          <strong>{selectedPeer.name}</strong>
                          <small>{staffMetaLine(selectedPeer)}</small>
                        </span>
                      </span>
                    ) : (
                      <span className="messenger-picker-placeholder">Select a staff member</span>
                    )}
                    <span className="messenger-picker-caret">{isPickerOpen ? '▲' : '▼'}</span>
                  </button>
                  {isPickerOpen ? (
                    <div className="messenger-picker-menu">
                      {filteredUsers.length ? (
                        filteredUsers.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            className="messenger-picker-option"
                            onClick={() => {
                              setSelectedPeerId(String(user.id))
                              setIsPickerOpen(false)
                            }}
                          >
                            <MessengerAvatar name={user.name} profileImageUrl={user.profile_image_url} size="sm" />
                            <span className="messenger-picker-option-text">
                              <strong>{user.name}</strong>
                              <span>{staffMetaLine(user)}</span>
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="messenger-picker-empty">No staff match your search.</div>
                      )}
                    </div>
                  ) : null}
                </div>
              </label>
            </div>
          </div>

          <div className="messenger-layout">
            <aside className="messenger-sidebar">
              <div className="messenger-section-head">
                <strong>Staff Directory</strong>
                <span>{isLoadingUsers ? 'Loading...' : filteredUsers.length}</span>
              </div>
              <div className="messenger-people-list">
                {filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className={String(user.id) === String(selectedPeerId) ? 'messenger-person active' : 'messenger-person'}
                    onClick={() => {
                      setSelectedPeerId(String(user.id))
                      setIsPickerOpen(false)
                      setIsOpen(true)
                    }}
                  >
                    <MessengerAvatar name={user.name} profileImageUrl={user.profile_image_url} size="md" />
                    <div className="messenger-person-copy">
                      <strong>{user.name}</strong>
                      <span>{staffMetaLine(user)}</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="messenger-section-head messenger-section-head-secondary">
                <strong>Inbox</strong>
                <span>{inboxThreads.length}</span>
              </div>
              <div className="messenger-thread-list">
                {inboxThreads.length ? inboxThreads.map((thread) => (
                  <button
                    key={`inbox-${thread.peer.id}`}
                    type="button"
                    className={String(thread.peer.id) === String(selectedPeerId) ? 'messenger-thread active' : 'messenger-thread'}
                    onClick={() => {
                      setSelectedPeerId(String(thread.peer.id))
                      setIsPickerOpen(false)
                      setIsOpen(true)
                    }}
                  >
                    <MessengerAvatar name={thread.peer.name} profileImageUrl={thread.peer.profile_image_url} size="sm" />
                    <div className="messenger-thread-body">
                      <div className="messenger-thread-top">
                        <strong>{thread.peer.name}</strong>
                        <span>{formatMessageDate(thread.latest_message.created_at)}</span>
                      </div>
                      <p>{thread.latest_message.excerpt}</p>
                      <div className="messenger-thread-meta">
                        <span>{staffMetaLine(thread.peer)}</span>
                        {thread.unread_count ? (
                          <em className="messenger-unread-pill">{thread.unread_count > 99 ? '99+' : thread.unread_count} new</em>
                        ) : (
                          <em className="messenger-thread-status">Received</em>
                        )}
                      </div>
                    </div>
                  </button>
                )) : (
                  <div className="messenger-thread-empty">No received messages yet.</div>
                )}
              </div>

              <div className="messenger-section-head messenger-section-head-secondary">
                <strong>Recent</strong>
                <span>{threads.length}</span>
              </div>
              <div className="messenger-thread-list">
                {threads.map((thread) => (
                  <button
                    key={thread.peer.id}
                    type="button"
                    className={String(thread.peer.id) === String(selectedPeerId) ? 'messenger-thread active' : 'messenger-thread'}
                    onClick={() => {
                      setSelectedPeerId(String(thread.peer.id))
                      setIsPickerOpen(false)
                      setIsOpen(true)
                    }}
                  >
                    <MessengerAvatar name={thread.peer.name} profileImageUrl={thread.peer.profile_image_url} size="sm" />
                    <div className="messenger-thread-body">
                      <div className="messenger-thread-top">
                        <strong>{thread.peer.name}</strong>
                        <span>{formatMessageDate(thread.latest_message.created_at)}</span>
                      </div>
                      <p>{thread.latest_message.excerpt}</p>
                      <div className="messenger-thread-meta">
                        <span>{staffMetaLine(thread.peer)}</span>
                        {thread.unread_count ? (
                          <em className="messenger-unread-pill">{thread.unread_count > 99 ? '99+' : thread.unread_count} new</em>
                        ) : null}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            <section className="messenger-conversation">
              {selectedPeer ? (
                <>
                  <div className="messenger-conversation-head">
                    <MessengerAvatar name={selectedPeer.name} profileImageUrl={selectedPeer.profile_image_url} size="lg" />
                    <div className="messenger-conversation-head-text">
                      <strong>{selectedPeer.name}</strong>
                      <span>{staffMetaLine(selectedPeer)}</span>
                    </div>
                  </div>

                  <div className="messenger-message-stream">
                    {isLoadingThread ? <p className="muted-copy">Loading messages...</p> : null}
                    {!isLoadingThread && !threadMessages.length ? (
                      <p className="muted-copy">No messages yet. Start the conversation below.</p>
                    ) : null}
                    {threadMessages.map((message) => (
                      <div
                        key={message.id}
                        className={message.is_mine ? 'messenger-bubble-row is-mine' : 'messenger-bubble-row'}
                      >
                        {!message.is_mine ? (
                          <MessengerAvatar
                            name={message.sender?.name}
                            profileImageUrl={message.sender?.profile_image_url}
                            size="xs"
                          />
                        ) : null}
                        <article className={message.is_mine ? 'messenger-bubble mine' : 'messenger-bubble'}>
                          <p>{message.message}</p>
                          <span className="messenger-bubble-time">
                            {formatMessageDate(message.created_at)} · {formatMessageTime(message.created_at)}
                          </span>
                        </article>
                      </div>
                    ))}
                  </div>

                  <form className="messenger-compose" onSubmit={sendMessage}>
                    <label className="full-span">
                      Message
                      <textarea
                        rows="4"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder={`Message ${selectedPeer.name}`}
                        required
                      />
                    </label>
                    <div className="filter-actions-row full-span">
                      <button type="submit" className="primary-button" disabled={isSendingMessage}>
                        {isSendingMessage ? 'Sending...' : 'Send message'}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="messenger-empty-state">
                  <PortalIcon name="message" className="messenger-empty-icon" />
                  <strong>Select a staff member to start messaging.</strong>
                  <span>Your chat panel stays available on every page of the portal.</span>
                </div>
              )}
            </section>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        className="messenger-fab"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={unreadTotal ? `Open internal messenger, ${unreadTotal} unread` : 'Open internal messenger'}
      >
        <PortalIcon name="message" className="messenger-fab-icon" />
        {unreadTotal > 0 ? (
          <span className="messenger-fab-badge" aria-hidden="true">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        ) : null}
      </button>
    </>
  )
}
