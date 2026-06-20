import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHmac, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const publicDir = join(rootDir, 'public');
const dataPath = join(rootDir, 'work', 'dev-db.json');
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'local-development-secret-change-me';
const WATER_TARIFF = Number(process.env.WATER_TARIFF || 0.2);
const TOKEN_TTL_SECONDS = 60 * 60 * 8;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

class JsonStore {
  constructor(data) {
    this.data = data;
  }

  static async load() {
    try {
      const content = await readFile(dataPath, 'utf8');
      return new JsonStore(JSON.parse(content));
    } catch {
      const store = new JsonStore(createSeedData());
      await store.save();
      return store;
    }
  }

  async save() {
    try {
      await mkdir(dirname(dataPath), { recursive: true });
      await writeFile(dataPath, JSON.stringify(this.data, null, 2), 'utf8');
      return true;
    } catch (error) {
      if (!this.warnedAboutPersistence) {
        console.warn(`Demo persistence is disabled: ${error.message}`);
        this.warnedAboutPersistence = true;
      }
      return false;
    }
  }
}

const store = await JsonStore.load();

function nowIso() {
  return new Date().toISOString();
}

function dateOnly(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return dateOnly(next);
}

function id(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function signJwt(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const issuedAt = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: issuedAt, exp: issuedAt + TOKEN_TTL_SECONDS };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(body))}`;
  const signature = createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function verifyJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new ApiError(401, 'Invalid authentication token.');
  const [header, payload, signature] = parts;
  const expected = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) {
    throw new ApiError(401, 'Invalid authentication token.');
  }
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new ApiError(401, 'Authentication token expired.');
  }
  return decoded;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return `pbkdf2$120000$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const [scheme, iterationsRaw, salt, hash] = String(storedHash || '').split('$');
  if (scheme !== 'pbkdf2' || !iterationsRaw || !salt || !hash) return false;
  const actual = pbkdf2Sync(password, salt, Number(iterationsRaw), 32, 'sha256');
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return {
    ...safe,
    permissions: permissionsFor(user)
  };
}

function permissionsFor(user) {
  if (!user) return [];
  if (user.role === 'admin') return ['*'];
  if (user.role === 'staff') {
    const role = store.data.staffRoles.find((item) => item.id === user.staffRoleId);
    return role?.permissions || [];
  }
  return ['farmer:self'];
}

function can(user, permission) {
  const permissions = permissionsFor(user);
  return permissions.includes('*') || permissions.includes(permission);
}

function requirePermission(user, permission) {
  if (!can(user, permission)) {
    throw new ApiError(403, 'You do not have permission to perform this action.');
  }
}

function getUserFromRequest(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const decoded = verifyJwt(token);
  const user = store.data.users.find((item) => item.id === decoded.sub && item.active);
  if (!user) throw new ApiError(401, 'User account is inactive or missing.');
  return user;
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON.');
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function findById(table, itemId) {
  return store.data[table].find((item) => item.id === itemId);
}

function requireFields(body, fields) {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || String(body[field]).trim() === '') {
      throw new ApiError(400, `Missing required field: ${field}`);
    }
  }
}

function addActivity(type, title, description, actorId = null) {
  store.data.activities.unshift({
    id: id('act'),
    type,
    title,
    description,
    actorId,
    createdAt: nowIso()
  });
  store.data.activities = store.data.activities.slice(0, 80);
}

function audit(user, action, entityType, entityId, details = {}, req = null) {
  if (!user || user.role === 'farmer') return;
  store.data.auditLogs.unshift({
    id: id('aud'),
    actorId: user.id,
    action,
    entityType,
    entityId,
    details,
    ipAddress: req?.socket?.remoteAddress || null,
    createdAt: nowIso()
  });
}

function createNotification(userId, title, message) {
  const notification = {
    id: id('not'),
    userId,
    title,
    message,
    status: 'unread',
    createdAt: nowIso()
  };
  store.data.notifications.unshift(notification);
  return notification;
}

function farmerForUser(user) {
  const farmer = store.data.farmers.find((item) => item.userId === user.id);
  if (!farmer) throw new ApiError(404, 'Farmer profile not found.');
  return farmer;
}

function metersForFarmer(farmerId) {
  const fields = store.data.fields.filter((field) => field.farmerId === farmerId);
  const fieldIds = new Set(fields.map((field) => field.id));
  return store.data.waterMeters.filter((meter) => fieldIds.has(meter.fieldId));
}

function readingsForMeter(meterId) {
  return store.data.meterReadings
    .filter((reading) => reading.meterId === meterId)
    .sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate));
}

function latestReading(meterId) {
  return readingsForMeter(meterId)[0] || null;
}

function previousReadingBefore(meterId, readingDate) {
  return store.data.meterReadings
    .filter((reading) => reading.meterId === meterId && new Date(reading.readingDate) <= new Date(readingDate))
    .sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate))[0] || null;
}

function getFarmerOverview(farmerId) {
  const farmer = findById('farmers', farmerId);
  const user = findById('users', farmer?.userId);
  const fields = store.data.fields
    .filter((field) => field.farmerId === farmerId)
    .map((field) => {
      const meter = store.data.waterMeters.find((item) => item.fieldId === field.id) || null;
      return {
        ...field,
        meter,
        latestReading: meter ? latestReading(meter.id) : null
      };
    });
  const meterIds = fields.map((field) => field.meter?.id).filter(Boolean);
  const readings = store.data.meterReadings
    .filter((reading) => meterIds.includes(reading.meterId))
    .sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate));
  const bills = store.data.bills
    .filter((bill) => bill.farmerId === farmerId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const requests = store.data.irrigationRequests
    .filter((request) => request.farmerId === farmerId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const notifications = store.data.notifications
    .filter((notification) => notification.userId === user?.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const totalConsumption = readings.reduce((sum, reading) => sum + Number(reading.consumption || 0), 0);
  const unpaidAmount = bills
    .filter((bill) => bill.status !== 'paid')
    .reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
  return {
    farmer,
    user: publicUser(user),
    fields,
    readings,
    bills,
    requests,
    notifications,
    summary: {
      totalFields: fields.length,
      totalMeters: meterIds.length,
      totalConsumption,
      unpaidAmount,
      pendingRequests: requests.filter((request) => request.status === 'pending').length,
      unreadNotifications: notifications.filter((notification) => notification.status === 'unread').length
    }
  };
}

function enrichFarmer(farmer) {
  const user = findById('users', farmer.userId);
  const fields = store.data.fields.filter((field) => field.farmerId === farmer.id);
  const meters = metersForFarmer(farmer.id);
  const bills = store.data.bills.filter((bill) => bill.farmerId === farmer.id);
  return {
    ...farmer,
    user: publicUser(user),
    fields,
    meters,
    unpaidBalance: bills.filter((bill) => bill.status !== 'paid').reduce((sum, bill) => sum + Number(bill.amount), 0)
  };
}

function dashboardStats() {
  const totalConsumption = store.data.meterReadings.reduce((sum, reading) => sum + Number(reading.consumption || 0), 0);
  const unpaidBills = store.data.bills.filter((bill) => bill.status !== 'paid');
  const paidBills = store.data.bills.filter((bill) => bill.status === 'paid');
  const requests = store.data.irrigationRequests;
  return {
    totalFarmers: store.data.farmers.filter((farmer) => farmer.status !== 'archived').length,
    totalFields: store.data.fields.length,
    totalWaterConsumption: totalConsumption,
    pendingRequests: requests.filter((request) => request.status === 'pending').length,
    approvedRequests: requests.filter((request) => request.status === 'approved').length,
    totalUnpaidBills: unpaidBills.reduce((sum, bill) => sum + Number(bill.amount), 0),
    unpaidBillCount: unpaidBills.length,
    revenue: paidBills.reduce((sum, bill) => sum + Number(bill.amount), 0),
    recentActivities: store.data.activities.slice(0, 10),
    revenueSeries: buildMonthlySeries('payments', 'paidAt', 'amount'),
    consumptionSeries: buildMonthlySeries('meterReadings', 'readingDate', 'consumption')
  };
}

function buildMonthlySeries(table, dateKey, valueKey) {
  const today = new Date();
  const months = [];
  for (let index = 5; index >= 0; index -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth() - index, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: new Intl.DateTimeFormat('ar-TN', { month: 'short' }).format(date),
      value: 0
    });
  }
  const map = new Map(months.map((month) => [month.key, month]));
  for (const item of store.data[table]) {
    const date = new Date(item[dateKey]);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (map.has(key)) map.get(key).value += Number(item[valueKey] || 0);
  }
  return months;
}

function reports() {
  const byCrop = {};
  const byRegion = {};
  const byStatus = {};
  for (const field of store.data.fields) {
    const meters = store.data.waterMeters.filter((meter) => meter.fieldId === field.id);
    const consumption = store.data.meterReadings
      .filter((reading) => meters.some((meter) => meter.id === reading.meterId))
      .reduce((sum, reading) => sum + Number(reading.consumption || 0), 0);
    byCrop[field.cropType] = (byCrop[field.cropType] || 0) + consumption;
  }
  for (const bill of store.data.bills.filter((item) => item.status !== 'paid')) {
    const farmer = findById('farmers', bill.farmerId);
    const region = farmer?.region || 'غير محدد';
    byRegion[region] = (byRegion[region] || 0) + Number(bill.amount || 0);
  }
  for (const request of store.data.irrigationRequests) {
    byStatus[request.status] = (byStatus[request.status] || 0) + 1;
  }
  return {
    consumptionByCrop: Object.entries(byCrop).map(([label, value]) => ({ label, value })),
    unpaidByRegion: Object.entries(byRegion).map(([label, value]) => ({ label, value })),
    requestsByStatus: Object.entries(byStatus).map(([label, value]) => ({ label, value })),
    topConsumers: store.data.farmers
      .map((farmer) => ({
        farmer: enrichFarmer(farmer),
        consumption: store.data.bills
          .filter((bill) => bill.farmerId === farmer.id)
          .reduce((sum, bill) => sum + Number(bill.consumption || 0), 0)
      }))
      .sort((a, b) => b.consumption - a.consumption)
      .slice(0, 5)
  };
}

function createFarmerAccount(body, actor = null) {
  requireFields(body, ['name', 'email', 'password', 'nationalId', 'region']);
  const email = normalizeEmail(body.email);
  if (store.data.users.some((user) => user.email === email)) {
    throw new ApiError(409, 'Email already exists.');
  }
  if (store.data.farmers.some((farmer) => farmer.nationalId === String(body.nationalId))) {
    throw new ApiError(409, 'National ID already exists.');
  }
  const userId = id('usr');
  const farmerId = id('far');
  const fieldId = id('fld');
  const meterId = id('mtr');
  const user = {
    id: userId,
    email,
    passwordHash: hashPassword(String(body.password)),
    displayName: String(body.name).trim(),
    phone: String(body.phone || '').trim(),
    role: 'farmer',
    staffRoleId: null,
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const farmer = {
    id: farmerId,
    userId,
    nationalId: String(body.nationalId).trim(),
    associationNumber: body.associationNumber || `AGR-${String(store.data.farmers.length + 1).padStart(5, '0')}`,
    region: String(body.region).trim(),
    address: String(body.address || '').trim(),
    status: 'active',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const field = {
    id: fieldId,
    farmerId,
    name: body.fieldName || 'الحقل الرئيسي',
    areaHectares: Number(body.areaHectares || body.fieldArea || 1),
    cropType: body.cropType || 'زياتين',
    location: body.fieldLocation || body.region,
    soilType: body.soilType || 'متوسط',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const meter = {
    id: meterId,
    fieldId,
    meterNumber: body.meterNumber || `WM-${new Date().getFullYear()}-${String(store.data.waterMeters.length + 101).padStart(4, '0')}`,
    installationDate: dateOnly(),
    status: 'active',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const reading = {
    id: id('red'),
    meterId,
    readingValue: Number(body.initialReading || 0),
    consumption: 0,
    readingDate: dateOnly(),
    recordedBy: actor?.id || userId,
    createdAt: nowIso()
  };
  store.data.users.push(user);
  store.data.farmers.push(farmer);
  store.data.fields.push(field);
  store.data.waterMeters.push(meter);
  store.data.meterReadings.push(reading);
  createNotification(userId, 'تم إنشاء الحساب', 'مرحبا بك في منظومة إدارة مياه الري.');
  addActivity('farmer', 'تسجيل فلاح جديد', `${user.displayName} انضم إلى الجمعية.`, actor?.id || userId);
  return { user, farmer, field, meter };
}

function updateFarmer(farmerId, body) {
  const farmer = findById('farmers', farmerId);
  if (!farmer) throw new ApiError(404, 'Farmer not found.');
  const user = findById('users', farmer.userId);
  if (body.name !== undefined) user.displayName = String(body.name).trim();
  if (body.phone !== undefined) user.phone = String(body.phone).trim();
  if (body.email !== undefined) {
    const email = normalizeEmail(body.email);
    if (store.data.users.some((item) => item.email === email && item.id !== user.id)) {
      throw new ApiError(409, 'Email already exists.');
    }
    user.email = email;
  }
  for (const key of ['nationalId', 'associationNumber', 'region', 'address', 'status']) {
    if (body[key] !== undefined) farmer[key] = String(body[key]).trim();
  }
  user.updatedAt = nowIso();
  farmer.updatedAt = nowIso();
  return enrichFarmer(farmer);
}

function createOrUpdateField(body, fieldId = null) {
  if (fieldId) {
    const field = findById('fields', fieldId);
    if (!field) throw new ApiError(404, 'Field not found.');
    for (const key of ['name', 'cropType', 'location', 'soilType']) {
      if (body[key] !== undefined) field[key] = String(body[key]).trim();
    }
    if (body.areaHectares !== undefined) field.areaHectares = Number(body.areaHectares);
    const meter = store.data.waterMeters.find((item) => item.fieldId === field.id);
    if (meter && body.meterNumber !== undefined) meter.meterNumber = String(body.meterNumber).trim();
    field.updatedAt = nowIso();
    return { field, meter };
  }
  requireFields(body, ['farmerId', 'name', 'areaHectares', 'cropType', 'location']);
  if (!findById('farmers', body.farmerId)) throw new ApiError(404, 'Farmer not found.');
  const field = {
    id: id('fld'),
    farmerId: body.farmerId,
    name: String(body.name).trim(),
    areaHectares: Number(body.areaHectares),
    cropType: String(body.cropType).trim(),
    location: String(body.location).trim(),
    soilType: String(body.soilType || '').trim(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const meter = {
    id: id('mtr'),
    fieldId: field.id,
    meterNumber: body.meterNumber || `WM-${new Date().getFullYear()}-${String(store.data.waterMeters.length + 101).padStart(4, '0')}`,
    installationDate: body.installationDate || dateOnly(),
    status: 'active',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  store.data.fields.push(field);
  store.data.waterMeters.push(meter);
  store.data.meterReadings.push({
    id: id('red'),
    meterId: meter.id,
    readingValue: Number(body.initialReading || 0),
    consumption: 0,
    readingDate: body.installationDate || dateOnly(),
    recordedBy: null,
    createdAt: nowIso()
  });
  return { field, meter };
}

function addMeterReading(body, user) {
  requireFields(body, ['meterId', 'readingValue', 'readingDate']);
  const meter = findById('waterMeters', body.meterId);
  if (!meter) throw new ApiError(404, 'Water meter not found.');
  const field = findById('fields', meter.fieldId);
  const farmer = findById('farmers', field?.farmerId);
  const previous = previousReadingBefore(meter.id, body.readingDate);
  const readingValue = Number(body.readingValue);
  if (Number.isNaN(readingValue) || readingValue < 0) throw new ApiError(400, 'Reading value must be a positive number.');
  if (previous && readingValue < Number(previous.readingValue)) {
    throw new ApiError(400, 'Reading value cannot be lower than the previous reading.');
  }
  const consumption = previous ? readingValue - Number(previous.readingValue) : 0;
  const reading = {
    id: id('red'),
    meterId: meter.id,
    readingValue,
    consumption,
    readingDate: body.readingDate,
    recordedBy: user.id,
    createdAt: nowIso()
  };
  store.data.meterReadings.push(reading);
  let bill = null;
  if (consumption > 0 && farmer) {
    const periodStart = previous?.readingDate || body.readingDate;
    const amount = Number((consumption * WATER_TARIFF).toFixed(2));
    bill = {
      id: id('bil'),
      farmerId: farmer.id,
      meterId: meter.id,
      readingId: reading.id,
      billNumber: `BILL-${new Date().getFullYear()}-${String(store.data.bills.length + 1).padStart(5, '0')}`,
      periodStart,
      periodEnd: body.readingDate,
      consumption,
      rate: WATER_TARIFF,
      amount,
      status: 'unpaid',
      dueDate: addDays(new Date(), 30),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.data.bills.unshift(bill);
    const farmerUser = findById('users', farmer.userId);
    createNotification(farmerUser.id, 'فاتورة جديدة', `تم إصدار فاتورة بقيمة ${amount.toFixed(2)} عن استهلاك ${consumption.toFixed(2)} م3.`);
  }
  addActivity('meter', 'قراءة عداد جديدة', `تم تسجيل قراءة ${meter.meterNumber}.`, user.id);
  return { reading, bill };
}

function updateRequestStatus(requestId, body, user) {
  const request = findById('irrigationRequests', requestId);
  if (!request) throw new ApiError(404, 'Irrigation request not found.');
  const status = body.status || request.status;
  if (!['pending', 'approved', 'rejected'].includes(status)) throw new ApiError(400, 'Invalid request status.');
  request.status = status;
  request.scheduledAt = body.scheduledAt || request.scheduledAt || null;
  request.staffNote = body.staffNote !== undefined ? String(body.staffNote) : request.staffNote;
  request.decidedBy = status === 'pending' ? null : user.id;
  request.decidedAt = status === 'pending' ? null : nowIso();
  request.updatedAt = nowIso();
  const farmer = findById('farmers', request.farmerId);
  const farmerUser = findById('users', farmer?.userId);
  if (farmerUser && status !== 'pending') {
    const title = status === 'approved' ? 'تمت الموافقة على طلب الري' : 'تم رفض طلب الري';
    const message = status === 'approved'
      ? `تمت الموافقة على طلبك. موعد الدور: ${request.scheduledAt ? new Date(request.scheduledAt).toLocaleString('ar-TN') : 'سيحدد لاحقا'}.`
      : `تم رفض طلبك. ${request.staffNote || ''}`.trim();
    createNotification(farmerUser.id, title, message);
  }
  addActivity('request', status === 'approved' ? 'موافقة على طلب ري' : status === 'rejected' ? 'رفض طلب ري' : 'تحديث طلب ري', `طلب ${farmerUser?.displayName || farmer?.associationNumber || ''}`, user.id);
  return request;
}

function markBillPaid(billId, body, user) {
  const bill = findById('bills', billId);
  if (!bill) throw new ApiError(404, 'Bill not found.');
  if (bill.status === 'paid') return bill;
  bill.status = 'paid';
  bill.updatedAt = nowIso();
  const payment = {
    id: id('pay'),
    billId: bill.id,
    farmerId: bill.farmerId,
    amount: Number(body.amount || bill.amount),
    method: body.method || 'cash',
    reference: body.reference || `PAY-${Date.now()}`,
    paidAt: nowIso(),
    recordedBy: user.id
  };
  store.data.payments.unshift(payment);
  const farmer = findById('farmers', bill.farmerId);
  const farmerUser = findById('users', farmer?.userId);
  if (farmerUser) createNotification(farmerUser.id, 'تم تسجيل الدفع', `تم تسجيل دفع فاتورة ${bill.billNumber}.`);
  addActivity('bill', 'تسديد فاتورة', `${bill.billNumber} بقيمة ${bill.amount.toFixed(2)}.`, user.id);
  return { bill, payment };
}

async function handleApi(req, res, pathname) {
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await parseBody(req);
    const user = store.data.users.find((item) => item.email === normalizeEmail(body.email) && item.active);
    if (!user || !verifyPassword(String(body.password || ''), user.passwordHash)) {
      throw new ApiError(401, 'Invalid email or password.');
    }
    sendJson(res, 200, {
      token: signJwt({ sub: user.id, role: user.role }),
      user: publicUser(user)
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const body = await parseBody(req);
    const { user, farmer } = createFarmerAccount(body);
    await store.save();
    sendJson(res, 201, {
      token: signJwt({ sub: user.id, role: user.role }),
      user: publicUser(user),
      farmer
    });
    return;
  }

  const user = getUserFromRequest(req);

  if (req.method === 'GET' && pathname === '/api/me') {
    sendJson(res, 200, {
      user: publicUser(user),
      farmer: user.role === 'farmer' ? farmerForUser(user) : null
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/farmer/overview') {
    if (user.role !== 'farmer') throw new ApiError(403, 'Farmer access required.');
    sendJson(res, 200, getFarmerOverview(farmerForUser(user).id));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/farmer/requests') {
    if (user.role !== 'farmer') throw new ApiError(403, 'Farmer access required.');
    const body = await parseBody(req);
    requireFields(body, ['fieldId', 'requestedDate', 'requestedHours']);
    const farmer = farmerForUser(user);
    const field = findById('fields', body.fieldId);
    if (!field || field.farmerId !== farmer.id) throw new ApiError(404, 'Field not found.');
    const request = {
      id: id('req'),
      farmerId: farmer.id,
      fieldId: field.id,
      requestedDate: body.requestedDate,
      requestedHours: Number(body.requestedHours),
      waterAmount: Number(body.waterAmount || 0),
      reason: String(body.reason || '').trim(),
      status: 'pending',
      scheduledAt: null,
      staffNote: '',
      decidedBy: null,
      decidedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.data.irrigationRequests.unshift(request);
    addActivity('request', 'طلب ري جديد', `${user.displayName} قدم طلب ري.`, user.id);
    await store.save();
    sendJson(res, 201, request);
    return;
  }

  const readNotificationMatch = matchPath('/api/farmer/notifications/:id/read', pathname);
  if (req.method === 'PATCH' && readNotificationMatch) {
    const notification = findById('notifications', readNotificationMatch.id);
    if (!notification || notification.userId !== user.id) throw new ApiError(404, 'Notification not found.');
    notification.status = 'read';
    await store.save();
    sendJson(res, 200, notification);
    return;
  }

  if (pathname.startsWith('/api/admin')) {
    if (!['admin', 'staff'].includes(user.role)) throw new ApiError(403, 'Admin or staff access required.');
  }

  if (req.method === 'GET' && pathname === '/api/admin/dashboard') {
    requirePermission(user, 'reports:read');
    sendJson(res, 200, dashboardStats());
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/farmers') {
    requirePermission(user, 'farmers:read');
    sendJson(res, 200, store.data.farmers.map(enrichFarmer));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/admin/farmers') {
    requirePermission(user, 'farmers:write');
    const body = await parseBody(req);
    const result = createFarmerAccount(body, user);
    audit(user, 'create', 'farmer', result.farmer.id, { email: result.user.email }, req);
    await store.save();
    sendJson(res, 201, enrichFarmer(result.farmer));
    return;
  }

  const farmerMatch = matchPath('/api/admin/farmers/:id', pathname);
  if (farmerMatch && req.method === 'PUT') {
    requirePermission(user, 'farmers:write');
    const body = await parseBody(req);
    const updated = updateFarmer(farmerMatch.id, body);
    audit(user, 'update', 'farmer', farmerMatch.id, body, req);
    await store.save();
    sendJson(res, 200, updated);
    return;
  }

  if (farmerMatch && req.method === 'DELETE') {
    requirePermission(user, 'farmers:write');
    const farmer = findById('farmers', farmerMatch.id);
    if (!farmer) throw new ApiError(404, 'Farmer not found.');
    farmer.status = 'archived';
    farmer.updatedAt = nowIso();
    const farmerUser = findById('users', farmer.userId);
    if (farmerUser) farmerUser.active = false;
    audit(user, 'delete', 'farmer', farmer.id, { softDelete: true }, req);
    addActivity('farmer', 'أرشفة فلاح', farmer.associationNumber, user.id);
    await store.save();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/fields') {
    requirePermission(user, 'farmers:read');
    sendJson(res, 200, store.data.fields.map((field) => ({
      ...field,
      farmer: enrichFarmer(findById('farmers', field.farmerId)),
      meter: store.data.waterMeters.find((meter) => meter.fieldId === field.id) || null
    })));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/admin/fields') {
    requirePermission(user, 'fields:write');
    const body = await parseBody(req);
    const result = createOrUpdateField(body);
    audit(user, 'create', 'field', result.field.id, body, req);
    await store.save();
    sendJson(res, 201, result);
    return;
  }

  const fieldMatch = matchPath('/api/admin/fields/:id', pathname);
  if (fieldMatch && req.method === 'PUT') {
    requirePermission(user, 'fields:write');
    const body = await parseBody(req);
    const result = createOrUpdateField(body, fieldMatch.id);
    audit(user, 'update', 'field', fieldMatch.id, body, req);
    await store.save();
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/meters') {
    requirePermission(user, 'meters:read');
    sendJson(res, 200, store.data.waterMeters.map((meter) => {
      const field = findById('fields', meter.fieldId);
      const farmer = field ? findById('farmers', field.farmerId) : null;
      const farmerUser = farmer ? findById('users', farmer.userId) : null;
      return {
        ...meter,
        field,
        farmer: farmer ? { ...farmer, user: publicUser(farmerUser) } : null,
        latestReading: latestReading(meter.id)
      };
    }));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/admin/meter-readings') {
    requirePermission(user, 'meters:write');
    const body = await parseBody(req);
    const result = addMeterReading(body, user);
    audit(user, 'create', 'meter_reading', result.reading.id, body, req);
    await store.save();
    sendJson(res, 201, result);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/requests') {
    requirePermission(user, 'requests:read');
    sendJson(res, 200, store.data.irrigationRequests.map((request) => {
      const farmer = findById('farmers', request.farmerId);
      const farmerUser = farmer ? findById('users', farmer.userId) : null;
      return {
        ...request,
        farmer: farmer ? { ...farmer, user: publicUser(farmerUser) } : null,
        field: findById('fields', request.fieldId)
      };
    }));
    return;
  }

  const requestMatch = matchPath('/api/admin/requests/:id', pathname);
  if (requestMatch && req.method === 'PATCH') {
    requirePermission(user, 'requests:write');
    const body = await parseBody(req);
    const result = updateRequestStatus(requestMatch.id, body, user);
    audit(user, 'update_status', 'irrigation_request', requestMatch.id, body, req);
    await store.save();
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/bills') {
    requirePermission(user, 'bills:read');
    sendJson(res, 200, store.data.bills.map((bill) => {
      const farmer = findById('farmers', bill.farmerId);
      const farmerUser = farmer ? findById('users', farmer.userId) : null;
      return {
        ...bill,
        farmer: farmer ? { ...farmer, user: publicUser(farmerUser) } : null,
        meter: findById('waterMeters', bill.meterId)
      };
    }));
    return;
  }

  const billPayMatch = matchPath('/api/admin/bills/:id/pay', pathname);
  if (billPayMatch && req.method === 'PATCH') {
    requirePermission(user, 'bills:write');
    const body = await parseBody(req);
    const result = markBillPaid(billPayMatch.id, body, user);
    audit(user, 'pay', 'bill', billPayMatch.id, body, req);
    await store.save();
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/staff') {
    requirePermission(user, 'staff:read');
    sendJson(res, 200, {
      roles: store.data.staffRoles,
      users: store.data.users.filter((item) => ['admin', 'staff'].includes(item.role)).map(publicUser)
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/admin/staff') {
    requirePermission(user, 'staff:write');
    const body = await parseBody(req);
    requireFields(body, ['name', 'email', 'password', 'staffRoleId']);
    if (!findById('staffRoles', body.staffRoleId)) throw new ApiError(404, 'Staff role not found.');
    const email = normalizeEmail(body.email);
    if (store.data.users.some((item) => item.email === email)) throw new ApiError(409, 'Email already exists.');
    const staffUser = {
      id: id('usr'),
      email,
      passwordHash: hashPassword(String(body.password)),
      displayName: String(body.name).trim(),
      phone: String(body.phone || '').trim(),
      role: 'staff',
      staffRoleId: body.staffRoleId,
      active: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.data.users.push(staffUser);
    audit(user, 'create', 'staff', staffUser.id, { email }, req);
    await store.save();
    sendJson(res, 201, publicUser(staffUser));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/reports') {
    requirePermission(user, 'reports:read');
    sendJson(res, 200, reports());
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/audit-logs') {
    requirePermission(user, 'audit:read');
    sendJson(res, 200, store.data.auditLogs.map((log) => ({
      ...log,
      actor: publicUser(findById('users', log.actorId))
    })));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/admin/notifications') {
    requirePermission(user, 'notifications:write');
    const body = await parseBody(req);
    requireFields(body, ['title', 'message']);
    const recipients = body.farmerId
      ? [findById('farmers', body.farmerId)].filter(Boolean).map((farmer) => findById('users', farmer.userId))
      : store.data.farmers.filter((farmer) => farmer.status === 'active').map((farmer) => findById('users', farmer.userId));
    const created = recipients.filter(Boolean).map((recipient) => createNotification(recipient.id, body.title, body.message));
    audit(user, 'send', 'notification', null, { count: created.length, title: body.title }, req);
    await store.save();
    sendJson(res, 201, { count: created.length, notifications: created });
    return;
  }

  throw new ApiError(404, 'API route not found.');
}

function matchPath(pattern, pathname) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    const pathPart = decodeURIComponent(pathParts[index]);
    if (patternPart.startsWith(':')) {
      params[patternPart.slice(1)] = pathPart;
    } else if (patternPart !== pathPart) {
      return null;
    }
  }
  return params;
}

async function serveStatic(req, res, pathname) {
  const target = pathname === '/' ? '/index.html' : pathname;
  const filePath = normalize(join(publicDir, target));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('Not a file');
    res.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream'
    });
    createReadStream(filePath).pipe(res);
  } catch {
    const fallback = join(publicDir, 'index.html');
    res.writeHead(200, { 'Content-Type': mimeTypes['.html'] });
    createReadStream(fallback).pipe(res);
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
      return;
    }
    await serveStatic(req, res, pathname);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    if (status === 500) console.error(error);
    sendJson(res, status, {
      error: error.message || 'Internal server error'
    });
  }
});

server.listen(PORT, () => {
  console.log(`Smart Irrigation Water Management System running at http://localhost:${PORT}`);
});

function createSeedData() {
  const adminRoleId = 'role_admin';
  const operationsRoleId = 'role_operations';
  const financeRoleId = 'role_finance';
  const adminUserId = 'usr_admin';
  const staffUserId = 'usr_staff';
  const farmerUserId = 'usr_farmer_1';
  const farmerTwoUserId = 'usr_farmer_2';
  const farmerId = 'far_1';
  const farmerTwoId = 'far_2';
  const fieldId = 'fld_1';
  const fieldTwoId = 'fld_2';
  const fieldThreeId = 'fld_3';
  const meterId = 'mtr_1';
  const meterTwoId = 'mtr_2';
  const meterThreeId = 'mtr_3';
  const today = new Date();
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 12);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 12);
  return {
    staffRoles: [
      {
        id: adminRoleId,
        name: 'مدير النظام',
        description: 'صلاحيات كاملة لإدارة الجمعية.',
        permissions: ['*'],
        createdAt: nowIso()
      },
      {
        id: operationsRoleId,
        name: 'مصلحة الري',
        description: 'إدارة العدادات والطلبات والجداول.',
        permissions: ['farmers:read', 'fields:write', 'meters:read', 'meters:write', 'requests:read', 'requests:write', 'bills:read', 'notifications:write', 'reports:read'],
        createdAt: nowIso()
      },
      {
        id: financeRoleId,
        name: 'مصلحة المالية',
        description: 'إدارة الفواتير والدفع والتقارير.',
        permissions: ['farmers:read', 'bills:read', 'bills:write', 'reports:read'],
        createdAt: nowIso()
      }
    ],
    users: [
      {
    id: adminUserId,
    email: 'admin@irrigation.local',
    passwordHash: hashPassword('Admin@123'),
    displayName: 'Admin',
    phone: '',
    role: 'admin',
    staffRoleId: adminRoleId,
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso()
      }
    ],
    farmers: [],
  fields: [],
  waterMeters: [],
  meterReadings: [],
  irrigationRequests: [],
  bills: [],
  payments: [],
  notifications: [],
  activities: [],
  auditLogs: []
  };
}
