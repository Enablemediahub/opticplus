import StatWidget from './StatWidget.jsx'

const assetGroups = [
  { title: 'Equipment', note: 'Autorefractors, slit lamps, edging machines, tonometers.' },
  { title: 'Tools', note: 'Hand tools, fitting kits, adjustment sets, repair gear.' },
  { title: 'Store Items', note: 'Furniture, computers, printers, AC units, POS devices.' },
  { title: 'Liabilities', note: 'Vendor payables, leases, warranties, and financed assets.' },
]

const planningFields = [
  'asset_code',
  'asset_name',
  'category',
  'branch_id',
  'purchase_date',
  'purchase_cost',
  'current_value',
  'condition',
  'status',
  'assigned_to',
  'serial_number',
  'vendor',
  'warranty_expiry',
  'last_service_date',
  'next_service_date',
  'liability_type',
  'notes',
]

export default function AssetsRegisterSection(props) {
  const operatorLabel =
    props.session?.role === 'manager'
      ? 'General Manager'
      : props.session?.role === 'accountant'
        ? 'Accountant'
        : 'Portal'

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Assets Register</p>
          <h3>Track company equipment, tools, items, and liabilities</h3>
          <p className="header-copy">This placeholder prepares an assets-recording workspace for the general manager and accountant once we add the table schema and API endpoints.</p>
        </div>
      </div>

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Equipment Register" value="Planned" note="Core machines and clinical equipment" icon="briefcase" className="total" />
        <StatWidget label="Tools Register" value="Planned" note="Workshop and fitting tools by branch" icon="inventory" className="seen" />
        <StatWidget label="Items Register" value="Planned" note="Computers, furniture, and support assets" icon="layers" className="pending" />
        <StatWidget label="Liabilities Register" value="Planned" note="Payables, leases, and financed assets" icon="receipt" className="today" />
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">What This Will Hold</p>
              <h3>Asset classes for the company</h3>
            </div>
            <span className="panel-tag">{operatorLabel} workspace</span>
          </div>

          <div className="stack-list">
            {assetGroups.map((group) => (
              <div key={group.title} className="stack-item">
                <div>
                  <strong>{group.title}</strong>
                  <span>{group.note}</span>
                </div>
                <div className="stack-meta">
                  <strong>Schema pending</strong>
                  <span>UI placeholder ready for backend hookup</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Suggested Schema</p>
              <h3>Starter fields for the future table</h3>
            </div>
            <span className="panel-tag">{planningFields.length} candidate columns</span>
          </div>

          <div className="table-shell">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                {planningFields.map((field) => (
                  <tr key={field}>
                    <td>{field}</td>
                    <td>{describeField(field)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </section>
  )
}

function describeField(field) {
  switch (field) {
    case 'asset_code':
      return 'Human-readable internal ID for equipment or liability records.'
    case 'asset_name':
      return 'Name of the asset, tool, item, or liability entry.'
    case 'category':
      return 'Groups rows into equipment, tools, items, liabilities, or future custom types.'
    case 'branch_id':
      return 'Links the record to a branch or merged company-wide ownership.'
    case 'purchase_date':
      return 'When the asset was acquired or liability started.'
    case 'purchase_cost':
      return 'Original acquisition or contract value.'
    case 'current_value':
      return 'Current book value, fair value, or outstanding balance.'
    case 'condition':
      return 'Operational state such as new, good, repair-needed, or retired.'
    case 'status':
      return 'Lifecycle status like active, in repair, disposed, or archived.'
    case 'assigned_to':
      return 'Optional staff, department, or room currently responsible for the asset.'
    case 'serial_number':
      return 'Manufacturer serial number or internal identifier.'
    case 'vendor':
      return 'Supplier, manufacturer, or creditor.'
    case 'warranty_expiry':
      return 'Tracks warranty coverage deadlines.'
    case 'last_service_date':
      return 'Most recent maintenance or service date.'
    case 'next_service_date':
      return 'Next expected service or inspection date.'
    case 'liability_type':
      return 'Labels payable, lease, financing, or other obligations.'
    case 'notes':
      return 'Free-form remarks for usage, condition, or finance follow-up.'
    default:
      return 'Planned register field.'
  }
}
