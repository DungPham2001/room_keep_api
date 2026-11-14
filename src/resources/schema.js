/**
 * One entry per business table (data schema of the description): REST path, fields, search, delete rules.
 * Every table gets its own CRUD endpoints (/v1/<path>) and the same rules apply to /v1/sync/push.
 *
 * Field helpers: str(max), text(max), int(min,max), money (integer đồng >= 0), signed (integer đồng, +/-),
 * num(min,max), bool, date (yyyy-MM-dd), month (yyyy-MM), datetime (ISO 8601 or epoch ms), oneOf(...values),
 * ref(Table, onDelete), json. `req(x)` = required. Defaults apply on create only.
 *
 * ref onDelete (REST DELETE of the referenced record):
 *   restrict -> 409 has_dependents while live records point to it
 *   cascade  -> the referencing records are deleted with it
 *   none     -> plain link, nothing happens (default)
 */
const MONEY_MAX = 100_000_000_000;

const str = (max = 200) => ({ type: 'string', max });
const text = (max = 5000) => ({ type: 'string', max, multiline: true });
const int = (min = 0, max = Number.MAX_SAFE_INTEGER) => ({ type: 'int', min, max });
const money = () => ({ type: 'int', min: 0, max: MONEY_MAX, money: true });
const signed = () => ({ type: 'int', min: -MONEY_MAX, max: MONEY_MAX, money: true });
const num = (min = 0, max = 1e9) => ({ type: 'number', min, max });
const bool = () => ({ type: 'bool' });
const date = () => ({ type: 'date' });
const month = () => ({ type: 'month' });
const datetime = () => ({ type: 'datetime' });
const oneOf = (...values) => ({ type: 'enum', values });
const ref = (table, onDelete = 'none') => ({ type: 'ref', table, onDelete });
const json = () => ({ type: 'json' });
const req = (f) => ({ ...f, required: true });
const def = (f, value) => ({ ...f, default: value });

const PHONE = { ...str(20), pattern: /^[0-9+().\-\s]{6,20}$/ };
const CALC = oneOf('per_room', 'per_person', 'per_use');

const T = {};
const add = (table, label, fields, opts = {}) => {
  T[table] = { table, label, fields, ...opts };
};

// ---------- Nhóm 1: cài đặt ----------
add('AppSettings', 'Cài đặt nhà trọ', {
  language: oneOf('vi', 'en'),
  propertyName: str(100),
  address: str(200),
  phone: PHONE,
  meterDay: int(1, 31),
  cycleStartDay: int(1, 31),
  dueDay: int(1, 31),
  dayCountMode: oneOf('fixed30', 'actual'),
  roundingStep: int(1, 100000),
  dateFormat: str(20),
  rulesText: text(20000),
  theme: oneOf('system', 'light', 'dark'),
}, { singleton: 'main', path: 'settings' });
add('OnboardingStep', 'Việc khởi động', { key: req(str(40)), isDone: def(bool(), false) }, { search: ['key'] });
add('MessageTemplate', 'Mẫu tin nhắn', { name: req(str(100)), body: req(text(5000)) }, { search: ['name'] });

// ---------- Nhóm 2: dãy, tầng, phòng ----------
add('Block', 'Dãy', { name: req(str(40)), sortOrder: def(int(0, 100000), 0) }, { search: ['name'], sort: 'sortOrder' });
add('Floor', 'Tầng', { blockId: req(ref('Block', 'restrict')), label: req(str(40)), sortOrder: def(int(0, 100000), 0) }, { search: ['label'], sort: 'sortOrder' });
add('RoomType', 'Loại phòng', { name: req(str(60)), suggestedPrice: money() }, { search: ['name'] });
add('Room', 'Phòng', {
  floorId: req(ref('Floor', 'restrict')),
  typeId: ref('RoomType'),
  name: req(str(40)),
  areaSqm: num(0, 10000),
  capacity: int(1, 50),
  status: def(oneOf('vacant', 'occupied', 'reserved', 'maintenance'), 'vacant'),
  amenitiesText: text(2000),
  note: text(2000),
}, { search: ['name'], noAccent: 'name', sort: 'name' });
add('RoomPrice', 'Giá thuê theo thời điểm', { roomId: req(ref('Room', 'cascade')), monthlyRent: req(money()), effectiveFrom: req(date()) }, { date: 'effectiveFrom' });
add('RoomItem', 'Đồ trang bị', { roomId: req(ref('Room', 'cascade')), name: req(str(100)), qty: def(int(0, 10000), 1), conditionText: str(500), note: text(1000) }, { search: ['name'] });
add('RoomDevice', 'Thiết bị trong phòng', { roomId: req(ref('Room', 'cascade')), name: req(str(100)), installedDate: date(), note: text(1000) }, { search: ['name'] });
add('PriceBatch', 'Cập nhật giá hàng loạt', { name: req(str(100)), effectiveAt: date(), ruleJson: json(), status: def(oneOf('draft', 'applied', 'cancelled'), 'draft') }, { search: ['name'] });

// ---------- Nhóm 3: khách thuê ----------
add('Tenant', 'Khách thuê', {
  name: req(str(100)),
  phone: PHONE,
  workplaceText: str(200),
  vehicleText: str(100),
  segment: oneOf('long_term', 'new', 'student', 'family', 'other'),
  emergencyContactText: str(300),
  note: text(2000),
}, { search: ['name', 'phone'], noAccent: 'name', sort: 'name' });
add('TenantNote', 'Ghi nhận về khách', { tenantId: req(ref('Tenant', 'cascade')), text: req(text(2000)), date: req(date()) }, { date: 'date' });

// ---------- Nhóm 4: hợp đồng ----------
add('Contract', 'Hợp đồng', {
  roomId: req(ref('Room', 'restrict')),
  leaderTenantId: req(ref('Tenant', 'restrict')),
  startDate: req(date()),
  endDate: date(),
  monthlyRent: req(money()),
  depositAmount: money(),
  depositDate: date(),
  extraTerms: text(10000),
  status: def(oneOf('draft', 'active', 'ended', 'terminated'), 'active'),
  terminationReason: str(500),
  renewedFromId: ref('Contract'),
}, { date: 'startDate', sort: 'startDate' });
add('Occupant', 'Người ở', {
  contractId: req(ref('Contract', 'cascade')),
  tenantId: req(ref('Tenant', 'restrict')),
  isLeader: def(bool(), false),
  moveInDate: date(),
  moveOutDate: date(),
});
add('ContractFee', 'Phụ phí hợp đồng', { contractId: req(ref('Contract', 'cascade')), serviceId: ref('Service'), calcMode: def(CALC, 'per_room'), amount: req(money()), effectiveFrom: date() });
add('ContractChange', 'Lịch sử thay đổi hợp đồng', { contractId: req(ref('Contract', 'cascade')), changedAt: datetime(), fieldKey: str(60), oldValue: str(500), newValue: str(500), note: text(1000) });
add('RoomTransfer', 'Chuyển phòng', { contractId: req(ref('Contract', 'cascade')), fromRoomId: req(ref('Room')), toRoomId: req(ref('Room')), transferDate: req(date()), depositMovedAmount: money() }, { date: 'transferDate' });
add('ContractTemplate', 'Mẫu hợp đồng', { name: req(str(100)), bodyText: req(text(20000)) }, { search: ['name'] });
add('MoveOutReason', 'Lý do trả phòng', { contractId: req(ref('Contract', 'cascade')), reasonKey: req(oneOf('price', 'location', 'job', 'rules', 'other')), note: text(1000) });

// ---------- Nhóm 7: giữ chỗ, cọc, bàn giao ----------
add('Prospect', 'Khách tiềm năng', {
  name: req(str(100)), phone: PHONE, interestedRoomsText: str(500), expectedMoveIn: date(), note: text(2000),
  status: def(oneOf('new', 'contacted', 'viewing', 'converted', 'lost'), 'new'),
}, { search: ['name', 'phone'], sort: 'name' });
add('Reservation', 'Giữ chỗ', {
  roomId: req(ref('Room', 'restrict')), prospectId: ref('Prospect'), tenantName: str(100), phone: PHONE,
  fromDate: date(), holdUntilDate: req(date()), depositAmount: money(),
  status: def(oneOf('active', 'converted', 'expired', 'cancelled'), 'active'), note: text(1000),
}, { search: ['tenantName', 'phone'], date: 'holdUntilDate' });
add('Viewing', 'Lịch xem phòng', {
  prospectId: ref('Prospect', 'cascade'), roomId: ref('Room'), date: req(date()), startMinute: int(0, 1439), note: text(1000),
  status: def(oneOf('scheduled', 'done', 'cancelled', 'no_show'), 'scheduled'),
}, { date: 'date' });
add('DepositEntry', 'Sổ tiền cọc', {
  contractId: req(ref('Contract', 'restrict')), type: req(oneOf('receive', 'refund', 'deduct', 'transfer_in', 'transfer_out')),
  amount: req(money()), date: req(date()), reason: str(300),
}, { appendOnly: true, date: 'date' });
add('HandoverRecord', 'Biên bản bàn giao', {
  contractId: req(ref('Contract', 'cascade')), roomId: ref('Room'), kind: req(oneOf('move_in', 'move_out')), conditionText: text(5000),
  itemsJson: json(), meterReadingsJson: json(), tenantConfirmed: def(bool(), false), date: req(date()),
}, { date: 'date' });
add('CheckoutCheck', 'Kiểm tra trả phòng', { contractId: req(ref('Contract', 'cascade')), itemKey: req(str(60)), isDone: def(bool(), false) });
add('DamageCharge', 'Trừ hư hỏng vào cọc', { contractId: req(ref('Contract', 'cascade')), description: req(str(300)), amount: req(money()) });

// ---------- Nhóm 5: điện nước ----------
add('Meter', 'Công tơ', {
  roomId: req(ref('Room', 'restrict')), kind: req(oneOf('electric', 'water')), serialNo: str(60),
  initialReading: req(int(0)), installedDate: date(), isActive: def(bool(), true),
}, { search: ['serialNo'] });
add('MeterReading', 'Chỉ số công tơ', {
  meterId: req(ref('Meter', 'restrict')), cycle: req(month()), readingDate: date(), readingValue: req(int(0)),
  consumption: int(-Number.MAX_SAFE_INTEGER), note: str(500), isReset: def(bool(), false),
}, { appendOnly: 'merge', date: 'readingDate', unique: [['meterId', 'cycle']] });
add('MeterReplacement', 'Thay công tơ', {
  oldMeterId: req(ref('Meter')), newMeterId: req(ref('Meter')), oldFinalReading: req(int(0)), newInitialReading: req(int(0)), date: req(date()),
}, { date: 'date' });
add('ElectricityTier', 'Bậc giá điện', { name: str(40), fromKwh: req(int(0)), toKwh: int(0), pricePerKwh: req(money()), effectiveFrom: date() }, { sort: 'fromKwh' });
add('WaterRate', 'Giá nước', { mode: req(oneOf('per_m3', 'per_person')), pricePerUnit: req(money()), effectiveFrom: date() });

// ---------- Nhóm 9: dịch vụ chung ----------
add('Service', 'Dịch vụ', { name: req(str(60)), calcMode: req(CALC), defaultPrice: money(), isFixedFee: def(bool(), true) }, { search: ['name'], sort: 'name' });
add('ServicePrice', 'Đơn giá dịch vụ theo thời điểm', { serviceId: req(ref('Service', 'cascade')), price: req(money()), effectiveFrom: req(date()) }, { date: 'effectiveFrom' });
add('ParkingSlot', 'Chỗ để xe', { label: req(str(40)), tenantId: ref('Tenant'), monthlyFee: money(), vehicleText: str(100) }, { search: ['label', 'vehicleText'] });
add('UsageLog', 'Lượt dùng dịch vụ', { roomId: req(ref('Room')), serviceId: req(ref('Service')), cycle: req(month()), qty: req(int(0, 100000)), date: date() }, { date: 'date' });
add('SharedCost', 'Chi phí chung', { cycle: req(month()), name: req(str(100)), amount: req(money()), splitMode: req(oneOf('equal', 'per_person', 'by_area')) }, { search: ['name'] });
add('SharedCostShare', 'Phần chia chi phí chung', { sharedCostId: req(ref('SharedCost', 'cascade')), roomId: req(ref('Room')), amount: req(money()) });

// ---------- Nhóm 6: tính tiền kỳ ----------
add('BillingCycle', 'Kỳ thu', { cycle: req(month()), status: def(oneOf('open', 'locked'), 'open'), lockedAt: datetime(), note: text(1000) }, { unique: [['cycle']], sort: 'cycle' });
add('RoomStatement', 'Bảng tính tiền phòng', {
  cycleId: req(ref('BillingCycle', 'restrict')),
  roomId: req(ref('Room', 'restrict')),
  contractId: ref('Contract', 'restrict'),
  rentAmount: money(),
  electricAmount: money(),
  waterAmount: money(),
  feesAmount: money(),
  sharedAmount: money(),
  discountAmount: money(),
  adjustAmount: signed(),
  totalAmount: req(signed()),
  prorationNote: str(500),
  missingReadings: def(bool(), false),
}, { unique: [['cycleId', 'contractId']], computed: ['paidAmount', 'collectStatus'] });
add('StatementLine', 'Dòng bảng kê', {
  statementId: req(ref('RoomStatement', 'cascade')), kind: req(oneOf('rent', 'electric', 'water', 'fee', 'shared', 'discount', 'adjust', 'other')),
  description: str(200), qty: num(-1e9, 1e9), unitPrice: signed(), amount: req(signed()),
});
add('StatementAdjust', 'Điều chỉnh tay', { statementId: req(ref('RoomStatement', 'cascade')), amount: req(signed()), reason: req(str(300)) });
add('Collection', 'Lần thu tiền', { statementId: req(ref('RoomStatement', 'restrict')), amount: req(money()), paidAt: req(date()), methodNote: str(200) }, { appendOnly: true, date: 'paidAt' });

// ---------- Nhóm 8: bảo trì ----------
add('Repairer', 'Thợ sửa', { name: req(str(100)), phone: PHONE, skillText: str(200), note: text(1000) }, { search: ['name', 'phone', 'skillText'], sort: 'name' });
add('RepairRequest', 'Yêu cầu sửa chữa', {
  roomId: req(ref('Room')), tenantId: ref('Tenant'), reportedDate: req(date()), category: str(60),
  priority: def(oneOf('urgent', 'normal', 'low'), 'normal'), description: req(text(2000)),
  status: def(oneOf('new', 'assigned', 'in_progress', 'done'), 'new'), repairerId: ref('Repairer'),
  cost: money(), costBearer: oneOf('owner', 'tenant'), doneDate: date(),
}, { search: ['description', 'category'], date: 'reportedDate' });
add('MaintenancePlan', 'Lịch bảo trì định kỳ', { roomId: ref('Room'), deviceId: ref('RoomDevice'), title: req(str(100)), intervalDays: req(int(1, 3650)), lastDoneDate: date() }, { search: ['title'] });
add('MaintenanceLog', 'Nhật ký bảo trì', { planId: req(ref('MaintenancePlan', 'cascade')), date: req(date()), cost: money(), note: text(1000) }, { date: 'date' });

// ---------- Nhóm 10: ra vào, nội quy ----------
add('Visitor', 'Khách thăm', { roomId: req(ref('Room')), name: req(str(100)), phone: PHONE, visitDate: req(date()), stayedOvernight: def(bool(), false), note: text(1000) }, { search: ['name', 'phone'], date: 'visitDate' });
add('KeyLog', 'Giao nhận chìa khóa', { roomId: req(ref('Room')), keyLabel: req(str(60)), givenTo: str(100), givenDate: req(date()), returnedDate: date() }, { search: ['keyLabel', 'givenTo'], date: 'givenDate' });
add('RuleViolation', 'Vi phạm nội quy', { roomId: ref('Room'), tenantId: ref('Tenant'), date: req(date()), text: req(text(2000)), action: str(500) }, { date: 'date' });
add('Announcement', 'Thông báo chung', { title: req(str(200)), body: req(text(5000)), targetJson: json() }, { search: ['title'] });

// ---------- Nhóm 11: thu chi (chỉ chủ trọ) ----------
add('CashEntry', 'Sổ thu chi tiền mặt', { type: req(oneOf('in', 'out')), amount: req(money()), reason: str(300), date: req(date()) }, { date: 'date' });
add('Expense', 'Chi phí nhà trọ', { category: req(str(60)), amount: req(money()), date: req(date()), isRecurring: def(bool(), false), note: str(300) }, { search: ['category', 'note'], date: 'date' });
add('UtilityBill', 'Điện nước tổng', { cycle: req(month()), kind: req(oneOf('electric', 'water')), totalAmount: req(money()), totalUnits: int(0) }, { unique: [['cycle', 'kind']], sort: 'cycle' });
add('ReserveFundEntry', 'Quỹ dự phòng sửa chữa', { type: req(oneOf('in', 'out')), amount: req(money()), date: req(date()), reason: str(300) }, { date: 'date' });
add('Investment', 'Chi phí đầu tư', { roomId: ref('Room'), amount: req(money()), date: req(date()), note: str(300) }, { date: 'date' });
add('Target', 'Mục tiêu doanh thu', { month: req(month()), targetRevenue: req(money()) }, { unique: [['month']], sort: 'month' });

// ---------- Nhóm 12: nhân sự ----------
add('Staff', 'Nhân sự', { name: req(str(100)), role: req(oneOf('manager', 'guard', 'cleaner', 'other')), note: text(1000) }, { search: ['name'], path: 'staff', sort: 'name' });
add('StaffSchedule', 'Lịch làm việc', { staffId: req(ref('Staff', 'cascade')), date: req(date()), shiftLabel: str(40) }, { date: 'date' });
add('StaffPay', 'Lương', { staffId: req(ref('Staff', 'restrict')), cycle: req(month()), amount: req(money()), note: str(300) }, { sort: 'cycle' });
add('TaskItem', 'Giao việc', { title: req(str(200)), assigneeId: ref('Staff'), dueDate: date(), status: def(oneOf('todo', 'doing', 'done'), 'todo'), refType: str(40), refId: str(64) }, { search: ['title'], date: 'dueDate', path: 'tasks' });
add('CleaningPlan', 'Lịch dọn vệ sinh', { area: req(str(100)), dayOfWeek: req(int(1, 7)), staffId: ref('Staff') }, { search: ['area'], sort: 'dayOfWeek' });
add('PatrolItem', 'Mục đi tuần', { title: req(str(100)), sortOrder: def(int(0, 100000), 0) }, { search: ['title'], sort: 'sortOrder' });
add('PatrolRun', 'Lượt đi tuần', { itemId: req(ref('PatrolItem', 'cascade')), date: req(date()), isDone: def(bool(), false), doneBy: str(100) }, { date: 'date' });

// ---------- Nhóm 15: phản hồi ----------
add('Feedback', 'Phản hồi khách thuê', { roomId: ref('Room'), tenantId: ref('Tenant'), score: int(1, 5), text: text(2000), date: req(date()) }, { date: 'date', path: 'feedback' });
add('Complaint', 'Khiếu nại', { roomId: ref('Room'), tenantId: ref('Tenant'), date: req(date()), text: req(text(2000)), resolution: text(2000), cost: money(), status: def(oneOf('open', 'resolved'), 'open') }, { date: 'date' });

// ---------- Nhóm 14, 16: kế hoạch ----------
add('Todo', 'Việc cần làm', { title: req(str(200)), dueAt: datetime(), repeatRule: def(oneOf('none', 'daily', 'weekly', 'monthly'), 'none'), isDone: def(bool(), false) }, { search: ['title'] });
add('ChecklistItem', 'Việc đầu/cuối tháng', { kind: req(oneOf('start_of_month', 'end_of_month')), title: req(str(200)), sortOrder: def(int(0, 100000), 0) }, { search: ['title'], sort: 'sortOrder' });
add('ChecklistRun', 'Đánh dấu việc đầu/cuối tháng', { itemId: req(ref('ChecklistItem', 'cascade')), period: req(month()), isDone: def(bool(), false) });

// ---------- derived ----------
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const plural = (s) => (/(s|x|ch|sh)$/.test(s) ? `${s}es` : /[^aeiou]y$/.test(s) ? `${s.slice(0, -1)}ies` : `${s}s`);
for (const r of Object.values(T)) {
  r.path = r.path || plural(kebab(r.table));
  r.search = r.search || [];
  r.unique = r.unique || [];
  r.computed = r.computed || [];
}

/** For each table: [{ table, field, onDelete }] of fields in other tables that point to it. */
const REFERENCED_BY = {};
for (const r of Object.values(T)) {
  for (const [field, f] of Object.entries(r.fields)) {
    if (f.type !== 'ref') continue;
    (REFERENCED_BY[f.table] = REFERENCED_BY[f.table] || []).push({ table: r.table, field, onDelete: f.onDelete });
  }
}

const byPath = Object.fromEntries(Object.values(T).map((r) => [r.path, r]));

module.exports = { RESOURCES: T, REFERENCED_BY, byPath };
