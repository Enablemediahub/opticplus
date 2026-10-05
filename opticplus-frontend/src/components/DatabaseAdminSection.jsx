import { useEffect, useMemo, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const defaultFilters = {
  table: '',
  table_search: '',
  search: '',
  per_page: 25,
}

const BILLING_DERIVED_FIELDS = [
  'amount',
  'tax',
  'nhil_amount',
  'getfund_amount',
  'vat_amount',
  'total_amount',
  'balance',
]

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '--'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function formatMoney(value) {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '--'
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function fieldLabel(name) {
  return name.replaceAll('_', ' ')
}

function syncColumnLayout(currentLayout, columnNames) {
  const validNames = new Set(columnNames)
  const preserved = (currentLayout ?? []).filter((name) => validNames.has(name))
  const missing = columnNames.filter((name) => !preserved.includes(name))
  return [...preserved, ...missing]
}

function reorderArrayItem(items, fromIndex, toIndex) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length || fromIndex === toIndex) {
    return items
  }

  const nextItems = [...items]
  const [item] = nextItems.splice(fromIndex, 1)
  nextItems.splice(toIndex, 0, item)
  return nextItems
}

function activeLinkedTables(linkedCounts = {}) {
  return Object.entries(linkedCounts)
    .filter(([, value]) => Number(value) > 0)
    .map(([key]) => key)
}

function toDatetimeLocal(value) {
  if (!value) return ''
  return String(value).replace(' ', 'T').slice(0, 16)
}

function createFormState(schema, record = {}) {
  const nextState = {}

  for (const column of schema?.columns ?? []) {
    if (!column.editable) continue

    const rawValue = record[column.name]
    if (column.input === 'boolean') {
      nextState[column.name] = rawValue === 1 || rawValue === true ? '1' : '0'
    } else if (column.input === 'datetime') {
      nextState[column.name] = toDatetimeLocal(rawValue)
    } else {
      nextState[column.name] = rawValue ?? ''
    }
  }

  return nextState
}

function tableSearchHint(tableData) {
  if (tableData?.search_hint) return tableData.search_hint
  return 'Search rows in the selected table'
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function numericValue(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function buildBillingLiveValues(editForm, record = {}) {
  const consultation = roundMoney(numericValue(editForm.consultation_price, numericValue(record.consultation_price, 0)))
  const frame = roundMoney(numericValue(editForm.frame_price, numericValue(record.frame_price, 0)))
  const lens = roundMoney(numericValue(editForm.lens_price, numericValue(record.lens_price, 0)))
  const casePrice = roundMoney(numericValue(editForm.case_price, numericValue(record.case_price, 0)))
  const discount = roundMoney(Math.max(numericValue(editForm.discount, numericValue(record.discount, 0)), 0))
  const subtotal = roundMoney(consultation + frame + lens + casePrice)
  const baseAmount = subtotal > 0 ? roundMoney(subtotal / 1.2) : 0
  const nhil = roundMoney(baseAmount * 0.025)
  const getfund = roundMoney(baseAmount * 0.025)
  const vat = roundMoney(baseAmount * 0.15)
  const tax = roundMoney(nhil + getfund + vat)
  const totalAmount = roundMoney(Math.max(subtotal - discount, 0))
  const settledAmount = roundMoney(Math.max(numericValue(record.total_amount, 0) - numericValue(record.balance, 0), 0))
  const balance = roundMoney(Math.max(totalAmount - settledAmount, 0))

  return {
    subtotal,
    baseAmount,
    discount,
    nhil,
    getfund,
    vat,
    tax,
    totalAmount,
    settledAmount,
    balance,
    persistedValues: {
      amount: baseAmount,
      discount,
      tax,
      nhil_amount: nhil,
      getfund_amount: getfund,
      vat_amount: vat,
      total_amount: totalAmount,
      balance,
    },
  }
}

function isRiskyColumn(column, primaryKey) {
  return column.name === primaryKey || column.key === 'PRI' || column.name.endsWith('_id')
}

export default function DatabaseAdminSection({ token, selectedBranchId, setSelectedBranchId, branchOptions, apiFetch, setActiveView }) {
  const [filters, setFilters] = useState(defaultFilters)
  const [summaryData, setSummaryData] = useState(null)
  const [tableData, setTableData] = useState(null)
  const [detail, setDetail] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [modalMode, setModalMode] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLoadingSummary, setIsLoadingSummary] = useState(false)
  const [isLoadingTable, setIsLoadingTable] = useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [page, setPage] = useState(1)
  const [appliedTableSearch, setAppliedTableSearch] = useState('')
  const [appliedRowSearch, setAppliedRowSearch] = useState('')
  const [hasRequestedTable, setHasRequestedTable] = useState(false)
  const [summaryReloadNonce, setSummaryReloadNonce] = useState(0)
  const [tableReloadNonce, setTableReloadNonce] = useState(0)
  const [tablesReloadNonce, setTablesReloadNonce] = useState(0)
  const [columnLayouts, setColumnLayouts] = useState({})
  const [duplicatesData, setDuplicatesData] = useState(null)
  const [duplicatesError, setDuplicatesError] = useState('')
  const [isLoadingDuplicates, setIsLoadingDuplicates] = useState(false)
  const [isDuplicatesOpen, setIsDuplicatesOpen] = useState(false)
  const [selectedRowIds, setSelectedRowIds] = useState([])
  const [draggedColumnName, setDraggedColumnName] = useState('')
  const [isDeletingSelection, setIsDeletingSelection] = useState(false)
  const [deleteMode, setDeleteMode] = useState('cascade')
  const [selectedLinkedTables, setSelectedLinkedTables] = useState([])
  const [bulkDeleteState, setBulkDeleteState] = useState({
    isOpen: false,
    isLoading: false,
    linkedCounts: {},
  })

  useEffect(() => {
    let cancelled = false

    async function loadWorkspaceSummary() {
      setIsLoadingSummary(true)
      setError('')

      try {
        const params = new URLSearchParams({
          branch_id: String(selectedBranchId),
        })

        const response = await apiFetch(`/manager/database-admin/meta?${params.toString()}`, { token })
        if (cancelled) return

        setSummaryData((current) => ({ ...(current ?? {}), ...response }))
      } catch (nextError) {
        if (!cancelled) setError(nextError.message)
      } finally {
        if (!cancelled) setIsLoadingSummary(false)
      }
    }

    loadWorkspaceSummary()

    return () => {
      cancelled = true
    }
  }, [apiFetch, selectedBranchId, summaryReloadNonce, token])

  useEffect(() => {
    let cancelled = false

    async function loadTables() {
      try {
        const params = new URLSearchParams({
          branch_id: String(selectedBranchId),
        })

        if (appliedTableSearch) params.set('table_search', appliedTableSearch)
        if (filters.table) params.set('table', filters.table)

        const response = await apiFetch(`/manager/database-admin/tables?${params.toString()}`, { token })
        if (cancelled) return

        setSummaryData((current) => ({ ...(current ?? {}), ...response }))
        setFilters((current) => {
          if (current.table && response.tables?.some((table) => table.name === current.table)) {
            return current
          }

          if (!response.selected_table || current.table === response.selected_table) {
            return current
          }

          return { ...current, table: response.selected_table }
        })
      } catch (nextError) {
        if (!cancelled) setError(nextError.message)
      }
    }

    loadTables()

    return () => {
      cancelled = true
    }
  }, [apiFetch, appliedTableSearch, filters.table, selectedBranchId, tablesReloadNonce, token])

  useEffect(() => {
    if (!hasRequestedTable && filters.table) {
      setHasRequestedTable(true)
    }
  }, [filters.table, hasRequestedTable])

  useEffect(() => {
    if (!hasRequestedTable || !filters.table) return undefined

    let cancelled = false

    async function loadTableRows() {
      setIsLoadingTable(true)
      setError('')

      try {
        const params = new URLSearchParams({
          branch_id: String(selectedBranchId),
          page: String(page),
          per_page: String(filters.per_page),
          table: filters.table,
          load_table: '1',
        })

        if (appliedTableSearch) params.set('table_search', appliedTableSearch)
        if (appliedRowSearch) params.set('search', appliedRowSearch)

        const response = await apiFetch(`/manager/database-admin/table?${params.toString()}`, { token })
        if (cancelled) return

        setSummaryData((current) => ({
          ...(current ?? {}),
          database_name: response.database_name,
          branch_id: response.branch_id,
          branch_name: response.branch_name,
          can_write: response.can_write,
          selected_table: response.selected_table,
          tables: response.tables,
          stats: response.stats,
        }))
        setTableData(response.table)
      } catch (nextError) {
        if (!cancelled) setError(nextError.message)
      } finally {
        if (!cancelled) setIsLoadingTable(false)
      }
    }

    loadTableRows()

    return () => {
      cancelled = true
    }
  }, [
    apiFetch,
    appliedRowSearch,
    appliedTableSearch,
    filters.per_page,
    filters.table,
    hasRequestedTable,
    page,
    selectedBranchId,
    tableReloadNonce,
    token,
  ])

  useEffect(() => {
    setFilters(defaultFilters)
    setSummaryData(null)
    setTableData(null)
    setDetail(null)
    setEditForm({})
    setIsModalOpen(false)
    setPage(1)
    setAppliedTableSearch('')
    setAppliedRowSearch('')
    setHasRequestedTable(false)
    setError('')
    setSuccess('')
    setColumnLayouts({})
    setDuplicatesData(null)
    setDuplicatesError('')
    setIsDuplicatesOpen(false)
    setSelectedRowIds([])
    setDraggedColumnName('')
    setIsDeletingSelection(false)
    setDeleteMode('cascade')
    setSelectedLinkedTables([])
    setBulkDeleteState({
      isOpen: false,
      isLoading: false,
      linkedCounts: {},
    })
  }, [selectedBranchId])

  const selectedTable = filters.table || summaryData?.selected_table || ''
  const columns = tableData?.schema?.columns ?? []
  const rows = tableData?.records ?? []
  const primaryKey = tableData?.schema?.primary_key
  const availableTables = summaryData?.tables ?? []
  const allColumnNames = useMemo(() => columns.map((column) => column.name), [columns])

  useEffect(() => {
    if (!selectedTable || allColumnNames.length === 0) return

    setColumnLayouts((current) => {
      const currentLayout = current[selectedTable] ?? []
      const nextLayout = syncColumnLayout(currentLayout, allColumnNames)

      if (nextLayout.length === currentLayout.length && nextLayout.every((name, index) => name === currentLayout[index])) {
        return current
      }

      return {
        ...current,
        [selectedTable]: nextLayout,
      }
    })
  }, [allColumnNames, selectedTable])

  const dataColumns = useMemo(() => {
    if (!columns.length) return []
    const columnsByName = new Map(columns.map((column) => [column.name, column]))
    const layout = syncColumnLayout(columnLayouts[selectedTable], allColumnNames)
    return layout.map((name) => columnsByName.get(name)).filter(Boolean)
  }, [allColumnNames, columnLayouts, columns, selectedTable])

  const selectableRowIds = useMemo(() => {
    if (!primaryKey) return []

    return rows
      .map((record) => record?.[primaryKey])
      .filter((value) => value !== null && value !== undefined && value !== '')
      .map((value) => String(value))
  }, [primaryKey, rows])

  const allRowsSelected = selectableRowIds.length > 0 && selectableRowIds.every((rowId) => selectedRowIds.includes(rowId))
  const singleDeleteLinkedTables = useMemo(() => activeLinkedTables(detail?.linked_counts ?? {}), [detail?.linked_counts])
  const bulkDeleteLinkedTables = useMemo(() => activeLinkedTables(bulkDeleteState.linkedCounts), [bulkDeleteState.linkedCounts])

  useEffect(() => {
    setDuplicatesData(null)
    setDuplicatesError('')
    setIsDuplicatesOpen(false)
    setSelectedRowIds([])
    setDraggedColumnName('')
    setDeleteMode('cascade')
    setSelectedLinkedTables([])
    setBulkDeleteState({
      isOpen: false,
      isLoading: false,
      linkedCounts: {},
    })
  }, [selectedTable])

  useEffect(() => {
    if (selectableRowIds.length === 0) {
      setSelectedRowIds([])
      return
    }

    setSelectedRowIds((current) => current.filter((rowId) => selectableRowIds.includes(rowId)))
  }, [selectableRowIds])

  const selectedTableMeta = useMemo(
    () => availableTables.find((table) => table.name === selectedTable) ?? null,
    [availableTables, selectedTable],
  )

  const billingLiveValues = useMemo(() => {
    if (selectedTable !== 'billing' || !detail?.record) return null
    return buildBillingLiveValues(editForm, detail.record)
  }, [detail?.record, editForm, selectedTable])

  const riskyFieldChanges = useMemo(() => {
    if (!detail?.schema?.columns || !detail?.record) return []

    return detail.schema.columns
      .filter((column) => column.editable && isRiskyColumn(column, detail.schema.primary_key))
      .filter((column) => String(editForm[column.name] ?? '') !== String(detail.record[column.name] ?? ''))
  }, [detail?.record, detail?.schema?.columns, detail?.schema?.primary_key, editForm])

  function reorderColumns(sourceColumnName, targetColumnName) {
    if (!selectedTable || !sourceColumnName || !targetColumnName || sourceColumnName === targetColumnName) return

    setColumnLayouts((current) => {
      const currentLayout = syncColumnLayout(current[selectedTable], allColumnNames)
      const fromIndex = currentLayout.indexOf(sourceColumnName)
      const toIndex = currentLayout.indexOf(targetColumnName)
      if (fromIndex === -1 || toIndex === -1) return current

      const nextLayout = reorderArrayItem(currentLayout, fromIndex, toIndex)
      if (nextLayout.every((name, index) => name === currentLayout[index])) {
        return current
      }

      return {
        ...current,
        [selectedTable]: nextLayout,
      }
    })
  }

  function toggleRowSelection(rowId) {
    const normalizedRowId = String(rowId)
    setSelectedRowIds((current) => (
      current.includes(normalizedRowId)
        ? current.filter((value) => value !== normalizedRowId)
        : [...current, normalizedRowId]
    ))
  }

  function toggleSelectAllRows() {
    setSelectedRowIds((current) => (allRowsSelected ? [] : selectableRowIds))
  }

  function beginDeleteFlow(linkedCounts = {}) {
    setDeleteMode('cascade')
    setSelectedLinkedTables(activeLinkedTables(linkedCounts))
  }

  function toggleLinkedTable(tableName) {
    setSelectedLinkedTables((current) => (
      current.includes(tableName)
        ? current.filter((value) => value !== tableName)
        : [...current, tableName]
    ))
  }

  async function openBulkDeleteModal() {
    if (!selectedTable || !primaryKey || selectedRowIds.length === 0) return

    beginDeleteFlow({})
    setBulkDeleteState({
      isOpen: true,
      isLoading: true,
      linkedCounts: {},
    })
    setError('')

    const aggregateCounts = {}

    try {
      for (const rowId of selectedRowIds) {
        const response = await apiFetch(`/manager/database-admin/${selectedTable}/${rowId}?branch_id=${selectedBranchId}`, { token })
        Object.entries(response.linked_counts ?? {}).forEach(([tableName, count]) => {
          aggregateCounts[tableName] = (aggregateCounts[tableName] ?? 0) + Number(count ?? 0)
        })
      }

      setBulkDeleteState({
        isOpen: true,
        isLoading: false,
        linkedCounts: aggregateCounts,
      })
      setSelectedLinkedTables(activeLinkedTables(aggregateCounts))
    } catch (nextError) {
      setBulkDeleteState({
        isOpen: true,
        isLoading: false,
        linkedCounts: {},
      })
      setError(nextError.message)
    }
  }

  async function deleteSelectedRows() {
    if (!selectedTable || !primaryKey || selectedRowIds.length === 0) return

    setIsDeletingSelection(true)
    setError('')
    setSuccess('')

    let deletedCount = 0

    try {
      for (const rowId of selectedRowIds) {
        await apiFetch(`/manager/database-admin/${selectedTable}/${rowId}?branch_id=${selectedBranchId}`, {
          method: 'DELETE',
          token,
          body: {
            delete_mode: deleteMode,
            linked_tables: deleteMode === 'selected_links' ? selectedLinkedTables : [],
          },
        })
        deletedCount += 1
      }

      setSuccess(`${deletedCount} row${deletedCount === 1 ? '' : 's'} deleted successfully.`)
      setSelectedRowIds([])
      setBulkDeleteState({
        isOpen: false,
        isLoading: false,
        linkedCounts: {},
      })
      setTableReloadNonce((current) => current + 1)
      setSummaryReloadNonce((current) => current + 1)
    } catch (nextError) {
      setError(nextError.message)
      if (deletedCount > 0) {
        setSuccess(`${deletedCount} row${deletedCount === 1 ? '' : 's'} deleted before the process stopped.`)
      }
      setTableReloadNonce((current) => current + 1)
      setSummaryReloadNonce((current) => current + 1)
    } finally {
      setIsDeletingSelection(false)
    }
  }

  async function openDuplicatesModal(nextColumn = '') {
    if (!selectedTable) return

    setIsDuplicatesOpen(true)
    setIsLoadingDuplicates(true)
    setDuplicatesError('')

    try {
      const params = new URLSearchParams({
        branch_id: String(selectedBranchId),
      })

      if (nextColumn) params.set('column', nextColumn)

      const response = await apiFetch(`/manager/database-admin/${selectedTable}/duplicates?${params.toString()}`, { token })
      setDuplicatesData(response)
    } catch (nextError) {
      setDuplicatesError(nextError.message)
    } finally {
      setIsLoadingDuplicates(false)
    }
  }

  async function openModal(record, nextMode = 'view') {
    if (!selectedTable || !primaryKey || !record?.[primaryKey]) return

    setModalMode(nextMode)
    setIsModalOpen(true)
    setIsLoadingDetail(true)
    setError('')
    setSuccess('')

    try {
      const response = await apiFetch(`/manager/database-admin/${selectedTable}/${record[primaryKey]}?branch_id=${selectedBranchId}`, { token })
      setDetail(response)
      setEditForm(createFormState(response.schema, response.record))
      if (nextMode === 'delete') {
        beginDeleteFlow(response.linked_counts ?? {})
      }
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setIsLoadingDetail(false)
    }
  }

  function closeModal() {
    setIsModalOpen(false)
    setModalMode('')
    setDetail(null)
  }

  function activateTable(nextTable) {
    if (!nextTable) return

    setFilters((current) => ({ ...current, table: nextTable, search: '' }))
    setSuccess('')
    setError('')
    setTableData(null)
    setAppliedRowSearch('')
    setHasRequestedTable(true)
    setPage(1)
    setTableReloadNonce((current) => current + 1)
  }

  async function submitUpdate(event) {
    event.preventDefault()
    if (!detail?.record || !detail?.schema?.primary_key) return

    const recordId = detail.record[detail.schema.primary_key]
    const body = selectedTable === 'billing' && billingLiveValues
      ? { ...editForm, ...billingLiveValues.persistedValues }
      : editForm

    if (riskyFieldChanges.length > 0) {
      const shouldContinue = window.confirm(
        `You changed sensitive key fields: ${riskyFieldChanges.map((column) => fieldLabel(column.name)).join(', ')}. `
        + 'These changes can affect linked records. Do you want to continue saving them?'
      )

      if (!shouldContinue) {
        return
      }
    }

    setIsSaving(true)
    setError('')
    setSuccess('')

    try {
      const response = await apiFetch(`/manager/database-admin/${selectedTable}/${recordId}?branch_id=${selectedBranchId}`, {
        method: 'PUT',
        token,
        body,
      })

      setSuccess(response.message || 'Row updated successfully.')
      closeModal()
      setTableReloadNonce((current) => current + 1)
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function confirmDelete() {
    if (!detail?.record || !detail?.schema?.primary_key) return

    const recordId = detail.record[detail.schema.primary_key]
    setIsSaving(true)
    setError('')
    setSuccess('')

    try {
      const response = await apiFetch(`/manager/database-admin/${selectedTable}/${recordId}?branch_id=${selectedBranchId}`, {
        method: 'DELETE',
        token,
        body: {
          delete_mode: deleteMode,
          linked_tables: deleteMode === 'selected_links' ? selectedLinkedTables : [],
        },
      })

      setSuccess(response.message || 'Row deleted successfully.')
      closeModal()
      setTableReloadNonce((current) => current + 1)
      setSummaryReloadNonce((current) => current + 1)
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setIsSaving(false)
    }
  }

  function renderInput(column) {
    const isBillingDerivedField = selectedTable === 'billing' && BILLING_DERIVED_FIELDS.includes(column.name) && billingLiveValues
    const value = isBillingDerivedField ? billingLiveValues.persistedValues[column.name] : editForm[column.name] ?? ''
    const commonProps = {
      value,
      readOnly: Boolean(isBillingDerivedField),
      onChange: (event) => setEditForm((current) => ({ ...current, [column.name]: event.target.value })),
    }

    if (column.input === 'textarea') {
      return (
        <textarea
          rows="4"
          {...commonProps}
        />
      )
    }

    if (column.input === 'select') {
      return (
        <select {...commonProps} disabled={Boolean(isBillingDerivedField)}>
          {column.nullable ? <option value="">None</option> : null}
          {column.options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      )
    }

    if (column.input === 'boolean') {
      return (
        <select {...commonProps} disabled={Boolean(isBillingDerivedField)}>
          <option value="1">Yes / 1</option>
          <option value="0">No / 0</option>
        </select>
      )
    }

    const inputType = column.input === 'number'
      ? 'number'
      : column.input === 'date'
        ? 'date'
        : column.input === 'datetime'
          ? 'datetime-local'
          : 'text'

    return (
      <input
        type={inputType}
        step={column.input === 'number' ? '0.01' : undefined}
        {...commonProps}
      />
    )
  }

  return (
    <section className="finance-section database-workspace">
      <div className="patients-header database-page-header">
        <div>
          <p className="eyebrow">Database</p>
          <h3>Live table explorer and duplicate cleaner</h3>
          <p className="header-copy">
            Navigate tables like a database client, spread the live rows across a wider workspace, and inspect duplicates before cleaning records.
          </p>
          <div className="database-meta-strip">
            <span><strong>Connected DB:</strong> {summaryData?.database_name || 'Loading...'}</span>
            <span><strong>Branch view:</strong> {summaryData?.branch_name || 'Loading...'}</span>
            <span><strong>Access:</strong> {summaryData?.can_write ? 'Write-enabled' : 'Read-only'}</span>
          </div>
        </div>
        <button type="button" className="ghost-button" onClick={() => setActiveView('Dashboard')}>
          Return to Overview Dashboard
        </button>
      </div>

      {error ? <div className="message-banner error">{error}</div> : null}
      {success ? <div className="message-banner success">{success}</div> : null}

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Tables" value={summaryData?.stats?.table_count ?? '...'} note="Accessible database tables" icon="reports" className="total" />
        <StatWidget label="Rows" value={hasRequestedTable ? (summaryData?.stats?.row_count ?? '...') : '--'} note={hasRequestedTable ? 'Rows in the selected table view' : 'Open a table to fetch live rows'} icon="dashboard" className="seen" />
        <StatWidget label="Columns" value={hasRequestedTable ? (summaryData?.stats?.column_count ?? '...') : '--'} note={hasRequestedTable ? 'Columns available to arrange in the live grid' : 'Open a table to arrange columns'} icon="support" className="pending" />
        <StatWidget label="Mode" value={summaryData?.stats?.writable ? 'Write' : 'Read'} note="Editing follows the current schema and branch scope." icon="settings" className="today" />
      </section>

      <article className="panel database-browser-panel">
        <div className="panel-heading database-main-heading">
          <div>
            <p className="eyebrow">Explorer</p>
            <h3>{tableData?.label || selectedTableMeta?.label || 'Database browser'}</h3>
            <p className="muted-copy">
              {selectedTable
                ? `${selectedTable} ${tableData?.pagination?.total ? `• ${tableData.pagination.total} visible rows` : ''}`
                : 'Choose a table tab to browse live rows and duplicate-sensitive columns.'}
            </p>
          </div>
          <div className="database-toolbar">
            <label className="database-table-select">
              Branch
              <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(Number(event.target.value))}>
                {(branchOptions ?? []).map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>
            <label className="database-table-search">
              Find table
              <input
                value={filters.table_search}
                placeholder="Search tables"
                onChange={(event) => setFilters((current) => ({ ...current, table_search: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    setAppliedTableSearch(filters.table_search.trim())
                    setTablesReloadNonce((current) => current + 1)
                  }
                }}
              />
            </label>
            <label>
              Rows per page
              <select
                value={filters.per_page}
                onChange={(event) => {
                  const nextValue = Number(event.target.value)
                  setFilters((current) => ({ ...current, per_page: nextValue }))
                  setPage(1)
                }}
              >
                {[25, 50, 100].map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="ghost-button"
              disabled={!selectedTable}
              onClick={() => openDuplicatesModal()}
            >
              Duplicates
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setSummaryReloadNonce((current) => current + 1)
                setTablesReloadNonce((current) => current + 1)
                if (selectedTable) {
                  setTableReloadNonce((current) => current + 1)
                }
              }}
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="database-tab-strip">
          {availableTables.map((table) => (
            <button
              key={table.name}
              type="button"
              className={table.name === selectedTable ? 'database-tab active' : 'database-tab'}
              onClick={() => activateTable(table.name)}
            >
              <span className="database-tab-label">{table.label}</span>
              <span className="database-tab-meta">{table.name}</span>
            </button>
          ))}
        </div>

        <div className="database-notice-row">
          <div className="finance-chip">
            <span>Primary key</span>
            <strong>{tableData?.schema?.primary_key || '--'}</strong>
          </div>
          <div className="finance-chip">
            <span>Branch aware</span>
            <strong>{tableData?.schema?.has_branch_id ? 'Yes' : 'No'}</strong>
          </div>
          <div className="finance-chip">
            <span>Writable</span>
            <strong>{tableData?.schema?.writable ? 'Yes' : 'No'}</strong>
          </div>
          <div className="finance-chip">
            <span>Visible columns</span>
            <strong>{dataColumns.length}</strong>
          </div>
          <div className="finance-chip">
            <span>Column order</span>
            <strong>Drag to arrange</strong>
          </div>
          {(tableData?.notices ?? []).map((notice) => (
            <div key={notice} className="finance-chip">
              <span>Notice</span>
              <strong>{notice}</strong>
            </div>
          ))}
        </div>

        <div className="database-explorer-grid">
          <article className="database-records-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Rows</p>
                <h3>Live table data</h3>
              </div>
              <span className="panel-tag">{tableData?.pagination?.total ?? 0} rows</span>
            </div>

            <form
              className="database-filter-row"
              onSubmit={(event) => {
                event.preventDefault()
                setPage(1)
                setAppliedRowSearch(filters.search.trim())
                setHasRequestedTable(true)
                setTableReloadNonce((current) => current + 1)
              }}
            >
              <label className="full-span">
                Search rows
                <input
                  value={filters.search}
                  placeholder={tableSearchHint(tableData)}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                />
              </label>
              <div className="filter-actions-row full-span">
                <button type="submit" className="primary-button" disabled={!selectedTable}>Search</button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={!selectedRowIds.length || isDeletingSelection || !summaryData?.can_write || !tableData?.schema?.writable}
                  onClick={openBulkDeleteModal}
                >
                  {isDeletingSelection ? 'Deleting selected...' : `Delete selected${selectedRowIds.length ? ` (${selectedRowIds.length})` : ''}`}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setFilters((current) => ({ ...current, search: '' }))
                    setAppliedRowSearch('')
                    setPage(1)
                    if (selectedTable) {
                      setTableReloadNonce((current) => current + 1)
                    }
                  }}
                >
                  Clear row search
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setFilters(defaultFilters)
                    setTableData(null)
                    setAppliedRowSearch('')
                    setAppliedTableSearch('')
                    setHasRequestedTable(false)
                    setPage(1)
                    setColumnLayouts({})
                    setDuplicatesData(null)
                    setDuplicatesError('')
                    setIsDuplicatesOpen(false)
                    setSelectedRowIds([])
                    setDraggedColumnName('')
                    setTablesReloadNonce((current) => current + 1)
                    setSummaryReloadNonce((current) => current + 1)
                  }}
                >
                  Reset workspace
                </button>
              </div>
            </form>

            <div className="database-inline-banner">
              <strong>Drag any table header to reorder columns.</strong>
              <span>Select multiple rows with the checkboxes, then use Delete selected when you are ready to clean them.</span>
            </div>

            <div className="table-shell database-grid-shell">
              <table className="portal-table database-grid">
                <thead>
                  <tr>
                    <th className="database-selection-cell">
                      <input
                        type="checkbox"
                        checked={allRowsSelected}
                        disabled={!selectableRowIds.length}
                        onChange={toggleSelectAllRows}
                        aria-label="Select all visible rows"
                      />
                    </th>
                    {dataColumns.map((column) => (
                      <th
                        key={column.name}
                        className={draggedColumnName === column.name ? 'database-draggable-column is-dragging' : 'database-draggable-column'}
                        draggable
                        onDragStart={() => setDraggedColumnName(column.name)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault()
                          reorderColumns(draggedColumnName, column.name)
                          setDraggedColumnName('')
                        }}
                        onDragEnd={() => setDraggedColumnName('')}
                      >
                        <div className="database-header-chip">
                          <strong>{fieldLabel(column.name)}</strong>
                          <span>Drag</span>
                        </div>
                      </th>
                    ))}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingSummary && !summaryData ? (
                    <tr>
                      <td colSpan={Math.max(dataColumns.length + 2, 3)}>Connecting to the configured database workspace...</td>
                    </tr>
                  ) : !hasRequestedTable ? (
                    <tr>
                      <td colSpan={Math.max(dataColumns.length + 2, 3)}>
                        Select a table tab above to load the live rows and draggable columns for that table.
                      </td>
                    </tr>
                  ) : isLoadingTable && !tableData ? (
                    <tr>
                      <td colSpan={Math.max(dataColumns.length + 2, 3)}>Loading table rows...</td>
                    </tr>
                  ) : rows.length ? (
                    rows.map((record, index) => {
                      const recordId = primaryKey ? record?.[primaryKey] : null
                      const rowKey = recordId ?? `${selectedTable}-${index}`
                      const normalizedRowKey = recordId === null || recordId === undefined || recordId === '' ? '' : String(recordId)

                      return (
                        <tr key={rowKey} onClick={() => openModal(record, 'view')}>
                          <td className="database-selection-cell" onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={normalizedRowKey ? selectedRowIds.includes(normalizedRowKey) : false}
                              disabled={!normalizedRowKey}
                              onChange={() => toggleRowSelection(normalizedRowKey)}
                              aria-label={`Select row ${normalizedRowKey || index + 1}`}
                            />
                          </td>
                          {dataColumns.map((column) => (
                            <td key={`${rowKey}-${column.name}`}>
                              <div className="database-cell">
                                <strong>{formatValue(record[column.name])}</strong>
                                <span>{column.type}</span>
                              </div>
                            </td>
                          ))}
                          <td onClick={(event) => event.stopPropagation()}>
                            <div className="manager-action-row">
                              <button type="button" className="mini-action" onClick={() => openModal(record, 'view')}>View</button>
                              <button
                                type="button"
                                className="mini-action"
                                onClick={() => openModal(record, 'edit')}
                                disabled={!tableData?.schema?.writable || !summaryData?.can_write}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="mini-action"
                                onClick={() => openModal(record, 'delete')}
                                disabled={!tableData?.schema?.writable || !summaryData?.can_write}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={Math.max(dataColumns.length + 2, 3)}>
                        No rows matched this view for <strong>{selectedTable || 'the selected table'}</strong> in{' '}
                        <strong>{summaryData?.database_name || 'the current database'}</strong>.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="database-footer">
              <span>Page {tableData?.pagination?.page ?? 1} of {tableData?.pagination?.total_pages ?? 1}</span>
              <span>{tableData?.pagination?.total ?? 0} rows</span>
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  disabled={!tableData?.pagination || tableData.pagination.page <= 1}
                  onClick={() => setPage((current) => Math.max(current - 1, 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={!tableData?.pagination || tableData.pagination.page >= tableData.pagination.total_pages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </article>
        </div>
      </article>

      {isModalOpen ? (
        <div className="modal-overlay" onClick={closeModal}>
          <article className="modal-panel database-admin-modal database-record-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">
                  {modalMode === 'delete' ? 'Delete Row' : modalMode === 'edit' ? 'Edit Row' : 'Row Details'}
                </p>
                <h3>{selectedTable}</h3>
              </div>
              <div className="modal-actions">
                {modalMode === 'view' && detail?.can_write ? (
                  <button type="button" className="ghost-button" onClick={() => setModalMode('edit')}>Edit row</button>
                ) : null}
                <button type="button" className="ghost-button" onClick={closeModal}>Close</button>
              </div>
            </div>

            {isLoadingDetail ? (
              <p className="muted-copy">Loading row details...</p>
            ) : detail?.record ? (
              <>
                <div className="finance-chip-row">
                  {Object.entries(detail.linked_counts ?? {}).map(([key, value]) => (
                    <div key={key} className="finance-chip">
                      <span>{fieldLabel(key)}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>

                {modalMode === 'delete' ? (
                  <div className="database-delete-copy">
                    <p>
                      Choose whether to remove only this row, remove this row with only the linked tables you pick, or run the full linked cleanup.
                    </p>
                    <div className="database-delete-options">
                      <label className="database-delete-option">
                        <input
                          type="radio"
                          name="single-delete-mode"
                          value="entry_only"
                          checked={deleteMode === 'entry_only'}
                          onChange={(event) => setDeleteMode(event.target.value)}
                        />
                        <span>Delete only this entry</span>
                      </label>
                      <label className="database-delete-option">
                        <input
                          type="radio"
                          name="single-delete-mode"
                          value="selected_links"
                          checked={deleteMode === 'selected_links'}
                          onChange={(event) => setDeleteMode(event.target.value)}
                          disabled={!singleDeleteLinkedTables.length}
                        />
                        <span>Delete this entry and only the linked tables I choose</span>
                      </label>
                      <label className="database-delete-option">
                        <input
                          type="radio"
                          name="single-delete-mode"
                          value="cascade"
                          checked={deleteMode === 'cascade'}
                          onChange={(event) => setDeleteMode(event.target.value)}
                        />
                        <span>Delete this entry with all linked cleanup</span>
                      </label>
                    </div>
                    {Object.values(detail.linked_counts ?? {}).some((value) => Number(value) > 0) ? (
                      <div className="database-delete-list">
                        {Object.entries(detail.linked_counts ?? {})
                          .filter(([, value]) => Number(value) > 0)
                          .map(([key, value]) => (
                            <label key={key} className="database-delete-item">
                              {deleteMode === 'selected_links' ? (
                                <input
                                  type="checkbox"
                                  checked={selectedLinkedTables.includes(key)}
                                  onChange={() => toggleLinkedTable(key)}
                                />
                              ) : null}
                              <span>{fieldLabel(key)}</span>
                              <strong>{value} linked row{Number(value) === 1 ? '' : 's'}</strong>
                            </label>
                          ))}
                      </div>
                    ) : null}
                    <div className="modal-actions">
                      <button type="button" className="ghost-button" onClick={closeModal}>Cancel</button>
                      <button type="button" className="primary-button danger-button" onClick={confirmDelete} disabled={isSaving}>
                        {isSaving ? 'Deleting...' : 'Delete row'}
                      </button>
                    </div>
                  </div>
                ) : modalMode === 'edit' ? (
                  <form className="database-edit-grid" onSubmit={submitUpdate}>
                    {selectedTable === 'billing' && billingLiveValues ? (
                      <div className="database-live-summary full-span">
                        <div className="database-inline-banner">
                          <strong>Live billing math is active.</strong>
                          <span>Change the service prices or discount and the tax fields, total, and balance will recalculate before save.</span>
                        </div>
                        <div className="database-live-grid">
                          <div className="database-live-card">
                            <span>Subtotal</span>
                            <strong>{formatMoney(billingLiveValues.subtotal)}</strong>
                          </div>
                          <div className="database-live-card">
                            <span>Taxable Base</span>
                            <strong>{formatMoney(billingLiveValues.baseAmount)}</strong>
                          </div>
                          <div className="database-live-card">
                            <span>NHIL</span>
                            <strong>{formatMoney(billingLiveValues.nhil)}</strong>
                          </div>
                          <div className="database-live-card">
                            <span>GETFund</span>
                            <strong>{formatMoney(billingLiveValues.getfund)}</strong>
                          </div>
                          <div className="database-live-card">
                            <span>VAT</span>
                            <strong>{formatMoney(billingLiveValues.vat)}</strong>
                          </div>
                          <div className="database-live-card">
                            <span>Total Tax</span>
                            <strong>{formatMoney(billingLiveValues.tax)}</strong>
                          </div>
                          <div className="database-live-card">
                            <span>Already Settled</span>
                            <strong>{formatMoney(billingLiveValues.settledAmount)}</strong>
                          </div>
                          <div className="database-live-card emphasis">
                            <span>New Outstanding Balance</span>
                            <strong>{formatMoney(billingLiveValues.balance)}</strong>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {riskyFieldChanges.length > 0 ? (
                      <div className="database-inline-banner danger full-span">
                        <strong>Sensitive links changed.</strong>
                        <span>
                          {riskyFieldChanges.map((column) => fieldLabel(column.name)).join(', ')} can affect linked data.
                          You will be asked to confirm before save.
                        </span>
                      </div>
                    ) : null}
                    {(detail.schema?.columns ?? []).map((column) => (
                      <label
                        key={column.name}
                        className={[
                          column.input === 'textarea' ? 'full-span' : '',
                          isRiskyColumn(column, detail.schema?.primary_key) ? 'database-risk-field' : '',
                          selectedTable === 'billing' && BILLING_DERIVED_FIELDS.includes(column.name) ? 'database-derived-field' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <span className="database-label-row">
                          <span>{fieldLabel(column.name)}</span>
                          {column.name === detail.schema?.primary_key ? <small>Locked primary key</small> : null}
                          {column.name !== detail.schema?.primary_key && isRiskyColumn(column, detail.schema?.primary_key) ? <small>Linked key field</small> : null}
                          {selectedTable === 'billing' && BILLING_DERIVED_FIELDS.includes(column.name) ? <small>Auto-calculated</small> : null}
                        </span>
                        {column.editable ? renderInput(column) : <input value={formatValue(detail.record[column.name])} readOnly />}
                      </label>
                    ))}
                    <div className="modal-actions full-span">
                      <button type="button" className="ghost-button" onClick={() => setModalMode('view')}>Back</button>
                      <button type="submit" className="primary-button" disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save changes'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="database-record-grid">
                    {(detail.schema?.columns ?? []).map((column) => (
                      <div key={column.name} className="database-record-card">
                        <span>{fieldLabel(column.name)}</span>
                        <strong>{formatValue(detail.record[column.name])}</strong>
                        <small>{column.type}</small>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="muted-copy">This row is no longer available.</p>
            )}
          </article>
        </div>
      ) : null}

      {bulkDeleteState.isOpen ? (
        <div className="modal-overlay" onClick={() => setBulkDeleteState({ isOpen: false, isLoading: false, linkedCounts: {} })}>
          <article className="modal-panel database-admin-modal database-record-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Bulk Delete</p>
                <h3>{selectedTable}</h3>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setBulkDeleteState({ isOpen: false, isLoading: false, linkedCounts: {} })}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="database-delete-copy">
              <p>
                You selected <strong>{selectedRowIds.length}</strong> row{selectedRowIds.length === 1 ? '' : 's'}.
                Choose whether to delete only those entries, selected linked tables, or everything linked to them.
              </p>
              <div className="database-delete-options">
                <label className="database-delete-option">
                  <input
                    type="radio"
                    name="bulk-delete-mode"
                    value="entry_only"
                    checked={deleteMode === 'entry_only'}
                    onChange={(event) => setDeleteMode(event.target.value)}
                  />
                  <span>Delete only the selected entries</span>
                </label>
                <label className="database-delete-option">
                  <input
                    type="radio"
                    name="bulk-delete-mode"
                    value="selected_links"
                    checked={deleteMode === 'selected_links'}
                    onChange={(event) => setDeleteMode(event.target.value)}
                    disabled={!bulkDeleteLinkedTables.length}
                  />
                  <span>Delete the selected entries and only the linked tables I choose</span>
                </label>
                <label className="database-delete-option">
                  <input
                    type="radio"
                    name="bulk-delete-mode"
                    value="cascade"
                    checked={deleteMode === 'cascade'}
                    onChange={(event) => setDeleteMode(event.target.value)}
                  />
                  <span>Delete the selected entries with all linked cleanup</span>
                </label>
              </div>

              {bulkDeleteState.isLoading ? (
                <div className="database-inline-banner">
                  <strong>Reviewing linked rows...</strong>
                  <span>Loading linked table counts for the selected records.</span>
                </div>
              ) : bulkDeleteLinkedTables.length ? (
                <div className="database-delete-list">
                  {Object.entries(bulkDeleteState.linkedCounts)
                    .filter(([, value]) => Number(value) > 0)
                    .map(([key, value]) => (
                      <label key={key} className="database-delete-item">
                        {deleteMode === 'selected_links' ? (
                          <input
                            type="checkbox"
                            checked={selectedLinkedTables.includes(key)}
                            onChange={() => toggleLinkedTable(key)}
                          />
                        ) : null}
                        <span>{fieldLabel(key)}</span>
                        <strong>{value} linked row{Number(value) === 1 ? '' : 's'} across the selection</strong>
                      </label>
                    ))}
                </div>
              ) : (
                <div className="database-inline-banner">
                  <strong>No linked rows detected in this selection.</strong>
                  <span>Deleting only the selected entries should be safe from the app's linked-record perspective.</span>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setBulkDeleteState({ isOpen: false, isLoading: false, linkedCounts: {} })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-button danger-button"
                  onClick={deleteSelectedRows}
                  disabled={isDeletingSelection || bulkDeleteState.isLoading}
                >
                  {isDeletingSelection ? 'Deleting selected...' : 'Confirm bulk delete'}
                </button>
              </div>
            </div>
          </article>
        </div>
      ) : null}

      {isDuplicatesOpen ? (
        <div className="modal-overlay" onClick={() => setIsDuplicatesOpen(false)}>
          <article className="modal-panel database-admin-modal database-duplicates-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Duplicates</p>
                <h3>{duplicatesData?.label || selectedTableMeta?.label || 'Duplicate review'}</h3>
                <p className="muted-copy">
                  Review repeated names, folder IDs, receipt numbers, and similar identifiers before deleting or editing rows.
                </p>
              </div>
              <div className="database-toolbar">
                <label className="database-table-select">
                  Duplicate column
                  <select
                    value={duplicatesData?.selected_column ?? ''}
                    onChange={(event) => openDuplicatesModal(event.target.value)}
                    disabled={isLoadingDuplicates || !(duplicatesData?.available_columns?.length)}
                  >
                    {(duplicatesData?.available_columns ?? []).map((column) => (
                      <option key={column.name} value={column.name}>{column.label}</option>
                    ))}
                  </select>
                </label>
                <button type="button" className="ghost-button" onClick={() => setIsDuplicatesOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            {duplicatesError ? <div className="message-banner error">{duplicatesError}</div> : null}

            <div className="database-notice-row">
              <div className="finance-chip">
                <span>Duplicate groups</span>
                <strong>{duplicatesData?.summary?.group_count ?? 0}</strong>
              </div>
              <div className="finance-chip">
                <span>Rows affected</span>
                <strong>{duplicatesData?.summary?.row_count ?? 0}</strong>
              </div>
              <div className="finance-chip">
                <span>Branch view</span>
                <strong>{duplicatesData?.branch_name || summaryData?.branch_name || '--'}</strong>
              </div>
            </div>

            {isLoadingDuplicates ? (
              <div className="database-inline-banner">
                <strong>Checking duplicates...</strong>
                <span>Loading repeated values for the selected table and branch view.</span>
              </div>
            ) : duplicatesData?.duplicate_groups?.length ? (
              <div className="database-duplicate-groups">
                {duplicatesData.duplicate_groups.map((group, index) => (
                  <section key={`${group.value}-${index}`} className="database-duplicate-card">
                    <div className="database-duplicate-header">
                      <div>
                        <span>Duplicate value</span>
                        <strong>{formatValue(group.value)}</strong>
                      </div>
                      <div className="finance-chip">
                        <span>Matches</span>
                        <strong>{group.count}</strong>
                      </div>
                    </div>
                    <div className="table-shell">
                      <table className="portal-table database-duplicate-table">
                        <thead>
                          <tr>
                            {(group.preview_columns ?? []).map((columnName) => (
                              <th key={columnName}>{fieldLabel(columnName)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(group.records ?? []).map((record, recordIndex) => (
                            <tr key={`${group.value}-${recordIndex}`}>
                              {(group.preview_columns ?? []).map((columnName) => (
                                <td key={`${group.value}-${recordIndex}-${columnName}`}>{formatValue(record[columnName])}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="database-inline-banner">
                <strong>No duplicates found</strong>
                <span>
                  {duplicatesData?.message || 'The selected duplicate-check column is clear for the current branch view.'}
                </span>
              </div>
            )}
          </article>
        </div>
      ) : null}
    </section>
  )
}
