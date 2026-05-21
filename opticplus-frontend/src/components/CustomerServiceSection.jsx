import { useState } from 'react'
import StatWidget from './StatWidget.jsx'

const customerTabs = ['Messages', 'Pickup Glasses']

export default function CustomerServiceSection(props) {
  const [activeTab, setActiveTab] = useState('Messages')
  const [smsPreview, setSmsPreview] = useState(null)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const isMergedView = Boolean(props.customerServiceData?.is_merged_view)

  function closeSmsPreview() {
    setSmsPreview(null)
  }

  function openSmsPreview(preview) {
    setSmsPreview(preview)
  }

  function updateSmsPreviewMessage(message) {
    setSmsPreview((current) => (current ? { ...current, message } : current))
  }

  function closeTemplateEditor() {
    setEditingTemplate(null)
    props.setTemplateForm({ id: null, template_name: '', message_text: '', is_shared: false })
  }

  function openTemplateEditor(template) {
    setEditingTemplate(template)
    props.setTemplateForm({
      id: template.id,
      template_name: template.template_name,
      message_text: template.message_text,
      is_shared: Boolean(template.is_shared),
    })
  }

  async function submitTemplateEditor(event) {
    const saved = await props.saveCustomerTemplate(event)
    if (saved) {
      closeTemplateEditor()
    }
  }

  async function handleTemplateDelete(templateId) {
    const deleted = await props.deleteCustomerTemplate(templateId)
    if (deleted) {
      closeTemplateEditor()
    }
  }

  function applySmsPreview() {
    if (!smsPreview) return

    props.setMessageForm((current) => ({
      ...current,
      mode: 'single',
      phone: smsPreview.phone ?? '',
      patient_id: smsPreview.patientId ?? '',
      mark_notified: smsPreview.markNotified ?? current.mark_notified,
      message: smsPreview.message ?? current.message,
    }))
    setActiveTab('Messages')
    closeSmsPreview()
  }

  async function sendSmsPreview() {
    if (!smsPreview) return

    const sent = await props.submitCustomerMessage({
      mode: 'single',
      template_id: null,
      message: smsPreview.message ?? '',
      phone: smsPreview.phone ?? '',
      patient_id: smsPreview.patientId ?? '',
      recipient_type: 'glasses_ready',
      mark_notified: Boolean(smsPreview.markNotified),
    })

    if (sent) {
      closeSmsPreview()
    }
  }

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Customer Service</p>
          <h3>Send messages and manage glasses pickup</h3>
          <p className="header-copy">Built around templates, patient outreach, and pickup readiness workflows.</p>
        </div>
      </div>

      {props.customerServiceError ? <div className="message-banner error">{props.customerServiceError}</div> : null}
      {props.customerServiceSuccess ? <div className="message-banner success">{props.customerServiceSuccess}</div> : null}

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Ready" value={props.customerServiceData?.stats.ready_count ?? '...'} note="Glasses ready for pickup" icon="glasses" className="total" />
        <StatWidget label="Notified" value={props.customerServiceData?.stats.notified_count ?? '...'} note="Pickup messages already sent" icon="message" className="seen" />
        <StatWidget label="Picked Up" value={props.customerServiceData?.stats.picked_up_count ?? '...'} note="Completed pickup confirmations" icon="check-badge" className="pending" />
        <StatWidget label="Templates" value={props.customerServiceData?.stats.templates_count ?? '...'} note="Saved branch message templates" icon="layers" className="today" />
      </section>

      {props.customerServiceData ? (
        <div className={props.customerServiceData.integrations?.arkesel_configured ? 'message-banner success' : 'message-banner'}>
          {props.customerServiceData.integrations?.arkesel_configured
            ? 'Arkesel SMS is configured. Sending a message from this desk will dispatch a live SMS.'
            : 'Arkesel SMS is not configured yet. Add ARKESEL_API_KEY and ARKESEL_SENDER_ID to the backend .env file before using live SMS sending.'}
        </div>
      ) : null}

      {isMergedView ? (
        <div className="message-banner">
          Merged view is great for reviewing birthdays and pickup queues across branches. To save templates or change pickup statuses, switch to a specific branch first.
        </div>
      ) : null}

      <div className="finance-tabs">
        {customerTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={tab === activeTab ? 'nav-item finance-tab active' : 'nav-item finance-tab'}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Messages' ? (
        <MessagesTab {...props} isMergedView={isMergedView} openSmsPreview={openSmsPreview} openTemplateEditor={openTemplateEditor} />
      ) : (
        <PickupTab {...props} isMergedView={isMergedView} openSmsPreview={openSmsPreview} />
      )}

      {smsPreview ? (
        <div className="modal-overlay" onClick={closeSmsPreview}>
          <article className="modal-panel customer-service-sms-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">SMS Preview</p>
                <h3>{smsPreview.title || 'Load drafted SMS'}</h3>
              </div>
              <button type="button" className="ghost-button" onClick={closeSmsPreview}>
                Close
              </button>
            </div>

            <div className="customer-service-sms-modal__summary">
              <div className="finance-chip">
                <span>Patient</span>
                <strong>{smsPreview.name || 'Unknown patient'}</strong>
              </div>
              <div className="finance-chip">
                <span>Phone</span>
                <strong>{smsPreview.phone || 'N/A'}</strong>
              </div>
              <div className="finance-chip">
                <span>Folder ID</span>
                <strong>{smsPreview.folderId || 'N/A'}</strong>
              </div>
              <div className="finance-chip">
                <span>Branch</span>
                <strong>{smsPreview.branchName || props.customerServiceData?.branch_name || 'N/A'}</strong>
              </div>
            </div>

            {smsPreview.subtitle ? <p className="muted-copy">{smsPreview.subtitle}</p> : null}

            <label className="customer-service-sms-modal__message">
              Draft message
              <textarea
                rows="6"
                value={smsPreview.message || ''}
                onChange={(event) => updateSmsPreviewMessage(event.target.value)}
                placeholder="Type your message here"
              />
            </label>

            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={closeSmsPreview}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={props.isSendingCustomerMessage}
                onClick={sendSmsPreview}
              >
                {props.isSendingCustomerMessage ? 'Sending...' : 'Send SMS now'}
              </button>
              <button type="button" className="primary-button" onClick={applySmsPreview}>
                Load into composer
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {editingTemplate ? (
        <div className="modal-overlay" onClick={closeTemplateEditor}>
          <article className="modal-panel customer-service-template-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Template Editor</p>
                <h3>Edit {editingTemplate.template_name}</h3>
              </div>
              <button type="button" className="ghost-button" onClick={closeTemplateEditor}>
                Close
              </button>
            </div>

            <form className="patient-form-grid" onSubmit={submitTemplateEditor}>
              <label>
                Template Name
                <input
                  value={props.templateForm.template_name}
                  onChange={(event) => props.setTemplateForm((current) => ({ ...current, template_name: event.target.value }))}
                  required
                  disabled={props.isSavingTemplate}
                />
              </label>
              <label>
                Scope
                <select
                  value={props.templateForm.is_shared ? 'shared' : 'branch'}
                  onChange={(event) =>
                    props.setTemplateForm((current) => ({ ...current, is_shared: event.target.value === 'shared' }))
                  }
                  disabled={props.isSavingTemplate}
                >
                  <option value="branch">This branch only</option>
                  <option value="shared">Shared across branches</option>
                </select>
              </label>

              <label className="full-span customer-service-template-modal__message">
                Template Message
                <textarea
                  rows="6"
                  value={props.templateForm.message_text}
                  onChange={(event) => props.setTemplateForm((current) => ({ ...current, message_text: event.target.value }))}
                  required
                  disabled={props.isSavingTemplate}
                />
              </label>

              <div className="modal-actions customer-service-template-modal__actions full-span">
                <button type="button" className="ghost-button" onClick={closeTemplateEditor} disabled={props.isSavingTemplate}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="mini-action danger"
                  onClick={() => handleTemplateDelete(editingTemplate.id)}
                  disabled={props.isSavingTemplate}
                >
                  Delete template
                </button>
                <button type="submit" className="primary-button" disabled={props.isSavingTemplate}>
                  {props.isSavingTemplate ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </article>
        </div>
      ) : null}
    </section>
  )
}

function MessagesTab(props) {
  function queueSingleMessage(recipient, suggestedMessage = '') {
    props.openSmsPreview({
      title: 'Birthday message',
      subtitle:
        recipient.days_until_birthday === 0
          ? 'This patient has a birthday today.'
          : `This patient has a birthday in ${recipient.days_until_birthday} day${recipient.days_until_birthday === 1 ? '' : 's'}.`,
      name: recipient.name,
      phone: recipient.phone,
      folderId: recipient.folder_id,
      patientId: recipient.patient_id ?? recipient.id ?? '',
      branchName: recipient.branch_name,
      message: suggestedMessage,
      markNotified: false,
    })
  }

  return (
    <section className="finance-layout">
      <article className="panel patient-list-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Upcoming Birthdays</p>
            <h3>Plan birthday outreach before the day arrives</h3>
          </div>
          <span className="panel-tag">{props.customerServiceData?.stats?.upcoming_birthdays_count ?? 0} upcoming</span>
        </div>

        {(props.customerServiceData?.upcoming_birthdays ?? []).length ? (
          <div className="table-shell">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Folder ID</th>
                  <th>Birthday</th>
                  <th>Phone</th>
                  <th>Branch</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(props.customerServiceData?.upcoming_birthdays ?? []).map((patient) => (
                  <tr key={`birthday-${patient.patient_id}`}>
                    <td>
                      <div className="patient-table-primary">
                        <strong>{patient.name || 'Unnamed patient'}</strong>
                        <span>
                          {patient.days_until_birthday === 0
                            ? 'Birthday is today'
                            : `Birthday in ${patient.days_until_birthday} day${patient.days_until_birthday === 1 ? '' : 's'}`}
                        </span>
                      </div>
                    </td>
                    <td>{patient.folder_id || 'N/A'}</td>
                    <td>{patient.birthday_label || 'N/A'}</td>
                    <td>{patient.phone || 'N/A'}</td>
                    <td>{patient.branch_name || props.customerServiceData?.branch_name || 'N/A'}</td>
                    <td>
                      <button
                        type="button"
                        className="mini-action success"
                        onClick={() =>
                          queueSingleMessage(
                            patient,
                            `Happy birthday ${patient.name || ''}! Wishing you a joyful year ahead from Bealet Optical Center.`,
                          )
                        }
                      >
                        Load SMS
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted-copy">No upcoming birthdays were found in the next 30 days for this view.</p>
        )}
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Send Messages</p>
            <h3>Single and bulk outreach</h3>
          </div>
          <span className="panel-tag">{props.customerServiceData?.branch_name ?? 'Customer Service'}</span>
        </div>

        <form className="patient-form-grid" onSubmit={props.sendCustomerMessage}>
          <label>
            Mode
            <select
              value={props.messageForm.mode}
              onChange={(event) => props.setMessageForm((current) => ({ ...current, mode: event.target.value }))}
            >
              <option value="single">Single</option>
              <option value="bulk">Bulk</option>
            </select>
          </label>
          <label>
            Template
            <select
              disabled={props.isMergedView}
              value={props.messageForm.template_id}
              onChange={(event) => {
                const template = (props.customerServiceData?.templates ?? []).find((item) => String(item.id) === event.target.value)
                props.setMessageForm((current) => ({
                  ...current,
                  template_id: event.target.value,
                  message: template?.message_text ?? current.message,
                }))
              }}
            >
              <option value="">No template</option>
              {(props.customerServiceData?.templates ?? []).map((template) => (
                <option key={template.id} value={template.id}>
                  {template.template_name} ({template.scope_label || (template.is_shared ? 'Shared' : 'Branch')})
                </option>
              ))}
            </select>
          </label>

          {props.messageForm.mode === 'single' ? (
            <>
              <label>
                Phone
                <input
                  value={props.messageForm.phone}
                  onChange={(event) => props.setMessageForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="233..."
                />
              </label>
              <label>
                Patient ID
                <input
                  value={props.messageForm.patient_id}
                  onChange={(event) => props.setMessageForm((current) => ({ ...current, patient_id: event.target.value }))}
                  placeholder="Optional patient ID"
                />
              </label>
            </>
          ) : (
            <label>
              Recipient Group
              <select
                value={props.messageForm.recipient_type}
                onChange={(event) => props.setMessageForm((current) => ({ ...current, recipient_type: event.target.value }))}
              >
                <option value="glasses_ready">Glasses Ready</option>
                <option value="all_patients">All Patients</option>
                <option value="birthday_patients">Birthday Patients</option>
                <option value="national_holidays">Holiday Broadcast</option>
              </select>
            </label>
          )}

          <label className="full-span">
            Message
            <textarea
              rows="5"
              value={props.messageForm.message}
              onChange={(event) => props.setMessageForm((current) => ({ ...current, message: event.target.value }))}
                  placeholder="Type your message here"
            />
          </label>

          <label className="full-span">
            <input
              type="checkbox"
              disabled={props.isMergedView}
              checked={Boolean(props.messageForm.mark_notified)}
              onChange={(event) => props.setMessageForm((current) => ({ ...current, mark_notified: event.target.checked }))}
            />
            {' '}Mark pickup notifications as sent
          </label>

          {props.isMergedView ? (
            <p className="muted-copy full-span">
              Merged mode can send SMS, but branch-specific templates and notification-state updates are disabled here to avoid cross-branch record changes.
            </p>
          ) : null}

          <button type="submit" className="primary-button full-span" disabled={props.isSendingCustomerMessage}>
            {props.isSendingCustomerMessage ? 'Processing message...' : 'Send / Record message'}
          </button>
        </form>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Templates</p>
            <h3>Create and manage message templates</h3>
          </div>
        </div>

        <form className="patient-form-grid" onSubmit={props.saveCustomerTemplate}>
          <label>
            Template Name
            <input
              value={props.templateForm.template_name}
              onChange={(event) => props.setTemplateForm((current) => ({ ...current, template_name: event.target.value }))}
              required
              disabled={props.isMergedView}
            />
          </label>
          <label>
            Scope
            <select
              value={props.templateForm.is_shared ? 'shared' : 'branch'}
              onChange={(event) =>
                props.setTemplateForm((current) => ({ ...current, is_shared: event.target.value === 'shared' }))
              }
              disabled={props.isMergedView}
            >
              <option value="branch">This branch only</option>
              <option value="shared">Shared across branches</option>
            </select>
          </label>
          <div className="filter-actions-row">
            <button type="submit" className="primary-button" disabled={props.isSavingTemplate || props.isMergedView}>
              {props.isSavingTemplate ? 'Saving...' : props.templateForm.id ? 'Update Template' : 'Save Template'}
            </button>
            <button type="button" className="ghost-button" onClick={() => props.setTemplateForm({ id: null, template_name: '', message_text: '', is_shared: false })}>
              Clear
            </button>
          </div>
          <label className="full-span">
            Template Message
            <textarea
              rows="5"
              value={props.templateForm.message_text}
              onChange={(event) => props.setTemplateForm((current) => ({ ...current, message_text: event.target.value }))}
              required
              disabled={props.isMergedView}
            />
          </label>
        </form>

        {props.isMergedView ? <p className="muted-copy">Switch to Labadi or Madina to add, edit, or delete templates.</p> : null}

        <div className="table-shell">
          <table className="portal-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Scope</th>
                <th>Message</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(props.customerServiceData?.templates ?? []).map((template) => (
                <tr key={template.id}>
                  <td>{template.template_name}</td>
                  <td>{template.scope_label || (template.is_shared ? 'Shared' : 'Branch')}</td>
                  <td>{template.message_text}</td>
                  <td>{template.updated_at}</td>
                  <td>
                    <div className="table-actions-inline">
                      <button type="button" className="mini-action" disabled={props.isMergedView} onClick={() => props.openTemplateEditor(template)}>
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}

function PickupTab(props) {
  function queuePickupMessage(record) {
    props.openSmsPreview({
      title: 'Pickup notification',
      subtitle:
        record.pickup_status === 'notified'
          ? 'This customer was already notified before, and the glasses are still ready.'
          : 'This customer is ready for a pickup notification.',
      name: record.patient_name,
      phone: record.phone,
      folderId: record.folder_id,
      patientId: record.patient_id ?? '',
      branchName: record.branch_name,
      message: `Hello ${record.patient_name || ''}, your glasses are ${record.pickup_status === 'notified' ? 'still ready' : 'ready'} for pickup at Bealet Optical Center. Kindly visit the branch at your convenience.`,
      markNotified: true,
    })
  }

  return (
    <section className="finance-layout">
      <article className="panel patient-list-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Ready for Pickup</p>
            <h3>Patients whose glasses are ready right now</h3>
          </div>
          <span className="panel-tag">{props.customerServiceData?.ready_for_pickup?.length ?? 0} in queue</span>
        </div>

        {(props.customerServiceData?.ready_for_pickup ?? []).length ? (
          <div className="table-shell">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Folder ID</th>
                  <th>Phone</th>
                  <th>Branch</th>
                  <th>Pickup</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(props.customerServiceData?.ready_for_pickup ?? []).map((record) => (
                  <tr key={`ready-${record.billing_id}`}>
                    <td>{record.patient_name}</td>
                    <td>{record.folder_id}</td>
                    <td>{record.phone || 'N/A'}</td>
                    <td>{record.branch_name || props.customerServiceData?.branch_name || 'N/A'}</td>
                    <td>{record.pickup_status_display}</td>
                    <td>
                      <button type="button" className="mini-action success" onClick={() => queuePickupMessage(record)}>
                        Load SMS
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted-copy">No ready-for-pickup glasses are waiting in this view right now.</p>
        )}
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Pickup Filters</p>
            <h3>Track pickup readiness and payment status</h3>
          </div>
        </div>

        <form
          className="patient-filter-grid"
          onSubmit={(event) => {
            event.preventDefault()
            props.setCustomerServiceQuery((current) => ({ ...current, ...props.customerServiceFilters, page: 1 }))
          }}
        >
          <label>
            Search
            <input
              value={props.customerServiceFilters.search}
              onChange={(event) => props.setCustomerServiceFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Patient, folder, phone, receipt"
            />
          </label>
          <label>
            Pickup Status
            <select
              value={props.customerServiceFilters.status}
              onChange={(event) => props.setCustomerServiceFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="all">All</option>
              <option value="not_ready">Not Ready</option>
              <option value="ready">Ready</option>
              <option value="notified">Notified</option>
              <option value="picked_up">Picked Up</option>
            </select>
          </label>
          <label>
            Payment Status
            <select
              value={props.customerServiceFilters.payment_status}
              onChange={(event) => props.setCustomerServiceFilters((current) => ({ ...current, payment_status: event.target.value }))}
            >
              <option value="all">All</option>
              <option value="paid">Paid in Full</option>
              <option value="partial">Partial Payment</option>
              <option value="owing">Balance Remaining</option>
            </select>
          </label>
          <label>
            Date from
            <input
              type="date"
              value={props.customerServiceFilters.date_from}
              onChange={(event) => props.setCustomerServiceFilters((current) => ({ ...current, date_from: event.target.value }))}
            />
          </label>
          <label>
            Date to
            <input
              type="date"
              value={props.customerServiceFilters.date_to}
              onChange={(event) => props.setCustomerServiceFilters((current) => ({ ...current, date_to: event.target.value }))}
            />
          </label>
          <div className="filter-actions-row full-span">
            <button type="submit" className="primary-button">Apply filters</button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                const defaults = { search: '', status: 'all', payment_status: 'all', date_from: '', date_to: '', page: 1, per_page: 12 }
                props.setCustomerServiceFilters(defaults)
                props.setCustomerServiceQuery(defaults)
              }}
            >
              Reset
            </button>
          </div>
        </form>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Pickup Table</p>
            <h3>Patients waiting for glasses or collection</h3>
          </div>
          <span className="panel-tag">{props.customerServiceData?.pagination?.total ?? 0} records</span>
        </div>

        {props.isLoadingCustomerService && !props.customerServiceData ? <p className="muted-copy">Loading customer service records...</p> : null}

        <div className="table-shell">
          <table className="portal-table inventory-table-wide">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Folder ID</th>
                <th>Phone</th>
                <th>Receipt</th>
                <th>Billing Date</th>
                <th>Payment</th>
                <th>Pickup</th>
                <th>Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(props.customerServiceData?.pickup_records ?? []).map((record) => (
                <tr key={record.billing_id}>
                  <td>{record.patient_name}</td>
                  <td>{record.folder_id}</td>
                  <td>{record.phone || 'N/A'}</td>
                  <td>{record.receipt_number || 'Pending'}</td>
                  <td>{record.billing_date}</td>
                  <td>{record.payment_status_display}</td>
                  <td>{record.pickup_status_display}</td>
                  <td>{record.balance}</td>
                  <td>
                    <div className="table-actions-inline">
                      <button
                        type="button"
                        className="mini-action"
                        disabled={props.isMergedView || props.pickupBusyId === record.billing_id || ['ready', 'notified', 'picked_up'].includes(record.pickup_status)}
                        onClick={() => props.updatePickupStatus(record.billing_id, 'ready')}
                      >
                        Ready
                      </button>
                      <button
                        type="button"
                        className="mini-action"
                        disabled={props.isMergedView || props.pickupBusyId === record.billing_id || record.pickup_status === 'picked_up'}
                        onClick={() => props.updatePickupStatus(record.billing_id, 'picked-up')}
                      >
                        Picked Up
                      </button>
                      <button
                        type="button"
                        className="mini-action success"
                        onClick={() => queuePickupMessage(record)}
                      >
                        Load SMS
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination-bar">
          <span>Page {props.customerServiceData?.pagination?.page ?? 1} of {Math.max(props.customerServiceData?.pagination?.total_pages ?? 1, 1)}</span>
          <div className="pagination-actions">
            <button
              type="button"
              className="ghost-button"
              disabled={(props.customerServiceData?.pagination?.page ?? 1) <= 1}
              onClick={() => props.setCustomerServiceQuery((current) => ({ ...current, page: current.page - 1 }))}
            >
              Previous
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={(props.customerServiceData?.pagination?.page ?? 1) >= (props.customerServiceData?.pagination?.total_pages ?? 1)}
              onClick={() => props.setCustomerServiceQuery((current) => ({ ...current, page: current.page + 1 }))}
            >
              Next
            </button>
          </div>
        </div>
      </article>
    </section>
  )
}
