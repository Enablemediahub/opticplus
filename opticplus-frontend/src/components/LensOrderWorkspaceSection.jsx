import LensOrdersSection from './LensOrdersSection.jsx'
import PlaceLensOrderSection from './PlaceLensOrderSection.jsx'
import WorkspaceTabs from './WorkspaceTabs.jsx'

const workspaceTabs = [
  {
    id: 'Place Lens Order',
    label: 'Place Lens Order',
    description: 'Review prescriptions and queue them for technician processing.',
    icon: 'PL',
  },
  {
    id: 'Lens Orders',
    label: 'Lens Orders',
    description: 'Review order progress, production notes, and technician sign-off.',
    icon: 'LO',
  },
]

export default function LensOrderWorkspaceSection(props) {
  const activeTab = props.activeView === 'Place Lens Order' ? 'Place Lens Order' : 'Lens Orders'

  return (
    <section className="lens-order-workspace">
      {activeTab === 'Place Lens Order' ? (
        <WorkspaceTabs
          tabs={workspaceTabs}
          activeTab={activeTab}
          onChange={props.setActiveView}
          ariaLabel="Lens order workspaces"
          heading="Lens order management"
          description="Place new lens orders and follow them through production from one workspace."
        />
      ) : null}
      {activeTab === 'Place Lens Order' ? (
        <PlaceLensOrderSection
          fetchGlassesPrescriptions={props.fetchGlassesPrescriptions}
          placeLensOrder={props.placeLensOrder}
          overturnLensOrder={props.overturnLensOrder}
          canOverturn
          session={props.session}
          placedOrders={props.placedOrders}
          setPlacedOrders={props.setPlacedOrders}
        />
      ) : (
        <LensOrdersSection
          workspaceNavigation={(
            <WorkspaceTabs
              tabs={workspaceTabs}
              activeTab={activeTab}
              onChange={props.setActiveView}
              ariaLabel="Lens order workspaces"
              heading="Lens order management"
              description="Place new lens orders and follow them through production from one workspace."
            />
          )}
          lensOrdersData={props.lensOrdersData}
          lensOrdersFilters={props.lensOrdersFilters}
          setLensOrdersFilters={props.setLensOrdersFilters}
          lensOrdersError={props.lensOrdersError}
          lensOrdersSuccess={props.lensOrdersSuccess}
          setLensOrdersError={props.setLensOrdersError}
          setLensOrdersSuccess={props.setLensOrdersSuccess}
          fetchGlassesPrescriptions={props.fetchGlassesPrescriptions}
          placeLensOrder={props.placeLensOrder}
          overturnLensOrder={props.overturnLensOrder}
          updatePickupStatus={props.updatePickupStatus}
          pickupBusyIds={props.pickupBusyIds}
          session={props.session}
          companyName={props.companyName}
        />
      )}
    </section>
  )
}
