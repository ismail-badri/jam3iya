const app = document.querySelector('#app');

const state = {
  token: localStorage.getItem('smart-irrigation-token'),
  user: null,
  authMode: 'login',
  adminTab: 'dashboard',
  farmerTab: 'overview',
  cache: {},
  loading: new Set(),
  toast: '',
  theme: localStorage.getItem('smart-irrigation-theme') || 'light'
};

document.documentElement.dataset.theme = state.theme;

const adminTabs = [
  ['dashboard', 'لوحة القيادة', 'لو'],
  ['farmers', 'الفلاحون', 'فل'],
  ['fields', 'الأراضي والعدادات', 'أر'],
  ['meters', 'القراءات', 'ق'],
  ['requests', 'طلبات الري', 'ط'],
  ['bills', 'الفواتير', 'فا'],
  ['staff', 'الأعوان', 'أع'],
  ['reports', 'التقارير', 'تق'],
  ['audit', 'السجل', 'سج'],
  ['notifications', 'الإشعارات', 'إش']
];

const farmerTabs = [
  ['overview', 'الملخص', 'مل'],
  ['fields', 'الأراضي والعداد', 'أر'],
  ['readings', 'الاستهلاك', 'اس'],
  ['bills', 'الفواتير', 'فا'],
  ['requests', 'طلبات الري', 'ط'],
  ['notifications', 'الإشعارات', 'إش']
];

const endpoints = {
  'farmer:overview': '/api/farmer/overview',
  'farmer:fields': '/api/farmer/overview',
  'farmer:readings': '/api/farmer/overview',
  'farmer:bills': '/api/farmer/overview',
  'farmer:requests': '/api/farmer/overview',
  'farmer:notifications': '/api/farmer/overview',
  'admin:dashboard': '/api/admin/dashboard',
  'admin:farmers': '/api/admin/farmers',
  'admin:fields': '/api/admin/fields',
  'admin:meters': '/api/admin/meters',
  'admin:requests': '/api/admin/requests',
  'admin:bills': '/api/admin/bills',
  'admin:staff': '/api/admin/staff',
  'admin:reports': '/api/admin/reports',
  'admin:audit': '/api/admin/audit-logs',
  'admin:notifications': '/api/admin/farmers'
};

const labels = {
  pending: 'قيد الانتظار',
  approved: 'مقبول',
  rejected: 'مرفوض',
  paid: 'مدفوعة',
  unpaid: 'غير مدفوعة',
  overdue: 'متأخرة',
  active: 'نشط',
  archived: 'مؤرشف',
  read: 'مقروء',
  unread: 'جديد',
  farmer: 'فلاح',
  staff: 'عون',
  admin: 'مدير'
};

const numberFormatter = new Intl.NumberFormat('ar-TN', { maximumFractionDigits: 2 });
const currencyFormatter = new Intl.NumberFormat('ar-TN', { style: 'currency', currency: 'TND', maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat('ar-TN', { dateStyle: 'medium' });
const dateTimeFormatter = new Intl.DateTimeFormat('ar-TN', { dateStyle: 'medium', timeStyle: 'short' });

init();

async function init() {
  if (state.token) {
    try {
      const { user } = await api('/api/me');
      state.user = user;
    } catch {
      logout(false);
    }
  }
  render();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) logout(false);
    throw new Error(payload.error || 'تعذر تنفيذ العملية.');
  }
  return payload;
}

function render() {
  app.innerHTML = state.user ? renderShell() : renderAuth();
  if (state.toast) {
    app.insertAdjacentHTML('beforeend', `<div class="toast">${escapeHtml(state.toast)}</div>`);
  }
}

function renderAuth() {
  const login = state.authMode === 'login';
  return `
    <main class="auth-layout">
      <section class="auth-panel">
        <div class="auth-switch">
          <div>
            <h2>${login ? 'تسجيل الدخول' : 'تسجيل فلاح جديد'}</h2>
            <p class="muted">${login ? 'الدخول إلى فضاء الجمعية أو فضاء الفلاح.' : 'إنشاء حساب فلاح مرتبط بحقل وعداد ماء.'}</p>
          </div>
          <button class="btn secondary" data-action="toggle-auth">${login ? 'حساب جديد' : 'لدي حساب'}</button>
        </div>
        ${login ? loginForm() : registerForm()}
      </section>
      <section class="auth-context">
        <div class="brand-block">
          <div class="brand-mark">ماء</div>
          <div>
            <h1>منظومة إدارة مياه الري</h1>
            <small>الجمعية الفلاحية لتوزيع المياه</small>
          </div>
        </div>
        <div>
          <h2>متابعة دقيقة للتوزيع، الاستهلاك، الفوترة، ودورات الري.</h2>
          <p>واجهة إدارية وفلاحية موحدة تدعم العربية، الصلاحيات، السجلات الرقابية، وتنبيهات القرارات.</p>
        </div>
        <div class="auth-demo">
          <strong>حسابات تجريبية</strong>
          <span>الإدارة: admin@irrigation.local / Admin@123</span>
          <span>فلاح: farmer1@irrigation.local / Farmer@123</span>
          <span>عون: staff@irrigation.local / Staff@123</span>
        </div>
      </section>
    </main>
  `;
}

function loginForm() {
  return `
    <form data-form="login" class="grid">
      <div class="form-row">
        <label>البريد الإلكتروني</label>
        <input name="email" type="email" autocomplete="username" required value="admin@irrigation.local">
      </div>
      <div class="form-row">
        <label>كلمة المرور</label>
        <input name="password" type="password" autocomplete="current-password" required value="Admin@123">
      </div>
      <button class="btn" type="submit">دخول</button>
    </form>
  `;
}

function registerForm() {
  return `
    <form data-form="register" class="form-grid">
      <div class="form-row">
        <label>الاسم الكامل</label>
        <input name="name" required>
      </div>
      <div class="form-row">
        <label>البريد الإلكتروني</label>
        <input name="email" type="email" required>
      </div>
      <div class="form-row">
        <label>كلمة المرور</label>
        <input name="password" type="password" minlength="8" required>
      </div>
      <div class="form-row">
        <label>رقم بطاقة التعريف</label>
        <input name="nationalId" required>
      </div>
      <div class="form-row">
        <label>الهاتف</label>
        <input name="phone">
      </div>
      <div class="form-row">
        <label>المنطقة</label>
        <input name="region" required>
      </div>
      <div class="form-row">
        <label>مساحة الحقل بالهكتار</label>
        <input name="fieldArea" type="number" min="0" step="0.01" value="1">
      </div>
      <div class="form-row">
        <label>نوع الغراسة</label>
        <input name="cropType" value="زياتين">
      </div>
      <div class="form-row">
        <label>الموقع</label>
        <input name="fieldLocation">
      </div>
      <div class="form-row full">
        <button class="btn" type="submit">إنشاء الحساب</button>
      </div>
    </form>
  `;
}

function renderShell() {
  const role = state.user.role;
  const tabs = role === 'farmer' ? farmerTabs : adminTabs;
  const current = role === 'farmer' ? state.farmerTab : state.adminTab;
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand-block">
          <div class="brand-mark">ماء</div>
          <div>
            <h2>إدارة الري</h2>
            <small>${escapeHtml(labels[role] || role)}</small>
          </div>
        </div>
        <nav class="sidebar-nav">
          ${tabs.map(([key, label, icon]) => `
            <button class="nav-button ${key === current ? 'active' : ''}" data-tab="${key}">
              <span class="nav-icon">${escapeHtml(icon)}</span>
              <span>${escapeHtml(label)}</span>
            </button>
          `).join('')}
        </nav>
        <div class="sidebar-footer">
          <button class="btn ghost" data-action="theme">${state.theme === 'dark' ? 'النمط الفاتح' : 'النمط الداكن'}</button>
          <button class="btn ghost" data-action="logout">خروج</button>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div>
            <h2>${escapeHtml(currentTitle())}</h2>
            <p>${escapeHtml(state.user.displayName)} - ${escapeHtml(state.user.email)}</p>
          </div>
          <div class="toolbar">
            <span class="badge active">${escapeHtml(labels[role] || role)}</span>
            <button class="btn secondary" data-action="refresh">تحديث</button>
          </div>
        </header>
        ${role === 'farmer' ? renderFarmer() : renderAdmin()}
      </main>
    </div>
  `;
}

function currentTitle() {
  const tabs = state.user?.role === 'farmer' ? farmerTabs : adminTabs;
  const current = state.user?.role === 'farmer' ? state.farmerTab : state.adminTab;
  return tabs.find(([key]) => key === current)?.[1] || 'لوحة القيادة';
}

function renderFarmer() {
  const data = dataForCurrentView();
  if (!data) return loadingPanel();
  switch (state.farmerTab) {
    case 'fields':
      return farmerFields(data);
    case 'readings':
      return farmerReadings(data);
    case 'bills':
      return farmerBills(data);
    case 'requests':
      return farmerRequests(data);
    case 'notifications':
      return farmerNotifications(data);
    default:
      return farmerOverview(data);
  }
}

function renderAdmin() {
  const data = dataForCurrentView();
  if (!data) return loadingPanel();
  switch (state.adminTab) {
    case 'farmers':
      return adminFarmers(data);
    case 'fields':
      return adminFields(data);
    case 'meters':
      return adminMeters(data);
    case 'requests':
      return adminRequests(data);
    case 'bills':
      return adminBills(data);
    case 'staff':
      return adminStaff(data);
    case 'reports':
      return adminReports(data);
    case 'audit':
      return adminAudit(data);
    case 'notifications':
      return adminNotifications(data);
    default:
      return adminDashboard(data);
  }
}

function dataForCurrentView() {
  const key = currentCacheKey();
  if (!state.cache[key] && !state.loading.has(key)) {
    loadCurrentData(key);
  }
  return state.cache[key];
}

function currentCacheKey() {
  if (!state.user) return '';
  return state.user.role === 'farmer' ? `farmer:${state.farmerTab}` : `admin:${state.adminTab}`;
}

async function loadCurrentData(key = currentCacheKey(), force = false) {
  if (!endpoints[key]) return;
  if (state.loading.has(key) || (!force && state.cache[key])) return;
  state.loading.add(key);
  render();
  try {
    state.cache[key] = await api(endpoints[key]);
  } catch (error) {
    showToast(error.message);
  } finally {
    state.loading.delete(key);
    render();
  }
}

function invalidate(prefix = '') {
  for (const key of Object.keys(state.cache)) {
    if (!prefix || key.startsWith(prefix)) delete state.cache[key];
  }
}

function loadingPanel() {
  return `<div class="loading">جاري تحميل البيانات...</div>`;
}

function farmerOverview(data) {
  return `
    <section class="grid stats-grid">
      ${statCard('عدد الأراضي', data.summary.totalFields, 'حقول مسجلة')}
      ${statCard('العدادات', data.summary.totalMeters, 'عدادات ماء')}
      ${statCard('إجمالي الاستهلاك', volume(data.summary.totalConsumption), 'من كل القراءات')}
      ${statCard('الفواتير غير المدفوعة', money(data.summary.unpaidAmount), `${fmt(data.summary.pendingRequests)} طلبات معلقة`)}
    </section>
    <section class="grid two-col" style="margin-top:18px">
      <div class="panel">
        <div class="panel-header"><h3>آخر الطلبات</h3></div>
        ${requestList(data.requests.slice(0, 4))}
      </div>
      <div class="panel">
        <div class="panel-header"><h3>آخر الإشعارات</h3></div>
        ${notificationList(data.notifications.slice(0, 5), true)}
      </div>
    </section>
  `;
}

function farmerFields(data) {
  return tableCard('الأراضي والعدادات', ['الحقل', 'المساحة', 'الغراسة', 'الموقع', 'رقم العداد', 'آخر قراءة'], data.fields.map((field) => [
    field.name,
    `${fmt(field.areaHectares)} هـ`,
    field.cropType,
    field.location,
    field.meter?.meterNumber || '-',
    field.latestReading ? volume(field.latestReading.readingValue) : '-'
  ]));
}

function farmerReadings(data) {
  return tableCard('قراءات العداد والاستهلاك', ['التاريخ', 'العداد', 'القراءة', 'الاستهلاك'], data.readings.map((reading) => {
    const meter = data.fields.map((field) => field.meter).find((meterItem) => meterItem?.id === reading.meterId);
    return [
      formatDate(reading.readingDate),
      meter?.meterNumber || '-',
      volume(reading.readingValue),
      volume(reading.consumption)
    ];
  }));
}

function farmerBills(data) {
  return tableCard('الفواتير', ['رقم الفاتورة', 'الفترة', 'الاستهلاك', 'المبلغ', 'الأجل', 'الحالة'], data.bills.map((bill) => [
    bill.billNumber,
    `${formatDate(bill.periodStart)} - ${formatDate(bill.periodEnd)}`,
    volume(bill.consumption),
    money(bill.amount),
    formatDate(bill.dueDate),
    badge(bill.status)
  ]));
}

function farmerRequests(data) {
  return `
    <section class="panel">
      <div class="panel-header"><h3>طلب ماء للري</h3></div>
      <form data-form="farmer-request" class="form-grid">
        <div class="form-row">
          <label>الحقل</label>
          <select name="fieldId" required>
            ${data.fields.map((field) => `<option value="${field.id}">${escapeHtml(field.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <label>التاريخ المطلوب</label>
          <input name="requestedDate" type="date" required value="${today()}">
        </div>
        <div class="form-row">
          <label>عدد الساعات</label>
          <input name="requestedHours" type="number" min="1" step="0.5" required value="4">
        </div>
        <div class="form-row">
          <label>كمية تقديرية م³</label>
          <input name="waterAmount" type="number" min="0" step="0.5" value="80">
        </div>
        <div class="form-row full">
          <label>السبب</label>
          <textarea name="reason"></textarea>
        </div>
        <div class="form-row full">
          <button class="btn" type="submit">إرسال الطلب</button>
        </div>
      </form>
    </section>
    <section class="table-card">
      <h3>متابعة الطلبات</h3>
      ${requestTable(data.requests, false)}
    </section>
  `;
}

function farmerNotifications(data) {
  return `<section class="panel"><div class="panel-header"><h3>الإشعارات</h3></div>${notificationList(data.notifications, true)}</section>`;
}

function adminDashboard(data) {
  return `
    <section class="grid stats-grid">
      ${statCard('إجمالي الفلاحين', data.totalFarmers, 'حسابات نشطة')}
      ${statCard('إجمالي الأراضي', data.totalFields, 'قطع مسجلة')}
      ${statCard('استهلاك المياه', volume(data.totalWaterConsumption), 'قراءات تراكمية')}
      ${statCard('طلبات معلقة', data.pendingRequests, `${fmt(data.approvedRequests)} طلبات مقبولة`)}
      ${statCard('غير مستخلص', money(data.totalUnpaidBills), `${fmt(data.unpaidBillCount)} فواتير`)}
      ${statCard('المداخيل', money(data.revenue), 'دفعات مسجلة')}
    </section>
    <section class="grid two-col" style="margin-top:18px">
      <div class="panel">
        <div class="panel-header"><h3>المداخيل الشهرية</h3></div>
        ${barList(data.revenueSeries, true)}
      </div>
      <div class="panel">
        <div class="panel-header"><h3>الاستهلاك الشهري</h3></div>
        ${barList(data.consumptionSeries, false)}
      </div>
    </section>
    <section class="panel">
      <div class="panel-header"><h3>آخر الأنشطة</h3></div>
      <div class="activity-list">
        ${data.recentActivities.map((item) => `
          <div class="activity-item">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="muted">${escapeHtml(item.description)} - ${formatDateTime(item.createdAt)}</span>
          </div>
        `).join('') || emptyState('لا توجد أنشطة حديثة.')}
      </div>
    </section>
  `;
}

function adminFarmers(farmers) {
  return `
    <details class="panel">
      <summary>إضافة فلاح</summary>
      <form data-form="admin-farmer" class="form-grid" style="margin-top:16px">
        <div class="form-row"><label>الاسم</label><input name="name" required></div>
        <div class="form-row"><label>البريد</label><input name="email" type="email" required></div>
        <div class="form-row"><label>كلمة المرور</label><input name="password" type="password" required value="Farmer@123"></div>
        <div class="form-row"><label>بطاقة التعريف</label><input name="nationalId" required></div>
        <div class="form-row"><label>الهاتف</label><input name="phone"></div>
        <div class="form-row"><label>المنطقة</label><input name="region" required></div>
        <div class="form-row"><label>اسم الحقل</label><input name="fieldName" value="الحقل الرئيسي"></div>
        <div class="form-row"><label>المساحة</label><input name="areaHectares" type="number" step="0.01" value="1"></div>
        <div class="form-row"><label>الغراسة</label><input name="cropType" value="زياتين"></div>
        <div class="form-row full"><button class="btn" type="submit">حفظ الفلاح</button></div>
      </form>
    </details>
    <section class="table-card">
      <h3>قائمة الفلاحين</h3>
      ${table(['الفلاح', 'الانخراط', 'المنطقة', 'الأراضي', 'العدادات', 'غير مستخلص', 'الحالة', 'إجراءات'], farmers.map((farmer) => [
        `${escapeHtml(farmer.user?.displayName || '')}<br><span class="muted">${escapeHtml(farmer.user?.email || '')}</span>`,
        farmer.associationNumber,
        farmer.region,
        fmt(farmer.fields.length),
        fmt(farmer.meters.length),
        money(farmer.unpaidBalance),
        badge(farmer.status),
        `<div class="actions">
          <button class="btn small secondary" data-action="edit-farmer" data-id="${farmer.id}">تعديل</button>
          <button class="btn small red" data-action="delete-farmer" data-id="${farmer.id}">حذف</button>
        </div>`
      ]))}
    </section>
  `;
}

function adminFields(fields) {
  const farmers = cachedFarmers();
  return `
    <section class="panel">
      <div class="panel-header"><h3>إضافة أرض وعداد</h3></div>
      <form data-form="admin-field" class="form-grid">
        <div class="form-row">
          <label>الفلاح</label>
          <select name="farmerId" required>${farmers.map((farmer) => `<option value="${farmer.id}">${escapeHtml(farmer.user?.displayName || farmer.associationNumber)}</option>`).join('')}</select>
        </div>
        <div class="form-row"><label>اسم الأرض</label><input name="name" required></div>
        <div class="form-row"><label>المساحة</label><input name="areaHectares" type="number" step="0.01" required></div>
        <div class="form-row"><label>الغراسة</label><input name="cropType" required></div>
        <div class="form-row"><label>الموقع</label><input name="location" required></div>
        <div class="form-row"><label>نوع التربة</label><input name="soilType"></div>
        <div class="form-row"><label>رقم العداد</label><input name="meterNumber"></div>
        <div class="form-row"><label>قراءة أولية</label><input name="initialReading" type="number" min="0" step="0.01" value="0"></div>
        <div class="form-row full"><button class="btn" type="submit">حفظ الأرض</button></div>
      </form>
    </section>
    <section class="table-card">
      <h3>الأراضي والعدادات</h3>
      ${table(['الأرض', 'الفلاح', 'المساحة', 'الغراسة', 'الموقع', 'العداد', 'إجراءات'], fields.map((field) => [
        field.name,
        field.farmer?.user?.displayName || '-',
        `${fmt(field.areaHectares)} هـ`,
        field.cropType,
        field.location,
        field.meter?.meterNumber || '-',
        `<button class="btn small secondary" data-action="edit-field" data-id="${field.id}">تعديل</button>`
      ]))}
    </section>
  `;
}

function adminMeters(meters) {
  return `
    <section class="panel">
      <div class="panel-header"><h3>تسجيل قراءة عداد</h3></div>
      <form data-form="meter-reading" class="form-grid compact">
        <div class="form-row">
          <label>العداد</label>
          <select name="meterId" required>
            ${meters.map((meter) => `<option value="${meter.id}">${escapeHtml(meter.meterNumber)} - ${escapeHtml(meter.farmer?.user?.displayName || '')}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>قيمة القراءة</label><input name="readingValue" type="number" min="0" step="0.01" required></div>
        <div class="form-row"><label>تاريخ القراءة</label><input name="readingDate" type="date" required value="${today()}"></div>
        <div class="form-row"><label>&nbsp;</label><button class="btn" type="submit">تسجيل</button></div>
      </form>
    </section>
    <section class="table-card">
      <h3>العدادات</h3>
      ${table(['رقم العداد', 'الفلاح', 'الأرض', 'آخر قراءة', 'آخر استهلاك', 'الحالة'], meters.map((meter) => [
        meter.meterNumber,
        meter.farmer?.user?.displayName || '-',
        meter.field?.name || '-',
        meter.latestReading ? volume(meter.latestReading.readingValue) : '-',
        meter.latestReading ? volume(meter.latestReading.consumption) : '-',
        badge(meter.status)
      ]))}
    </section>
  `;
}

function adminRequests(requests) {
  return `<section class="table-card"><h3>طلبات الري وتنظيم الأدوار</h3>${requestTable(requests, true)}</section>`;
}

function adminBills(bills) {
  return `
    <section class="table-card">
      <h3>الفواتير والمدفوعات</h3>
      ${table(['الفاتورة', 'الفلاح', 'الاستهلاك', 'المبلغ', 'الأجل', 'الحالة', 'إجراءات'], bills.map((bill) => [
        bill.billNumber,
        bill.farmer?.user?.displayName || '-',
        volume(bill.consumption),
        money(bill.amount),
        formatDate(bill.dueDate),
        badge(bill.status),
        bill.status === 'paid' ? '-' : `<button class="btn small green" data-action="pay-bill" data-id="${bill.id}">تسجيل دفع</button>`
      ]))}
    </section>
  `;
}

function adminStaff(data) {
  return `
    <section class="panel">
      <div class="panel-header"><h3>إضافة حساب عون</h3></div>
      <form data-form="staff" class="form-grid">
        <div class="form-row"><label>الاسم</label><input name="name" required></div>
        <div class="form-row"><label>البريد</label><input name="email" type="email" required></div>
        <div class="form-row"><label>الهاتف</label><input name="phone"></div>
        <div class="form-row"><label>كلمة المرور</label><input name="password" type="password" value="Staff@123" required></div>
        <div class="form-row">
          <label>الدور</label>
          <select name="staffRoleId" required>${data.roles.map((role) => `<option value="${role.id}">${escapeHtml(role.name)}</option>`).join('')}</select>
        </div>
        <div class="form-row"><label>&nbsp;</label><button class="btn" type="submit">حفظ العون</button></div>
      </form>
    </section>
    <section class="table-card">
      <h3>حسابات الأعوان</h3>
      ${table(['الاسم', 'البريد', 'الدور', 'الصلاحيات', 'الحالة'], data.users.map((user) => {
        const role = data.roles.find((item) => item.id === user.staffRoleId);
        return [
          user.displayName,
          user.email,
          role?.name || labels[user.role] || user.role,
          (role?.permissions || user.permissions || []).join(', '),
          badge(user.active ? 'active' : 'archived')
        ];
      }))}
    </section>
  `;
}

function adminReports(data) {
  return `
    <section class="grid three-col">
      <div class="panel"><div class="panel-header"><h3>الاستهلاك حسب الغراسة</h3></div>${barList(data.consumptionByCrop, false)}</div>
      <div class="panel"><div class="panel-header"><h3>غير مستخلص حسب المنطقة</h3></div>${barList(data.unpaidByRegion, true)}</div>
      <div class="panel"><div class="panel-header"><h3>حالة طلبات الري</h3></div>${barList(data.requestsByStatus.map((item) => ({ ...item, label: labels[item.label] || item.label })), false)}</div>
    </section>
    <section class="table-card">
      <h3>أعلى استهلاك</h3>
      ${table(['الفلاح', 'المنطقة', 'الاستهلاك'], data.topConsumers.map((item) => [
        item.farmer.user?.displayName || '-',
        item.farmer.region,
        volume(item.consumption)
      ]))}
    </section>
  `;
}

function adminAudit(logs) {
  return `
    <section class="table-card">
      <h3>سجل العمليات الإدارية</h3>
      ${table(['التاريخ', 'المستخدم', 'العملية', 'الكيان', 'التفاصيل'], logs.map((log) => [
        formatDateTime(log.createdAt),
        log.actor?.displayName || '-',
        log.action,
        log.entityType,
        `<code>${escapeHtml(JSON.stringify(log.details))}</code>`
      ]))}
    </section>
  `;
}

function adminNotifications(farmers) {
  return `
    <section class="panel">
      <div class="panel-header"><h3>إرسال إشعار</h3></div>
      <form data-form="notification" class="form-grid">
        <div class="form-row">
          <label>المستلم</label>
          <select name="farmerId">
            <option value="">كل الفلاحين</option>
            ${farmers.map((farmer) => `<option value="${farmer.id}">${escapeHtml(farmer.user?.displayName || farmer.associationNumber)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>العنوان</label><input name="title" required></div>
        <div class="form-row full"><label>الرسالة</label><textarea name="message" required></textarea></div>
        <div class="form-row full"><button class="btn" type="submit">إرسال</button></div>
      </form>
    </section>
  `;
}

function requestTable(requests, adminMode) {
  return table(adminMode
    ? ['الفلاح', 'الحقل', 'التاريخ', 'الساعات', 'الكمية', 'الحالة', 'الدور', 'إجراءات']
    : ['الحقل', 'التاريخ', 'الساعات', 'الكمية', 'الحالة', 'الدور', 'ملاحظة'],
  requests.map((request) => {
    if (adminMode) {
      return [
        request.farmer?.user?.displayName || '-',
        request.field?.name || '-',
        formatDate(request.requestedDate),
        fmt(request.requestedHours),
        request.waterAmount ? volume(request.waterAmount) : '-',
        badge(request.status),
        request.scheduledAt ? formatDateTime(request.scheduledAt) : `<input class="inline-input" data-schedule="${request.id}" type="datetime-local">`,
        `<div class="actions">
          <button class="btn small green" data-action="approve-request" data-id="${request.id}">موافقة</button>
          <button class="btn small red" data-action="reject-request" data-id="${request.id}">رفض</button>
        </div>`
      ];
    }
    return [
      request.field?.name || '-',
      formatDate(request.requestedDate),
      fmt(request.requestedHours),
      request.waterAmount ? volume(request.waterAmount) : '-',
      badge(request.status),
      request.scheduledAt ? formatDateTime(request.scheduledAt) : '-',
      escapeHtml(request.staffNote || request.reason || '-')
    ];
  }));
}

function requestList(requests) {
  if (!requests.length) return emptyState('لا توجد طلبات.');
  return `<div class="activity-list">${requests.map((request) => `
    <div class="activity-item">
      <strong>${badge(request.status)} ${formatDate(request.requestedDate)}</strong>
      <span class="muted">${fmt(request.requestedHours)} ساعات - ${escapeHtml(request.reason || '')}</span>
    </div>
  `).join('')}</div>`;
}

function notificationList(notifications, withAction = false) {
  if (!notifications.length) return emptyState('لا توجد إشعارات.');
  return `<div class="notification-list">${notifications.map((notification) => `
    <div class="notification-item">
      <div class="panel-header" style="margin-bottom:6px">
        <strong>${escapeHtml(notification.title)}</strong>
        ${badge(notification.status)}
      </div>
      <p class="muted" style="margin:0 0 8px">${escapeHtml(notification.message)}</p>
      <div class="actions">
        <span class="muted">${formatDateTime(notification.createdAt)}</span>
        ${withAction && notification.status === 'unread' ? `<button class="btn small secondary" data-action="read-notification" data-id="${notification.id}">تعليم كمقروء</button>` : ''}
      </div>
    </div>
  `).join('')}</div>`;
}

function tableCard(title, headers, rows) {
  return `<section class="table-card"><h3>${escapeHtml(title)}</h3>${table(headers, rows)}</section>`;
}

function table(headers, rows) {
  if (!rows.length) return emptyState('لا توجد بيانات.');
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function statCard(label, value, note) {
  return `
    <div class="card">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value">${typeof value === 'number' ? fmt(value) : value}</div>
      <div class="stat-note">${escapeHtml(note || '')}</div>
    </div>
  `;
}

function barList(items, asMoney) {
  if (!items?.length) return emptyState('لا توجد بيانات.');
  const max = Math.max(...items.map((item) => Number(item.value || 0)), 1);
  return `<div class="bar-list">${items.map((item) => `
    <div class="bar-item">
      <span class="muted">${escapeHtml(item.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.max(4, (Number(item.value || 0) / max) * 100)}%"></span></span>
      <strong>${asMoney ? money(item.value) : fmt(item.value)}</strong>
    </div>
  `).join('')}</div>`;
}

function badge(status) {
  return `<span class="badge ${escapeAttr(status)}">${escapeHtml(labels[status] || status)}</span>`;
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function fmt(value) {
  return numberFormatter.format(Number(value || 0));
}

function money(value) {
  return currencyFormatter.format(Number(value || 0));
}

function volume(value) {
  return `<span class="metric" dir="ltr">${fmt(value)} م³</span>`;
}

function formatDate(value) {
  if (!value) return '-';
  return dateFormatter.format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return '-';
  return dateTimeFormatter.format(new Date(value));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return String(value ?? '').replace(/[^a-z0-9_-]/gi, '');
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function showToast(message) {
  state.toast = message;
  render();
  window.setTimeout(() => {
    state.toast = '';
    render();
  }, 2800);
}

function cachedFarmers() {
  if (!state.cache['admin:farmers']) {
    api('/api/admin/farmers').then((farmers) => {
      state.cache['admin:farmers'] = farmers;
      render();
    }).catch((error) => showToast(error.message));
  }
  return state.cache['admin:farmers'] || [];
}

function logout(announce = true) {
  localStorage.removeItem('smart-irrigation-token');
  state.token = '';
  state.user = null;
  state.cache = {};
  if (announce) showToast('تم تسجيل الخروج.');
  render();
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button[data-action], button[data-tab]');
  if (!target) return;
  const action = target.dataset.action;
  const tab = target.dataset.tab;
  try {
    if (tab) {
      if (state.user.role === 'farmer') state.farmerTab = tab;
      else state.adminTab = tab;
      render();
      return;
    }
    if (action === 'toggle-auth') {
      state.authMode = state.authMode === 'login' ? 'register' : 'login';
      render();
      return;
    }
    if (action === 'logout') {
      logout();
      return;
    }
    if (action === 'theme') {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('smart-irrigation-theme', state.theme);
      document.documentElement.dataset.theme = state.theme;
      render();
      return;
    }
    if (action === 'refresh') {
      delete state.cache[currentCacheKey()];
      await loadCurrentData(currentCacheKey(), true);
      return;
    }
    if (action === 'edit-farmer') {
      await editFarmer(target.dataset.id);
      return;
    }
    if (action === 'delete-farmer') {
      if (confirm('هل تريد حذف هذا الفلاح من الحسابات النشطة؟')) {
        await api(`/api/admin/farmers/${target.dataset.id}`, { method: 'DELETE' });
        invalidate('admin:');
        await loadCurrentData(currentCacheKey(), true);
        showToast('تم حذف الفلاح.');
      }
      return;
    }
    if (action === 'edit-field') {
      await editField(target.dataset.id);
      return;
    }
    if (action === 'approve-request' || action === 'reject-request') {
      const scheduledInput = document.querySelector(`[data-schedule="${CSS.escape(target.dataset.id)}"]`);
      await api(`/api/admin/requests/${target.dataset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: action === 'approve-request' ? 'approved' : 'rejected',
          scheduledAt: scheduledInput?.value ? new Date(scheduledInput.value).toISOString() : undefined,
          staffNote: action === 'reject-request' ? 'لم تتوفر حصة ماء في التاريخ المطلوب.' : 'تم إدراج الطلب في جدول الأدوار.'
        })
      });
      invalidate('admin:');
      await loadCurrentData(currentCacheKey(), true);
      showToast('تم تحديث الطلب.');
      return;
    }
    if (action === 'pay-bill') {
      await api(`/api/admin/bills/${target.dataset.id}/pay`, {
        method: 'PATCH',
        body: JSON.stringify({ method: 'cash' })
      });
      invalidate('admin:');
      await loadCurrentData(currentCacheKey(), true);
      showToast('تم تسجيل الدفع.');
      return;
    }
    if (action === 'read-notification') {
      await api(`/api/farmer/notifications/${target.dataset.id}/read`, { method: 'PATCH' });
      invalidate('farmer:');
      await loadCurrentData(currentCacheKey(), true);
      return;
    }
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  const formName = form.dataset.form;
  if (!formName) return;
  event.preventDefault();
  try {
    const body = formData(form);
    if (formName === 'login') {
      const payload = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(body) });
      state.token = payload.token;
      state.user = payload.user;
      localStorage.setItem('smart-irrigation-token', payload.token);
      state.cache = {};
      render();
      return;
    }
    if (formName === 'register') {
      const payload = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
      state.token = payload.token;
      state.user = payload.user;
      localStorage.setItem('smart-irrigation-token', payload.token);
      state.cache = {};
      render();
      return;
    }
    if (formName === 'farmer-request') {
      await api('/api/farmer/requests', { method: 'POST', body: JSON.stringify(body) });
      invalidate('farmer:');
      await loadCurrentData(currentCacheKey(), true);
      showToast('تم إرسال الطلب.');
      return;
    }
    if (formName === 'admin-farmer') {
      await api('/api/admin/farmers', { method: 'POST', body: JSON.stringify(body) });
      invalidate('admin:');
      await loadCurrentData(currentCacheKey(), true);
      showToast('تم حفظ الفلاح.');
      return;
    }
    if (formName === 'admin-field') {
      await api('/api/admin/fields', { method: 'POST', body: JSON.stringify(body) });
      invalidate('admin:');
      await loadCurrentData(currentCacheKey(), true);
      showToast('تم حفظ الأرض والعداد.');
      return;
    }
    if (formName === 'meter-reading') {
      await api('/api/admin/meter-readings', { method: 'POST', body: JSON.stringify(body) });
      invalidate('admin:');
      await loadCurrentData(currentCacheKey(), true);
      showToast('تم تسجيل القراءة وإصدار الفاتورة عند وجود استهلاك.');
      return;
    }
    if (formName === 'staff') {
      await api('/api/admin/staff', { method: 'POST', body: JSON.stringify(body) });
      invalidate('admin:');
      await loadCurrentData(currentCacheKey(), true);
      showToast('تم إنشاء حساب العون.');
      return;
    }
    if (formName === 'notification') {
      await api('/api/admin/notifications', { method: 'POST', body: JSON.stringify(body) });
      showToast('تم إرسال الإشعار.');
    }
  } catch (error) {
    showToast(error.message);
  }
});

async function editFarmer(farmerId) {
  const farmer = state.cache['admin:farmers']?.find((item) => item.id === farmerId);
  if (!farmer) return;
  const name = prompt('الاسم الكامل', farmer.user?.displayName || '');
  if (name === null) return;
  const phone = prompt('الهاتف', farmer.user?.phone || '');
  if (phone === null) return;
  const region = prompt('المنطقة', farmer.region || '');
  if (region === null) return;
  await api(`/api/admin/farmers/${farmerId}`, {
    method: 'PUT',
    body: JSON.stringify({ name, phone, region })
  });
  invalidate('admin:');
  await loadCurrentData(currentCacheKey(), true);
  showToast('تم تعديل بيانات الفلاح.');
}

async function editField(fieldId) {
  const field = state.cache['admin:fields']?.find((item) => item.id === fieldId);
  if (!field) return;
  const name = prompt('اسم الأرض', field.name || '');
  if (name === null) return;
  const areaHectares = prompt('المساحة', field.areaHectares || '');
  if (areaHectares === null) return;
  const cropType = prompt('الغراسة', field.cropType || '');
  if (cropType === null) return;
  const meterNumber = prompt('رقم العداد', field.meter?.meterNumber || '');
  if (meterNumber === null) return;
  await api(`/api/admin/fields/${fieldId}`, {
    method: 'PUT',
    body: JSON.stringify({ name, areaHectares, cropType, meterNumber })
  });
  invalidate('admin:');
  await loadCurrentData(currentCacheKey(), true);
  showToast('تم تعديل الأرض.');
}
