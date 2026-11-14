/**
 * Room tables the app may sync (data schema of the description). Local-only tables
 * (Account, RegistrationDraft, SyncOutbox, SyncState, SyncConflict, SyncLog, DeviceSession, InviteLocal)
 * never leave the device and are rejected with `unknown_table`.
 */
const SYNC_TABLES = new Set([
  'AppSettings', 'Block', 'Floor', 'RoomType', 'Room', 'RoomPrice', 'RoomItem', 'RoomDevice', 'PriceBatch',
  'OnboardingStep', 'MessageTemplate',
  'Tenant', 'Occupant', 'Contract', 'ContractFee', 'ContractChange', 'RoomTransfer', 'ContractTemplate',
  'Reservation', 'Prospect', 'Viewing',
  'Meter', 'MeterReading', 'MeterReplacement', 'ElectricityTier', 'WaterRate',
  'Service', 'ServicePrice', 'ParkingSlot', 'UsageLog', 'SharedCost', 'SharedCostShare',
  'BillingCycle', 'RoomStatement', 'StatementLine', 'StatementAdjust', 'Collection',
  'DepositEntry', 'HandoverRecord', 'CheckoutCheck', 'DamageCharge',
  'RepairRequest', 'Repairer', 'MaintenancePlan', 'MaintenanceLog',
  'Visitor', 'KeyLog', 'RuleViolation', 'Announcement',
  'CashEntry', 'Expense', 'UtilityBill', 'ReserveFundEntry',
  'Staff', 'StaffSchedule', 'StaffPay', 'TaskItem', 'CleaningPlan', 'PatrolItem', 'PatrolRun',
  'Feedback', 'Complaint', 'TenantNote', 'MoveOutReason', 'Investment', 'Target',
  'Todo', 'ChecklistItem', 'ChecklistRun',
  ...(process.env.EXTRA_SYNC_TABLES || '').split(',').map((s) => s.trim()).filter(Boolean),
]);

/**
 * Append-only ledgers: always merged, never a conflict (technical notes: Collection, DepositEntry, MeterReading).
 */
const APPEND_ONLY = new Set(['Collection', 'DepositEntry', 'MeterReading']);

/**
 * Owner-only data: a manager does not see profit, salary or total costs. The server enforces it:
 * these tables are left out of pull and rejected on push for a manager (not just hidden in the app).
 */
const OWNER_ONLY = new Set(['StaffPay', 'Investment', 'Expense', 'UtilityBill', 'ReserveFundEntry', 'CashEntry', 'Target']);

/** Tables whose records belong to a billing cycle; a locked cycle rejects changes to them (feature 59). */
const CYCLE_BOUND = new Set(['RoomStatement', 'StatementLine', 'StatementAdjust', 'SharedCost', 'SharedCostShare', 'UsageLog']);

/** Fixed id of the singleton AppSettings record, so every device writes the same row. */
const APP_SETTINGS_ID = 'main';

const visibleTables = (role) => [...SYNC_TABLES].filter((t) => role === 'owner' || !OWNER_ONLY.has(t));

module.exports = { SYNC_TABLES, APPEND_ONLY, OWNER_ONLY, CYCLE_BOUND, APP_SETTINGS_ID, visibleTables };
