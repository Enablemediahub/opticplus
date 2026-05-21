import { useEffect, useMemo, useRef, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const emptyDraft = () => ({ title: '', contentHtml: '', reminder: '' })

const EDITOR_ACTIONS = [
  { label: 'B', title: 'Bold', command: 'bold' },
  { label: 'I', title: 'Italic', command: 'italic' },
  { label: 'U', title: 'Underline', command: 'underline' },
  { label: 'List', title: 'Bullet List', command: 'insertUnorderedList' },
  { label: '1.', title: 'Numbered List', command: 'insertOrderedList' },
]

export default function NotesSection({ session }) {
  const editorRef = useRef(null)
  const [notes, setNotes] = useState([])
  const [draft, setDraft] = useState(emptyDraft())
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [modalNoteId, setModalNoteId] = useState(null)
  const [search, setSearch] = useState('')
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const storageKey = useMemo(() => getStorageKey(session), [session])

  useEffect(() => {
    const storedNotes = readStoredNotes(storageKey)
    setNotes(storedNotes)
    setEditingNoteId(null)
    setModalNoteId(null)
    setDraft(emptyDraft())
    setSuccess('')
    setError('')
  }, [storageKey])

  useEffect(() => {
    if (!editorRef.current) return
    if (editorRef.current.innerHTML !== draft.contentHtml) {
      editorRef.current.innerHTML = draft.contentHtml || ''
    }
  }, [draft.contentHtml])

  const filteredNotes = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return notes

    return notes.filter((note) => (
      `${note.title} ${note.reminder || ''} ${note.plainText}`.toLowerCase().includes(term)
    ))
  }, [notes, search])

  const activeModalNote = useMemo(
    () => notes.find((note) => note.id === modalNoteId) ?? null,
    [modalNoteId, notes],
  )

  const notesUpdatedToday = useMemo(() => {
    const today = new Date().toDateString()
    return notes.filter((note) => new Date(note.updatedAt).toDateString() === today).length
  }, [notes])

  const remindersCount = useMemo(
    () => notes.filter((note) => note.reminder).length,
    [notes],
  )

  const unsavedState = useMemo(
    () => (editingNoteId ? 'Editing' : 'Drafting'),
    [editingNoteId],
  )

  function persistNotes(nextNotes) {
    const orderedNotes = [...nextNotes].sort((left, right) => (
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    ))

    setNotes(orderedNotes)

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, JSON.stringify(orderedNotes))
    }
  }

  function syncDraftFromEditor() {
    const html = editorRef.current?.innerHTML ?? ''
    setDraft((current) => ({ ...current, contentHtml: html }))
    return html
  }

  function resetComposer() {
    setEditingNoteId(null)
    setDraft(emptyDraft())
    setSuccess('')
    setError('')
    if (editorRef.current) {
      editorRef.current.innerHTML = ''
    }
  }

  function applyEditorCommand(command) {
    if (typeof document === 'undefined') return
    editorRef.current?.focus()
    document.execCommand(command, false, null)
    syncDraftFromEditor()
  }

  function saveNote() {
    const contentHtml = sanitizeEditorHtml(syncDraftFromEditor())
    const title = draft.title.trim()
    const reminder = draft.reminder.trim()
    const plainText = extractPlainText(contentHtml)

    if (!title && !plainText && !reminder) {
      setError('Add a title, reminder, or note content before saving.')
      setSuccess('')
      return
    }

    const now = new Date().toISOString()

    if (editingNoteId) {
      const nextNotes = notes.map((note) => (
        note.id === editingNoteId
          ? { ...note, title, reminder, contentHtml, plainText, updatedAt: now }
          : note
      ))
      persistNotes(nextNotes)
      setSuccess('Note updated successfully.')
      setError('')
      return
    }

    const nextNote = {
      id: createNoteId(),
      title,
      reminder,
      contentHtml,
      plainText,
      createdAt: now,
      updatedAt: now,
    }

    persistNotes([nextNote, ...notes])
    setEditingNoteId(nextNote.id)
    setDraft({ title, reminder, contentHtml })
    setSuccess('Note saved successfully.')
    setError('')
  }

  function openNoteModal(noteId) {
    setModalNoteId(noteId)
  }

  function editNote(note) {
    setEditingNoteId(note.id)
    setDraft({
      title: note.title || '',
      reminder: note.reminder || '',
      contentHtml: note.contentHtml || '',
    })
    setModalNoteId(null)
    setSuccess('')
    setError('')
  }

  function deleteNote(noteId) {
    const note = notes.find((item) => item.id === noteId)
    if (!note) return

    const shouldDelete = typeof window === 'undefined'
      ? true
      : window.confirm(`Delete "${note.title || 'Untitled note'}"?`)

    if (!shouldDelete) return

    const nextNotes = notes.filter((item) => item.id !== noteId)
    persistNotes(nextNotes)

    if (editingNoteId === noteId) {
      resetComposer()
    }

    if (modalNoteId === noteId) {
      setModalNoteId(null)
    }

    setSuccess('Note deleted.')
    setError('')
  }

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Notes</p>
          <h3>Write notes and reminders in one workspace</h3>
          <p className="header-copy">Capture reminders, front-desk handoffs, and personal follow-up notes with a standard writing editor and quick reopen modal.</p>
        </div>
      </div>

      {error ? <div className="message-banner error">{error}</div> : null}
      {success ? <div className="message-banner success">{success}</div> : null}

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Saved Notes" value={String(notes.length)} note="All notes in your workspace" icon="message" className="total" />
        <StatWidget label="Updated Today" value={String(notesUpdatedToday)} note="Touched during this session day" icon="calendar" className="pending" />
        <StatWidget label="Reminders" value={String(remindersCount)} note="Notes with reminder prompts" icon="reports" className="today" />
        <StatWidget label="Composer" value={unsavedState} note={editingNoteId ? 'Updating an existing note' : 'Ready for a new entry'} icon="support" className="seen" />
      </section>

      <section className="notes-workspace">
        <article className="panel notes-editor-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{editingNoteId ? 'Edit Note' : 'New Note'}</p>
              <h3>{editingNoteId ? 'Update your saved note' : 'Write a fresh note or reminder'}</h3>
            </div>
            <span className="panel-tag">{session?.name ?? 'Workspace user'}</span>
          </div>

          <div className="notes-editor-shell">
            <label>
              Title
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="Daily reception handoff"
              />
            </label>
            <label>
              Reminder
              <input
                value={draft.reminder}
                onChange={(event) => setDraft((current) => ({ ...current, reminder: event.target.value }))}
                placeholder="Call patient back at 3:00 PM"
              />
            </label>
            <div className="full-span notes-rich-editor">
              <span>Note</span>
              <div className="editor-toolbar" role="toolbar" aria-label="Note formatting tools">
                {EDITOR_ACTIONS.map((action) => (
                  <button
                    key={action.command}
                    type="button"
                    className="ghost-button editor-tool"
                    title={action.title}
                    onClick={() => applyEditorCommand(action.command)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              <div
                ref={editorRef}
                className="notes-editor-surface"
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Write observations, reminders, follow-up actions, or anything you need to revisit later."
                onInput={syncDraftFromEditor}
              />
            </div>
          </div>

          <div className="notes-toolbar">
            <button type="button" className="ghost-button" onClick={resetComposer}>
              New Note
            </button>
            {editingNoteId ? (
              <button type="button" className="ghost-button danger-outline" onClick={() => deleteNote(editingNoteId)}>
                Delete
              </button>
            ) : null}
            <button type="button" className="primary-button" onClick={saveNote}>
              {editingNoteId ? 'Save Changes' : 'Save Note'}
            </button>
          </div>
        </article>

        <article className="panel notes-list-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Saved Notes</p>
              <h3>Open, edit, and delete earlier entries</h3>
            </div>
            <span className="panel-tag">{filteredNotes.length} shown</span>
          </div>

          <label className="notes-search">
            Search
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search titles, reminders, or note text"
            />
          </label>

          <div className="notes-list-shell">
            {filteredNotes.length ? filteredNotes.map((note) => (
              <article key={note.id} className={note.id === editingNoteId ? 'note-list-card active' : 'note-list-card'}>
                <button type="button" className="note-list-open" onClick={() => openNoteModal(note.id)}>
                  <strong>{note.title || 'Untitled note'}</strong>
                  <span>{formatDateTime(note.updatedAt)}</span>
                  {note.reminder ? <small className="note-reminder-chip">Reminder: {note.reminder}</small> : null}
                  <p>{note.plainText || 'No note body saved.'}</p>
                </button>
                <div className="note-list-actions">
                  <button type="button" className="ghost-button" onClick={() => openNoteModal(note.id)}>
                    Open
                  </button>
                  <button type="button" className="ghost-button" onClick={() => editNote(note)}>
                    Edit
                  </button>
                  <button type="button" className="ghost-button danger-outline" onClick={() => deleteNote(note.id)}>
                    Delete
                  </button>
                </div>
              </article>
            )) : (
              <div className="empty-state-panel">
                <strong>No notes found</strong>
                <span>Save a note or adjust the search to see entries here.</span>
              </div>
            )}
          </div>
        </article>
      </section>

      {activeModalNote ? (
        <div className="modal-overlay" role="presentation" onClick={() => setModalNoteId(null)}>
          <div
            className="modal-panel note-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="note-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Note Entry</p>
                <h3 id="note-modal-title">{activeModalNote.title || 'Untitled note'}</h3>
              </div>
              <span className="panel-tag">{formatDateTime(activeModalNote.updatedAt)}</span>
            </div>

            {activeModalNote.reminder ? (
              <div className="note-modal-reminder">
                <strong>Reminder</strong>
                <p>{activeModalNote.reminder}</p>
              </div>
            ) : null}

            <article
              className="note-modal-body"
              dangerouslySetInnerHTML={{ __html: activeModalNote.contentHtml || '<p>No note body saved.</p>' }}
            />

            <div className="notes-toolbar">
              <button type="button" className="ghost-button" onClick={() => setModalNoteId(null)}>
                Close
              </button>
              <button type="button" className="ghost-button danger-outline" onClick={() => deleteNote(activeModalNote.id)}>
                Delete
              </button>
              <button type="button" className="primary-button" onClick={() => editNote(activeModalNote)}>
                Edit Note
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function getStorageKey(session) {
  const userKey = session?.id ?? session?.staff_id ?? session?.name ?? 'guest'
  return `opticplus-personal-notes-${userKey}`
}

function readStoredNotes(storageKey) {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((note) => note && typeof note === 'object')
      .map((note) => normalizeStoredNote(note))
  } catch {
    return []
  }
}

function normalizeStoredNote(note) {
  const legacyBody = typeof note.body === 'string' ? note.body : ''
  const contentHtml = typeof note.contentHtml === 'string'
    ? note.contentHtml
    : convertPlainTextToHtml(legacyBody)

  return {
    id: note.id || createNoteId(),
    title: typeof note.title === 'string' ? note.title : '',
    reminder: typeof note.reminder === 'string' ? note.reminder : '',
    contentHtml,
    plainText: extractPlainText(contentHtml),
    createdAt: note.createdAt || new Date().toISOString(),
    updatedAt: note.updatedAt || note.createdAt || new Date().toISOString(),
  }
}

function createNoteId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function sanitizeEditorHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/ on\w+="[^"]*"/gi, '')
    .replace(/ on\w+='[^']*'/gi, '')
    .trim()
}

function extractPlainText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function convertPlainTextToHtml(text) {
  const escaped = escapeHtml(String(text || ''))
  return escaped
    ? escaped.split(/\n{2,}/).map((chunk) => `<p>${chunk.replace(/\n/g, '<br />')}</p>`).join('')
    : ''
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatDateTime(value) {
  if (!value) return 'No activity yet'
  return new Date(value).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
