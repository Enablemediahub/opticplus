import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import AccountantDashboardSection from './components/AccountantDashboardSection.jsx'
import AuditLogSection from './components/AuditLogSection.jsx'
import DashboardSection from './components/DashboardSection.jsx'
import BillingSection from './components/BillingSection.jsx'
import BsmiTrackingSection from './components/BsmiTrackingSection.jsx'
import CustomerServiceSection from './components/CustomerServiceSection.jsx'
import AssetsRegisterSection from './components/AssetsRegisterSection.jsx'
import BankDepositsSection from './components/BankDepositsSection.jsx'
import DebtManagementSection from './components/DebtManagementSection.jsx'
import DatabaseAdminSection from './components/DatabaseAdminSection.jsx'
import ExtractSection from './components/ExtractSection.jsx'
import FinanceSection from './components/FinanceSection.jsx'
import InsuranceSection from './components/InsuranceSection.jsx'
import InventorySection from './components/InventorySection.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import ExecutiveDashboardSection from './components/ExecutiveDashboardSection.jsx'
import ManagerDashboardSection from './components/ManagerDashboardSection.jsx'
import MemosSection from './components/MemosSection.jsx'
import NotesSection from './components/NotesSection.jsx'
import OptometristAppointmentsSection from './components/OptometristAppointmentsSection.jsx'
import OptometristDashboardSection from './components/OptometristDashboardSection.jsx'
import OptometristPrescriptionsSection from './components/OptometristPrescriptionsSection.jsx'
import MedicalReportSection from './components/MedicalReportSection.jsx'
import MessengerWidget from './components/MessengerWidget.jsx'
import PatientsSection, { defaultPatientFilters, patientFiltersForView, patientFormDefaults, PatientIntakeModal } from './components/PatientsSection.jsx'
import PayrollSection from './components/PayrollSection.jsx'
import PortalIcon from './components/PortalIcon.jsx'
import ReportsSection from './components/ReportsSection.jsx'
import SettingsSection from './components/SettingsSection.jsx'
import StaffProfilesSection from './components/StaffProfilesSection.jsx'
import UsersManagementSection from './components/UsersManagementSection.jsx'

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  `${window.location.origin}/api/v1`
).replace(/\/+$/, '')

const branchOptions = [
  { id: 0, name: 'Merged' },
  { id: 1, name: 'Labadi' },
  { id: 2, name: 'Madina' },
]

const navItems = [
  { label: 'Dashboard', icon: 'dashboard' },
  { label: 'Users', icon: 'settings' },
  { label: 'Database', icon: 'reports' },
  { label: 'Staff Profiles', icon: 'support' },
  { label: 'Appointments', icon: 'calendar' },
  { label: 'Patients', icon: 'patients' },
  { label: 'Billing', icon: 'receipt' },
  { label: 'Finance', icon: 'finance' },
  { label: 'Insurance', icon: 'shield' },
  { label: 'Inventory', icon: 'inventory' },
  { label: 'Attendance', icon: 'clock' },
  { label: 'Reports', icon: 'reports' },
  { label: 'Notes', icon: 'message' },
  { label: 'Customer Service', icon: 'support' },
  { label: 'Settings', icon: 'settings' },
]

const managerNavSections = [
  {
    title: 'Dashboard',
    items: [{ label: 'Dashboard', navLabel: 'Overview Dashboard', icon: 'dashboard' }],
  },
  {
    title: 'Patient Management',
    items: [
      { label: 'Patients', navLabel: 'Patient Records', icon: 'patients' },
      { label: 'Billing', navLabel: 'Billing / Invoicing', icon: 'receipt' },
    ],
  },
  {
    title: 'Inventory & Products',
    items: [
      { label: 'Inventory', navLabel: 'Products', icon: 'inventory' },
      { label: 'Assets Register', navLabel: 'Company Assets', icon: 'briefcase' },
      { label: 'Memos', navLabel: 'Memos', icon: 'message' },
    ],
  },
  {
    title: 'Financial Management',
    items: [
      { label: 'Revenue Tracking', navLabel: 'Revenue Tracking', icon: 'finance' },
      { label: 'Sales', navLabel: 'Daily Sales', icon: 'money' },
      { label: 'Expenses', navLabel: 'Expenses', icon: 'alert' },
      { label: 'Insurance Claims', navLabel: 'Insurance Claims', icon: 'shield' },
      { label: 'Debts', navLabel: 'Company Debts', icon: 'receipt' },
      { label: 'BSMI Tracking', navLabel: 'BSMI Tracking', icon: 'inventory' },
      { label: 'Reports', navLabel: 'Reports', icon: 'reports' },
      { label: 'Extract', navLabel: 'Extract', icon: 'reports' },
      { label: 'Bank Deposits', navLabel: 'Bank Deposits', icon: 'finance' },
      { label: 'Audit Log', navLabel: 'Audit Log', icon: 'reports' },
    ],
  },
  {
    title: 'Human Resources',
    items: [
      { label: 'Payroll', navLabel: 'Staff Payroll', icon: 'money' },
      { label: 'Staff Profiles', navLabel: 'Staff Profiles', icon: 'support' },
      { label: 'Users', navLabel: 'User Management', icon: 'settings' },
    ],
  },
  {
    title: 'Data Controls',
    items: [{ label: 'Database', navLabel: 'Database', icon: 'reports' }],
  },
  {
    title: 'Customer Relations',
    items: [{ label: 'Customer Service', navLabel: 'Customer Relations', icon: 'support' }],
  },
  {
    title: 'System Administration',
    items: [
      { label: 'Notes', navLabel: 'Notes & Reminders', icon: 'message' },
      { label: 'Settings', navLabel: 'My Profile & Settings', icon: 'settings' },
    ],
  },
]

const receptionistNavSections = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', navLabel: 'Dashboard Overview', icon: 'dashboard' }],
  },
  {
    title: 'Front Desk',
    items: [
      { label: 'Appointments', navLabel: 'Appointments', icon: 'calendar' },
      { label: 'Patients', navLabel: 'Patient Intake & Queue', icon: 'patients' },
      { label: 'Billing', navLabel: 'Billing / Payments', icon: 'receipt' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Finance', navLabel: 'Receipt Reprints', icon: 'receipt' },
      { label: 'Expenses', navLabel: 'Add Expenses', icon: 'alert' },
      { label: 'Insurance', navLabel: 'Insurance', icon: 'shield' },
      { label: 'Inventory', navLabel: 'Inventory', icon: 'inventory' },
      { label: 'Lens Tracker', navLabel: 'Lens Tracker', icon: 'glasses' },
      { label: 'Notes', navLabel: 'Notes & Reminders', icon: 'message' },
    ],
  },
  {
    title: 'Customer Care',
    items: [{ label: 'Customer Service', navLabel: 'Customer Service', icon: 'support' }],
  },
  {
    title: 'Preferences',
    items: [{ label: 'Settings', navLabel: 'Settings', icon: 'settings' }],
  },
]

const optometristNavSections = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', navLabel: 'Dashboard', icon: 'dashboard' }],
  },
  {
    title: 'Patients',
    items: [
      { label: 'Patient Management', navLabel: 'Patient Management', icon: 'patients' },
      { label: 'Patient Review', navLabel: 'Patient Review', icon: 'check-badge' },
      { label: 'Patient Form', navLabel: 'Patient Form', icon: 'glasses' },
      { label: 'Patient Records', navLabel: 'Patient Records', icon: 'reports' },
      { label: 'Patient Uploads', navLabel: 'Patient Uploads', icon: 'support' },
    ],
  },
  {
    title: 'Appointments',
    items: [{ label: 'Appointments', navLabel: 'View Appointments', icon: 'calendar' }],
  },
  {
    title: 'Clinical Records',
    items: [
      { label: 'Glasses Prescriptions', navLabel: 'Prescriptions', icon: 'glasses' },
      { label: 'Medical Report', navLabel: 'Medical Report', icon: 'reports' },
    ],
  },
  {
    title: 'Notes & Preferences',
    items: [
      { label: 'Notes', navLabel: 'View Notes', icon: 'message' },
      { label: 'Settings', navLabel: 'System Settings', icon: 'settings' },
      { label: 'Profile', navLabel: 'Profile', icon: 'support' },
    ],
  },
]

const accountantNavSections = [
  {
    title: 'Dashboard',
    items: [{ label: 'Dashboard', navLabel: 'Financial Overview', icon: 'dashboard' }],
  },
  {
    title: 'Inventory & Products',
    items: [
      { label: 'Inventory', navLabel: 'Inventory', icon: 'inventory' },
      { label: 'Lens Tracker', navLabel: 'Lens Tracker', icon: 'glasses' },
      { label: 'Memos', navLabel: 'Memos', icon: 'message' },
    ],
  },
  {
    title: 'Receivables & Billing',
    items: [
      { label: 'Billing', navLabel: 'Billing / Invoicing', icon: 'receipt' },
      { label: 'Debts', navLabel: 'Debt Management', icon: 'money' },
    ],
  },
  {
    title: 'Financial Management',
    items: [
      { label: 'Finance', navLabel: 'Finance Snapshot', icon: 'finance' },
      { label: 'Sales', navLabel: 'Sales', icon: 'money' },
      { label: 'Revenue Tracking', navLabel: 'Revenue Tracking', icon: 'trend' },
      { label: 'Expenses', navLabel: 'Expenses', icon: 'alert' },
      { label: 'BSMI Tracking', navLabel: 'BSMI Tracking', icon: 'inventory' },
      { label: 'Reports', navLabel: 'Reports', icon: 'reports' },
      { label: 'Payroll', navLabel: 'Staff Payroll', icon: 'money' },
      { label: 'Bank Deposits', navLabel: 'Bank Deposits', icon: 'finance' },
    ],
  },
  {
    title: 'Claims & Records',
    items: [
      { label: 'Insurance Claims', navLabel: 'Insurance Claims', icon: 'shield' },
      { label: 'Extract', navLabel: 'Extract / Exports', icon: 'reports' },
    ],
  },
  {
    title: 'Profile',
    items: [
      { label: 'Notes', navLabel: 'Notes & Reminders', icon: 'message' },
      { label: 'Settings', navLabel: 'My Profile & Settings', icon: 'settings' },
    ],
  },
]

const executiveNavSections = [
  {
    title: 'Executive Overview',
    items: [{ label: 'Dashboard', navLabel: 'Executive Dashboard', icon: 'dashboard' }],
  },
  {
    title: 'Financial Visibility',
    items: [
      { label: 'Sales', navLabel: 'Daily Sales', icon: 'money' },
      { label: 'Revenue Tracking', navLabel: 'Revenue Tracking', icon: 'trend' },
      { label: 'Expenses', navLabel: 'Expenses Review', icon: 'alert' },
      { label: 'Insurance Claims', navLabel: 'Insurance Review', icon: 'shield' },
      { label: 'Reports', navLabel: 'Financial Reports', icon: 'reports' },
    ],
  },
  {
    title: 'Communication',
    items: [
      { label: 'Notes', navLabel: 'Notes & Reminders', icon: 'message' },
      { label: 'Settings', navLabel: 'Profile & Settings', icon: 'settings' },
    ],
  },
]

const viewHashMap = {
  Dashboard: '#/dashboard',
  Users: '#/users',
  Database: '#/database',
  'Staff Profiles': '#/staff-profiles',
  Appointments: '#/appointments',
  Patients: '#/patients',
  Billing: '#/billing',
  Finance: '#/finance',
  Sales: '#/sales',
  'Revenue Tracking': '#/revenue-tracking',
  Expenses: '#/expenses',
  Insurance: '#/insurance',
  'Insurance Claims': '#/insurance-claims',
  'Debt Management': '#/debt-management',
  Debts: '#/debts',
  'BSMI Tracking': '#/bsmi-tracking',
  'Assets Register': '#/assets-register',
  'Lens Tracker': '#/lens-tracker',
  Memos: '#/memos',
  Payroll: '#/payroll',
  'Bank Deposits': '#/bank-deposits',
  'Audit Log': '#/audit-log',
  Extract: '#/extract',
  Inventory: '#/inventory',
  Attendance: '#/attendance',
  Reports: '#/reports',
  'Customer Service': '#/customer-service',
  Settings: '#/settings',
  'Patient Management': '#/patient-management',
  'Prescription Reference': '#/prescription-reference',
  Prescriptions: '#/prescriptions',
  Prescription: '#/prescription',
  'Patient Review': '#/patient-review',
  'Patient Form': '#/patient-form',
  'Patient Records': '#/patient-records',
  'Patient Uploads': '#/patient-uploads',
  'Glasses Prescriptions': '#/glasses-prescriptions',
  'Medical Report': '#/medical-report',
  Notes: '#/notes',
  Profile: '#/profile',
}

const financeViews = ['Finance', 'Sales', 'Revenue Tracking', 'Expenses', 'Extract', 'Reports']
const paymentDetailViews = ['Billing', ...financeViews]
const insuranceViews = ['Insurance', 'Insurance Claims']
const inventoryViews = ['Inventory', 'Lens Tracker', 'BSMI Tracking', 'Assets Register', 'Memos']
const optometristPatientViews = [
  'Patient Management',
  'Prescription Reference',
  'Prescriptions',
  'Prescription',
  'Patient Review',
  'Patient Form',
  'Patient Records',
  'Patient Uploads',
]
const optometristClinicalViews = ['Glasses Prescriptions', 'Medical Report']
const optometristSettingsViews = ['Settings', 'Profile']

function hashToView(hash) {
  const match = Object.entries(viewHashMap).find(([, value]) => value === hash)
  return match?.[0] ?? 'Dashboard'
}

function getInitialView() {
  if (typeof window === 'undefined') return 'Dashboard'
  return hashToView(window.location.hash || '#/dashboard')
}

function shouldResetSavedSession() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('reset') === '1'
}

const roleLabels = {
  ceo: 'CEO',
  director: 'Director',
  manager: 'General Manager',
  accountant: 'Accountant',
  optometrist: 'Optometrist',
  receptionist: 'Receptionist',
  technician: 'Technician',
}

const moduleCards = [
  { title: 'Users', icon: 'settings', description: 'Create accounts, reset passwords, and control access across the portal.' },
  { title: 'Staff Profiles', icon: 'support', description: 'Inspect employee records, attendance, and linked portal accounts.' },
  { title: 'Appointments', icon: 'calendar', description: 'Calendar bookings, optometrist assignment, and status tracking.' },
  { title: 'Billing', icon: 'receipt', description: 'VAT-aware pricing, payment follow-up, and receipt generation.' },
  { title: 'Finance', icon: 'finance', description: 'Deposits, balances, expenses, and branch performance snapshots.' },
  { title: 'Insurance', icon: 'shield', description: 'Claims handling, approvals, and corporate scheme visibility.' },
  { title: 'Inventory', icon: 'inventory', description: 'Frames, lenses, stock movement, and reorder visibility.' },
  { title: 'Attendance', icon: 'clock', description: 'Clock-in activity with location verification and staff visibility.' },
  { title: 'Reports', icon: 'reports', description: 'Branch comparisons, revenue trends, and export-ready views.' },
  { title: 'Customer Service', icon: 'support', description: 'Aftercare touchpoints, reminders, and service recovery notes.' },
  { title: 'Settings', icon: 'settings', description: 'Portal preferences, roles, and system configuration controls.' },
]

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

const defaultFinanceSalesFilters = () => ({
  search: '',
  payment_method: 'all',
  date_from: '',
  date_to: '',
  page: 1,
  per_page: 12,
})

const defaultFinanceExpenseFilters = () => ({
  filter: 'all',
  start_date: '',
  end_date: '',
  category: 'all',
  search: '',
  page: 1,
  per_page: 12,
})

const defaultExpenseForm = (category = '') => ({
  description: '',
  amount: '',
  date: todayIso(),
  category,
  other_category: '',
})

const defaultFinancePaymentFilters = () => ({
  date_from: '',
  date_to: '',
  search: '',
  receipt_search: '',
  page: 1,
  per_page: 12,
  receipt_page: 1,
  receipt_per_page: 10,
})

const defaultPaymentForm = () => ({
  payment_method: 'Cash',
  amount: '',
  date: todayIso(),
  transaction_id: '',
  reference: '',
  description: '',
  customer_email: '',
  insurance_provider: '',
  insurance_number: '',
  insurance_package: '',
  patient_organization: '',
})

const defaultInsuranceFilters = () => ({
  search: '',
  provider: 'all',
  status: 'all',
  date_from: '',
  date_to: '',
  page: 1,
  per_page: 12,
})

const defaultInsuranceForm = () => ({
  billing_id: '',
  patient_id: '',
  folder_id: '',
  patient_name: '',
  insurance_provider: '',
  insurance_number: '',
  insurance_package: '',
  patient_organization: '',
  amount_paid: '',
  date: todayIso(),
})

const defaultInventoryFilters = () => ({
  search: '',
  category: 'all',
  date_from: '',
  date_to: '',
  as_of_at: '',
  page: 1,
  per_page: 15,
})

const defaultInventoryProductForm = () => ({
  id: null,
  code: '',
  name: '',
  category: 'Frames',
  grade: '',
  stock: '',
  min_price: '',
  max_price: '',
})

const defaultLensTrackerFilters = () => ({
  date_from: todayIso(),
  date_to: todayIso(),
  search: '',
  tracking: 'all',
})

const defaultCustomerServiceFilters = () => ({
  search: '',
  status: 'all',
  payment_status: 'all',
  date_from: '',
  date_to: '',
  page: 1,
  per_page: 12,
})

const defaultMessageForm = () => ({
  mode: 'single',
  template_id: '',
  message: '',
  phone: '',
  patient_id: '',
  recipient_type: 'glasses_ready',
  mark_notified: true,
})

const defaultTemplateForm = () => ({
  id: null,
  template_name: '',
  message_text: '',
  is_shared: false,
})

const defaultSettingsProfileForm = (session = null) => ({
  name: session?.name ?? '',
  username: session?.username ?? '',
  email: session?.email ?? '',
  phone: session?.phone ?? '',
  profileImage: null,
  profilePreview: session?.profile_image_url ?? '',
})

const defaultSettingsPasswordForm = () => ({
  current_password: '',
  password: '',
  password_confirmation: '',
})

const defaultCompanyProfile = () => ({
  company_name: 'Bealet Optical Center',
  company_email: 'bealetopticalcenter@gmail.com',
  company_phone_primary: '+233502484144',
  company_phone_secondary: '+233593998962',
  labadi_address: 'Labadi Rd, Opp Advent Press',
  madina_address: 'FireStone Madina Road, Opp Cal Bank',
  tagline: 'Professional Eye Care and Optical Services',
  login_wallpaper: null,
  login_wallpaper_url: '',
  loginWallpaperFile: null,
  loginWallpaperPreview: '',
  updated_at: '',
})

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('opticplus-theme') ?? 'dark')
  const [token, setToken] = useState(() => {
    if (shouldResetSavedSession()) {
      localStorage.removeItem('opticplus-token')
      return ''
    }

    return localStorage.getItem('opticplus-token') ?? ''
  })
  const [session, setSession] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [activeView, setActiveView] = useState(getInitialView)
  const [isBooting, setIsBooting] = useState(true)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false)
  const [selectedBranchId, setSelectedBranchId] = useState(() => {
    const stored = localStorage.getItem('opticplus-branch')
    return stored ? Number(stored) : 1
  })
  const [credentials, setCredentials] = useState({ login: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [patientMeta, setPatientMeta] = useState(null)
  const [patientData, setPatientData] = useState(null)
  const [patientFilters, setPatientFilters] = useState(defaultPatientFilters())
  const [patientQuery, setPatientQuery] = useState(defaultPatientFilters())
  const [isLoadingPatients, setIsLoadingPatients] = useState(false)
  const [patientError, setPatientError] = useState('')
  const [patientSuccess, setPatientSuccess] = useState('')
  const [patientForm, setPatientForm] = useState(patientFormDefaults)
  const [dashboardIntakeModalOpen, setDashboardIntakeModalOpen] = useState(false)
  const [isSavingPatient, setIsSavingPatient] = useState(false)
  const [patientLookupSearch, setPatientLookupSearch] = useState('')
  const [patientLookupResults, setPatientLookupResults] = useState([])
  const [isSearchingPatientLookup, setIsSearchingPatientLookup] = useState(false)
  const [rowAssignments, setRowAssignments] = useState({})
  const [rowBusyId, setRowBusyId] = useState(null)
  const [billingMeta, setBillingMeta] = useState(null)
  const [billingData, setBillingData] = useState(null)
  const [dailyPayments, setDailyPayments] = useState(null)
  const [billingPatientSearch, setBillingPatientSearch] = useState('')
  const [billingPatientResults, setBillingPatientResults] = useState([])
  const [isSearchingBillingPatients, setIsSearchingBillingPatients] = useState(false)
  const [billingFilters, setBillingFilters] = useState({
    status: 'all',
    search: '',
    date_from: '',
    date_to: '',
    page: 1,
    per_page: 15,
  })
  const [billingQuery, setBillingQuery] = useState({
    status: 'all',
    search: '',
    date_from: '',
    date_to: '',
    page: 1,
    per_page: 15,
  })
  const [billingForm, setBillingForm] = useState({
    patient_id: '',
    folder_id: '',
    name: '',
    prescription_id: '',
    date: todayIso(),
    consultation_customer_type: 'new',
    consultation_price: '100.00',
    frame_code_id: '',
    frame_price: '0.00',
    frame_items: [createDefaultBillingFrameItem()],
    lens_price: '0.00',
    lens_items: [createDefaultBillingLensItem()],
    case_price: '0.00',
    discount: '0.00',
    health_insurance: 'NONE',
  })
  const [dailyPaymentSearch, setDailyPaymentSearch] = useState('')
  const [isLoadingBilling, setIsLoadingBilling] = useState(false)
  const [isLoadingBillingMeta, setIsLoadingBillingMeta] = useState(false)
  const [isLoadingPayments, setIsLoadingPayments] = useState(false)
  const [isSavingBill, setIsSavingBill] = useState(false)
  const [billingError, setBillingError] = useState('')
  const [billingSuccess, setBillingSuccess] = useState('')
  const [financeSummary, setFinanceSummary] = useState(null)
  const [financeSales, setFinanceSales] = useState(null)
  const [financeExpenses, setFinanceExpenses] = useState(null)
  const [financePayments, setFinancePayments] = useState(null)
  const [financeSalesFilters, setFinanceSalesFilters] = useState(defaultFinanceSalesFilters())
  const [financeSalesQuery, setFinanceSalesQuery] = useState(defaultFinanceSalesFilters())
  const [financeExpenseFilters, setFinanceExpenseFilters] = useState(defaultFinanceExpenseFilters())
  const [financeExpenseQuery, setFinanceExpenseQuery] = useState(defaultFinanceExpenseFilters())
  const [expenseForm, setExpenseForm] = useState(defaultExpenseForm())
  const [financePaymentFilters, setFinancePaymentFilters] = useState(defaultFinancePaymentFilters())
  const [financePaymentQuery, setFinancePaymentQuery] = useState(defaultFinancePaymentFilters())
  const [isLoadingFinanceSummary, setIsLoadingFinanceSummary] = useState(false)
  const [isLoadingFinanceSales, setIsLoadingFinanceSales] = useState(false)
  const [isLoadingFinanceExpenses, setIsLoadingFinanceExpenses] = useState(false)
  const [isLoadingFinancePayments, setIsLoadingFinancePayments] = useState(false)
  const [isSavingExpense, setIsSavingExpense] = useState(false)
  const [isUpdatingExpenseRecord, setIsUpdatingExpenseRecord] = useState(false)
  const [deletingExpenseRecordId, setDeletingExpenseRecordId] = useState(null)
  const [isSavingExpenseCategory, setIsSavingExpenseCategory] = useState(false)
  const [financeError, setFinanceError] = useState('')
  const [financeSuccess, setFinanceSuccess] = useState('')
  const [selectedPaymentRecordId, setSelectedPaymentRecordId] = useState(null)
  const [paymentModalOriginView, setPaymentModalOriginView] = useState(null)
  const [paymentDetail, setPaymentDetail] = useState(null)
  const [receiptPreview, setReceiptPreview] = useState(null)
  const [paymentForm, setPaymentForm] = useState(defaultPaymentForm())
  const [isSplitPaymentEnabled, setIsSplitPaymentEnabled] = useState(false)
  const [secondaryPaymentForm, setSecondaryPaymentForm] = useState(defaultPaymentForm())
  const [isLoadingPaymentDetail, setIsLoadingPaymentDetail] = useState(false)
  const [isSavingPayment, setIsSavingPayment] = useState(false)
  const [isInitializingPaystack, setIsInitializingPaystack] = useState(false)
  const [isVerifyingPaystack, setIsVerifyingPaystack] = useState(false)
  const [inventoryData, setInventoryData] = useState(null)
  const [inventoryLensData, setInventoryLensData] = useState(null)
  const [inventoryBsmiData, setInventoryBsmiData] = useState(null)
  const [inventoryFilters, setInventoryFilters] = useState(defaultInventoryFilters())
  const [inventoryQuery, setInventoryQuery] = useState(defaultInventoryFilters())
  const [inventoryForm, setInventoryForm] = useState(defaultInventoryProductForm())
  const [lensTrackerFilters, setLensTrackerFilters] = useState(defaultLensTrackerFilters())
  const [lensTrackerQuery, setLensTrackerQuery] = useState(defaultLensTrackerFilters())
  const [inventoryError, setInventoryError] = useState('')
  const [inventorySuccess, setInventorySuccess] = useState('')
  const [isLoadingInventory, setIsLoadingInventory] = useState(false)
  const [isLoadingLensTracker, setIsLoadingLensTracker] = useState(false)
  const [isSavingInventoryProduct, setIsSavingInventoryProduct] = useState(false)
  const [savingLensBillingId, setSavingLensBillingId] = useState(null)
  const [customerServiceData, setCustomerServiceData] = useState(null)
  const [customerServiceFilters, setCustomerServiceFilters] = useState(defaultCustomerServiceFilters())
  const [customerServiceQuery, setCustomerServiceQuery] = useState(defaultCustomerServiceFilters())
  const [messageForm, setMessageForm] = useState(defaultMessageForm())
  const [templateForm, setTemplateForm] = useState(defaultTemplateForm())
  const [customerServiceError, setCustomerServiceError] = useState('')
  const [customerServiceSuccess, setCustomerServiceSuccess] = useState('')
  const [isLoadingCustomerService, setIsLoadingCustomerService] = useState(false)
  const [isSendingCustomerMessage, setIsSendingCustomerMessage] = useState(false)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [pickupBusyIds, setPickupBusyIds] = useState([])
  const [insuranceMeta, setInsuranceMeta] = useState(null)
  const [insuranceData, setInsuranceData] = useState(null)
  const [insuranceFilters, setInsuranceFilters] = useState(defaultInsuranceFilters())
  const [insuranceQuery, setInsuranceQuery] = useState(defaultInsuranceFilters())
  const [insuranceForm, setInsuranceForm] = useState(defaultInsuranceForm())
  const [insuranceError, setInsuranceError] = useState('')
  const [insuranceSuccess, setInsuranceSuccess] = useState('')
  const [isLoadingInsuranceMeta, setIsLoadingInsuranceMeta] = useState(false)
  const [isLoadingInsuranceData, setIsLoadingInsuranceData] = useState(false)
  const [isSavingInsuranceClaim, setIsSavingInsuranceClaim] = useState(false)
  const [isSavingInsuranceRemittance, setIsSavingInsuranceRemittance] = useState(false)
  const [claimBusyId, setClaimBusyId] = useState(null)
  const [settingsProfileForm, setSettingsProfileForm] = useState(defaultSettingsProfileForm())
  const [settingsPasswordForm, setSettingsPasswordForm] = useState(defaultSettingsPasswordForm())
  const [settingsError, setSettingsError] = useState('')
  const [settingsSuccess, setSettingsSuccess] = useState('')
  const [successToasts, setSuccessToasts] = useState([])
  const previousSuccessMessagesRef = useRef({})
  const [isSavingSettingsProfile, setIsSavingSettingsProfile] = useState(false)
  const [isSavingSettingsPassword, setIsSavingSettingsPassword] = useState(false)
  const [companyProfileForm, setCompanyProfileForm] = useState(defaultCompanyProfile())
  const [isSavingCompanyProfile, setIsSavingCompanyProfile] = useState(false)
  const [insuranceProviderCatalog, setInsuranceProviderCatalog] = useState([])
  const [expenseCategoryCatalog, setExpenseCategoryCatalog] = useState([])
  const [isLoadingSettingsCatalog, setIsLoadingSettingsCatalog] = useState(false)
  const [isSavingInsuranceProvider, setIsSavingInsuranceProvider] = useState(false)
  const [isDeletingInsuranceProviderId, setIsDeletingInsuranceProviderId] = useState(null)
  const [isDeletingExpenseCategoryId, setIsDeletingExpenseCategoryId] = useState(null)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [userHeroProfile, setUserHeroProfile] = useState(null)
  const [staffHeroProfile, setStaffHeroProfile] = useState(null)
  const profileMenuRef = useRef(null)
  const hasManagerSidebar = ['manager', 'accountant'].includes(session?.role)
  const isAccountant = session?.role === 'accountant'
  const isGeneralManager = session?.role === 'manager'
  const isOptometrist = session?.role === 'optometrist'
  const isExecutive = ['ceo', 'director'].includes(session?.role)
  const canAccessSystemSettings = ['ceo', 'director', 'manager'].includes(session?.role)
  const isMergedView = session?.is_admin && selectedBranchId === 0
  const executiveDashboardActive = isExecutive && activeView === 'Dashboard'
  const mergedSupportedViews = ['Dashboard', 'Users', 'Database', 'Staff Profiles', 'Patients', 'Billing', 'Finance', 'Sales', 'Revenue Tracking', 'Expenses', 'Insurance', 'Insurance Claims', 'Debt Management', 'BSMI Tracking', 'Assets Register', 'Lens Tracker', 'Memos', 'Extract', 'Reports', 'Inventory', 'Customer Service', 'Settings', 'Bank Deposits', 'Audit Log']
  const isDatabaseFullscreen = isGeneralManager && activeView === 'Database'
  const isPatientFormFullscreen = isOptometrist && activeView === 'Patient Form'
  const isChromeHiddenView = isDatabaseFullscreen || isPatientFormFullscreen
  const heroWallpaper = companyProfileForm.loginWallpaperPreview || companyProfileForm.login_wallpaper_url || ''

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('opticplus-theme', theme)
  }, [theme])

  function openPaymentModal(billingId, originView = activeView) {
    setSelectedPaymentRecordId(billingId)
    setPaymentModalOriginView(originView)
    if (originView !== 'Finance') {
      setActiveView('Finance')
    }
  }

  function closePaymentModal() {
    const originView = paymentModalOriginView
    setSelectedPaymentRecordId(null)
    setPaymentModalOriginView(null)
    if (originView && originView !== 'Finance') {
      setActiveView(originView)
    }
  }

  function buildInventoryParams(branchId) {
    const params = new URLSearchParams({
      branch_id: String(branchId),
      page: String(inventoryQuery.page),
      per_page: String(inventoryQuery.per_page),
    })

    if (inventoryQuery.search) params.set('search', inventoryQuery.search)
    if (inventoryQuery.category && inventoryQuery.category !== 'all') params.set('category', inventoryQuery.category)
    if (inventoryQuery.date_from) params.set('date_from', inventoryQuery.date_from)
    if (inventoryQuery.date_to) params.set('date_to', inventoryQuery.date_to)
    if (inventoryQuery.as_of_at) params.set('as_of_at', inventoryQuery.as_of_at)

    return params
  }

  function buildReceiptPreview(receipt, billing = null) {
    const branchName = financePayments?.branch_name || session?.branch_name || 'Active branch'
    const amountPaid = Number(receipt?.amount_paid ?? 0)
    const totalAmount = Number(billing?.total_amount ?? receipt?.total_amount ?? 0)
    const balance = Number(billing?.calculated_balance ?? billing?.balance ?? receipt?.balance ?? 0)
    const nhilAmount = Number(billing?.nhil_amount ?? receipt?.nhil_amount ?? 0)
    const getfundAmount = Number(billing?.getfund_amount ?? receipt?.getfund_amount ?? 0)
    const vatAmount = Number(billing?.vat_amount ?? receipt?.vat_amount ?? 0)
    const taxTotal = nhilAmount + getfundAmount + vatAmount

    return {
      id: receipt?.id ?? billing?.id ?? 'receipt',
      branch_name: branchName,
      patient_name: receipt?.name || billing?.name || 'N/A',
      folder_id: receipt?.folder_id || billing?.folder_id || 'N/A',
      billing_id: receipt?.billing_id || billing?.id || 'N/A',
      receipt_number: receipt?.receipt_number || billing?.receipt_number || 'Pending',
      payment_date: receipt?.date || billing?.date || 'N/A',
      payment_method: receipt?.payment_method || 'Cash',
      amount_paid: amountPaid,
      total_amount: totalAmount,
      outstanding_balance: balance,
      reference: receipt?.reference || receipt?.transaction_id || 'N/A',
      transaction_id: receipt?.transaction_id || '',
      description: receipt?.description || '',
      company_name: companyProfileForm.company_name,
      company_email: companyProfileForm.company_email,
      company_phone_primary: companyProfileForm.company_phone_primary,
      company_phone_secondary: companyProfileForm.company_phone_secondary,
      company_tagline: companyProfileForm.tagline,
      branch_address:
        String(branchName).toLowerCase().includes('madina')
          ? companyProfileForm.madina_address
          : companyProfileForm.labadi_address,
      tax_total: taxTotal,
      tax_breakdown: [
        ['VAT (15%)', vatAmount],
        ['NHIL (2.5%)', nhilAmount],
        ['GETFund (2.5%)', getfundAmount],
      ].filter(([, amount]) => Number(amount) > 0),
      printed_at: new Date().toLocaleString(),
    }
  }

  function openReceiptPreview(receipt, billing = null) {
    const billingSnapshot = billing ?? (
      receipt && (
        receipt.total_amount !== undefined
        || receipt.balance !== undefined
        || receipt.calculated_balance !== undefined
      )
        ? receipt
        : null
    )

    setReceiptPreview(buildReceiptPreview(receipt, billingSnapshot))
  }

  function printThermalReceipt(receiptData, receiptWindow = null) {
    const targetWindow = receiptWindow ?? window.open('', '_blank', 'width=420,height=900')
    if (targetWindow && !targetWindow.closed) {
      targetWindow.document.open()
    }
    if (!targetWindow) {
      setFinanceError('Unable to open the print window. Please allow popups and try again.')
      return
    }

    const safe = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    const amount = currency.format(Number(receiptData?.amount_paid ?? 0))
    const total = currency.format(Number(receiptData?.total_amount ?? 0))
    const balance = currency.format(Number(receiptData?.outstanding_balance ?? 0))
    const taxRows = (receiptData?.tax_breakdown ?? [])
      .map(([label, value]) => `<div class="row"><span>${safe(label)}</span><strong>${safe(currency.format(Number(value ?? 0)))}</strong></div>`)
      .join('')
    const taxTotal = currency.format(Number(receiptData?.tax_total ?? 0))

    targetWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Thermal Receipt ${safe(receiptData?.receipt_number || receiptData?.id)}</title>
          <style>
            :root { color-scheme: light; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              background: #eef2f7;
              color: #111827;
              font-family: "Segoe UI", Arial, sans-serif;
            }
            .page {
              min-height: 100vh;
              display: grid;
              place-items: center;
              padding: 24px 12px;
            }
            .thermal {
              width: 302px;
              background: #fff;
              color: #111827;
              border: 1px solid #d1d5db;
              box-shadow: 0 20px 45px rgba(15, 23, 42, 0.18);
              padding: 18px 16px 22px;
            }
            .brand,
            .center {
              text-align: center;
            }
            .brand h1 {
              margin: 0;
              font-size: 18px;
              letter-spacing: 0.08em;
              text-transform: uppercase;
            }
            .brand p,
            .meta,
            .footnote {
              margin: 6px 0 0;
              color: #000000;
              font-size: 11px;
              font-weight: 700;
              line-height: 1.5;
            }
            .divider {
              margin: 14px 0;
              border-top: 1px dashed #9ca3af;
            }
            .kicker {
              font-size: 10px;
              letter-spacing: 0.14em;
              text-transform: uppercase;
              color: #000000;
              font-weight: 700;
            }
            .amount {
              margin: 8px 0 2px;
              font-size: 28px;
              font-weight: 700;
              letter-spacing: -0.03em;
            }
            .summary {
              display: grid;
              gap: 8px;
              margin-top: 14px;
            }
            .row {
              display: flex;
              justify-content: space-between;
              gap: 16px;
              align-items: flex-start;
              font-size: 12px;
              color: #000000;
            }
            .row span:first-child {
              color: #000000;
              font-weight: 700;
            }
            .row strong {
              font-weight: 700;
              color: #000000;
              text-align: right;
            }
            .total-row {
              padding-top: 8px;
              border-top: 1px dashed #9ca3af;
            }
            .meta-grid {
              display: grid;
              gap: 7px;
              margin-top: 14px;
            }
            .meta-grid .row {
              font-size: 11px;
            }
            .tax-box {
              display: grid;
              gap: 7px;
              margin-top: 14px;
              padding: 10px 12px;
              border: 1px dashed #9ca3af;
              background: #f9fafb;
              color: #000000;
            }
            .tax-box .kicker {
              margin-bottom: 2px;
            }
            .status {
              margin-top: 12px;
              padding: 8px 10px;
              background: #f3f4f6;
              border: 1px solid #e5e7eb;
              font-size: 11px;
              color: #000000;
              font-weight: 700;
              text-align: center;
              letter-spacing: 0.08em;
              text-transform: uppercase;
            }
            .footnote {
              text-align: center;
              margin-top: 14px;
            }
            @media print {
              :root { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              body { background: #fff; }
              .page { padding: 0; }
              .thermal {
                width: 80mm;
                border: none;
                box-shadow: none;
              }
              .brand p,
              .meta,
              .footnote,
              .row,
              .row span:first-child,
              .row strong,
              .kicker,
              .tax-box,
              .status {
                color: #000000 !important;
                font-weight: 700 !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <section class="thermal">
              <div class="brand">
                <h1>${safe(receiptData?.company_name || 'Bealet Optical Center')}</h1>
                <p>${safe(receiptData?.branch_name)}</p>
                <p>${safe(receiptData?.branch_address || '')}</p>
                <p>${safe(receiptData?.company_tagline || 'Professional Eye Care and Optical Services')}</p>
              </div>
              <div class="divider"></div>
              <div class="center">
                <div class="kicker">Thermal Receipt</div>
                <div class="amount">${safe(amount)}</div>
                <div class="meta">${safe(receiptData?.payment_method)} payment</div>
              </div>
              <div class="summary">
                <div class="row"><span>Total bill</span><strong>${safe(total)}</strong></div>
                <div class="row"><span>Amount paid</span><strong>${safe(amount)}</strong></div>
                <div class="row total-row"><span>Balance after payment</span><strong>${safe(balance)}</strong></div>
              </div>
              <div class="divider"></div>
              <div class="meta-grid">
                <div class="row"><span>Patient</span><strong>${safe(receiptData?.patient_name)}</strong></div>
                <div class="row"><span>Folder ID</span><strong>${safe(receiptData?.folder_id)}</strong></div>
                <div class="row"><span>Billing ID</span><strong>${safe(receiptData?.billing_id)}</strong></div>
                <div class="row"><span>Receipt No.</span><strong>${safe(receiptData?.receipt_number)}</strong></div>
                <div class="row"><span>Date</span><strong>${safe(receiptData?.payment_date)}</strong></div>
                <div class="row"><span>Reference</span><strong>${safe(receiptData?.reference)}</strong></div>
                <div class="row"><span>Printed</span><strong>${safe(receiptData?.printed_at)}</strong></div>
              </div>
              ${receiptData?.tax_breakdown?.length ? `
                <div class="tax-box">
                  <div class="kicker">Tax Breakdown</div>
                  ${taxRows}
                  <div class="row total-row"><span>Total tax</span><strong>${safe(taxTotal)}</strong></div>
                </div>
              ` : ''}
              <div class="status">Thank you for your payment</div>
              <div class="footnote">
                ${safe(receiptData?.company_phone_primary || '')}${receiptData?.company_phone_secondary ? ` | ${safe(receiptData.company_phone_secondary)}` : ''}<br />
                ${safe(receiptData?.company_email || '')}<br />
                Keep this slip for verification and future reprints.<br />
                Generated from the OPTICPLUS finance desk.<br />
                Designed and Developed by Dale Quist (Enable Technologies)
              </div>
            </section>
          </div>
        </body>
      </html>
    `)
    targetWindow.document.close()
    targetWindow.focus()
    targetWindow.print()
  }

  function openPendingReceiptWindow(message = 'Your receipt will print automatically after the payment is saved.') {
    const receiptWindow = window.open('', '_blank', 'width=420,height=900')
    if (!receiptWindow) return null

    receiptWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Preparing receipt...</title>
          <style>
            body {
              margin: 0;
              font-family: "Segoe UI", Arial, sans-serif;
              background: #f3f4f6;
              color: #111827;
              display: grid;
              place-items: center;
              min-height: 100vh;
            }
            .shell {
              width: min(320px, calc(100vw - 32px));
              background: #fff;
              border: 1px solid #d1d5db;
              padding: 24px 20px;
              text-align: center;
              box-shadow: 0 16px 34px rgba(15, 23, 42, 0.12);
            }
            strong {
              display: block;
              margin-bottom: 8px;
              font-size: 16px;
            }
            p {
              margin: 0;
              font-size: 13px;
              color: #000000;
              font-weight: 700;
            }
          </style>
        </head>
        <body>
          <div class="shell">
            <strong>Preparing thermal receipt</strong>
            <p>${message}</p>
          </div>
        </body>
      </html>
    `)
    receiptWindow.document.close()

    return receiptWindow
  }

  function findLatestReceiptEntry(detailResponse, paymentMethod, matcher = null) {
    return (detailResponse?.recent_transactions ?? []).find((transaction) => {
      if (paymentMethod === 'Insurance') {
        return transaction.entry_type === 'claim' && (!matcher || matcher(transaction))
      }

      return transaction.entry_type === 'payment'
        && transaction.payment_method === paymentMethod
        && (!matcher || matcher(transaction))
    })
  }

  function buildReceiptPayloadFromDetail(detailResponse, transaction) {
    if (!detailResponse?.billing || !transaction) return null

    return buildReceiptPreview(
      {
        ...transaction,
        name: detailResponse.billing.name,
        folder_id: detailResponse.billing.folder_id,
        billing_id: detailResponse.billing.id,
        receipt_number: detailResponse.billing.receipt_number,
        total_amount: detailResponse.billing.total_amount,
        balance: detailResponse.billing.calculated_balance,
      },
      detailResponse.billing,
    )
  }

  function buildCombinedReceiptPayload(detailResponse, payments) {
    if (!detailResponse?.billing || !Array.isArray(payments) || payments.length === 0) return null

    const totalAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const methodLabel = payments.map((payment) => payment.payment_method).join(' + ')
    const referenceLabel = payments
      .map((payment) => payment.reference || payment.transaction_id || payment.insurance_number || '')
      .filter(Boolean)
      .join(' | ')

    return buildReceiptPreview(
      {
        id: `split-${detailResponse.billing.id}-${Date.now()}`,
        name: detailResponse.billing.name,
        folder_id: detailResponse.billing.folder_id,
        billing_id: detailResponse.billing.id,
        receipt_number: detailResponse.billing.receipt_number,
        date: payments[payments.length - 1]?.date || detailResponse.billing.date,
        payment_method: methodLabel,
        amount_paid: totalAmount,
        reference: referenceLabel || 'Multiple payment entries',
        description: payments
          .map((payment) => `${payment.payment_method}: ${currency.format(Number(payment.amount || 0))}`)
          .join(' | '),
      },
      detailResponse.billing,
    )
  }

  useEffect(() => {
    const syncFromHash = () => setActiveView(hashToView(window.location.hash || '#/dashboard'))
    window.addEventListener('hashchange', syncFromHash)

    return () => {
      window.removeEventListener('hashchange', syncFromHash)
    }
  }, [])

  useEffect(() => {
    if (activeView !== 'Sales') return
    const today = todayIso()
    const hasDateRange = Boolean(financeSalesFilters.date_from || financeSalesFilters.date_to)
    if (hasDateRange) return

    setFinanceSalesFilters((current) => ({
      ...current,
      date_from: today,
      date_to: today,
      page: 1,
    }))
    setFinanceSalesQuery((current) => ({
      ...current,
      date_from: today,
      date_to: today,
      page: 1,
    }))
  }, [activeView, financeSalesFilters.date_from, financeSalesFilters.date_to])

  useEffect(() => {
    const nextHash = viewHashMap[activeView] ?? '#/dashboard'
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash
    }
    document.title = `OPTICPLUS | ${activeView}`
  }, [activeView])

  useEffect(() => {
    localStorage.setItem('opticplus-branch', String(selectedBranchId))
  }, [selectedBranchId])

  useEffect(() => {
    if (!shouldResetSavedSession()) return

    const url = new URL(window.location.href)
    url.searchParams.delete('reset')
    window.history.replaceState({}, '', url.toString())
  }, [])

  useEffect(() => {
    if (token) localStorage.setItem('opticplus-token', token)
    else localStorage.removeItem('opticplus-token')
  }, [token])

  useEffect(() => {
    let cancelled = false

    async function bootstrapSession() {
      if (!token) {
        setIsBooting(false)
        return
      }

      try {
        const response = await apiFetch('/me', { token })
        if (!cancelled) setSession(response.user)
      } catch {
        if (!cancelled) {
          setToken('')
          setSession(null)
        }
      } finally {
        if (!cancelled) setIsBooting(false)
      }
    }

    bootstrapSession()
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      if (!token || !session) {
        setDashboard(null)
        return
      }

      setIsLoadingDashboard(true)
      try {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const response = await apiFetch(`/dashboard?branch_id=${branchId}`, { token })
        if (!cancelled) setDashboard(response)
      } catch (error) {
        if (!cancelled) setLoginError(error.message)
      } finally {
        if (!cancelled) setIsLoadingDashboard(false)
      }
    }

    loadDashboard()
    return () => {
      cancelled = true
    }
  }, [selectedBranchId, session, token])

  useEffect(() => {
    let cancelled = false

    async function loadCompanyProfile() {
      try {
        const response = await apiFetch('/company-profile')
        if (!cancelled) {
          setCompanyProfileForm({
            ...defaultCompanyProfile(),
            ...(response.profile ?? {}),
          })
        }
      } catch {
        if (!cancelled) {
          setCompanyProfileForm(defaultCompanyProfile())
        }
      }
    }

    loadCompanyProfile()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!session) return
    const defaults = defaultPatientFilters(Boolean(session?.is_admin || ['manager', 'ceo'].includes(session?.role)))
    setPatientFilters(defaults)
    setPatientQuery(defaults)
    setPatientData(null)
    setPatientMeta(null)
    setPatientError('')
    setPatientSuccess('')
    setPatientLookupSearch('')
    setPatientLookupResults([])
    setBillingData(null)
    setBillingMeta(null)
    setBillingPatientSearch('')
    setBillingPatientResults([])
    setDailyPayments(null)
    setBillingError('')
    setBillingSuccess('')
    setFinanceSummary(null)
    setFinanceSales(null)
    setFinanceExpenses(null)
    setFinancePayments(null)
    setFinanceError('')
    setFinanceSuccess('')
    setInventoryData(null)
    setInventoryLensData(null)
    setInventoryBsmiData(null)
    setInventoryFilters(defaultInventoryFilters())
    setInventoryQuery(defaultInventoryFilters())
    setInventoryForm(defaultInventoryProductForm())
    setLensTrackerFilters(defaultLensTrackerFilters())
    setLensTrackerQuery(defaultLensTrackerFilters())
    setInventoryError('')
    setInventorySuccess('')
    setCustomerServiceData(null)
    setCustomerServiceFilters(defaultCustomerServiceFilters())
    setCustomerServiceQuery(defaultCustomerServiceFilters())
    setMessageForm(defaultMessageForm())
    setTemplateForm(defaultTemplateForm())
    setCustomerServiceError('')
    setCustomerServiceSuccess('')
    setFinanceSalesFilters(defaultFinanceSalesFilters())
    setFinanceSalesQuery(defaultFinanceSalesFilters())
    setFinanceExpenseFilters(defaultFinanceExpenseFilters())
    setFinanceExpenseQuery(defaultFinanceExpenseFilters())
    setFinancePaymentFilters(defaultFinancePaymentFilters())
    setFinancePaymentQuery(defaultFinancePaymentFilters())
    setExpenseForm(defaultExpenseForm())
    setSelectedPaymentRecordId(null)
    setPaymentModalOriginView(null)
    setPaymentDetail(null)
    setPaymentForm(defaultPaymentForm())
    setIsSplitPaymentEnabled(false)
    setSecondaryPaymentForm(defaultPaymentForm())
    setInsuranceMeta(null)
    setInsuranceData(null)
    setInsuranceFilters(defaultInsuranceFilters())
    setInsuranceQuery(defaultInsuranceFilters())
    setInsuranceForm(defaultInsuranceForm())
    setInsuranceError('')
    setInsuranceSuccess('')
    setSettingsProfileForm(defaultSettingsProfileForm(session))
    setSettingsPasswordForm(defaultSettingsPasswordForm())
    setSettingsError('')
    setSettingsSuccess('')
  }, [selectedBranchId, session?.branch_id, session?.id, session?.is_admin, session?.role])

  useEffect(() => {
    if (!session || activeView !== 'Patient Management') return

    const defaults = patientFiltersForView({
      activeView,
      role: session?.role,
      isAdmin: session?.is_admin,
    })

    setPatientFilters(defaults)
    setPatientQuery(defaults)
    setPatientError('')
  }, [activeView, session?.id, session?.is_admin, session?.role])

  useEffect(() => {
    const firstCategory = financeExpenses?.categories?.[0] ?? ''
    if (!firstCategory) return

    setExpenseForm((current) => (
      current.category
        ? current
        : { ...current, category: firstCategory }
    ))
  }, [financeExpenses?.categories])

  useEffect(() => {
    let cancelled = false

    async function loadPatientMeta() {
      const metaViews = ['Patients', ...optometristPatientViews, 'Medical Report']
      const needsMeta =
        metaViews.includes(activeView) || (activeView === 'Dashboard' && session?.role === 'receptionist')
      if (!token || !session || !needsMeta) return
      try {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const response = await apiFetch(`/patients/meta?branch_id=${branchId}`, { token })
        if (!cancelled) setPatientMeta(response)
      } catch (error) {
        if (!cancelled) setPatientError(error.message)
      }
    }

    loadPatientMeta()
    return () => {
      cancelled = true
    }
  }, [activeView, selectedBranchId, session, token])

  useEffect(() => {
    let cancelled = false

    async function loadPatients() {
      const patientEnabledViews = ['Patients', ...optometristPatientViews, ...(isOptometrist ? ['Dashboard', 'Appointments', ...optometristClinicalViews] : [])]
      if (!token || !session || !patientEnabledViews.includes(activeView)) return

      setIsLoadingPatients(true)
      setPatientError('')

      try {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const params = new URLSearchParams({
          branch_id: String(branchId),
          page: String(patientQuery.page),
          per_page: String(patientQuery.per_page),
        })

        for (const [key, value] of Object.entries(patientQuery)) {
          if (!value || key === 'page' || key === 'per_page') continue
          params.set(key, value)
        }

        const response = await apiFetch(`/patients?${params.toString()}`, { token })

        if (!cancelled) {
          setPatientData(response)
          mergeRowAssignments(response.records)
        }
      } catch (error) {
        if (!cancelled) setPatientError(error.message)
      } finally {
        if (!cancelled) setIsLoadingPatients(false)
      }
    }

    loadPatients()
    return () => {
      cancelled = true
    }
  }, [activeView, isOptometrist, patientQuery, selectedBranchId, session, token])

  useEffect(() => {
    if (!['Patients', ...optometristPatientViews, 'Medical Report'].includes(activeView)) return undefined
    if (!token || !session) return undefined

    const search = patientLookupSearch.trim()
    if (search.length < 2) {
      setPatientLookupResults([])
      setIsSearchingPatientLookup(false)
      return undefined
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      setIsSearchingPatientLookup(true)

      try {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const params = new URLSearchParams({
          branch_id: String(branchId),
          search,
        })
        const response = await apiFetch(`/patients/lookup?${params.toString()}`, { token })

        if (!cancelled) {
          setPatientLookupResults(response.records ?? [])
          mergeRowAssignments(response.records ?? [])
        }
      } catch (error) {
        if (!cancelled) {
          setPatientLookupResults([])
          setPatientError(error.message)
        }
      } finally {
        if (!cancelled) setIsSearchingPatientLookup(false)
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [activeView, patientLookupSearch, selectedBranchId, session, token])

  useEffect(() => {
    if (activeView !== 'Patient Management') return undefined

    const timeoutId = window.setTimeout(() => {
      setPatientQuery((current) => {
        if (current.search === patientFilters.search && current.page === 1) {
          return current
        }

        return {
          ...current,
          search: patientFilters.search,
          page: 1,
        }
      })
    }, 250)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [activeView, patientFilters.search])

  useEffect(() => {
    let cancelled = false

    async function loadBillingMeta() {
      if (!token || !session || activeView !== 'Billing') return
      setIsLoadingBillingMeta(true)
      try {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const response = await apiFetch(`/billing/meta?branch_id=${branchId}`, { token })
        if (!cancelled) {
          setBillingMeta(response)
          setBillingForm((current) => ({
            ...current,
            consultation_customer_type: current.consultation_customer_type || 'new',
            consultation_price: String(response.standard_prices.consultation_price.toFixed(2)),
            frame_price: String(response.standard_prices.frame_price.toFixed(2)),
            lens_price: String(response.standard_prices.lens_price.toFixed(2)),
            case_price: String(response.standard_prices.case_price.toFixed(2)),
          }))
        }
      } catch (error) {
        if (!cancelled) setBillingError(error.message)
      } finally {
        if (!cancelled) setIsLoadingBillingMeta(false)
      }
    }

    loadBillingMeta()
    return () => {
      cancelled = true
    }
  }, [activeView, selectedBranchId, session, token])

  useEffect(() => {
    let cancelled = false

    async function loadBillingData() {
      if (!token || !session || activeView !== 'Billing') return
      setIsLoadingBilling(true)
      try {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const params = new URLSearchParams({
          branch_id: String(branchId),
          page: String(billingQuery.page),
          per_page: String(billingQuery.per_page),
        })
        for (const [key, value] of Object.entries(billingQuery)) {
          if (!value || key === 'page' || key === 'per_page') continue
          params.set(key, value)
        }
        const response = await apiFetch(`/billing?${params.toString()}`, { token })
        if (!cancelled) setBillingData(response)
      } catch (error) {
        if (!cancelled) setBillingError(error.message)
      } finally {
        if (!cancelled) setIsLoadingBilling(false)
      }
    }

    loadBillingData()
    return () => {
      cancelled = true
    }
  }, [activeView, billingQuery, selectedBranchId, session, token])

  useEffect(() => {
    if (activeView !== 'Billing') return undefined

    const timeoutId = window.setTimeout(() => {
      setBillingQuery((current) => {
        if (current.search === billingFilters.search && current.page === 1) {
          return current
        }

        return {
          ...current,
          search: billingFilters.search,
          page: 1,
        }
      })
    }, 250)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [activeView, billingFilters.search])

  useEffect(() => {
    if (activeView !== 'Billing') return undefined
    if (!token || !session) return undefined

    const search = billingPatientSearch.trim()
    if (search.length < 1) {
      setBillingPatientResults([])
      setIsSearchingBillingPatients(false)
      return undefined
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      setIsSearchingBillingPatients(true)

      try {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const params = new URLSearchParams({
          branch_id: String(branchId),
          search,
        })
        const response = await apiFetch(`/billing/patient-search?${params.toString()}`, { token })
        if (!cancelled) {
          setBillingPatientResults(response.patient_candidates ?? [])
        }
      } catch (error) {
        if (!cancelled) {
          setBillingPatientResults([])
          setBillingError(error.message)
        }
      } finally {
        if (!cancelled) setIsSearchingBillingPatients(false)
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [activeView, billingPatientSearch, selectedBranchId, session, token])

  useEffect(() => {
    let cancelled = false

    async function loadDailyPayments() {
      if (!token || !session || activeView !== 'Billing') return
      setIsLoadingPayments(true)
      try {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const params = new URLSearchParams({
          branch_id: String(branchId),
          date: todayIso(),
        })
        if (dailyPaymentSearch) params.set('search', dailyPaymentSearch)
        const response = await apiFetch(`/billing/daily-payments?${params.toString()}`, { token })
        if (!cancelled) setDailyPayments(response)
      } catch (error) {
        if (!cancelled) setBillingError(error.message)
      } finally {
        if (!cancelled) setIsLoadingPayments(false)
      }
    }

    loadDailyPayments()
    return () => {
      cancelled = true
    }
  }, [activeView, dailyPaymentSearch, selectedBranchId, session, token])

  useEffect(() => {
    let cancelled = false

    async function loadFinanceSummary() {
      if (!token || !session || (!financeViews.includes(activeView) && !executiveDashboardActive)) return
      setIsLoadingFinanceSummary(true)
      setFinanceError('')
      try {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const response = await apiFetch(`/finance/summary?branch_id=${branchId}`, { token })
        if (!cancelled) setFinanceSummary(response)
      } catch (error) {
        if (!cancelled) setFinanceError(error.message)
      } finally {
        if (!cancelled) setIsLoadingFinanceSummary(false)
      }
    }

    loadFinanceSummary()
    return () => {
      cancelled = true
    }
  }, [activeView, executiveDashboardActive, selectedBranchId, session, token])

  useEffect(() => {
    let cancelled = false

    async function loadFinanceSales() {
      if (!token || !session || (!financeViews.includes(activeView) && !executiveDashboardActive)) return
      setIsLoadingFinanceSales(true)
      setFinanceError('')
      try {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const params = new URLSearchParams({
          branch_id: String(branchId),
          page: String(financeSalesQuery.page),
          per_page: String(financeSalesQuery.per_page),
        })
        for (const [key, value] of Object.entries(financeSalesQuery)) {
          if (!value || value === 'all' || key === 'page' || key === 'per_page') continue
          params.set(key, value)
        }
        const response = await apiFetch(`/finance/sales?${params.toString()}`, { token })
        if (!cancelled) setFinanceSales(response)
      } catch (error) {
        if (!cancelled) setFinanceError(error.message)
      } finally {
        if (!cancelled) setIsLoadingFinanceSales(false)
      }
    }

    loadFinanceSales()
    return () => {
      cancelled = true
    }
  }, [activeView, executiveDashboardActive, financeSalesQuery, selectedBranchId, session, token])

  useEffect(() => {
    let cancelled = false

    async function loadFinanceExpenses() {
      if (!token || !session || (!financeViews.includes(activeView) && !executiveDashboardActive)) return
      setIsLoadingFinanceExpenses(true)
      setFinanceError('')
      try {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const receptionistTodayOnly = session.role === 'receptionist' && activeView === 'Expenses'
        const today = new Date().toISOString().slice(0, 10)
        const params = new URLSearchParams({
          branch_id: String(branchId),
        })
        const effectiveExpenseQuery = receptionistTodayOnly
          ? {
              ...financeExpenseQuery,
              start_date: today,
              end_date: today,
              search: '',
              category: 'all',
              page: 1,
            }
          : financeExpenseQuery
        for (const [key, value] of Object.entries(effectiveExpenseQuery)) {
          if ((value === '' || value == null) || value === 'all') continue
          params.set(key, value)
        }
        const response = await apiFetch(`/finance/expenses?${params.toString()}`, { token })
        if (!cancelled) setFinanceExpenses(response)
      } catch (error) {
        if (!cancelled) setFinanceError(error.message)
      } finally {
        if (!cancelled) setIsLoadingFinanceExpenses(false)
      }
    }

    loadFinanceExpenses()
    return () => {
      cancelled = true
    }
  }, [activeView, executiveDashboardActive, financeExpenseQuery, selectedBranchId, session, token])

  useEffect(() => {
    let cancelled = false

    async function loadFinancePayments() {
      if (!token || !session || (!financeViews.includes(activeView) && !executiveDashboardActive)) return
      setIsLoadingFinancePayments(true)
      setFinanceError('')
      try {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const params = new URLSearchParams({
          branch_id: String(branchId),
          page: String(financePaymentQuery.page),
          per_page: String(financePaymentQuery.per_page),
          receipt_page: String(financePaymentQuery.receipt_page),
          receipt_per_page: String(financePaymentQuery.receipt_per_page),
        })
        if (financePaymentQuery.date_from) params.set('date_from', financePaymentQuery.date_from)
        if (financePaymentQuery.date_to) params.set('date_to', financePaymentQuery.date_to)
        if (financePaymentQuery.search) params.set('search', financePaymentQuery.search)
        if (financePaymentQuery.receipt_search) params.set('receipt_search', financePaymentQuery.receipt_search)
        const response = await apiFetch(`/finance/payments?${params.toString()}`, { token })
        if (!cancelled) setFinancePayments(response)
      } catch (error) {
        if (!cancelled) setFinanceError(error.message)
      } finally {
        if (!cancelled) setIsLoadingFinancePayments(false)
      }
    }

    loadFinancePayments()
    return () => {
      cancelled = true
    }
  }, [activeView, executiveDashboardActive, financePaymentQuery, selectedBranchId, session, token])

  useEffect(() => {
    let cancelled = false

    async function loadInsuranceMeta() {
      if (!token || !session || (![...insuranceViews, ...financeViews].includes(activeView) && !executiveDashboardActive)) return
      setIsLoadingInsuranceMeta(true)
      try {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const response = await apiFetch(`/insurance/meta?branch_id=${branchId}`, { token })
        if (!cancelled) setInsuranceMeta(response)
      } catch (error) {
        if (!cancelled) setInsuranceError(error.message)
      } finally {
        if (!cancelled) setIsLoadingInsuranceMeta(false)
      }
    }

    loadInsuranceMeta()
    return () => {
      cancelled = true
    }
  }, [activeView, executiveDashboardActive, selectedBranchId, session, token])

  useEffect(() => {
    let cancelled = false

    async function loadInventory() {
      if (!token || !session || !inventoryViews.includes(activeView)) return
      setIsLoadingInventory(true)
      setInventoryError('')
      try {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const params = buildInventoryParams(branchId)
        const response = await apiFetch(`/inventory?${params.toString()}`, { token })
        if (!cancelled) setInventoryData(response)
      } catch (error) {
        if (!cancelled) setInventoryError(error.message)
      } finally {
        if (!cancelled) setIsLoadingInventory(false)
      }
    }

    loadInventory()
    return () => {
      cancelled = true
    }
  }, [activeView, inventoryQuery, selectedBranchId, session, token])

  useEffect(() => {
    let cancelled = false

    async function loadLensTracker() {
      if (!token || !session || !inventoryViews.includes(activeView)) return
      setIsLoadingLensTracker(true)
      setInventoryError('')
      try {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const params = new URLSearchParams({
          branch_id: String(branchId),
          date_from: lensTrackerQuery.date_from,
          date_to: lensTrackerQuery.date_to,
        })
        if (lensTrackerQuery.search) params.set('search', lensTrackerQuery.search)
        if (lensTrackerQuery.tracking && lensTrackerQuery.tracking !== 'all') params.set('tracking', lensTrackerQuery.tracking)
        const endpoint = activeView === 'BSMI Tracking' ? '/inventory/bsmi-tracker' : '/inventory/lens-tracker'
        const response = await apiFetch(`${endpoint}?${params.toString()}`, { token })
        if (!cancelled) {
          if (activeView === 'BSMI Tracking') {
            setInventoryBsmiData(response)
          } else {
            setInventoryLensData(response)
          }
        }
      } catch (error) {
        if (!cancelled) setInventoryError(error.message)
      } finally {
        if (!cancelled) setIsLoadingLensTracker(false)
      }
    }

    loadLensTracker()
    return () => {
      cancelled = true
    }
  }, [activeView, lensTrackerQuery, selectedBranchId, session, token])

  useEffect(() => {
    if (!inventoryViews.includes(activeView) && activeView !== 'Lens Tracker' && activeView !== 'BSMI Tracking') {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setLensTrackerQuery((current) => {
        const nextQuery = {
          ...current,
          ...lensTrackerFilters,
        }

        if (
          current.date_from === nextQuery.date_from &&
          current.date_to === nextQuery.date_to &&
          current.search === nextQuery.search &&
          current.tracking === nextQuery.tracking
        ) {
          return current
        }

        return nextQuery
      })
    }, lensTrackerFilters.search ? 250 : 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [activeView, lensTrackerFilters])

  useEffect(() => {
    let cancelled = false

    async function loadCustomerService() {
      if (!token || !session || activeView !== 'Customer Service') return
      setIsLoadingCustomerService(true)
      setCustomerServiceError('')
      try {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const params = new URLSearchParams({
          branch_id: String(branchId),
          page: String(customerServiceQuery.page),
          per_page: String(customerServiceQuery.per_page),
        })
        for (const [key, value] of Object.entries(customerServiceQuery)) {
          if (!value || value === 'all' || key === 'page' || key === 'per_page') continue
          params.set(key, value)
        }
        const response = await apiFetch(`/customer-service?${params.toString()}`, { token })
        if (!cancelled) setCustomerServiceData(response)
      } catch (error) {
        if (!cancelled) setCustomerServiceError(error.message)
      } finally {
        if (!cancelled) setIsLoadingCustomerService(false)
      }
    }

    loadCustomerService()
    return () => {
      cancelled = true
    }
  }, [activeView, customerServiceQuery, selectedBranchId, session, token])

  useEffect(() => {
    let cancelled = false

    async function loadInsuranceData() {
      if (!token || !session || (!insuranceViews.includes(activeView) && !executiveDashboardActive)) return
      setIsLoadingInsuranceData(true)
      setInsuranceError('')
      try {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const params = new URLSearchParams({
          branch_id: String(branchId),
          page: String(insuranceQuery.page),
          per_page: String(insuranceQuery.per_page),
        })
        for (const [key, value] of Object.entries(insuranceQuery)) {
          if (!value || value === 'all' || key === 'page' || key === 'per_page') continue
          params.set(key, value)
        }
        const response = await apiFetch(`/insurance/claims?${params.toString()}`, { token })
        if (!cancelled) setInsuranceData(response)
      } catch (error) {
        if (!cancelled) setInsuranceError(error.message)
      } finally {
        if (!cancelled) setIsLoadingInsuranceData(false)
      }
    }

    loadInsuranceData()
    return () => {
      cancelled = true
    }
  }, [activeView, executiveDashboardActive, insuranceQuery, selectedBranchId, session, token])

  useEffect(() => {
    let cancelled = false

    async function loadPaymentDetail() {
      if (!token || !session || !paymentDetailViews.includes(activeView) || !selectedPaymentRecordId) {
        if (!selectedPaymentRecordId) setPaymentDetail(null)
        return
      }

      const branchId = session.is_admin ? selectedBranchId : session.branch_id
      setIsLoadingPaymentDetail(true)
      setPaymentDetail(null)
      try {
        const response = await apiFetch(`/finance/payments/${selectedPaymentRecordId}?branch_id=${branchId}`, { token })
        if (!cancelled) {
          setPaymentDetail(response)
          setPaymentForm((current) => ({
            ...current,
            amount: Number(response.billing.calculated_balance ?? 0).toFixed(2),
            customer_email: current.customer_email || response.billing.email || '',
            insurance_provider:
              current.insurance_provider || response.billing.health_insurance || '',
            description: current.description || '',
          }))
          setSecondaryPaymentForm((current) => ({
            ...current,
            date: current.date || response.billing.date || todayIso(),
            customer_email: current.customer_email || response.billing.email || '',
            insurance_provider:
              current.insurance_provider || response.billing.health_insurance || '',
          }))
        }
      } catch (error) {
        if (!cancelled) {
          setPaymentDetail(null)
          setFinanceError(error.message)
        }
      } finally {
        if (!cancelled) setIsLoadingPaymentDetail(false)
      }
    }

    loadPaymentDetail()
    return () => {
      cancelled = true
    }
  }, [activeView, selectedBranchId, selectedPaymentRecordId, session, token])

  useEffect(() => {
    if (activeView !== 'Finance') return

    const timer = window.setTimeout(() => {
      setFinancePaymentQuery((current) => {
        if (
          current.date_from === financePaymentFilters.date_from &&
          current.date_to === financePaymentFilters.date_to &&
          current.search === financePaymentFilters.search &&
          current.receipt_search === financePaymentFilters.receipt_search
        ) {
          return current
        }

        return {
          ...current,
          ...financePaymentFilters,
          page: 1,
          receipt_page: 1,
        }
      })
    }, financePaymentFilters.search ? 180 : 0)

    return () => window.clearTimeout(timer)
  }, [activeView, financePaymentFilters])

  useEffect(() => {
    if (!paymentDetail?.billing) return

    setPaymentForm((current) => {
      if (current.payment_method !== 'Insurance') {
        return current
      }

      const nextInsuranceProvider =
        current.insurance_provider || paymentDetail.billing.health_insurance || ''

      if (current.insurance_provider === nextInsuranceProvider) {
        return current
      }

      return {
        ...current,
        insurance_provider: nextInsuranceProvider,
      }
    })
  }, [paymentDetail])

  useEffect(() => {
    if (!paymentDetail?.billing) return

    setSecondaryPaymentForm((current) => {
      if (current.payment_method !== 'Insurance') {
        return current
      }

      const nextInsuranceProvider =
        current.insurance_provider || paymentDetail.billing.health_insurance || ''

      if (current.insurance_provider === nextInsuranceProvider) {
        return current
      }

      return {
        ...current,
        insurance_provider: nextInsuranceProvider,
      }
    })
  }, [paymentDetail])

  useEffect(() => {
    if (!insuranceMeta?.providers?.length) return

    setPaymentForm((current) => {
      const billingProvider = paymentDetail?.billing?.health_insurance || ''
      const nextInsuranceProvider =
        current.insurance_provider && insuranceMeta.providers.includes(current.insurance_provider)
          ? current.insurance_provider
          : billingProvider && billingProvider !== 'NONE'
            ? billingProvider
            : ''

      if (current.insurance_provider === nextInsuranceProvider) {
        return current
      }

      return {
        ...current,
        insurance_provider: nextInsuranceProvider,
      }
    })
  }, [insuranceMeta, paymentDetail])

  useEffect(() => {
    if (!insuranceMeta?.providers?.length) return

    setSecondaryPaymentForm((current) => {
      const billingProvider = paymentDetail?.billing?.health_insurance || ''
      const nextInsuranceProvider =
        current.insurance_provider && insuranceMeta.providers.includes(current.insurance_provider)
          ? current.insurance_provider
          : billingProvider && billingProvider !== 'NONE'
            ? billingProvider
            : ''

      if (current.insurance_provider === nextInsuranceProvider) {
        return current
      }

      return {
        ...current,
        insurance_provider: nextInsuranceProvider,
      }
    })
  }, [insuranceMeta, paymentDetail])

  function buildFinanceSalesParams(branchId) {
    const params = new URLSearchParams({
      branch_id: String(branchId),
      page: String(financeSalesQuery.page),
      per_page: String(financeSalesQuery.per_page),
    })

    for (const [key, value] of Object.entries(financeSalesQuery)) {
      if (!value || value === 'all' || key === 'page' || key === 'per_page') continue
      params.set(key, value)
    }

    return params
  }

  function buildFinancePaymentParams(branchId) {
    const params = new URLSearchParams({
      branch_id: String(branchId),
      page: String(financePaymentQuery.page),
      per_page: String(financePaymentQuery.per_page),
      receipt_page: String(financePaymentQuery.receipt_page),
      receipt_per_page: String(financePaymentQuery.receipt_per_page),
    })

    if (financePaymentQuery.date_from) params.set('date_from', financePaymentQuery.date_from)
    if (financePaymentQuery.date_to) params.set('date_to', financePaymentQuery.date_to)
    if (financePaymentQuery.search) params.set('search', financePaymentQuery.search)
    if (financePaymentQuery.receipt_search) params.set('receipt_search', financePaymentQuery.receipt_search)

    return params
  }

  function buildInsuranceClaimsParams(branchId) {
    const params = new URLSearchParams({
      branch_id: String(branchId),
      page: String(insuranceQuery.page),
      per_page: String(insuranceQuery.per_page),
    })

    for (const [key, value] of Object.entries(insuranceQuery)) {
      if (!value || value === 'all' || key === 'page' || key === 'per_page') continue
      params.set(key, value)
    }

    return params
  }

  function buildBillingListParams(branchId) {
    const params = new URLSearchParams({
      branch_id: String(branchId),
      page: String(billingQuery.page),
      per_page: String(billingQuery.per_page),
    })

    for (const [key, value] of Object.entries(billingQuery)) {
      if (!value || key === 'page' || key === 'per_page') continue
      params.set(key, value)
    }

    return params
  }

  async function refreshInsuranceConnectedData({ paymentDetailBillingId = selectedPaymentRecordId, suppressErrors = false } = {}) {
    if (!token || !session) return null

    const branchId = session.is_admin ? selectedBranchId : session.branch_id
    const requests = [
      apiFetch(`/dashboard?branch_id=${branchId}`, { token }),
      apiFetch(`/finance/summary?branch_id=${branchId}`, { token }),
      apiFetch(`/finance/sales?${buildFinanceSalesParams(branchId).toString()}`, { token }),
      apiFetch(`/finance/payments?${buildFinancePaymentParams(branchId).toString()}`, { token }),
      apiFetch(`/insurance/claims?${buildInsuranceClaimsParams(branchId).toString()}`, { token }),
      apiFetch(`/billing?${buildBillingListParams(branchId).toString()}`, { token }),
    ]

    if (paymentDetailBillingId) {
      requests.push(apiFetch(`/finance/payments/${paymentDetailBillingId}?branch_id=${branchId}`, { token }))
    }

    const results = await Promise.allSettled(requests)
    const [
      dashboardResult,
      summaryResult,
      salesResult,
      paymentsResult,
      insuranceResult,
      billingResult,
      detailResult = null,
    ] = results

    if (dashboardResult?.status === 'fulfilled') setDashboard(dashboardResult.value)
    if (summaryResult?.status === 'fulfilled') setFinanceSummary(summaryResult.value)
    if (salesResult?.status === 'fulfilled') setFinanceSales(salesResult.value)
    if (paymentsResult?.status === 'fulfilled') setFinancePayments(paymentsResult.value)
    if (insuranceResult?.status === 'fulfilled') setInsuranceData(insuranceResult.value)
    if (billingResult?.status === 'fulfilled') setBillingData(billingResult.value)
    if (detailResult?.status === 'fulfilled') setPaymentDetail(detailResult.value)

    const firstRejected = results.find((result) => result.status === 'rejected')
    if (firstRejected && !suppressErrors) {
      throw firstRejected.reason
    }

    return detailResult?.status === 'fulfilled' ? detailResult.value : null
  }

  async function refreshFinancePaymentState(billingId, paymentMethod = paymentForm.payment_method) {
    const detailResponse = await refreshInsuranceConnectedData({ paymentDetailBillingId: billingId })
    setPaymentForm((current) => ({
      ...defaultPaymentForm(),
      payment_method: paymentMethod,
      customer_email: current.customer_email || detailResponse.billing.email || '',
      insurance_provider: detailResponse.billing.health_insurance || '',
      amount: Number(detailResponse.billing.calculated_balance ?? 0).toFixed(2),
    }))
    setIsSplitPaymentEnabled(false)
    setSecondaryPaymentForm({
      ...defaultPaymentForm(),
      payment_method: 'Cash',
      customer_email: detailResponse.billing.email || '',
      insurance_provider: detailResponse.billing.health_insurance || '',
    })

    return detailResponse
  }

  useEffect(() => {
    if (!isProfileMenuOpen) return

    const handlePointerDown = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) {
        setIsProfileMenuOpen(false)
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsProfileMenuOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isProfileMenuOpen])

  useEffect(() => {
    if (activeView !== 'Users') {
      setUserHeroProfile(null)
    }

    if (activeView !== 'Staff Profiles') {
      setStaffHeroProfile(null)
    }
  }, [activeView])

  const activeBranchName =
    dashboard?.branch_name ??
    patientData?.branch_name ??
    financeSummary?.branch_name ??
    financeSales?.branch_name ??
    financeExpenses?.branch_name ??
    financePayments?.branch_name ??
    branchOptions.find((branch) => branch.id === selectedBranchId)?.name
  const headerProfile = activeView === 'Users' && userHeroProfile
    ? {
        imageUrl: userHeroProfile.profile_image_url ?? '',
        name: userHeroProfile.name ?? 'User profile',
        subtitle: userHeroProfile.staff_id || roleLabels[userHeroProfile.role] || userHeroProfile.username || 'Portal user',
      }
    : activeView === 'Staff Profiles' && staffHeroProfile
    ? {
        imageUrl: staffHeroProfile.photo_url ?? '',
        name: staffHeroProfile.name ?? 'Staff profile',
        subtitle: staffHeroProfile.staff_id || staffHeroProfile.job_title || staffHeroProfile.department || 'Staff profile',
      }
    : {
        imageUrl: session?.profile_image_url ?? '',
        name: session?.name ?? 'Profile',
        subtitle: session?.staff_id || roleLabels[session?.role] || 'Portal user',
      }

  const visibleNavSections = useMemo(() => {
    const stripSettings = (sections) => sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => canAccessSystemSettings || item.label !== 'Settings'),
      }))
      .filter((section) => section.items.length)

    if (isOptometrist) {
      return stripSettings(optometristNavSections)
    }

    if (isExecutive) {
      return stripSettings(executiveNavSections)
    }

    if (isAccountant) {
      return stripSettings(accountantNavSections)
    }

    if (hasManagerSidebar) {
      return stripSettings(managerNavSections)
    }

    return stripSettings(receptionistNavSections)
  }, [canAccessSystemSettings, hasManagerSidebar, isAccountant, isExecutive, isOptometrist])

  const visibleNavItems = useMemo(
    () => visibleNavSections.flatMap((section) => section.items),
    [visibleNavSections],
  )

  useEffect(() => {
    setIsSidebarOpen(false)
  }, [activeView])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const syncSidebarForViewport = () => {
      if (window.innerWidth > 920) {
        setIsSidebarOpen(false)
      }
    }

    window.addEventListener('resize', syncSidebarForViewport)
    return () => window.removeEventListener('resize', syncSidebarForViewport)
  }, [])

  useEffect(() => {
    if (!session || activeView !== 'Settings' || canAccessSystemSettings) return
    setActiveView('Dashboard')
  }, [activeView, canAccessSystemSettings, session])

  useEffect(() => {
    if (session?.role !== 'receptionist' || activeView !== 'Reports') return
    setActiveView('Notes')
  }, [activeView, session])

  useEffect(() => {
    if (activeView !== 'Audit Log' || isGeneralManager) return
    setActiveView('Dashboard')
  }, [activeView, isGeneralManager])

  useEffect(() => {
    const successSources = [
      ['patient', patientSuccess],
      ['billing', billingSuccess],
      ['finance', financeSuccess],
      ['inventory', inventorySuccess],
      ['customer-service', customerServiceSuccess],
      ['insurance', insuranceSuccess],
      ['settings', settingsSuccess],
    ]

    successSources.forEach(([key, message]) => {
      if (!message || previousSuccessMessagesRef.current[key] === message) return

      const toastId = `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setSuccessToasts((current) => [...current, { id: toastId, message }])
      window.setTimeout(() => {
        setSuccessToasts((current) => current.filter((toast) => toast.id !== toastId))
      }, 4200)
    })

    previousSuccessMessagesRef.current = Object.fromEntries(successSources)
  }, [
    billingSuccess,
    customerServiceSuccess,
    financeSuccess,
    insuranceSuccess,
    inventorySuccess,
    patientSuccess,
    settingsSuccess,
  ])

  function pushSuccessToast(message, key = 'global') {
    if (!message) return
    const toastId = `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setSuccessToasts((current) => [...current, { id: toastId, message }])
    window.setTimeout(() => {
      setSuccessToasts((current) => current.filter((toast) => toast.id !== toastId))
    }, 4200)
  }

  useEffect(() => {
    let cancelled = false

    async function loadSettingsCatalog() {
      if (!token || session?.role !== 'manager' || activeView !== 'Settings') return
      setIsLoadingSettingsCatalog(true)
      setSettingsError('')

      try {
        const [providersResult, categoriesResult] = await Promise.allSettled([
          apiFetch('/insurance/providers', { token }),
          apiFetch('/finance/expense-categories', { token }),
        ])

        if (cancelled) return
        if (providersResult.status === 'fulfilled') {
          setInsuranceProviderCatalog(providersResult.value.providers ?? [])
        }

        if (categoriesResult.status === 'fulfilled') {
          setExpenseCategoryCatalog(categoriesResult.value.categories ?? [])
        }

        const providerError = providersResult.status === 'rejected' ? providersResult.reason?.message : ''
        const categoryError = categoriesResult.status === 'rejected' ? categoriesResult.reason?.message : ''
        const combinedError = [providerError, categoryError].filter(Boolean).join(' ')
        if (combinedError) {
          setSettingsError(combinedError)
        }
      } catch (error) {
        if (!cancelled) setSettingsError(error.message)
      } finally {
        if (!cancelled) setIsLoadingSettingsCatalog(false)
      }
    }

    loadSettingsCatalog()
    return () => {
      cancelled = true
    }
  }, [activeView, session, token])

  const dashboardStats = useMemo(() => {
    if (!dashboard) return []
    return [
      { label: 'Revenue', value: currency.format(Number(dashboard.stats.revenue_today ?? 0)), note: 'Non-insurance sales collected today' },
      { label: 'Expenses', value: currency.format(Number(dashboard.stats.expenses_today ?? 0)), note: 'Branch expenses recorded today' },
      { label: 'Insurance Revenue', value: currency.format(Number(dashboard.stats.insurance_revenue_today ?? 0)), note: 'Sales paid using insurance today' },
      { label: 'Patients Today', value: dashboard.stats.patients_today, note: 'Unique billed patients for today' },
    ]
  }, [dashboard])

  const patientStats = useMemo(() => {
    if (!patientData) return []
    return [
      { className: 'pending', label: 'Pending Records', value: patientData.stats.pending_count, note: 'Waiting to be seen' },
      { className: 'seen', label: 'Seen Records', value: patientData.stats.seen_count, note: 'Completed consultations' },
      { className: 'today', label: 'Today Pending', value: patientData.stats.today_pending_count, note: 'Urgent focus for today' },
      { className: 'total', label: 'Filtered Total', value: patientData.stats.total_count, note: 'Records matching active filters' },
    ]
  }, [patientData])

  async function handleLogin(event) {
    event.preventDefault()
    setIsLoggingIn(true)
    setLoginError('')
    try {
      const response = await apiFetch('/login', { method: 'POST', body: credentials })
      setToken(response.token)
      setSession(response.user)
      if (!response.user.is_admin && response.user.branch_id) setSelectedBranchId(response.user.branch_id)
    } catch (error) {
      setLoginError(error.message)
    } finally {
      setIsLoggingIn(false)
    }
  }

  async function handleLogout() {
    try {
      if (token) await apiFetch('/logout', { method: 'POST', token })
    } catch {
      // Clear local state even if remote logout fails.
    } finally {
      setToken('')
      setSession(null)
      setDashboard(null)
      setPatientData(null)
      setPatientMeta(null)
      setCredentials({ login: '', password: '' })
      setLoginError('')
    }
  }

  function handleSidebarNavigation(nextView) {
    setActiveView(nextView)

    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 920px)').matches) {
      setIsSidebarOpen(false)
    }
  }

  async function saveSettingsProfile(event) {
    event.preventDefault()
    setIsSavingSettingsProfile(true)
    setSettingsError('')
    setSettingsSuccess('')

    try {
      const formData = new FormData()
      formData.append('name', settingsProfileForm.name)
      formData.append('username', settingsProfileForm.username)
      formData.append('email', settingsProfileForm.email)
      formData.append('phone', settingsProfileForm.phone)

      if (settingsProfileForm.profileImage) {
        formData.append('profile_image', settingsProfileForm.profileImage)
      }

      const response = await apiFetch('/me/profile', {
        method: 'POST',
        token,
        body: formData,
      })

      setSession(response.user)
      setSettingsProfileForm(defaultSettingsProfileForm(response.user))
      setSettingsSuccess(response.message || 'Profile updated successfully.')
    } catch (error) {
      setSettingsError(error.message)
    } finally {
      setIsSavingSettingsProfile(false)
    }
  }

  async function saveSettingsPassword(event) {
    event.preventDefault()
    setIsSavingSettingsPassword(true)
    setSettingsError('')
    setSettingsSuccess('')

    try {
      const response = await apiFetch('/me/password', {
        method: 'POST',
        token,
        body: settingsPasswordForm,
      })

      setSettingsPasswordForm(defaultSettingsPasswordForm())
      setSettingsSuccess(response.message || 'Password updated successfully.')
    } catch (error) {
      setSettingsError(error.message)
    } finally {
      setIsSavingSettingsPassword(false)
    }
  }

  async function saveCompanyProfile(event) {
    event.preventDefault()
    setIsSavingCompanyProfile(true)
    setSettingsError('')
    setSettingsSuccess('')

    try {
      const formData = new FormData()
      formData.append('company_name', companyProfileForm.company_name)
      formData.append('company_email', companyProfileForm.company_email)
      formData.append('company_phone_primary', companyProfileForm.company_phone_primary)
      formData.append('company_phone_secondary', companyProfileForm.company_phone_secondary)
      formData.append('labadi_address', companyProfileForm.labadi_address)
      formData.append('madina_address', companyProfileForm.madina_address)
      formData.append('tagline', companyProfileForm.tagline)
      if (companyProfileForm.loginWallpaperFile) {
        formData.append('login_wallpaper', companyProfileForm.loginWallpaperFile)
      }

      const response = await apiFetch('/company-profile', {
        method: 'POST',
        token,
        body: formData,
      })

      setCompanyProfileForm({
        ...defaultCompanyProfile(),
        ...(response.profile ?? {}),
      })
      setSettingsSuccess(response.message || 'Company profile updated successfully.')
    } catch (error) {
      setSettingsError(error.message)
    } finally {
      setIsSavingCompanyProfile(false)
    }
  }

  async function saveInsuranceProvider(name) {
    setIsSavingInsuranceProvider(true)
    setSettingsError('')
    setSettingsSuccess('')
    setInsuranceError('')
    setInsuranceSuccess('')

    try {
      const response = await apiFetch('/insurance/providers', {
        method: 'POST',
        token,
        body: { name },
      })

      const providersResponse = await apiFetch('/insurance/providers', { token })
      setInsuranceProviderCatalog(providersResponse.providers ?? [])
      if (session) {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const metaResponse = await apiFetch(`/insurance/meta?branch_id=${branchId}`, { token })
        setInsuranceMeta(metaResponse)
      }
      setSettingsSuccess(response.message || 'Insurance provider added successfully.')
      setInsuranceSuccess(response.message || 'Insurance provider added successfully.')
      return true
    } catch (error) {
      setSettingsError(error.message)
      setInsuranceError(error.message)
      return false
    } finally {
      setIsSavingInsuranceProvider(false)
    }
  }

  async function deleteInsuranceProvider(providerId) {
    setIsDeletingInsuranceProviderId(providerId)
    setSettingsError('')
    setSettingsSuccess('')

    try {
      const response = await apiFetch(`/insurance/providers/${providerId}`, {
        method: 'DELETE',
        token,
      })

      const providersResponse = await apiFetch('/insurance/providers', { token })
      setInsuranceProviderCatalog(providersResponse.providers ?? [])
      if (session) {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const metaResponse = await apiFetch(`/insurance/meta?branch_id=${branchId}`, { token })
        setInsuranceMeta(metaResponse)
      }
      setSettingsSuccess(response.message || 'Insurance provider deleted successfully.')
    } catch (error) {
      setSettingsError(error.message)
    } finally {
      setIsDeletingInsuranceProviderId(null)
    }
  }

  async function deleteExpenseCategory(categoryId) {
    const branchId = session.is_admin ? selectedBranchId : session.branch_id
    setIsDeletingExpenseCategoryId(categoryId)
    setFinanceError('')
    setFinanceSuccess('')
    setSettingsError('')
    setSettingsSuccess('')

    try {
      const response = await apiFetch(`/finance/expense-categories/${categoryId}?branch_id=${branchId}`, {
        method: 'DELETE',
        token,
      })

      const categoriesResponse = await apiFetch('/finance/expense-categories', { token })
      const nextCategories = categoriesResponse.categories ?? []
      const nextCategoryNames = nextCategories.map((category) => category.name)
      setExpenseCategoryCatalog(nextCategories)
      setFinanceExpenses((current) => {
        if (!current) return current

        return {
          ...current,
          categories: nextCategoryNames,
          category_records: nextCategories,
        }
      })
      setExpenseForm((current) => (
        nextCategoryNames.includes(current.category)
          ? current
          : {
              ...current,
              category: nextCategoryNames[0] ?? '',
            }
      ))
      setFinanceExpenseFilters((current) => ({
        ...current,
        category:
          current.category === 'all' || nextCategoryNames.includes(current.category)
            ? current.category
            : 'all',
      }))
      setFinanceExpenseQuery((current) => ({
        ...current,
        category:
          current.category === 'all' || nextCategoryNames.includes(current.category)
            ? current.category
            : 'all',
      }))
      setFinanceSuccess(response.message || 'Expense category deleted successfully.')
      setSettingsSuccess(response.message || 'Expense category deleted successfully.')

      if (activeView === 'Expenses') {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const expensesResponse = await apiFetch(`/finance/expenses?branch_id=${branchId}&page=${financeExpenseQuery.page || 1}&per_page=${financeExpenseQuery.per_page || 12}${financeExpenseQuery.filter && financeExpenseQuery.filter !== 'all' ? `&filter=${encodeURIComponent(financeExpenseQuery.filter)}` : ''}${financeExpenseQuery.start_date ? `&start_date=${encodeURIComponent(financeExpenseQuery.start_date)}` : ''}${financeExpenseQuery.end_date ? `&end_date=${encodeURIComponent(financeExpenseQuery.end_date)}` : ''}${financeExpenseQuery.category && financeExpenseQuery.category !== 'all' ? `&category=${encodeURIComponent(financeExpenseQuery.category)}` : ''}${financeExpenseQuery.search ? `&search=${encodeURIComponent(financeExpenseQuery.search)}` : ''}`, { token })
        setFinanceExpenses(expensesResponse)
      }
    } catch (error) {
      setFinanceError(error.message)
      setSettingsError(error.message)
      throw error
    } finally {
      setIsDeletingExpenseCategoryId(null)
    }
  }

  async function savePatientRecord(event) {
    event.preventDefault()
    setIsSavingPatient(true)
    setPatientError('')
    setPatientSuccess('')
    try {
      await apiFetch('/patients', {
        method: 'POST',
        token,
        body: {
          ...patientForm,
          age: patientForm.age ? Number(patientForm.age) : null,
        },
      })
      setPatientSuccess('Patient record saved successfully.')
      setPatientForm(patientFormDefaults)
      setPatientQuery((current) => ({ ...current }))
      return true
    } catch (error) {
      setPatientError(error.message)
      return false
    } finally {
      setIsSavingPatient(false)
    }
  }

  async function markAsSeen(recordId, status) {
    setRowBusyId(recordId)
    setPatientError('')
    setPatientSuccess('')
    try {
      await apiFetch(`/patients/${recordId}/status`, {
        method: 'PATCH',
        token,
        body: { status },
      })
      setPatientSuccess(`Patient status updated to ${status}.`)
      setPatientQuery((current) => ({ ...current }))
    } catch (error) {
      setPatientError(error.message)
    } finally {
      setRowBusyId(null)
    }
  }

  async function assignOptometrist(recordId) {
    const assignment = rowAssignments[recordId]
    if (!assignment?.assigned_optometrist_id) {
      setPatientError('Select an optometrist before assigning.')
      return
    }

    setRowBusyId(recordId)
    setPatientError('')
    setPatientSuccess('')
    try {
      await apiFetch(`/patients/${recordId}/assign-optometrist`, {
        method: 'PATCH',
        token,
        body: assignment,
      })
      setPatientSuccess('Optometrist assigned successfully.')
      setPatientQuery((current) => ({ ...current }))
    } catch (error) {
      setPatientError(error.message)
    } finally {
      setRowBusyId(null)
    }
  }

  async function updatePatientDetails(recordId, payload) {
    setPatientError('')
    setPatientSuccess('')

    const response = await apiFetch(`/patients/${recordId}`, {
      method: 'PUT',
      token,
      body: {
        ...payload,
        age: payload.age ? Number(payload.age) : null,
      },
    })

    setPatientSuccess(response.message || 'Patient details updated successfully.')
    setPatientQuery((current) => ({ ...current }))
    return response
  }

  async function fetchPatientPrescriptions(recordId) {
    return apiFetch(`/patients/${recordId}/prescriptions`, {
      token,
    })
  }

  async function addPatientPrescription(recordId, payload) {
    return apiFetch(`/patients/${recordId}/prescriptions`, {
      method: 'POST',
      token,
      body: payload,
    })
  }

  async function fetchMedicalReport(recordId) {
    return apiFetch(`/patients/${recordId}/medical-report`, {
      token,
    })
  }

  async function fetchPatientExamForm(recordId, options = {}) {
    const params = new URLSearchParams()
    if (options.formId) {
      params.set('form_id', String(options.formId))
    }

    return apiFetch(`/patients/${recordId}/exam-form${params.toString() ? `?${params.toString()}` : ''}`, {
      token,
    })
  }

  async function savePatientExamForm(recordId, payload) {
    return apiFetch(`/patients/${recordId}/exam-form`, {
      method: 'POST',
      token,
      body: payload,
    })
  }

  async function fetchPatientDocuments(recordId) {
    return apiFetch(`/patients/${recordId}/documents`, {
      token,
    })
  }

  async function uploadPatientDocuments(recordId, formData) {
    return apiFetch(`/patients/${recordId}/documents`, {
      method: 'POST',
      token,
      body: formData,
    })
  }

  async function lookupPatients(search) {
    const branchId = session?.is_admin ? selectedBranchId : session?.branch_id
    const params = new URLSearchParams({
      branch_id: String(branchId ?? 1),
      search,
    })

    return apiFetch(`/patients/lookup?${params.toString()}`, {
      token,
    })
  }

  async function fetchGlassesPrescriptions({ search = '', page = 1, perPage = 15 } = {}) {
    const branchId = session?.is_admin ? selectedBranchId : session?.branch_id
    const params = new URLSearchParams({
      branch_id: String(branchId ?? 1),
      search,
      page: String(page),
      per_page: String(perPage),
    })

    return apiFetch(`/glasses-prescriptions?${params.toString()}`, {
      token,
    })
  }

  async function fetchFormPrescriptionSearch(search) {
    const branchId = session?.is_admin ? selectedBranchId : session?.branch_id
    const params = new URLSearchParams({
      branch_id: String(branchId ?? 1),
      search,
    })

    return apiFetch(`/patients/form-prescriptions/search?${params.toString()}`, {
      token,
    })
  }

  function mergeRowAssignments(records) {
    setRowAssignments((current) => ({
      ...Object.fromEntries(
        records.map((record) => [
          record.id,
          {
            assigned_optometrist_id: record.assigned_optometrist_id ?? '',
            appointment_date: record.appointment_date ?? todayIso(),
          },
        ]),
      ),
      ...current,
    }))
  }

  async function saveBillingPricing(pricingForm) {
    setBillingError('')
    setBillingSuccess('')

    const branchId = session.is_admin ? selectedBranchId : session.branch_id

    await apiFetch(`/billing/pricing?branch_id=${branchId}`, {
      method: 'PUT',
      token,
      body: {
        consultation_price: Number(pricingForm.consultation_price || 0),
        existing_consultation_price: Number(pricingForm.existing_consultation_price || 0),
        frame_price: Number(pricingForm.frame_price || 0),
        lens_price: Number(pricingForm.lens_price || 0),
        case_price: Number(pricingForm.case_price || 0),
      },
    })

    const refreshedMeta = await apiFetch(`/billing/meta?branch_id=${branchId}`, { token })
    setBillingMeta(refreshedMeta)
    setBillingForm((current) => ({
      ...current,
      consultation_price:
        current.consultation_customer_type === 'existing'
          ? String(Number(refreshedMeta.standard_prices.existing_consultation_price ?? 80).toFixed(2))
          : String(Number(refreshedMeta.standard_prices.consultation_price ?? 100).toFixed(2)),
      frame_price: String(Number(refreshedMeta.standard_prices.frame_price ?? 0).toFixed(2)),
      lens_price: String(Number(refreshedMeta.standard_prices.lens_price ?? 0).toFixed(2)),
      case_price: String(Number(refreshedMeta.standard_prices.case_price ?? 0).toFixed(2)),
    }))
    setBillingSuccess('Billing pricing updated successfully.')
  }

  async function exportBillingData(mode = 'ledger') {
    setBillingError('')
    const branchId = session.is_admin ? selectedBranchId : session.branch_id
    const params = new URLSearchParams({
      branch_id: String(branchId),
    })

    for (const [key, value] of Object.entries(billingQuery)) {
      if (!value || key === 'page' || key === 'per_page') continue
      params.set(key, value)
    }

    const response = await apiFetch(`/billing/export?${params.toString()}`, { token })
    const branchLabel = response.branch_name || 'billing'
    const rows = response.records ?? []

    if (mode === 'summary') {
      const stats = billingData?.stats ?? {}
      downloadCsv(
        `billing-summary-${slugify(branchLabel)}-${todayIso()}.csv`,
        toCsv([
          { metric: 'Branch', value: branchLabel },
          { metric: 'Exported At', value: response.exported_at || new Date().toLocaleString() },
          { metric: 'Total Bills', value: stats.total_bills ?? '' },
          { metric: 'Total Amount', value: stats.total_amount ?? '' },
          { metric: 'Filtered Amount', value: stats.filtered_total_amount ?? '' },
          { metric: 'Collected Amount', value: stats.filtered_collected_amount ?? '' },
          { metric: 'Outstanding Amount', value: stats.filtered_outstanding_amount ?? '' },
          { metric: 'Collection Rate', value: stats.collection_rate ?? '' },
          { metric: 'Insured Bill Count', value: stats.insured_bill_count ?? '' },
          { metric: 'Insured Bill Value', value: stats.insured_bill_value ?? '' },
        ]),
      )
      setBillingSuccess('Billing summary export started.')
      return
    }

    downloadCsv(
      `billing-ledger-${slugify(branchLabel)}-${todayIso()}.csv`,
      toCsv(rows.map((record) => ({
        branch: record.branch_name,
        billing_id: record.id,
        patient: record.name,
        folder_id: record.folder_id,
        date: record.date,
        receipt_number: record.receipt_number,
        status: record.status,
        insurance: record.health_insurance,
        consultation: record.consultation_price,
        frame: record.frame_price,
        lens: record.lens_price,
        case: record.case_price,
        discount: record.discount,
        total_amount: record.total_amount,
        total_paid: record.total_paid,
        insurance_claimed: record.insurance_claimed,
        balance: record.calculated_balance,
        patient_phone: record.patient_phone,
        customer_phone: record.customer_phone,
      }))),
    )
    setBillingSuccess('Billing ledger export started.')
  }

  async function saveBillingRecord(event) {
    event.preventDefault()
    setIsSavingBill(true)
    setBillingError('')
    setBillingSuccess('')
    try {
      await apiFetch('/billing', {
        method: 'POST',
        token,
        body: {
          ...billingForm,
          patient_id: billingForm.patient_id ? Number(billingForm.patient_id) : null,
          prescription_id: billingForm.prescription_id ? Number(billingForm.prescription_id) : null,
          frame_items: normalizeBillingFrameItemsForApi(billingForm.frame_items, billingForm.frame_code_id, billingForm.frame_price),
          lens_items: normalizeBillingLensItemsForApi(billingForm.lens_items, billingForm.lens_price),
          consultation_price: formatMoneyInput(billingForm.consultation_price),
          frame_price: formatMoneyInput(sumBillingFrameItems(billingForm.frame_items, billingForm.frame_code_id, billingForm.frame_price)),
          lens_price: formatMoneyInput(sumBillingLensItems(billingForm.lens_items, billingForm.lens_price)),
          case_price: formatMoneyInput(billingForm.case_price),
          discount: formatMoneyInput(billingForm.discount),
        },
      })
      setBillingSuccess('Billing record created successfully.')
      setBillingQuery((current) => ({ ...current }))
      setDailyPaymentSearch('')
    } catch (error) {
      setBillingError(error.message)
    } finally {
      setIsSavingBill(false)
    }
  }

  async function saveExpenseRecord(event) {
    event?.preventDefault?.()
    const branchId = session.is_admin ? selectedBranchId : session.branch_id
    setIsSavingExpense(true)
    setFinanceError('')
    setFinanceSuccess('')
    try {
      await apiFetch('/finance/expenses', {
        method: 'POST',
        token,
        body: {
          ...expenseForm,
          branch_id: branchId,
          amount: Number(expenseForm.amount || 0),
        },
      })
      setFinanceSuccess('Expense saved successfully.')
      setExpenseForm(defaultExpenseForm(financeExpenses?.categories?.[0] ?? ''))
      setFinanceExpenseQuery((current) => ({ ...current }))
      setFinancePaymentQuery((current) => ({ ...current }))
      const summary = await apiFetch(`/finance/summary?branch_id=${branchId}`, { token })
      setFinanceSummary(summary)
    } catch (error) {
      setFinanceError(error.message)
      throw error
    } finally {
      setIsSavingExpense(false)
    }
  }

  async function updateExpenseRecord(expenseId, values) {
    const branchId = session.is_admin ? selectedBranchId : session.branch_id
    setIsUpdatingExpenseRecord(true)
    setFinanceError('')
    setFinanceSuccess('')

    try {
      await apiFetch(`/finance/expenses/${expenseId}?branch_id=${branchId}`, {
        method: 'PUT',
        token,
        body: {
          ...values,
          branch_id: branchId,
          amount: Number(values.amount || 0),
        },
      })

      setFinanceSuccess('Expense updated successfully.')
      setFinanceExpenseQuery((current) => ({ ...current }))
      const summary = await apiFetch(`/finance/summary?branch_id=${branchId}`, { token })
      setFinanceSummary(summary)
    } catch (error) {
      setFinanceError(error.message)
      throw error
    } finally {
      setIsUpdatingExpenseRecord(false)
    }
  }

  async function deleteExpenseRecord(expenseId) {
    const branchId = session.is_admin ? selectedBranchId : session.branch_id
    setDeletingExpenseRecordId(expenseId)
    setFinanceError('')
    setFinanceSuccess('')

    try {
      const response = await apiFetch(`/finance/expenses/${expenseId}?branch_id=${branchId}`, {
        method: 'DELETE',
        token,
      })

      setFinanceSuccess(response.message || 'Expense deleted successfully.')
      setFinanceExpenseQuery((current) => ({ ...current }))
      const summary = await apiFetch(`/finance/summary?branch_id=${branchId}`, { token })
      setFinanceSummary(summary)
    } catch (error) {
      setFinanceError(error.message)
      throw error
    } finally {
      setDeletingExpenseRecordId(null)
    }
  }

  async function saveExpenseCategory(name) {
    const branchId = session.is_admin ? selectedBranchId : session.branch_id
    setIsSavingExpenseCategory(true)
    setFinanceError('')
    setFinanceSuccess('')
    setSettingsError('')
    setSettingsSuccess('')

    try {
      const response = await apiFetch('/finance/expense-categories', {
        method: 'POST',
        token,
        body: { name, branch_id: branchId },
      })

      const expensesResponse = await apiFetch(`/finance/expenses?branch_id=${branchId}&page=${financeExpenseQuery.page || 1}&per_page=${financeExpenseQuery.per_page || 12}${financeExpenseQuery.filter && financeExpenseQuery.filter !== 'all' ? `&filter=${encodeURIComponent(financeExpenseQuery.filter)}` : ''}${financeExpenseQuery.start_date ? `&start_date=${encodeURIComponent(financeExpenseQuery.start_date)}` : ''}${financeExpenseQuery.end_date ? `&end_date=${encodeURIComponent(financeExpenseQuery.end_date)}` : ''}${financeExpenseQuery.category && financeExpenseQuery.category !== 'all' ? `&category=${encodeURIComponent(financeExpenseQuery.category)}` : ''}${financeExpenseQuery.search ? `&search=${encodeURIComponent(financeExpenseQuery.search)}` : ''}`, { token })
      setFinanceExpenses(expensesResponse)
      const categoriesResponse = await apiFetch('/finance/expense-categories', { token })
      const nextCategories = categoriesResponse.categories ?? []
      setExpenseCategoryCatalog(nextCategories)
      setFinanceExpenses((current) => {
        if (!current) return current

        return {
          ...current,
          categories: nextCategories.map((category) => category.name),
          category_records: nextCategories,
        }
      })
      setFinanceSuccess(response.message || 'Expense category added successfully.')
      setSettingsSuccess(response.message || 'Expense category added successfully.')
    } catch (error) {
      setFinanceError(error.message)
      setSettingsError(error.message)
    } finally {
      setIsSavingExpenseCategory(false)
    }
  }

  async function updateExpenseCategory(categoryId, name) {
    const branchId = session.is_admin ? selectedBranchId : session.branch_id
    setIsSavingExpenseCategory(true)
    setFinanceError('')
    setFinanceSuccess('')
    setSettingsError('')
    setSettingsSuccess('')

    try {
      const response = await apiFetch(`/finance/expense-categories/${categoryId}?branch_id=${branchId}`, {
        method: 'PUT',
        token,
        body: { name, branch_id: branchId },
      })

      const expensesResponse = await apiFetch(`/finance/expenses?branch_id=${branchId}&page=${financeExpenseQuery.page || 1}&per_page=${financeExpenseQuery.per_page || 12}${financeExpenseQuery.filter && financeExpenseQuery.filter !== 'all' ? `&filter=${encodeURIComponent(financeExpenseQuery.filter)}` : ''}${financeExpenseQuery.start_date ? `&start_date=${encodeURIComponent(financeExpenseQuery.start_date)}` : ''}${financeExpenseQuery.end_date ? `&end_date=${encodeURIComponent(financeExpenseQuery.end_date)}` : ''}${financeExpenseQuery.category && financeExpenseQuery.category !== 'all' ? `&category=${encodeURIComponent(financeExpenseQuery.category)}` : ''}${financeExpenseQuery.search ? `&search=${encodeURIComponent(financeExpenseQuery.search)}` : ''}`, { token })
      setFinanceExpenses(expensesResponse)
      const categoriesResponse = await apiFetch('/finance/expense-categories', { token })
      setExpenseCategoryCatalog(categoriesResponse.categories ?? [])
      setFinanceSuccess(response.message || 'Expense category updated successfully.')
      setSettingsSuccess(response.message || 'Expense category updated successfully.')
      return response
    } catch (error) {
      setFinanceError(error.message)
      setSettingsError(error.message)
      throw error
    } finally {
      setIsSavingExpenseCategory(false)
    }
  }

  async function saveBillingPayment(event) {
    event.preventDefault()
    if (session?.role === 'accountant') {
      setFinanceError('Accountants can review finance records here, but payment processing is disabled on this page.')
      return
    }

    if (!selectedPaymentRecordId) {
      setFinanceError('Select a billing record before processing payment.')
      return
    }

    const branchId = session.is_admin ? selectedBranchId : session.branch_id
    const receiptWindow = openPendingReceiptWindow()

    setIsSavingPayment(true)
    setFinanceError('')
    setFinanceSuccess('')

    try {
      const paymentsToRecord = isSplitPaymentEnabled
        ? [
            {
              ...paymentForm,
              amount: Number(paymentForm.amount || 0),
            },
            {
              ...secondaryPaymentForm,
              amount: Number(secondaryPaymentForm.amount || 0),
            },
          ]
        : [
            {
              ...paymentForm,
              amount: Number(paymentForm.amount || 0),
            },
          ]

      if (isSplitPaymentEnabled) {
        const methods = paymentsToRecord.map((payment) => payment.payment_method)
        if (methods.includes('Paystack')) {
          throw new Error('Paystack is available only in single-payment mode.')
        }

        if (paymentsToRecord.length !== 2) {
          throw new Error('Split payment requires exactly two payment lines.')
        }

        const roundPaymentAmount = (value) => Math.round(Number(value || 0) * 100) / 100
        const balanceOwing = roundPaymentAmount(Number(paymentDetail?.billing?.calculated_balance ?? 0))
        let splitTotal = 0

        paymentsToRecord.forEach((payment, index) => {
          const amount = roundPaymentAmount(Number(payment.amount || 0))
          splitTotal += amount
          const method = payment.payment_method
          if (amount < 0.01) {
            throw new Error(`Payment line ${index + 1} needs an amount of at least 0.01.`)
          }
          if (['Mobile Money', 'Paystack'].includes(method) && !String(payment.transaction_id ?? '').trim()) {
            throw new Error(`Payment line ${index + 1} (${method}) needs a transaction ID.`)
          }
          const allowed = ['Insurance', 'Cash', 'Mobile Money']
          if (!allowed.includes(method)) {
            throw new Error(`Payment line ${index + 1} cannot use ${method} in split mode.`)
          }
        })

        if (splitTotal > balanceOwing + 0.01) {
          throw new Error(`Split amounts (${currency.format(splitTotal)}) cannot exceed the outstanding balance (${currency.format(balanceOwing)}).`)
        }
      }

      await apiFetch(`/finance/payments/${selectedPaymentRecordId}`, {
        method: 'POST',
        token,
        body: isSplitPaymentEnabled
          ? {
              branch_id: branchId,
              payments: paymentsToRecord,
            }
          : {
              ...paymentsToRecord[0],
              branch_id: branchId,
            },
      })

      const nextPrimaryMethod = isSplitPaymentEnabled
        ? paymentsToRecord[1]?.payment_method || 'Cash'
        : paymentForm.payment_method
      const detailResponse = await refreshFinancePaymentState(selectedPaymentRecordId, nextPrimaryMethod)
      setFinanceSuccess(
        isSplitPaymentEnabled
          ? `${paymentsToRecord.map((payment) => payment.payment_method).join(' + ')} payment saved successfully.`
          : `${paymentForm.payment_method} payment saved successfully.`,
      )

      const latestReceipt = isSplitPaymentEnabled
        ? null
        : (
            findLatestReceiptEntry(
              detailResponse,
              paymentForm.payment_method,
              (transaction) => (
                paymentForm.payment_method === 'Insurance'
                  ? (!paymentForm.insurance_number || transaction.reference === paymentForm.insurance_number)
                  : (!paymentForm.transaction_id || transaction.transaction_id === paymentForm.transaction_id)
                    && (!paymentForm.reference || transaction.reference === paymentForm.reference)
              ),
            ) ?? findLatestReceiptEntry(detailResponse, paymentForm.payment_method)
          )

      const receiptPayload = isSplitPaymentEnabled
        ? buildCombinedReceiptPayload(detailResponse, paymentsToRecord)
        : buildReceiptPayloadFromDetail(detailResponse, latestReceipt)
      if (receiptPayload) {
        setReceiptPreview(receiptPayload)
        printThermalReceipt(receiptPayload, receiptWindow)
      } else if (receiptWindow && !receiptWindow.closed) {
        receiptWindow.close()
      }
    } catch (error) {
      if (receiptWindow && !receiptWindow.closed) {
        receiptWindow.close()
      }
      setFinanceError(error.message)
    } finally {
      setIsSavingPayment(false)
    }
  }

  async function initializePaystackPayment() {
    if (session?.role === 'accountant') {
      setFinanceError('Accountants can review finance records here, but payment processing is disabled on this page.')
      return
    }

    if (!selectedPaymentRecordId || !paymentDetail?.billing) {
      setFinanceError('Select a billing record before starting a Paystack checkout.')
      return
    }

    const email = String(paymentForm.customer_email || paymentDetail.billing.email || '').trim()
    if (!email) {
      setFinanceError('Enter the customer email address before starting a Paystack checkout.')
      return
    }

    setIsInitializingPaystack(true)
    setFinanceError('')
    setFinanceSuccess('')

    try {
      const branchId = session.is_admin ? selectedBranchId : session.branch_id
      const callbackUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}`
          : undefined

      const response = await apiFetch(`/finance/payments/${selectedPaymentRecordId}/paystack/initialize`, {
        method: 'POST',
        token,
        body: {
          amount: Number(paymentForm.amount || 0),
          email,
          callback_url: callbackUrl,
          branch_id: branchId,
        },
      })

      setPaymentForm((current) => ({
        ...current,
        payment_method: 'Paystack',
        customer_email: email,
        reference: response.reference || current.reference,
        transaction_id: response.access_code || current.transaction_id,
      }))

      if (response.authorization_url && typeof window !== 'undefined') {
        window.open(response.authorization_url, '_blank', 'noopener,noreferrer')
      }

      setFinanceSuccess(response.message || 'Paystack checkout initialized successfully.')
    } catch (error) {
      setFinanceError(error.message)
    } finally {
      setIsInitializingPaystack(false)
    }
  }

  async function verifyPaystackPayment() {
    if (session?.role === 'accountant') {
      setFinanceError('Accountants can review finance records here, but payment processing is disabled on this page.')
      return
    }

    if (!selectedPaymentRecordId || !paymentForm.reference) {
      setFinanceError('A Paystack reference is required before verification.')
      return
    }

    setIsVerifyingPaystack(true)
    setFinanceError('')
    setFinanceSuccess('')
    const receiptWindow = openPendingReceiptWindow('Your receipt will print automatically after the Paystack payment is verified.')

    try {
      const branchId = session.is_admin ? selectedBranchId : session.branch_id
      const response = await apiFetch(`/finance/payments/${selectedPaymentRecordId}/paystack/verify`, {
        method: 'POST',
        token,
        body: {
          reference: paymentForm.reference,
          branch_id: branchId,
        },
      })

      const detailResponse = await refreshFinancePaymentState(selectedPaymentRecordId, 'Paystack')
      setFinanceSuccess(response.message || 'Paystack payment verified successfully.')

      const latestReceipt = findLatestReceiptEntry(
        detailResponse,
        'Paystack',
        (transaction) => transaction.reference === paymentForm.reference,
      ) ?? findLatestReceiptEntry(detailResponse, 'Paystack')

      const receiptPayload = buildReceiptPayloadFromDetail(detailResponse, latestReceipt)
      if (receiptPayload) {
        setReceiptPreview(receiptPayload)
        printThermalReceipt(receiptPayload, receiptWindow)
      } else if (receiptWindow && !receiptWindow.closed) {
        receiptWindow.close()
      }
    } catch (error) {
      if (receiptWindow && !receiptWindow.closed) {
        receiptWindow.close()
      }
      setFinanceError(error.message)
    } finally {
      setIsVerifyingPaystack(false)
    }
  }

  async function saveLensCostEntry(billingId, payload) {
    if (!billingId) return

    setSavingLensBillingId(billingId)
    setInventoryError('')
    setInventorySuccess('')

    try {
      await apiFetch(`/inventory/lens-tracker/${billingId}`, {
        method: 'POST',
        token,
        body: {
          cost_price: Number(payload.cost_price || 0),
          selling_price: Number(payload.selling_price || 0),
        },
      })

      const branchId = session.is_admin ? selectedBranchId : session.branch_id
      const [inventoryResponse, lensResponse] = await Promise.all([
        apiFetch(`/inventory?${buildInventoryParams(branchId).toString()}`, { token }),
        apiFetch(
          `/inventory/lens-tracker?${new URLSearchParams({
            branch_id: String(branchId),
            date_from: lensTrackerQuery.date_from,
            date_to: lensTrackerQuery.date_to,
            ...(lensTrackerQuery.search ? { search: lensTrackerQuery.search } : {}),
            ...(lensTrackerQuery.tracking && lensTrackerQuery.tracking !== 'all' ? { tracking: lensTrackerQuery.tracking } : {}),
          }).toString()}`,
          { token },
        ),
      ])

      setInventoryData(inventoryResponse)
      setInventoryLensData(lensResponse)
      setInventorySuccess('Lens cost saved successfully.')
    } catch (error) {
      setInventoryError(error.message)
    } finally {
      setSavingLensBillingId(null)
    }
  }

  async function deleteLensCostEntry(billingId) {
    if (!billingId) return

    setSavingLensBillingId(billingId)
    setInventoryError('')
    setInventorySuccess('')

    try {
      await apiFetch(`/inventory/lens-tracker/${billingId}`, {
        method: 'DELETE',
        token,
      })

      const branchId = session.is_admin ? selectedBranchId : session.branch_id
      const [inventoryResponse, lensResponse] = await Promise.all([
        apiFetch(`/inventory?${buildInventoryParams(branchId).toString()}`, { token }),
        apiFetch(
          `/inventory/lens-tracker?${new URLSearchParams({
            branch_id: String(branchId),
            date_from: lensTrackerQuery.date_from,
            date_to: lensTrackerQuery.date_to,
            ...(lensTrackerQuery.search ? { search: lensTrackerQuery.search } : {}),
            ...(lensTrackerQuery.tracking && lensTrackerQuery.tracking !== 'all' ? { tracking: lensTrackerQuery.tracking } : {}),
          }).toString()}`,
          { token },
        ),
      ])

      setInventoryData(inventoryResponse)
      setInventoryLensData(lensResponse)
      setInventorySuccess('Lens cost deleted successfully.')
    } catch (error) {
      setInventoryError(error.message)
    } finally {
      setSavingLensBillingId(null)
    }
  }

  async function saveInventoryProduct(payload) {
    setIsSavingInventoryProduct(true)
    setInventoryError('')
    setInventorySuccess('')

    try {
      const branchId = session.is_admin ? selectedBranchId : session.branch_id
      const body = {
        branch_id: branchId,
        code: payload.code,
        name: payload.name,
        category: payload.category,
        grade: payload.grade || null,
        stock: Number(payload.stock || 0),
        min_price: Number(payload.min_price || 0),
        max_price: Number(payload.max_price || 0),
      }

      await apiFetch(payload.id ? `/inventory/${payload.id}` : '/inventory', {
        method: payload.id ? 'PUT' : 'POST',
        token,
        body,
      })

      const inventoryResponse = await apiFetch(`/inventory?${buildInventoryParams(branchId).toString()}`, { token })

      setInventoryData(inventoryResponse)
      setInventoryForm(defaultInventoryProductForm())
      setInventorySuccess(payload.id ? 'Inventory item updated successfully.' : 'Inventory item added successfully.')
    } catch (error) {
      setInventoryError(error.message)
      throw error
    } finally {
      setIsSavingInventoryProduct(false)
    }
  }

  async function deleteInventoryProduct(productId) {
    setIsSavingInventoryProduct(true)
    setInventoryError('')
    setInventorySuccess('')

    try {
      const branchId = session.is_admin ? selectedBranchId : session.branch_id

      await apiFetch(`/inventory/${productId}`, {
        method: 'DELETE',
        token,
        body: { branch_id: branchId },
      })

      const inventoryResponse = await apiFetch(`/inventory?${buildInventoryParams(branchId).toString()}`, { token })

      setInventoryData(inventoryResponse)
      setInventoryForm((current) => (current.id === productId ? defaultInventoryProductForm() : current))
      setInventorySuccess('Inventory item deleted successfully.')
    } catch (error) {
      setInventoryError(error.message)
      throw error
    } finally {
      setIsSavingInventoryProduct(false)
    }
  }

  async function submitCustomerMessage(payload) {
    setIsSendingCustomerMessage(true)
    setCustomerServiceError('')
    setCustomerServiceSuccess('')

    try {
      const branchId = session.is_admin ? selectedBranchId : session.branch_id
      await apiFetch('/customer-service/messages/send', {
        method: 'POST',
        token,
        body: {
          branch_id: branchId,
          ...payload,
          template_id: payload.template_id || null,
          patient_id: payload.patient_id || null,
        },
      })

      setCustomerServiceSuccess('Message action completed successfully.')
      setCustomerServiceQuery((current) => ({ ...current }))
      return true
    } catch (error) {
      setCustomerServiceError(error.message)
      return false
    } finally {
      setIsSendingCustomerMessage(false)
    }
  }

  async function sendCustomerMessage(event) {
    event.preventDefault()
    await submitCustomerMessage(messageForm)
  }

  async function saveCustomerTemplate(event) {
    event.preventDefault()
    setIsSavingTemplate(true)
    setCustomerServiceError('')
    setCustomerServiceSuccess('')

    try {
      const branchId = session.is_admin ? selectedBranchId : session.branch_id
      await apiFetch(
        templateForm.id ? `/customer-service/templates/${templateForm.id}` : '/customer-service/templates',
        {
          method: templateForm.id ? 'PUT' : 'POST',
          token,
          body: {
            branch_id: branchId,
            ...templateForm,
          },
        },
      )

      setTemplateForm(defaultTemplateForm())
      setCustomerServiceSuccess(templateForm.id ? 'Template updated successfully.' : 'Template saved successfully.')
      setCustomerServiceQuery((current) => ({ ...current }))
      return true
    } catch (error) {
      setCustomerServiceError(error.message)
      return false
    } finally {
      setIsSavingTemplate(false)
    }
  }

  async function deleteCustomerTemplate(templateId) {
    setCustomerServiceError('')
    setCustomerServiceSuccess('')

    try {
      const branchId = session.is_admin ? selectedBranchId : session.branch_id
      await apiFetch(`/customer-service/templates/${templateId}`, {
        method: 'DELETE',
        token,
        body: { branch_id: branchId },
      })
      setTemplateForm(defaultTemplateForm())
      setCustomerServiceSuccess('Template deleted successfully.')
      setCustomerServiceQuery((current) => ({ ...current }))
      return true
    } catch (error) {
      setCustomerServiceError(error.message)
      return false
    }
  }

  function syncPickupStatusState(billingIds, nextStatus) {
    setCustomerServiceData((current) => {
      if (!current) return current

      const statusDisplay = {
        ready: 'Ready for Pickup',
        notified: 'Notified',
        picked_up: 'Picked Up',
      }[nextStatus] ?? 'Not Ready'

      const nextPickupRecords = (current.pickup_records ?? []).map((record) => (
        billingIds.includes(record.billing_id)
          ? { ...record, pickup_status: nextStatus, pickup_status_display: statusDisplay }
          : record
      ))

      const updatedReadyEntries = nextPickupRecords
        .filter((record) => billingIds.includes(record.billing_id) && ['ready', 'notified'].includes(record.pickup_status))
        .map((record) => ({
          billing_id: record.billing_id,
          branch_id: record.branch_id,
          patient_id: record.patient_id,
          folder_id: record.folder_id,
          patient_name: record.patient_name,
          receipt_number: record.receipt_number,
          balance: record.balance,
          billing_date: record.billing_date,
          phone: record.phone,
          pickup_status: record.pickup_status,
          pickup_status_display: record.pickup_status_display,
          branch_name: record.branch_name,
        }))

      const readyLookup = new Map(
        (current.ready_for_pickup ?? [])
          .filter((record) => !billingIds.includes(record.billing_id))
          .map((record) => [record.billing_id, record]),
      )

      for (const record of updatedReadyEntries) {
        readyLookup.set(record.billing_id, record)
      }

      return {
        ...current,
        pickup_records: nextPickupRecords,
        ready_for_pickup: Array.from(readyLookup.values()),
      }
    })
  }

  async function updatePickupStatus(billingIdOrIds, action) {
    const billingIds = [...new Set((Array.isArray(billingIdOrIds) ? billingIdOrIds : [billingIdOrIds]).filter(Boolean))]
    if (!billingIds.length) return

    setPickupBusyIds(billingIds)
    setCustomerServiceError('')
    setCustomerServiceSuccess('')

    try {
      const branchId = session.is_admin ? selectedBranchId : session.branch_id
      await Promise.all(
        billingIds.map((billingId) => apiFetch(`/customer-service/pickups/${billingId}/${action}`, {
          method: 'POST',
          token,
          body: { branch_id: branchId },
        })),
      )

      syncPickupStatusState(billingIds, action === 'ready' ? 'ready' : 'picked_up')

      const plural = billingIds.length > 1
      setCustomerServiceSuccess(
        action === 'ready'
          ? (plural ? 'Selected records marked as ready for pickup.' : 'Marked as ready for pickup.')
          : (plural ? 'Selected pickups confirmed successfully.' : 'Pickup confirmed successfully.'),
      )
      setCustomerServiceQuery((current) => ({ ...current }))
    } catch (error) {
      setCustomerServiceError(error.message)
    } finally {
      setPickupBusyIds([])
    }
  }

  async function printFinanceReceipt(receipt) {
    setFinanceError('')

    try {
      if (receipt?.billing_id) {
        const branchId = session.is_admin ? selectedBranchId : session.branch_id
        const detailResponse = await apiFetch(`/finance/payments/${receipt.billing_id}?branch_id=${branchId}`, { token })
        openReceiptPreview(
          {
            ...receipt,
            name: detailResponse.billing?.name ?? receipt?.name,
            folder_id: detailResponse.billing?.folder_id ?? receipt?.folder_id,
            billing_id: detailResponse.billing?.id ?? receipt?.billing_id,
            receipt_number: detailResponse.billing?.receipt_number ?? receipt?.receipt_number,
            total_amount: detailResponse.billing?.total_amount ?? receipt?.total_amount,
            balance: detailResponse.billing?.calculated_balance ?? receipt?.balance,
            nhil_amount: detailResponse.billing?.nhil_amount ?? receipt?.nhil_amount,
            getfund_amount: detailResponse.billing?.getfund_amount ?? receipt?.getfund_amount,
            vat_amount: detailResponse.billing?.vat_amount ?? receipt?.vat_amount,
            tax: detailResponse.billing?.tax ?? receipt?.tax,
          },
          detailResponse.billing,
        )
        return
      }
    } catch (error) {
      openReceiptPreview(receipt, receipt)
      setFinanceError(error.message || 'Could not load the billing summary for this receipt.')
      return
    }

    openReceiptPreview(receipt, receipt)
  }

  async function saveInsuranceClaim(event) {
    event.preventDefault()
    setIsSavingInsuranceClaim(true)
    setInsuranceError('')
    setInsuranceSuccess('')

    try {
      await apiFetch('/insurance/claims', {
        method: 'POST',
        token,
        body: {
          ...insuranceForm,
          billing_id: Number(insuranceForm.billing_id),
          patient_id: insuranceForm.patient_id ? Number(insuranceForm.patient_id) : null,
          amount_paid: Number(insuranceForm.amount_paid || 0),
        },
      })

      await refreshInsuranceConnectedData({ suppressErrors: true })
      setInsuranceSuccess('Insurance claim saved successfully.')
      setInsuranceForm(defaultInsuranceForm())
    } catch (error) {
      setInsuranceError(error.message)
    } finally {
      setIsSavingInsuranceClaim(false)
    }
  }

  async function markClaimPaid(claimId, claimBranchId = null) {
    setClaimBusyId(claimId)
    setInsuranceError('')
    setInsuranceSuccess('')

    try {
      const branchId = claimBranchId ?? (session.is_admin ? selectedBranchId : session.branch_id)
      await apiFetch(`/insurance/claims/${claimId}/mark-paid?branch_id=${branchId}`, {
        method: 'PATCH',
        token,
      })
      await refreshInsuranceConnectedData({ suppressErrors: true })
      setInsuranceSuccess('Insurance claim marked as paid.')
    } catch (error) {
      setInsuranceError(error.message)
    } finally {
      setClaimBusyId(null)
    }
  }

  async function markClaimPending(claimId, claimBranchId = null) {
    setClaimBusyId(claimId)
    setInsuranceError('')
    setInsuranceSuccess('')

    try {
      const branchId = claimBranchId ?? (session.is_admin ? selectedBranchId : session.branch_id)
      await apiFetch(`/insurance/claims/${claimId}/mark-pending?branch_id=${branchId}`, {
        method: 'PATCH',
        token,
      })
      await refreshInsuranceConnectedData({ suppressErrors: true })
      setInsuranceSuccess('Insurance claim reverted to pending.')
    } catch (error) {
      setInsuranceError(error.message)
    } finally {
      setClaimBusyId(null)
    }
  }

  async function updateInsuranceClaim(claimId, payload, claimBranchId = null) {
    setClaimBusyId(claimId)
    setInsuranceError('')
    setInsuranceSuccess('')

    try {
      const branchId = claimBranchId ?? (session.is_admin ? selectedBranchId : session.branch_id)
      const response = await apiFetch(`/insurance/claims/${claimId}?branch_id=${branchId}`, {
        method: 'PUT',
        token,
        body: payload,
      })
      setInsuranceData((current) => {
        if (!current) return current

        return {
          ...current,
          claims: (current.claims ?? []).map((claim) =>
            claim.id === claimId
              ? {
                  ...claim,
                  ...payload,
                  amount_paid: payload.amount_paid === '' ? claim.amount_paid : payload.amount_paid,
                }
              : claim,
          ),
        }
      })
      await refreshInsuranceConnectedData({ suppressErrors: true })
      setInsuranceSuccess(response.message || 'Insurance claim updated successfully.')
      return true
    } catch (error) {
      setInsuranceError(error.message)
      return false
    } finally {
      setClaimBusyId(null)
    }
  }

  async function deleteInsuranceClaim(claimId, claimBranchId = null) {
    setClaimBusyId(claimId)
    setInsuranceError('')
    setInsuranceSuccess('')

    try {
      const branchId = claimBranchId ?? (session.is_admin ? selectedBranchId : session.branch_id)
      await apiFetch(`/insurance/claims/${claimId}?branch_id=${branchId}`, {
        method: 'DELETE',
        token,
      })
      await refreshInsuranceConnectedData({ suppressErrors: true })
      setInsuranceSuccess('Insurance claim deleted successfully.')
      return true
    } catch (error) {
      setInsuranceError(error.message)
      return false
    } finally {
      setClaimBusyId(null)
    }
  }

  async function generateInsuranceReport() {
    setInsuranceError('')
    const branchId = session.is_admin ? selectedBranchId : session.branch_id
    const params = new URLSearchParams({ branch_id: String(branchId) })

    for (const [key, value] of Object.entries(insuranceQuery)) {
      if (!value || value === 'all' || key === 'page' || key === 'per_page') continue
      params.set(key, value)
    }

    try {
      return await apiFetch(`/insurance/claims/report?${params.toString()}`, { token })
    } catch (error) {
      setInsuranceError(error.message)
      throw error
    }
  }

  async function saveInsuranceRemittance(payload) {
    setIsSavingInsuranceRemittance(true)
    setInsuranceError('')
    setInsuranceSuccess('')

    try {
      await apiFetch('/insurance/remittances', {
        method: 'POST',
        token,
        body: payload,
      })

      await refreshInsuranceConnectedData({ suppressErrors: true })
      setInsuranceSuccess('Manual insurance receipt recorded successfully.')
      return true
    } catch (error) {
      setInsuranceError(error.message)
      return false
    } finally {
      setIsSavingInsuranceRemittance(false)
    }
  }

  if (isBooting) {
    return (
      <main className="app-shell">
        <section className="login-shell login-shell-modern boot-restore-shell">
          <div className="brand-panel">
            <div className="boot-restore-logo-wrap">
              <img src="/opticplus-login-logo.png" alt="Opticplus logo" className="boot-restore-logo" />
            </div>
            <h1>Restoring your session.</h1>
            <p>Checking the Laravel API and your stored login token.</p>
          </div>
          <AppCreditFooter />
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      {!session ? (
        <LoginScreen
          theme={theme}
          setTheme={setTheme}
          credentials={credentials}
          setCredentials={setCredentials}
          companyProfile={companyProfileForm}
          handleLogin={handleLogin}
          isLoggingIn={isLoggingIn}
          loginError={loginError}
        />
      ) : (
        <section className={isChromeHiddenView ? `portal-shell ${isDatabaseFullscreen ? 'database-fullscreen-shell' : 'patient-form-fullscreen-shell'}` : 'portal-shell'}>
          {!isChromeHiddenView && isSidebarOpen ? (
            <button
              type="button"
              className="sidebar-overlay"
              aria-label="Close navigation"
              onClick={() => setIsSidebarOpen(false)}
            />
          ) : null}
          {!isChromeHiddenView ? (
          <aside className={`sidebar${isGeneralManager ? ' general-manager-sidebar' : ''}${isSidebarOpen ? ' is-open' : ''}`}>
            <div className="sidebar-brand">
              <div className="brand-mark">
                <img src="/bealet-logo.png" alt="Bealet Optical Center logo" className="brand-logo" />
              </div>
              <div className="sidebar-brand-copy">
                <strong>Bealet Optical Center</strong>
                <span>{isOptometrist ? 'Optometrist Panel' : isExecutive ? 'Executive Finance Desk' : 'OPTICPLUS Operations Portal'}</span>
              </div>
              <button
                type="button"
                className="sidebar-mobile-close"
                onClick={() => setIsSidebarOpen(false)}
                aria-label="Close navigation menu"
              >
                <PortalIcon name="close" className="nav-icon" />
              </button>
            </div>

            <nav className="sidebar-nav">
              {visibleNavSections.map((section) => (
                <div key={section.title} className="sidebar-nav-section">
                  <p className="sidebar-nav-title">{section.title}</p>
                  <div className="sidebar-nav-group">
                    {section.items.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        className={item.label === activeView ? 'nav-item active' : 'nav-item'}
                        onClick={() => handleSidebarNavigation(item.label)}
                      >
                        <PortalIcon name={item.icon} className="nav-icon" />
                        <span>{item.navLabel ?? item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="sidebar-footnote">
              <div className="sidebar-footnote-head">
                <PortalIcon name="support" className="sidebar-footnote-icon" />
                <span>Signed in as</span>
              </div>
              <strong>{roleLabels[session.role] ?? session.role}</strong>
              <button
                type="button"
                className="nav-item sidebar-signout"
                onClick={() => {
                  setIsSidebarOpen(false)
                  handleLogout()
                }}
              >
                <PortalIcon name="logout" className="nav-icon" />
                <span>Sign out</span>
              </button>
            </div>
          </aside>
          ) : null}

          <div className={isChromeHiddenView ? `portal-main ${isDatabaseFullscreen ? 'database-fullscreen-main' : 'patient-form-fullscreen-main'}` : 'portal-main'}>
            {!isChromeHiddenView ? (
            <header className="portal-header">
              <div
                className="portal-hero"
                style={heroWallpaper ? { '--portal-hero-wallpaper': `url("${heroWallpaper}")` } : undefined}
              >
                <div className="portal-hero-main">
                  <div className="portal-hero-copy">
                    <button
                      type="button"
                      className="sidebar-toggle"
                      onClick={() => setIsSidebarOpen((current) => !current)}
                      aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
                      aria-expanded={isSidebarOpen}
                    >
                      <PortalIcon name={isSidebarOpen ? 'close' : 'menu'} className="nav-icon" />
                    </button>
                    <p className="eyebrow">Welcome Back</p>
                    <h2>{session.name}</h2>
                    <div className="portal-hero-meta">
                      <span className="portal-hero-branch">
                        {session.is_admin ? activeBranchName : `${session.branch || activeBranchName} Branch`}
                      </span>
                      <span className="portal-hero-role">{roleLabels[session.role] ?? session.role}</span>
                    </div>
                    <div className="portal-hero-page">
                      <strong>{activeView}</strong>
                      <p className="header-copy">
                        {isOptometrist
                          ? 'Managing patient review, appointments, prescriptions, and clinical follow-up for your branch.'
                          : isExecutive
                          ? 'Reviewing revenue, expenses, insurance exposure, reports, and internal communication from an executive read-only desk.'
                          : isMergedView
                          ? 'Monitoring company-wide performance across the mastered database.'
                          : `Monitoring ${session.is_admin ? `${activeBranchName} branch` : `${session.branch || activeBranchName} branch`} operations.`}
                      </p>
                    </div>
                  </div>

                  <div className="header-actions portal-hero-actions">
                    {session.is_admin ? (
                      <label className="branch-select">
                        Branch
                        <select
                          value={selectedBranchId}
                          onChange={(event) => setSelectedBranchId(Number(event.target.value))}
                        >
                          {branchOptions.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    <button
                      type="button"
                      className="theme-toggle icon-button"
                      onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
                      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    >
                      <PortalIcon name={theme === 'dark' ? 'sun' : 'moon'} className="nav-icon" />
                    </button>

                    <div className="profile-menu-shell" ref={profileMenuRef}>
                      <button
                        type="button"
                        className="profile-chip"
                        onClick={() => setIsProfileMenuOpen((current) => !current)}
                        aria-expanded={isProfileMenuOpen}
                        aria-haspopup="menu"
                      >
                        <div className="profile-chip-avatar">
                          {headerProfile.imageUrl ? (
                            <img src={headerProfile.imageUrl} alt={`${headerProfile.name} profile`} className="profile-chip-image" />
                          ) : (
                            <PortalIcon name="patients" className="profile-chip-icon" />
                          )}
                        </div>
                        <div className="profile-chip-copy">
                          <strong>{String(headerProfile.name || '').split(' ')[0] || 'Profile'}</strong>
                          <span>{headerProfile.subtitle}</span>
                        </div>
                        <PortalIcon name="chevron-down" className={isProfileMenuOpen ? 'profile-chevron open' : 'profile-chevron'} />
                      </button>

                      {isProfileMenuOpen ? (
                        <div className="profile-dropdown" role="menu">
                          {canAccessSystemSettings ? (
                            <button
                              type="button"
                              className="profile-dropdown-item"
                              onClick={() => {
                                setActiveView('Settings')
                                setIsProfileMenuOpen(false)
                              }}
                            >
                              <PortalIcon name="settings" className="nav-icon" />
                              <span>Settings</span>
                            </button>
                          ) : null}

                          <button
                            type="button"
                            className="profile-dropdown-item danger"
                            onClick={() => {
                              setIsProfileMenuOpen(false)
                              handleLogout()
                            }}
                          >
                            <PortalIcon name="logout" className="nav-icon" />
                            <span>Logout</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </header>
            ) : null}

            {isMergedView && !mergedSupportedViews.includes(activeView) ? (
              <section className="module-section">
                <div className="panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Merged Mode</p>
                      <h3>This view is currently read-only for company-wide monitoring</h3>
                    </div>
                  </div>
                  <p className="header-copy">
                    Switch the branch selector from `Merged` to `Labadi` or `Madina` to perform branch-specific actions in {activeView}.
                  </p>
                </div>
              </section>
            ) : null}

            {activeView === 'Dashboard' ? (
              isGeneralManager ? (
                <ManagerDashboardSection
                  token={token}
                  selectedBranchId={selectedBranchId}
                  apiFetch={apiFetch}
                  setActiveView={setActiveView}
                />
              ) : isExecutive ? (
                <ExecutiveDashboardSection
                  dashboard={dashboard}
                  financeSummary={financeSummary}
                  financeSales={financeSales}
                  financeExpenses={financeExpenses}
                  insuranceData={insuranceData}
                  isLoadingDashboard={isLoadingDashboard}
                  isLoadingFinanceSummary={isLoadingFinanceSummary}
                  isLoadingFinanceSales={isLoadingFinanceSales}
                  isLoadingFinanceExpenses={isLoadingFinanceExpenses}
                  isLoadingInsuranceData={isLoadingInsuranceData}
                  setActiveView={setActiveView}
                  session={session}
                />
              ) : isAccountant ? (
                <AccountantDashboardSection
                  token={token}
                  selectedBranchId={selectedBranchId}
                  apiFetch={apiFetch}
                  setActiveView={setActiveView}
                />
              ) : isOptometrist ? (
                <OptometristDashboardSection
                  dashboard={dashboard}
                  patientData={patientData}
                  isLoadingDashboard={isLoadingDashboard}
                  isLoadingPatients={isLoadingPatients}
                  rowBusyId={rowBusyId}
                  markAsSeen={markAsSeen}
                  setActiveView={setActiveView}
                  currency={currency}
                />
              ) : (
                <DashboardSection
                  dashboard={dashboard}
                  stats={dashboardStats}
                  isLoadingDashboard={isLoadingDashboard}
                  currency={currency}
                  hideFinanceSnapshot={session?.role === 'receptionist'}
                  onPatientIntakeClick={
                    session?.role === 'receptionist'
                      ? () => {
                          setPatientForm(patientFormDefaults)
                          setDashboardIntakeModalOpen(true)
                        }
                      : undefined
                  }
                />
              )
            ) : null}

            {activeView === 'Users' && isGeneralManager ? (
              <UsersManagementSection
                token={token}
                selectedBranchId={selectedBranchId}
                apiFetch={apiFetch}
                onHeaderProfileChange={setUserHeroProfile}
              />
            ) : null}

            {activeView === 'Database' && isGeneralManager ? (
              <DatabaseAdminSection
                token={token}
                selectedBranchId={selectedBranchId}
                setSelectedBranchId={setSelectedBranchId}
                branchOptions={branchOptions}
                apiFetch={apiFetch}
                setActiveView={setActiveView}
              />
            ) : null}

            {activeView === 'Staff Profiles' && isGeneralManager ? (
              <StaffProfilesSection
                token={token}
                selectedBranchId={selectedBranchId}
                apiFetch={apiFetch}
                onHeaderProfileChange={setStaffHeroProfile}
              />
            ) : null}

            {['Patients', ...optometristPatientViews].includes(activeView) ? (
              <PatientsSection
                activeView={activeView}
                setActiveView={setActiveView}
                session={session}
                companyProfile={companyProfileForm}
                patientMeta={patientMeta}
                patientData={patientData}
                patientStats={patientStats}
                patientFilters={patientFilters}
                setPatientFilters={setPatientFilters}
                setPatientQuery={setPatientQuery}
                patientForm={patientForm}
                setPatientForm={setPatientForm}
                savePatientRecord={savePatientRecord}
                isSavingPatient={isSavingPatient}
                patientLookupSearch={patientLookupSearch}
                setPatientLookupSearch={setPatientLookupSearch}
                patientLookupResults={patientLookupResults}
                isSearchingPatientLookup={isSearchingPatientLookup}
                patientError={patientError}
                patientSuccess={patientSuccess}
                isLoadingPatients={isLoadingPatients}
                changePatientPage={(page) => setPatientQuery((current) => ({ ...current, page }))}
                rowAssignments={rowAssignments}
                setRowAssignments={setRowAssignments}
                rowBusyId={rowBusyId}
                markAsSeen={markAsSeen}
                assignOptometrist={assignOptometrist}
                updatePatientDetails={updatePatientDetails}
                fetchPatientPrescriptions={fetchPatientPrescriptions}
                addPatientPrescription={addPatientPrescription}
                fetchMedicalReport={fetchMedicalReport}
                fetchPatientExamForm={fetchPatientExamForm}
                savePatientExamForm={savePatientExamForm}
                fetchPatientDocuments={fetchPatientDocuments}
                uploadPatientDocuments={uploadPatientDocuments}
              />
            ) : null}

            {activeView === 'Appointments' && isOptometrist ? (
              <OptometristAppointmentsSection
                dashboard={dashboard}
                isLoadingDashboard={isLoadingDashboard}
                setActiveView={setActiveView}
              />
            ) : null}

            {activeView === 'Billing' ? (
              <BillingSection
                session={session}
                billingMeta={billingMeta}
                billingData={billingData}
                dailyPayments={dailyPayments}
                billingPatientSearch={billingPatientSearch}
                setBillingPatientSearch={setBillingPatientSearch}
                billingPatientResults={billingPatientResults}
                isSearchingBillingPatients={isSearchingBillingPatients}
                billingFilters={billingFilters}
                setBillingFilters={setBillingFilters}
                setBillingQuery={setBillingQuery}
                billingForm={billingForm}
                setBillingForm={setBillingForm}
                saveBillingRecord={saveBillingRecord}
                isSavingBill={isSavingBill}
                isLoadingBilling={isLoadingBilling}
                isLoadingBillingMeta={isLoadingBillingMeta}
                isLoadingPayments={isLoadingPayments}
                selectedPaymentRecordId={selectedPaymentRecordId}
                setSelectedPaymentRecordId={setSelectedPaymentRecordId}
                paymentDetail={paymentDetail}
                isLoadingPaymentDetail={isLoadingPaymentDetail}
                openBillingPayment={(billingId) => openPaymentModal(billingId, 'Billing')}
                billingError={billingError}
                billingSuccess={billingSuccess}
                dailyPaymentSearch={dailyPaymentSearch}
                setDailyPaymentSearch={setDailyPaymentSearch}
                saveBillingPricing={saveBillingPricing}
                exportBillingData={exportBillingData}
              />
            ) : null}

            {activeView === 'Finance' ? (
              <FinanceSection
                pageMode={session?.role === 'receptionist' && paymentModalOriginView !== 'Billing' ? 'receipts' : 'default'}
                financeSummary={financeSummary}
                financeSales={financeSales}
                financeExpenses={financeExpenses}
                financePayments={financePayments}
                financeSalesFilters={financeSalesFilters}
                setFinanceSalesFilters={setFinanceSalesFilters}
                setFinanceSalesQuery={setFinanceSalesQuery}
                financeExpenseFilters={financeExpenseFilters}
                setFinanceExpenseFilters={setFinanceExpenseFilters}
                setFinanceExpenseQuery={setFinanceExpenseQuery}
                expenseForm={expenseForm}
                setExpenseForm={setExpenseForm}
                saveExpenseRecord={saveExpenseRecord}
                updateExpenseRecord={updateExpenseRecord}
                deleteExpenseRecord={deleteExpenseRecord}
                saveExpenseCategory={saveExpenseCategory}
                updateExpenseCategory={updateExpenseCategory}
                deleteExpenseCategory={deleteExpenseCategory}
                isSavingExpense={isSavingExpense}
                isUpdatingExpenseRecord={isUpdatingExpenseRecord}
                deletingExpenseRecordId={deletingExpenseRecordId}
                isSavingExpenseCategory={isSavingExpenseCategory}
                isDeletingExpenseCategoryId={isDeletingExpenseCategoryId}
                financePaymentFilters={financePaymentFilters}
                setFinancePaymentFilters={setFinancePaymentFilters}
                financePaymentQuery={financePaymentQuery}
                setFinancePaymentQuery={setFinancePaymentQuery}
                selectedPaymentRecordId={selectedPaymentRecordId}
                setSelectedPaymentRecordId={setSelectedPaymentRecordId}
                openPaymentRecord={(billingId) => openPaymentModal(billingId, 'Finance')}
                closePaymentModal={closePaymentModal}
                paymentDetail={paymentDetail}
                paymentForm={paymentForm}
                setPaymentForm={setPaymentForm}
                isSplitPaymentEnabled={isSplitPaymentEnabled}
                setIsSplitPaymentEnabled={setIsSplitPaymentEnabled}
                secondaryPaymentForm={secondaryPaymentForm}
                setSecondaryPaymentForm={setSecondaryPaymentForm}
                saveBillingPayment={saveBillingPayment}
                initializePaystackPayment={initializePaystackPayment}
                verifyPaystackPayment={verifyPaystackPayment}
                insuranceMeta={insuranceMeta}
                financeError={financeError}
                financeSuccess={financeSuccess}
                isLoadingFinanceSummary={isLoadingFinanceSummary}
                isLoadingFinanceSales={isLoadingFinanceSales}
                isLoadingFinanceExpenses={isLoadingFinanceExpenses}
                isLoadingFinancePayments={isLoadingFinancePayments}
                isLoadingPaymentDetail={isLoadingPaymentDetail}
                isSavingPayment={isSavingPayment}
                isInitializingPaystack={isInitializingPaystack}
                isVerifyingPaystack={isVerifyingPaystack}
                openReceiptPreview={openReceiptPreview}
                printFinanceReceipt={printFinanceReceipt}
                session={session}
                readOnly={isExecutive}
              />
            ) : null}

            {activeView === 'Sales' ? (
              <FinanceSection
                pageMode="sales"
                financeSummary={financeSummary}
                financeSales={financeSales}
                financeExpenses={financeExpenses}
                financePayments={financePayments}
                financeSalesFilters={financeSalesFilters}
                setFinanceSalesFilters={setFinanceSalesFilters}
                setFinanceSalesQuery={setFinanceSalesQuery}
                financeExpenseFilters={financeExpenseFilters}
                setFinanceExpenseFilters={setFinanceExpenseFilters}
                setFinanceExpenseQuery={setFinanceExpenseQuery}
                expenseForm={expenseForm}
                setExpenseForm={setExpenseForm}
                saveExpenseRecord={saveExpenseRecord}
                updateExpenseRecord={updateExpenseRecord}
                deleteExpenseRecord={deleteExpenseRecord}
                saveExpenseCategory={saveExpenseCategory}
                updateExpenseCategory={updateExpenseCategory}
                deleteExpenseCategory={deleteExpenseCategory}
                isSavingExpense={isSavingExpense}
                isUpdatingExpenseRecord={isUpdatingExpenseRecord}
                deletingExpenseRecordId={deletingExpenseRecordId}
                isSavingExpenseCategory={isSavingExpenseCategory}
                isDeletingExpenseCategoryId={isDeletingExpenseCategoryId}
                financePaymentFilters={financePaymentFilters}
                setFinancePaymentFilters={setFinancePaymentFilters}
                financePaymentQuery={financePaymentQuery}
                setFinancePaymentQuery={setFinancePaymentQuery}
                selectedPaymentRecordId={selectedPaymentRecordId}
                setSelectedPaymentRecordId={setSelectedPaymentRecordId}
                openPaymentRecord={(billingId) => openPaymentModal(billingId, activeView)}
                closePaymentModal={closePaymentModal}
                paymentDetail={paymentDetail}
                paymentForm={paymentForm}
                setPaymentForm={setPaymentForm}
                isSplitPaymentEnabled={isSplitPaymentEnabled}
                setIsSplitPaymentEnabled={setIsSplitPaymentEnabled}
                secondaryPaymentForm={secondaryPaymentForm}
                setSecondaryPaymentForm={setSecondaryPaymentForm}
                saveBillingPayment={saveBillingPayment}
                initializePaystackPayment={initializePaystackPayment}
                verifyPaystackPayment={verifyPaystackPayment}
                insuranceMeta={insuranceMeta}
                financeError={financeError}
                financeSuccess={financeSuccess}
                isLoadingFinanceSummary={isLoadingFinanceSummary}
                isLoadingFinanceSales={isLoadingFinanceSales}
                isLoadingFinanceExpenses={isLoadingFinanceExpenses}
                isLoadingFinancePayments={isLoadingFinancePayments}
                isLoadingPaymentDetail={isLoadingPaymentDetail}
                isSavingPayment={isSavingPayment}
                isInitializingPaystack={isInitializingPaystack}
                isVerifyingPaystack={isVerifyingPaystack}
                openReceiptPreview={openReceiptPreview}
                printFinanceReceipt={printFinanceReceipt}
                session={session}
                readOnly={isExecutive}
              />
            ) : null}

            {activeView === 'Revenue Tracking' ? (
              <FinanceSection
                pageMode="revenue"
                financeSummary={financeSummary}
                financeSales={financeSales}
                financeExpenses={financeExpenses}
                financePayments={financePayments}
                financeSalesFilters={financeSalesFilters}
                setFinanceSalesFilters={setFinanceSalesFilters}
                setFinanceSalesQuery={setFinanceSalesQuery}
                financeExpenseFilters={financeExpenseFilters}
                setFinanceExpenseFilters={setFinanceExpenseFilters}
                setFinanceExpenseQuery={setFinanceExpenseQuery}
                expenseForm={expenseForm}
                setExpenseForm={setExpenseForm}
                saveExpenseRecord={saveExpenseRecord}
                updateExpenseRecord={updateExpenseRecord}
                deleteExpenseRecord={deleteExpenseRecord}
                saveExpenseCategory={saveExpenseCategory}
                updateExpenseCategory={updateExpenseCategory}
                deleteExpenseCategory={deleteExpenseCategory}
                isSavingExpense={isSavingExpense}
                isUpdatingExpenseRecord={isUpdatingExpenseRecord}
                deletingExpenseRecordId={deletingExpenseRecordId}
                isSavingExpenseCategory={isSavingExpenseCategory}
                isDeletingExpenseCategoryId={isDeletingExpenseCategoryId}
                financePaymentFilters={financePaymentFilters}
                setFinancePaymentFilters={setFinancePaymentFilters}
                financePaymentQuery={financePaymentQuery}
                setFinancePaymentQuery={setFinancePaymentQuery}
                selectedPaymentRecordId={selectedPaymentRecordId}
                setSelectedPaymentRecordId={setSelectedPaymentRecordId}
                openPaymentRecord={(billingId) => openPaymentModal(billingId, activeView)}
                closePaymentModal={closePaymentModal}
                paymentDetail={paymentDetail}
                paymentForm={paymentForm}
                setPaymentForm={setPaymentForm}
                isSplitPaymentEnabled={isSplitPaymentEnabled}
                setIsSplitPaymentEnabled={setIsSplitPaymentEnabled}
                secondaryPaymentForm={secondaryPaymentForm}
                setSecondaryPaymentForm={setSecondaryPaymentForm}
                saveBillingPayment={saveBillingPayment}
                initializePaystackPayment={initializePaystackPayment}
                verifyPaystackPayment={verifyPaystackPayment}
                insuranceMeta={insuranceMeta}
                financeError={financeError}
                financeSuccess={financeSuccess}
                isLoadingFinanceSummary={isLoadingFinanceSummary}
                isLoadingFinanceSales={isLoadingFinanceSales}
                isLoadingFinanceExpenses={isLoadingFinanceExpenses}
                isLoadingFinancePayments={isLoadingFinancePayments}
                isLoadingPaymentDetail={isLoadingPaymentDetail}
                isSavingPayment={isSavingPayment}
                isInitializingPaystack={isInitializingPaystack}
                isVerifyingPaystack={isVerifyingPaystack}
                openReceiptPreview={openReceiptPreview}
                printFinanceReceipt={printFinanceReceipt}
                session={session}
                readOnly={isExecutive}
              />
            ) : null}

            {activeView === 'Expenses' ? (
              <FinanceSection
                pageMode="expenses"
                financeSummary={financeSummary}
                financeSales={financeSales}
                financeExpenses={financeExpenses}
                financePayments={financePayments}
                financeSalesFilters={financeSalesFilters}
                setFinanceSalesFilters={setFinanceSalesFilters}
                setFinanceSalesQuery={setFinanceSalesQuery}
                financeExpenseFilters={financeExpenseFilters}
                setFinanceExpenseFilters={setFinanceExpenseFilters}
                setFinanceExpenseQuery={setFinanceExpenseQuery}
                expenseForm={expenseForm}
                setExpenseForm={setExpenseForm}
                saveExpenseRecord={saveExpenseRecord}
                updateExpenseRecord={updateExpenseRecord}
                deleteExpenseRecord={deleteExpenseRecord}
                saveExpenseCategory={saveExpenseCategory}
                updateExpenseCategory={updateExpenseCategory}
                deleteExpenseCategory={deleteExpenseCategory}
                isSavingExpense={isSavingExpense}
                isUpdatingExpenseRecord={isUpdatingExpenseRecord}
                deletingExpenseRecordId={deletingExpenseRecordId}
                isSavingExpenseCategory={isSavingExpenseCategory}
                isDeletingExpenseCategoryId={isDeletingExpenseCategoryId}
                financePaymentFilters={financePaymentFilters}
                setFinancePaymentFilters={setFinancePaymentFilters}
                financePaymentQuery={financePaymentQuery}
                setFinancePaymentQuery={setFinancePaymentQuery}
                selectedPaymentRecordId={selectedPaymentRecordId}
                setSelectedPaymentRecordId={setSelectedPaymentRecordId}
                openPaymentRecord={(billingId) => openPaymentModal(billingId, activeView)}
                closePaymentModal={closePaymentModal}
                paymentDetail={paymentDetail}
                paymentForm={paymentForm}
                setPaymentForm={setPaymentForm}
                isSplitPaymentEnabled={isSplitPaymentEnabled}
                setIsSplitPaymentEnabled={setIsSplitPaymentEnabled}
                secondaryPaymentForm={secondaryPaymentForm}
                setSecondaryPaymentForm={setSecondaryPaymentForm}
                saveBillingPayment={saveBillingPayment}
                initializePaystackPayment={initializePaystackPayment}
                verifyPaystackPayment={verifyPaystackPayment}
                insuranceMeta={insuranceMeta}
                financeError={financeError}
                financeSuccess={financeSuccess}
                isLoadingFinanceSummary={isLoadingFinanceSummary}
                isLoadingFinanceSales={isLoadingFinanceSales}
                isLoadingFinanceExpenses={isLoadingFinanceExpenses}
                isLoadingFinancePayments={isLoadingFinancePayments}
                isLoadingPaymentDetail={isLoadingPaymentDetail}
                isSavingPayment={isSavingPayment}
                isInitializingPaystack={isInitializingPaystack}
                isVerifyingPaystack={isVerifyingPaystack}
                openReceiptPreview={openReceiptPreview}
                printFinanceReceipt={printFinanceReceipt}
                session={session}
                readOnly={isExecutive}
              />
            ) : null}

            {activeView === 'Debt Management' || activeView === 'Debts' ? (
              <DebtManagementSection
                apiFetch={apiFetch}
                token={token}
                selectedBranchId={selectedBranchId}
                session={session}
              />
            ) : null}

            {activeView === 'Payroll' ? (
              <PayrollSection
                apiFetch={apiFetch}
                token={token}
                selectedBranchId={selectedBranchId}
                session={session}
              />
            ) : null}

            {activeView === 'Bank Deposits' ? (
              <BankDepositsSection
                apiFetch={apiFetch}
                token={token}
                selectedBranchId={selectedBranchId}
                session={session}
              />
            ) : null}

            {activeView === 'Audit Log' && isGeneralManager ? (
              <AuditLogSection
                apiFetch={apiFetch}
                token={token}
                selectedBranchId={selectedBranchId}
                session={session}
              />
            ) : null}

            {activeView === 'Insurance' ? (
              <InsuranceSection
                pageEyebrow="Insurance"
                pageTitle="Manage claims, balances, and insurer follow-up"
                pageCopy="Built from the legacy insurance claims and balance workflow, with provider-specific claim capture and claim settlement."
                insuranceMeta={insuranceMeta}
                insuranceData={insuranceData}
                insuranceFilters={insuranceFilters}
                setInsuranceFilters={setInsuranceFilters}
                setInsuranceQuery={setInsuranceQuery}
                insuranceForm={insuranceForm}
                setInsuranceForm={setInsuranceForm}
                saveInsuranceClaim={saveInsuranceClaim}
                isSavingInsuranceClaim={isSavingInsuranceClaim}
                insuranceError={insuranceError}
                insuranceSuccess={insuranceSuccess}
                isLoadingInsuranceMeta={isLoadingInsuranceMeta}
                isLoadingInsuranceData={isLoadingInsuranceData}
                markClaimPaid={markClaimPaid}
                markClaimPending={markClaimPending}
                updateInsuranceClaim={updateInsuranceClaim}
                deleteInsuranceClaim={deleteInsuranceClaim}
                printFinanceReceipt={printFinanceReceipt}
                generateInsuranceReport={generateInsuranceReport}
                claimBusyId={claimBusyId}
                insuranceProviderCatalog={insuranceProviderCatalog}
                saveInsuranceProvider={saveInsuranceProvider}
                isSavingInsuranceProvider={isSavingInsuranceProvider}
                saveInsuranceRemittance={saveInsuranceRemittance}
                isSavingInsuranceRemittance={isSavingInsuranceRemittance}
                session={session}
                readOnly={isExecutive}
              />
            ) : null}

            {activeView === 'Insurance Claims' ? (
              <InsuranceSection
                pageEyebrow="Insurance Claims"
                pageTitle="Track insurer claims and settlement status"
                pageCopy="Review pending, claimed, and paid insurer balances with a general-manager workflow inspired by the legacy claims register."
                insuranceMeta={insuranceMeta}
                insuranceData={insuranceData}
                insuranceFilters={insuranceFilters}
                setInsuranceFilters={setInsuranceFilters}
                setInsuranceQuery={setInsuranceQuery}
                insuranceForm={insuranceForm}
                setInsuranceForm={setInsuranceForm}
                saveInsuranceClaim={saveInsuranceClaim}
                isSavingInsuranceClaim={isSavingInsuranceClaim}
                insuranceError={insuranceError}
                insuranceSuccess={insuranceSuccess}
                isLoadingInsuranceMeta={isLoadingInsuranceMeta}
                isLoadingInsuranceData={isLoadingInsuranceData}
                markClaimPaid={markClaimPaid}
                markClaimPending={markClaimPending}
                updateInsuranceClaim={updateInsuranceClaim}
                deleteInsuranceClaim={deleteInsuranceClaim}
                printFinanceReceipt={printFinanceReceipt}
                generateInsuranceReport={generateInsuranceReport}
                claimBusyId={claimBusyId}
                insuranceProviderCatalog={insuranceProviderCatalog}
                saveInsuranceProvider={saveInsuranceProvider}
                isSavingInsuranceProvider={isSavingInsuranceProvider}
                saveInsuranceRemittance={saveInsuranceRemittance}
                isSavingInsuranceRemittance={isSavingInsuranceRemittance}
                session={session}
                readOnly={isExecutive}
              />
            ) : null}

            {activeView === 'Inventory' ? (
              <InventorySection
                inventoryData={inventoryData}
                inventoryFilters={inventoryFilters}
                setInventoryFilters={setInventoryFilters}
                setInventoryQuery={setInventoryQuery}
                inventoryForm={inventoryForm}
                setInventoryForm={setInventoryForm}
                inventoryLensData={inventoryLensData}
                lensTrackerFilters={lensTrackerFilters}
                setLensTrackerFilters={setLensTrackerFilters}
                setLensTrackerQuery={setLensTrackerQuery}
                saveInventoryProduct={saveInventoryProduct}
                deleteInventoryProduct={deleteInventoryProduct}
                isSavingInventoryProduct={isSavingInventoryProduct}
                saveLensCostEntry={saveLensCostEntry}
                deleteLensCostEntry={deleteLensCostEntry}
                savingLensBillingId={savingLensBillingId}
                inventoryError={inventoryError}
                inventorySuccess={inventorySuccess}
                isLoadingInventory={isLoadingInventory}
                isLoadingLensTracker={isLoadingLensTracker}
                session={session}
              />
            ) : null}

            {activeView === 'Lens Tracker' ? (
              <InventorySection
                initialTab="Lens Tracker & Lens Spec"
                showTabs={false}
                inventoryData={inventoryData}
                inventoryFilters={inventoryFilters}
                setInventoryFilters={setInventoryFilters}
                setInventoryQuery={setInventoryQuery}
                inventoryForm={inventoryForm}
                setInventoryForm={setInventoryForm}
                inventoryLensData={inventoryLensData}
                lensTrackerFilters={lensTrackerFilters}
                setLensTrackerFilters={setLensTrackerFilters}
                setLensTrackerQuery={setLensTrackerQuery}
                saveInventoryProduct={saveInventoryProduct}
                deleteInventoryProduct={deleteInventoryProduct}
                isSavingInventoryProduct={isSavingInventoryProduct}
                inventoryError={inventoryError}
                inventorySuccess={inventorySuccess}
                isLoadingInventory={isLoadingInventory}
                isLoadingLensTracker={isLoadingLensTracker}
                saveLensCostEntry={saveLensCostEntry}
                deleteLensCostEntry={deleteLensCostEntry}
                savingLensBillingId={savingLensBillingId}
                session={session}
              />
            ) : null}

            {activeView === 'BSMI Tracking' ? (
              <BsmiTrackingSection
                bsmiData={inventoryBsmiData}
                lensTrackerFilters={lensTrackerFilters}
                setLensTrackerFilters={setLensTrackerFilters}
                setLensTrackerQuery={setLensTrackerQuery}
                inventoryError={inventoryError}
              />
            ) : null}

            {activeView === 'Assets Register' ? (
              <AssetsRegisterSection session={session} selectedBranchId={selectedBranchId} />
            ) : null}

            {activeView === 'Memos' ? (
              <MemosSection
                apiFetch={apiFetch}
                token={token}
                selectedBranchId={selectedBranchId}
                session={session}
                pushSuccessToast={(message) => pushSuccessToast(message, 'memos')}
              />
            ) : null}

            {activeView === 'Notes' ? (
              <NotesSection session={session} />
            ) : null}

            {activeView === 'Extract' ? (
              <ExtractSection
                financeSummary={financeSummary}
                financeSales={financeSales}
                financeExpenses={financeExpenses}
                companyProfile={companyProfileForm}
                branchName={activeBranchName}
                financeError={financeError}
                financeSalesFilters={financeSalesFilters}
                setFinanceSalesFilters={setFinanceSalesFilters}
                setFinanceSalesQuery={setFinanceSalesQuery}
                financeExpenseFilters={financeExpenseFilters}
                setFinanceExpenseFilters={setFinanceExpenseFilters}
                setFinanceExpenseQuery={setFinanceExpenseQuery}
              />
            ) : null}

            {activeView === 'Reports' && session?.role !== 'receptionist' ? (
              <ReportsSection
                apiFetch={apiFetch}
                token={token}
                session={session}
                selectedBranchId={selectedBranchId}
                financeSales={financeSales}
                financeExpenses={financeExpenses}
              />
            ) : null}

            {activeView === 'Customer Service' ? (
              <CustomerServiceSection
                customerServiceData={customerServiceData}
                customerServiceFilters={customerServiceFilters}
                setCustomerServiceFilters={setCustomerServiceFilters}
                setCustomerServiceQuery={setCustomerServiceQuery}
                messageForm={messageForm}
                setMessageForm={setMessageForm}
                templateForm={templateForm}
                setTemplateForm={setTemplateForm}
                sendCustomerMessage={sendCustomerMessage}
                submitCustomerMessage={submitCustomerMessage}
                saveCustomerTemplate={saveCustomerTemplate}
                deleteCustomerTemplate={deleteCustomerTemplate}
                updatePickupStatus={updatePickupStatus}
                pickupBusyIds={pickupBusyIds}
                customerServiceError={customerServiceError}
                customerServiceSuccess={customerServiceSuccess}
                isLoadingCustomerService={isLoadingCustomerService}
                isSendingCustomerMessage={isSendingCustomerMessage}
                isSavingTemplate={isSavingTemplate}
                session={session}
                selectedBranchId={selectedBranchId}
              />
            ) : null}

            {optometristSettingsViews.includes(activeView) || activeView === 'Settings' ? (
              <SettingsSection
                session={session}
                settingsProfileForm={settingsProfileForm}
                setSettingsProfileForm={setSettingsProfileForm}
                settingsPasswordForm={settingsPasswordForm}
                setSettingsPasswordForm={setSettingsPasswordForm}
                settingsError={settingsError}
                settingsSuccess={settingsSuccess}
                isSavingSettingsProfile={isSavingSettingsProfile}
                isSavingSettingsPassword={isSavingSettingsPassword}
                companyProfileForm={companyProfileForm}
                setCompanyProfileForm={setCompanyProfileForm}
                isSavingCompanyProfile={isSavingCompanyProfile}
                insuranceProviderCatalog={insuranceProviderCatalog}
                expenseCategoryCatalog={expenseCategoryCatalog}
                isLoadingSettingsCatalog={isLoadingSettingsCatalog}
                isSavingInsuranceProvider={isSavingInsuranceProvider}
                isSavingExpenseCategory={isSavingExpenseCategory}
                isDeletingInsuranceProviderId={isDeletingInsuranceProviderId}
                isDeletingExpenseCategoryId={isDeletingExpenseCategoryId}
                saveSettingsProfile={saveSettingsProfile}
                saveSettingsPassword={saveSettingsPassword}
                saveCompanyProfile={saveCompanyProfile}
                saveInsuranceProvider={saveInsuranceProvider}
                deleteInsuranceProvider={deleteInsuranceProvider}
                saveExpenseCategory={saveExpenseCategory}
                deleteExpenseCategory={deleteExpenseCategory}
              />
            ) : null}

            {activeView === 'Glasses Prescriptions' && isOptometrist ? (
              <OptometristPrescriptionsSection
                dashboard={dashboard}
                patientData={patientData}
                fetchGlassesPrescriptions={fetchGlassesPrescriptions}
                fetchFormPrescriptionSearch={fetchFormPrescriptionSearch}
                companyProfile={companyProfileForm}
              />
            ) : null}

            {activeView === 'Medical Report' && isOptometrist ? (
              <MedicalReportSection
                lookupPatients={lookupPatients}
                fetchPatientPrescriptions={fetchPatientPrescriptions}
                fetchMedicalReport={fetchMedicalReport}
                companyProfile={companyProfileForm}
                currentUserName={session?.name || ''}
              />
            ) : null}

            {!['Dashboard', 'Users', 'Staff Profiles', 'Patients', 'Billing', 'Finance', 'Sales', 'Revenue Tracking', 'Expenses', 'Insurance', 'Insurance Claims', 'Debt Management', 'Debts', 'BSMI Tracking', 'Assets Register', 'Lens Tracker', 'Memos', 'Payroll', 'Bank Deposits', 'Audit Log', 'Extract', 'Reports', 'Inventory', 'Customer Service', 'Settings', ...optometristPatientViews, 'Appointments', ...optometristClinicalViews, 'Patient Uploads', 'Notes', 'Profile'].includes(activeView) ? (
              <section className="module-section">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">{activeView}</p>
                    <h3>This module is queued next</h3>
                  </div>
                </div>

                <div className="module-grid">
                  {moduleCards.map((module) => (
                    <article key={module.title} className="module-card">
                      <div className="module-card-icon">
                        <PortalIcon name={module.icon} className="module-icon" />
                      </div>
                      <strong>{module.title}</strong>
                      <p>{module.description}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <AppCreditFooter />
          </div>
        </section>
      )}

      {dashboardIntakeModalOpen && session?.role === 'receptionist' && activeView === 'Dashboard' ? (
        <PatientIntakeModal
          title="Register patient"
          form={patientForm}
          setForm={setPatientForm}
          patientMeta={patientMeta}
          isSaving={isSavingPatient}
          onClose={() => setDashboardIntakeModalOpen(false)}
          onSubmit={async (event) => {
            const ok = await savePatientRecord(event)
            if (ok) setDashboardIntakeModalOpen(false)
          }}
          submitLabel={isSavingPatient ? 'Saving patient...' : 'Save patient record'}
        />
      ) : null}

      {receiptPreview ? (
        <div className="modal-overlay thermal-modal-overlay" onClick={() => setReceiptPreview(null)}>
          <article className="modal-panel thermal-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Thermal Receipt</p>
                <h3>{receiptPreview.receipt_number}</h3>
              </div>
              <div className="modal-actions">
                <button type="button" className="primary-button" onClick={() => printThermalReceipt(receiptPreview)}>
                  Print receipt
                </button>
                <button type="button" className="ghost-button" onClick={() => setReceiptPreview(null)}>
                  Close
                </button>
              </div>
            </div>

            <ThermalReceiptPreview receipt={receiptPreview} />
          </article>
        </div>
      ) : null}

      {successToasts.length ? (
        <div className="success-toast-stack" aria-live="polite" aria-atomic="true">
          {successToasts.map((toast) => (
            <div key={toast.id} className="success-toast">
              <strong>Success</strong>
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      ) : null}

      {session ? (
        <MessengerWidget
          apiFetch={apiFetch}
          token={token}
          session={session}
        />
      ) : null}
    </main>
  )
}

function formatMoneyInput(value) {
  return Number(Number(value || 0).toFixed(2)).toFixed(2)
}

function createDefaultBillingFrameItem() {
  return {
    frame_code_id: '',
    frame_price: '0.00',
  }
}

function createDefaultBillingLensItem() {
  return {
    amount: '0.00',
  }
}

function normalizeBillingFrameItemsForApi(items, legacyCode = '', legacyPrice = '0.00') {
  const normalized = Array.isArray(items)
    ? items
        .map((item) => ({
          frame_code_id: String(item?.frame_code_id || '').trim(),
          frame_price: formatMoneyInput(item?.frame_price),
        }))
        .filter((item) => item.frame_code_id)
    : []

  if (normalized.length > 0) {
    return normalized
  }

  const legacyFrameCode = String(legacyCode || '').trim()
  return legacyFrameCode
    ? [{ frame_code_id: legacyFrameCode, frame_price: formatMoneyInput(legacyPrice) }]
    : []
}

function normalizeBillingLensItemsForApi(items, legacyLensPrice = '0.00') {
  const normalized = Array.isArray(items)
    ? items
        .map((item) => ({ amount: formatMoneyInput(item?.amount) }))
        .filter((item) => Number(item.amount) > 0)
    : []

  if (normalized.length > 0) {
    return normalized
  }

  const legacyAmount = Number(formatMoneyInput(legacyLensPrice))
  return legacyAmount > 0 ? [{ amount: formatMoneyInput(legacyAmount) }] : []
}

function sumBillingFrameItems(items, legacyCode = '', legacyPrice = '0.00') {
  return normalizeBillingFrameItemsForApi(items, legacyCode, legacyPrice).reduce(
    (sum, item) => sum + Number(item.frame_price || 0),
    0,
  )
}

function sumBillingLensItems(items, legacyLensPrice = '0.00') {
  return normalizeBillingLensItemsForApi(items, legacyLensPrice).reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  )
}

function AppCreditFooter() {
  return (
    <footer className="app-credit-footer">
      Developed and Designed by DALE QUIST [Enable Technologies]
    </footer>
  )
}

function ThermalReceiptPreview({ receipt }) {
  return (
    <div className="thermal-preview-shell">
      <section className="thermal-preview-paper">
        <header className="thermal-preview-brand">
          <strong>{receipt.company_name || 'Bealet Optical Center'}</strong>
          <span>{receipt.branch_name}</span>
          <span>{receipt.branch_address || ''}</span>
          <span>{receipt.company_tagline || 'Professional Eye Care and Optical Services'}</span>
        </header>

        <div className="thermal-preview-divider" />

        <section className="thermal-preview-center">
          <p>Thermal Receipt</p>
          <strong>{currency.format(Number(receipt.amount_paid ?? 0))}</strong>
          <span>{receipt.payment_method} payment</span>
        </section>

        <div className="thermal-preview-summary">
          <div>
            <span>Total bill</span>
            <strong>{currency.format(Number(receipt.total_amount ?? 0))}</strong>
          </div>
          <div>
            <span>Amount paid</span>
            <strong>{currency.format(Number(receipt.amount_paid ?? 0))}</strong>
          </div>
          <div className="thermal-preview-balance">
            <span>Balance after payment</span>
            <strong>{currency.format(Number(receipt.outstanding_balance ?? 0))}</strong>
          </div>
        </div>

        <div className="thermal-preview-divider" />

        <div className="thermal-preview-meta">
          <div><span>Patient</span><strong>{receipt.patient_name}</strong></div>
          <div><span>Folder ID</span><strong>{receipt.folder_id}</strong></div>
          <div><span>Billing ID</span><strong>{receipt.billing_id}</strong></div>
          <div><span>Receipt No.</span><strong>{receipt.receipt_number}</strong></div>
          <div><span>Date</span><strong>{receipt.payment_date}</strong></div>
          <div><span>Reference</span><strong>{receipt.reference}</strong></div>
          <div><span>Printed</span><strong>{receipt.printed_at}</strong></div>
        </div>

        {receipt.tax_breakdown?.length ? (
          <div className="thermal-preview-meta">
            <div><span>Tax Breakdown</span><strong>{currency.format(Number(receipt.tax_total ?? 0))}</strong></div>
            {receipt.tax_breakdown.map(([label, amount]) => (
              <div key={label}><span>{label}</span><strong>{currency.format(Number(amount ?? 0))}</strong></div>
            ))}
          </div>
        ) : null}

        <footer className="thermal-preview-foot">
          <span>{receipt.company_phone_primary}{receipt.company_phone_secondary ? ` | ${receipt.company_phone_secondary}` : ''}</span>
          <span>{receipt.company_email}</span>
          <span>Thank you for your payment.</span>
          <span>Keep this slip for verification and future reprints.</span>
          <span>Generated from the OPTICPLUS finance desk.</span>
          <span>Designed and Developed by Dale Quist (Enable Technologies)</span>
        </footer>
      </section>
    </div>
  )
}

function toCsv(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\n')
}

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function slugify(value) {
  return String(value ?? 'export')
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
}

const IDEMPOTENCY_WINDOW_MS = 90 * 1000

function isMutatingMethod(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || 'GET').toUpperCase())
}

function stableSerialize(value) {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString())
  }
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function serializeRequestBody(body) {
  if (!body) return ''

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const entries = []
    body.forEach((value, key) => {
      if (typeof File !== 'undefined' && value instanceof File) {
        entries.push([key, {
          fileName: value.name,
          fileSize: value.size,
          fileType: value.type,
          lastModified: value.lastModified,
        }])
        return
      }

      entries.push([key, String(value)])
    })

    return stableSerialize(entries)
  }

  return stableSerialize(body)
}

function hashString(value) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16)
}

function createRequestNonce() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function buildIdempotencyKey(path, options = {}) {
  const method = String(options.method ?? 'GET').toUpperCase()
  if (!isMutatingMethod(method) || typeof window === 'undefined' || !window.sessionStorage) {
    return null
  }

  const signature = `${method}|${path}|${serializeRequestBody(options.body)}`
  const storageKey = `opticplus:idempotency:${hashString(signature)}`
  const now = Date.now()

  try {
    const raw = window.sessionStorage.getItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.key && Number(parsed.expiresAt) > now) {
        return parsed.key
      }
    }

    const nextKey = createRequestNonce()
    window.sessionStorage.setItem(storageKey, JSON.stringify({
      key: nextKey,
      expiresAt: now + IDEMPOTENCY_WINDOW_MS,
    }))
    return nextKey
  } catch {
    return createRequestNonce()
  }
}

export async function apiFetch(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const method = String(options.method ?? 'GET').toUpperCase()
  const idempotencyKey = buildIdempotencyKey(path, options)
  const headers = {
    Accept: 'application/json',
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: !options.body ? undefined : isFormData ? options.body : JSON.stringify(options.body),
  })

  const data = await response.json().catch(() => ({}))
  const firstValidationError = Object.values(data?.errors ?? {}).flat?.()?.[0]

  if (!response.ok) {
    throw new Error(
      data?.message ||
        firstValidationError ||
        'The request failed. Check the backend connection and try again.',
    )
  }

  return data
}

export function todayIso() {
  return new Date().toISOString().split('T')[0]
}

export default App
