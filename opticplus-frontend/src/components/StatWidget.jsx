import PortalIcon from './PortalIcon.jsx'

export default function StatWidget({ label, value, note, icon, className = '', valueClassName = '' }) {
  return (
    <article className={`stat-card patient-stat-card ${className}`.trim()}>
      <div className="stat-card-icon">
        <PortalIcon name={icon} className="widget-icon" />
      </div>
      <span>{label}</span>
      <strong className={valueClassName}>{value}</strong>
      <p>{note}</p>
    </article>
  )
}
