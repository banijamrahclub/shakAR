// 1. STATE MANAGEMENT
const defaultServices = [
    { name: "قص الشعر", price: 1.0 }, { name: "قص اللحية", price: 1.0 },
    { name: "شمع الوجه", price: 1.0 }, { name: "صباغة اللحية", price: 1.0 },
    { name: "مساج كتف وراس", price: 1.0 }, { name: "حلاقة الأطفال", price: 1.0 },
    { name: "تسريحة", price: 1.0 }, { name: "غسل الشعر", price: 0.5 },
    { name: "لصقة أنف", price: 0.5 }, { name: "الخيط", price: 0.5 },
    { name: "صباغة الشعر", price: 1.5 }, { name: "تنظيف الوجه", price: 2.0 },
    { name: "التمليس", price: 3.0 }, { name: "البروتين", price: 15.0 }
];

const defaultPackages = [
    { name: "بكج الشكر المميز", price: 5.0, duration: 60, description: "قص شعر ولحية + تنظيف وجه + سكراب" },
    { name: "بكج التوفير", price: 3.0, duration: 40, description: "قص شعر ولحية + غسل شعر + تسريحة" }
];

let state = {
    isAuthorized: false,
    currentRole: 'employee',
    currentPage: 'pos',
    pendingTarget: null,
    cart: [],
    history: [],
    expenses: [],
    fixedExpenses: [],
    services: defaultServices,
    packages: defaultPackages,
    barbers: [
        { id: 'owner', name: 'الحلاق الشكر', role: 'owner' },
        { id: 'employee', name: 'الموظف 1', role: 'employee' }
    ],
    appointments: [],
    settings: { openTime: '10:00', closeTime: '22:00' }, // إعدادات افتراضية
    managedDate: new Date().toISOString().split('T')[0], // التاريخ الذي يتم إدارته حالياً (الافتراضي هو اليوم)
    currentPosType: 'service', // النوع المختار في صفحة البيع (خدمات أو بكجات)
    manualSelectedServices: [], // الخدمات المختارة في الحجز اليدوي
    appFilter: 'all', // فلتر الحجوزات (الكل، المؤكدة، المعلقة)
    appSearch: '', // نص البحث في الحجوزات
    selectedChartMonth: new Date().getMonth(), // الشهر المختار في الرسومات
    selectedChartYear: new Date().getFullYear(), // السنة المختارة في الرسومات
    editSelectedServices: [] // الخدمات المختارة في نافذة التعديل
};

const PASSWORD = "1";
let myChart = null;

// API URL (Auto detect if local or server)
const API_BASE = window.location.origin;

// 2. INITIALIZATION & DATA SYNC
document.addEventListener('DOMContentLoaded', async () => {
    // التحقق من الدخول الكلي للنظام
    if (sessionStorage.getItem('sh_site_access') === 'granted') {
        document.getElementById('site-auth-overlay').style.display = 'none';
        document.querySelector('.app-layout').style.display = 'flex';
    }

    initHistorySelectors();
    await loadData(); // تحميل البيانات من السيرفر
    renderServices();
    updateUI();
    if (document.getElementById('search-date')) document.getElementById('search-date').valueAsDate = new Date();

    // تحديث تلقائي كل 15 ثانية لجلب المعلومات الجديدة (تمت الزيادة لضمان راحة المستخدم عند التعديل)
    setInterval(async () => {
        await loadData();
        if (state.currentPage === 'appointments') renderAppointmentsTable();
        updateUI(); // هذا يضمن تحديث العدادات وكل شيء تلقائياً
    }, 15000);

    // إضافة مستمع لزر Enter في خانة الباسورد
    document.getElementById('site-pass').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verifySiteAccess();
    });
});

let isSaving = false;
let savePending = false;

async function save() {
    updateSyncStatus('saving');
    // 1. التحديث المحلي فوري (لحماية البيانات لو أغلق المتصفح)
    localStorage.setItem('sh_history', JSON.stringify(state.history));
    localStorage.setItem('sh_expenses', JSON.stringify(state.expenses));
    localStorage.setItem('sh_fixed', JSON.stringify(state.fixedExpenses));
    localStorage.setItem('sh_services', JSON.stringify(state.services));
    localStorage.setItem('sh_packages', JSON.stringify(state.packages));
    localStorage.setItem('sh_barbers', JSON.stringify(state.barbers));
    localStorage.setItem('sh_settings', JSON.stringify(state.settings));

    if (isSaving) {
        savePending = true;
        return;
    }

    isSaving = true;
    try {
        const response = await fetch(`${API_BASE}/api/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state)
        });
        const result = await response.json();

        if (result.success && result.cloudSuccess) {
            updateSyncStatus('synced', result.lastCloudSync);
        } else if (result.success && !result.cloudSuccess) {
            updateSyncStatus('error'); // فشل قوقل شيت لكن الحفظ المحلي تم
            console.error("Cloud Save Failed:", result.cloudError);
        } else {
            throw new Error("Save error");
        }
    } catch (err) {
        console.error("Save Connection Error:", err);
        updateSyncStatus('error');
    } finally {
        isSaving = false;
        if (savePending) {
            savePending = false;
            save();
        }
    }
}

function updateSyncStatus(status, timestamp = null) {
    const dot = document.getElementById('sync-dot');
    const text = document.getElementById('sync-text');
    const timeEl = document.getElementById('sync-time');
    
    // التحديث في الـ Popup العائم (Indicator) ليبقى متوافقاً مع الكود القديم
    let el = document.getElementById('sync-indicator');
    if (!el) {
        el = document.createElement('div');
        el.id = 'sync-indicator';
        el.style.cssText = "position:fixed; top:10px; left:10px; padding:8px 15px; border-radius:20px; font-size:13px; font-weight:bold; z-index:10000; transition:0.3s; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display:flex; align-items:center; gap:8px;";
        document.body.appendChild(el);
    }

    if (status === 'saving') {
        el.innerHTML = '<span class="spinner"></span> ⏳ جاري الحفظ...';
        el.style.background = '#f59e0b'; el.style.color = 'black'; el.style.opacity = '1';
        if(dot) { dot.style.background = '#f59e0b'; text.innerText = 'جاري الحفظ...'; }
    } else if (status === 'synced') {
        el.innerHTML = '✅ تم الحفظ سحابياً';
        el.style.background = 'var(--success)'; el.style.color = 'white';
        setTimeout(() => el.style.opacity = '0', 3000);
        if(dot) { 
            dot.style.background = '#22c55e'; // green
            text.innerText = 'متصل وسحابي';
            if (timestamp) {
                const time = new Date(timestamp).toLocaleTimeString('ar-BH', { hour: '2-digit', minute: '2-digit' });
                timeEl.innerText = 'آخر حفظ: ' + time;
            }
        }
    } else if (status === 'error') {
        el.innerHTML = '⚠️ خطأ: قوقل شيت غير متصل';
        el.style.background = 'var(--danger)'; el.style.color = 'white'; el.style.opacity = '1';
        if(dot) { dot.style.background = '#ef4444'; text.innerText = 'خطأ في التزامن'; }
    }
}

async function loadData() {
    // إذا كنت في منتصف عملية حفظ، لا تسحب بيانات قديمة
    if (isSaving || savePending) return;

    try {
        const res = await fetch(`${API_BASE}/api/data`);
        const cloudData = await res.json();

        // فحص مرة أخرى بعد انتهاء الطلب للتأكد أن المستخدم لم يضغط "حفظ" في هذه اللحظة
        if (isSaving || savePending) {
            console.log("Discarding loadData results to protect new changes.");
            return;
        }

        state.history = cloudData.history || [];
        state.expenses = cloudData.expenses || [];
        state.fixedExpenses = cloudData.fixedExpenses || [];
        if (cloudData.services) state.services = cloudData.services;
        if (cloudData.packages) state.packages = cloudData.packages;
        state.barbers = cloudData.barbers || [{ id: 'owner', name: 'الحلاق الشكر', role: 'owner' }, { id: 'employee', name: 'الموظف 1', role: 'employee' }];
        state.appointments = cloudData.appointments || [];
        state.settings = cloudData.settings || { openTime: '10:00', closeTime: '22:00' };

        if (cloudData.lastCloudSync) {
            updateSyncStatus('synced', cloudData.lastCloudSync);
        }

        saveLocalBackup();
        console.log("Sync down complete.");
    } catch (e) {
        console.log("Offline mode: reading from local storage");
        restoreFromLocal();
    }
}

function saveLocalBackup() {
    localStorage.setItem('sh_history', JSON.stringify(state.history));
    localStorage.setItem('sh_expenses', JSON.stringify(state.expenses));
    localStorage.setItem('sh_fixed', JSON.stringify(state.fixedExpenses));
    localStorage.setItem('sh_services', JSON.stringify(state.services));
    localStorage.setItem('sh_packages', JSON.stringify(state.packages));
    localStorage.setItem('sh_barbers', JSON.stringify(state.barbers));
    localStorage.setItem('sh_settings', JSON.stringify(state.settings));
}

async function refreshFromCloud() {
    if (isSaving || savePending) return alert("يرجى الانتظار حتى اكتمال الحفظ الحالي");

    updateSyncStatus('saving');
    try {
        const res = await fetch(`${API_BASE}/api/sync-down`);
        const result = await res.json();
        if (result.success) {
            // دمج ذكي بدلاً من الاستبدال الكامل
            if (result.data.history) {
                const existingIds = new Set(state.history.map(h => h.id));
                const newItems = result.data.history.filter(h => !existingIds.has(h.id));
                state.history = [...state.history, ...newItems].sort((a, b) => b.id - a.id);
            }
            if (result.data.expenses) {
                const existingIds = new Set(state.expenses.map(e => e.id));
                const newItems = result.data.expenses.filter(e => !existingIds.has(e.id));
                state.expenses = [...state.expenses, ...newItems].sort((a, b) => b.id - a.id);
            }
            if (result.data.fixedExpenses) {
                const existingIds = new Set(state.fixedExpenses.map(f => f.id));
                const newItems = result.data.fixedExpenses.filter(f => !existingIds.has(f.id));
                state.fixedExpenses = [...state.fixedExpenses, ...newItems];
            }
            if (result.data.services) state.services = result.data.services;
            if (result.data.packages) state.packages = result.data.packages;
            if (result.data.appointments) state.appointments = result.data.appointments;

            saveLocalBackup();
            updateUI();
            updateSyncStatus('synced');
            showToast("✅ تم جلب أحدث البيانات من قوقل شيت");
        } else {
            throw new Error("Sync failed");
        }
    } catch (e) {
        console.error("Manual Sync Error:", e);
        updateSyncStatus('error');
        alert("فشل جلب البيانات من قوقل شيت، تأكد من اتصال الإنترنت");
    }
}

function restoreFromLocal() {
    state.history = JSON.parse(localStorage.getItem('sh_history')) || [];
    state.expenses = JSON.parse(localStorage.getItem('sh_expenses')) || [];
    state.fixedExpenses = JSON.parse(localStorage.getItem('sh_fixed')) || [];
    state.services = JSON.parse(localStorage.getItem('sh_services')) || defaultServices;
    state.packages = JSON.parse(localStorage.getItem('sh_packages')) || defaultPackages;
    state.barbers = JSON.parse(localStorage.getItem('sh_barbers')) || [{ id: 'owner', name: 'الحلاق الشكر', role: 'owner' }, { id: 'employee', name: 'الموظف 1', role: 'employee' }];
    state.settings = JSON.parse(localStorage.getItem('sh_settings')) || { openTime: '10:00', closeTime: '22:00' };
    state.appointments = [];
}

function toggleActionButtons(disabled) {
    // لم نعد نحتاج لتعطيل الأزرار بفضل نظام الطابور الجديد
}

// --- بقية وظائف النظام ---

function initHistorySelectors() {
    const yearSelect = document.getElementById('history-year');
    const monthSelect = document.getElementById('history-month');
    if (!yearSelect || !monthSelect) return;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    yearSelect.innerHTML = "";
    for (let y = currentYear + 2; y >= 2024; y--) {
        const opt = document.createElement('option');
        opt.value = y; opt.innerText = y;
        yearSelect.appendChild(opt);
    }
    yearSelect.value = currentYear;
    monthSelect.value = currentMonth;
}

function handleNav(target) {
    const barber = state.barbers.find(b => b.id === target);

    // السماح لكل موظف يحمل رتبة 'employee' بالدخول لصفحة المبيعات (POS) مباشرة وبدون صلاحيات أدمن
    if (barber && barber.role === 'employee') {
        state.isAuthorized = false; // نلغي صلاحيات الأدمن للدخول كحلاق عادي
        state.currentRole = barber.id;
        state.currentPage = 'pos';
        updateUI();
        return;
    }

    if (state.isAuthorized) {
        processNav(target);
    } else {
        state.pendingTarget = target;
        document.getElementById('auth-overlay').style.display = 'flex';
        document.getElementById('admin-pass').focus();
    }
}

function verifyAdmin() {
    const val = document.getElementById('admin-pass').value;
    if (val === PASSWORD) {
        state.isAuthorized = true;
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('admin-pass').value = '';
        processNav(state.pendingTarget);
    } else { alert("الباسورد خطأ"); }
}

function verifySiteAccess() {
    const pass = document.getElementById('site-pass').value;
    if (pass === "12341234") {
        sessionStorage.setItem('sh_site_access', 'granted');
        document.getElementById('site-auth-overlay').style.display = 'none';
        document.querySelector('.app-layout').style.display = 'flex';
    } else {
        alert("رمز الدخول غير صحيح");
    }
}

function processNav(target) {
    const barber = state.barbers.find(b => b.id === target);
    if (barber) {
        state.currentRole = barber.id;
        state.currentPage = 'pos';
    } else {
        state.currentPage = target;
    }
    updateUI();
}

function closeAuth() { document.getElementById('auth-overlay').style.display = 'none'; }

function updateUI() {
    // منع التحديث التلقائي إذا كان المستخدم يكتب حالياً في أي خانة إدخال
    // لضمان عدم ضياع التعديلات أو خروج المؤشر من الخانة
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
        return;
    }

    renderBarberLinks();

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        const onclick = link.getAttribute('onclick');
        if (onclick && onclick.includes(`handleNav('${state.currentPage}')`)) {
            link.classList.add('active');
        }
        // خاص بنقاط البيع للموظفين
        if (state.currentPage === 'pos') {
            if (onclick && onclick.includes(`handleNav('${state.currentRole}')`)) {
                link.classList.add('active');
            }
        }
    });

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById(`page-${state.currentPage}`);
    if (targetPage) targetPage.classList.add('active');

    const currentBarber = state.barbers.find(b => b.id === state.currentRole);
    document.getElementById('role-status').innerText = `المسؤول: ${currentBarber ? currentBarber.name : 'موظف'}`;

    const ownerOnlyElements = document.querySelectorAll('.owner-only');
    ownerOnlyElements.forEach(el => el.style.display = (state.isAuthorized ? 'block' : 'none'));

    if (state.currentPage === 'emergency-exp') renderExpensesTable();
    if (state.currentPage === 'analytics') initProfitChart();
    if (state.currentPage === 'fixed-exp') renderFixedTable();
    if (state.currentPage === 'history') renderHistoryTable();
    if (state.currentPage === 'top-services') renderTopServices();
    if (state.currentPage === 'manage-barbers') renderManageBarbers();
    if (state.currentPage === 'manage-services') renderManageServices();
    if (state.currentPage === 'manage-packages') renderManagePackages();
    if (state.currentPage === 'appointments') renderAppointmentsTable();
    if (state.currentPage === 'settings') renderSettings();

    updateGlobalStats();

    // تحديث عرض التاريخ الحالي والملخص في صفحة البيع
    const dateEl = document.getElementById('current-system-date');
    const resetBtn = document.getElementById('reset-date-btn');
    if (dateEl) {
        dateEl.innerText = state.managedDate;
        const today = new Date().toISOString().split('T')[0];
        if (resetBtn) resetBtn.style.display = state.managedDate === today ? 'none' : 'block';
    }

    // تحديث ملخص الحلاق في صفحة البيع (POS)
    if (currentBarber && document.getElementById('pos-barber-name')) {
        document.getElementById('pos-barber-name').innerText = currentBarber.name;
        const count = state.history.filter(h => h.date === state.managedDate && h.role === state.currentRole).length;
        document.getElementById('pos-barber-count').innerText = count;
    }

    // إذا كنا في صفحة التاريخ والبحث مفتوح، نحدث النتائج
    const searchRes = document.getElementById('search-result');
    if (state.currentPage === 'history' && searchRes && searchRes.style.display === 'block') {
        performSearch();
    }
}

function renderBarberLinks() {
    const container = document.getElementById('dynamic-barber-links');
    if (!container) return;

    // حساب عمليات اليوم لكل حلاق (بناءً على التاريخ المدار حالياً)
    const dailySales = state.history.filter(h => h.date === state.managedDate);

    container.innerHTML = state.barbers.map(b => {
        const count = dailySales.filter(h => h.role === b.id).length;
        return `
        <div class="nav-link ${state.currentPage === 'pos' && state.currentRole === b.id ? 'active' : ''}" onclick="handleNav('${b.id}')">
            <span style="display: flex; align-items: center; gap: 8px; width: 100%;">
                <span>${b.role === 'owner' ? '✂️' : '🏠'} ${b.name}</span>
                <span style="margin-right: auto; background: var(--primary); color: black; padding: 2px 8px; border-radius: 8px; font-size: 0.75rem; font-weight: 800;">${count}</span>
            </span>
        </div>
    `}).join('');
}

function resetSystemDate() {
    state.managedDate = new Date().toISOString().split('T')[0];
    updateUI();
    alert("تمت العودة لتاريخ اليوم الأصلي");
}

function setManagedDate(date) {
    state.managedDate = date;
    updateUI();
    alert("تم تغيير تاريخ النظام إلى: " + date + "\nيمكنك الآن تسجيل المبيعات والمصاريف لهذا التاريخ.");
}

async function renderAppointmentsTable() {
    const body = document.querySelector('#appointments-table tbody');
    if (!body) return;

    if (body.innerHTML === '') {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center;">جاري تحميل الحجوزات...</td></tr>';
    }

    try {
        const res = await fetch(`${API_BASE}/api/data`);
        const data = await res.json();
        state.appointments = data.appointments || [];
        
        // التأكد أن كل الحجوزات لها ID لتجنب مشاكل التعديل
        state.appointments.forEach((a, idx) => {
            if (!a.id) a.id = 'app_' + Date.now() + '_' + idx;
        });

        // 1. الفلترة حسب الحالة
        let filtered = state.appointments;
        if (state.appFilter !== 'all') {
            filtered = filtered.filter(a => a.status === state.appFilter);
        }

        // 2. البحث بالاسم أو الرقم
        if (state.appSearch) {
            const query = state.appSearch.toLowerCase();
            filtered = filtered.filter(a => 
                (a.name && a.name.toLowerCase().includes(query)) || 
                (a.phone && a.phone.includes(query))
            );
        }

        // 3. الترتيب
        filtered.sort((a, b) => {
            if (a.status === 'pending' && b.status !== 'pending') return -1;
            if (a.status !== 'pending' && b.status === 'pending') return 1;
            return new Date(a.startTime) - new Date(b.startTime);
        });

        // 4. الرندرة
        body.innerHTML = filtered.map((app) => {
            const isPending = app.status === 'pending';
            const startTimeFormatted = new Date(app.startTime).toLocaleString('ar-BH');

            const depositMsg = `تحية طيبة من "حلاق الشكر"،\nمرحباً ${app.name}، لقد استلمنا حجزك المبدئي:\n⏰ الموعد: ${startTimeFormatted}\n✂️ الخدمة: ${app.service}\n\nيرجى إرسال صورة إيصال دفع العربون (1.000 دينار) لشراء وقتك وتأكيد حجزك نهائياً عبر بينفت أو آيبان.\nشكراً لك.`;
            const confirmMsg = `تم التأكيد ✅\nعزيزي ${app.name}، تم استلام العربون وتأكيد موعدك بنجاح.\n⏰ ننتظرك في: ${startTimeFormatted}\n\n⚠️ ملاحظة 1: لن يتم ارجاع العربون اذا تم الغاء الحجز قبل اقل من 24 ساعة منه.\n⚠️ ملاحظة 2: سيتم الغاء الموعد اذا تأخر الزبون 15 دقيقة عن الموعد.\n⚠️ ملاحظة 3: في حال عدم حضور الحلاق سيتم إخبارك ويمكنك التوجه للموظف الأجنبي، أو تأجيل الحجز إلى يوم آخر، أو إلغاء الحجز واسترداد الأموال.\n\nشكراً لاختيارك حلاق الشكر.`;
            const reminderMsg = `تذكير بموعدك لدى حلاق الشكر ⏰\nعزيزي ${app.name}، نود تذكيرك بموعدك المحجوز لدينا:\n📅 الموعد: ${startTimeFormatted}\n✂️ الخدمة: ${app.service}\n\nنحن بانتظارك في الوقت المحدد.\nشكراً لاختيارك حلاق الشكر.`;

            return `
            <tr style="${isPending ? 'border-right: 4px solid orange;' : 'border-right: 4px solid var(--success);'}">
                <td style="color:var(--primary); font-weight:700;">
                    ${startTimeFormatted}
                    <div style="font-size:0.7rem; color:${isPending ? 'orange' : 'var(--success)'}">${isPending ? '⏳ بانتظار العربون' : '✅ موعد مؤكد'}</div>
                </td>
                <td style="font-weight:700;">${app.name}</td>
                <td>${app.phone}</td>
                <td style="font-size:0.85rem;">${app.service}</td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 5px;">
                        ${isPending ? `
                            <button class="btn-action" style="background:orange; color:black;" onclick="verifyBooking('${app.id}', '${app.name}', '${app.startTime}')">💰 تأكيد العربون</button>
                            <button class="btn-action" style="background:#25d366; color:white;" onclick="sendWhatsAppMessage('${app.phone}', '${encodeURIComponent(depositMsg)}')">💬 اطلب العربون</button>
                        ` : `
                            <button class="btn-action" style="background:var(--success); color:black;" onclick="completeAppointment('${app.id}', '${app.name}', '${app.startTime}')">✅ انتهى</button>
                            <button class="btn-action" style="background:#075e54; color:white;" onclick="sendWhatsAppMessage('${app.phone}', '${encodeURIComponent(reminderMsg)}')">🔔 أرسل تذكير</button>
                            <button class="btn-action" style="background:#25d366; color:white;" onclick="sendWhatsAppMessage('${app.phone}', '${encodeURIComponent(confirmMsg)}')">💬 سند التأكيد</button>
                        `}
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                            <button class="btn-action" style="background:var(--primary); color:black;" onclick="openEditModal('${app.id}')">✏️ تعديل</button>
                            <button class="btn-action" style="background:var(--danger); color:white;" onclick="deleteAppointment('${app.id}')">🗑️ إلغاء</button>
                        </div>
                    </div>
                </td>
            </tr>
            `;
        }).join('') || '<tr><td colspan="5">لا توجد حجوزات تطابق البحث حالياً</td></tr>';

        // تحديث حالة الأزرار (Active)
        document.querySelectorAll('.finance-sub-nav .sub-link').forEach(link => {
            link.classList.remove('active');
            if (link.id === `app-filter-${state.appFilter}`) link.classList.add('active');
        });

    } catch (e) {
        body.innerHTML = '<tr><td colspan="5">فشل جلب الحجوزات</td></tr>';
    }
}

function setAppFilter(filter) {
    state.appFilter = filter;
    renderAppointmentsTable();
}

function handleAppSearch() {
    state.appSearch = document.getElementById('app-search-input').value;
    renderAppointmentsTable();
}

function sendWhatsAppMessage(phone, encodedMsg) {
    // تنظيف رقم الهاتف إذا كان يبدأ بـ 0 أو بدون مفتاح الدولة
    let cleanPhone = phone.replace(/\s+/g, '').replace('+', '');
    if (!cleanPhone.startsWith('973')) cleanPhone = '973' + cleanPhone;
    window.open(`https://wa.me/${cleanPhone}?text=${encodedMsg}`);
}

function toggleManualAppForm() {
    const form = document.getElementById('manual-app-form');
    const isOpening = form.style.display === 'none';
    form.style.display = isOpening ? 'block' : 'none';
    
    if (isOpening) {
        state.manualSelectedServices = [];
        renderManualAppServices();
        updateManualSummary();
    }
}

function renderManualAppServices() {
    const container = document.getElementById('m-services-list');
    if (!container) return;

    let html = '';
    // الخدمات
    state.services.forEach(s => {
        const isSelected = state.manualSelectedServices.some(ms => ms.name === s.name);
        html += `
            <div onclick="toggleManualService('${s.name}', ${s.price}, ${s.duration || 20})" 
                 style="display: flex; align-items: center; gap: 10px; padding: 10px; background: ${isSelected ? 'rgba(148, 163, 184, 0.2)' : 'var(--bg-card)'}; border-radius: 8px; cursor: pointer; border: 1px solid ${isSelected ? 'var(--primary)' : 'transparent'}; transition: 0.2s;">
                <div style="width: 16px; height: 16px; border: 2px solid var(--primary); border-radius: 4px; display: flex; align-items: center; justify-content: center;">
                    ${isSelected ? '<div style="width: 8px; height: 8px; background: var(--primary); border-radius: 1px;"></div>' : ''}
                </div>
                <div style="flex: 1; font-size: 0.85rem;">${s.name}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${s.price.toFixed(3)}</div>
            </div>
        `;
    });
    // البكجات
    state.packages.forEach(p => {
        const isSelected = state.manualSelectedServices.some(ms => ms.name === p.name);
        html += `
            <div onclick="toggleManualService('${p.name}', ${p.price}, ${p.duration || 45})" 
                 style="display: flex; align-items: center; gap: 10px; padding: 10px; background: ${isSelected ? 'rgba(148, 163, 184, 0.2)' : 'var(--bg-card)'}; border-radius: 8px; cursor: pointer; border: 1px solid ${isSelected ? 'var(--primary)' : 'transparent'}; transition: 0.2s;">
                <div style="width: 16px; height: 16px; border: 2px solid var(--primary); border-radius: 4px; display: flex; align-items: center; justify-content: center;">
                    ${isSelected ? '<div style="width: 8px; height: 8px; background: var(--primary); border-radius: 1px;"></div>' : ''}
                </div>
                <div style="flex: 1; font-size: 0.85rem;">📦 ${p.name}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${p.price.toFixed(3)}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function toggleManualService(name, price, duration) {
    const index = state.manualSelectedServices.findIndex(s => s.name === name);
    if (index > -1) {
        state.manualSelectedServices.splice(index, 1);
    } else {
        state.manualSelectedServices.push({ name, price, duration });
    }
    renderManualAppServices();
    updateManualSummary();
}

function updateManualSummary() {
    const summary = document.getElementById('m-app-summary');
    if (state.manualSelectedServices.length === 0) {
        summary.style.display = 'none';
        return;
    }
    summary.style.display = 'flex';
    const names = state.manualSelectedServices.map(s => s.name).join(' + ');
    const totalPrice = state.manualSelectedServices.reduce((sum, s) => sum + s.price, 0);
    const totalDuration = state.manualSelectedServices.reduce((sum, s) => sum + s.duration, 0);
    
    document.getElementById('m-selected-names').innerText = names;
    document.getElementById('m-total-price').innerText = totalPrice.toFixed(3);
    document.getElementById('m-total-duration').innerText = totalDuration;
}

async function saveManualAppointment() {
    const name = document.getElementById('m-app-name').value;
    const phone = document.getElementById('m-app-phone').value;
    const start = document.getElementById('m-app-start').value;

    if (!name || !phone || !start) return alert("يرجى ملئ الاسم والهاتف والتوقيت");
    if (state.manualSelectedServices.length === 0) return alert("يرجى اختيار خدمة واحدة على الأقل");

    const startTime = new Date(start).toISOString();
    const totalDuration = state.manualSelectedServices.reduce((sum, s) => sum + s.duration, 0);
    const totalPrice = state.manualSelectedServices.reduce((sum, s) => sum + s.price, 0);
    const serviceNames = state.manualSelectedServices.map(s => s.name).join(' + ');
    const endTime = new Date(new Date(startTime).getTime() + totalDuration * 60000).toISOString();
    const syncCalendar = document.getElementById('m-sync-google').checked;

    try {
        const res = await fetch(`${API_BASE}/api/calendar/book`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, service: serviceNames, price: totalPrice, startTime, endTime, syncCalendar, status: 'confirmed' })
        });
        const result = await res.json();
        if (result.success) {
            alert("تمت إضافة الحجز بنجاح!");
            toggleManualAppForm();
            renderAppointmentsTable();
            // مسح الخانات
            document.getElementById('m-app-name').value = '';
            document.getElementById('m-app-phone').value = '';
            document.getElementById('m-app-start').value = '';
            document.getElementById('m-sync-google').checked = true;
        } else {
            alert(result.error || "فشل إضافة الحجز");
        }
    } catch (e) { alert("خطأ في الاتصال"); }
}

async function verifyBooking(id, name, startTime) {
    let app = state.appointments.find(a => a.id === id);
    if (!app && name && startTime) {
        app = state.appointments.find(a => a.name === name && a.startTime === startTime);
    }
    
    if (!app) return alert("لم يتم العثور على بيانات الحجز. يرجى تحديث الصفحة.");

    if (confirm(`هل أنت متأكد من استلام العربون (1.000 د.ب) من الزبون ${app.name}؟`)) {
        const syncCalendar = confirm("هل تريد مزامنة هذا الموعد مع تقويم قوقل أيضاً؟");
        try {
            const res = await fetch(`${API_BASE}/api/calendar/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: app.id, name: app.name, startTime: app.startTime, syncCalendar })
            });
            const result = await res.json();
            if (result.success) {
                // تحديث الحالة محلياً فوراً لمنع التضارب قبل المزامنة القادمة
                app.status = 'confirmed';
                
                alert("تم تأكيد الحجز بنجاح!");

                // إرسال رسالة التأكيد عبر الواتساب فوراً
                const formattedTime = new Date(app.startTime).toLocaleString('ar-BH');
                const confirmMsg = `تم التأكيد ✅\n\nعزيزي ${app.name}، تم استلام العربون وتأكيد موعدك بنجاح.\n⏰ ننتظرك في: ${formattedTime}\n\n⚠️ ملاحظة 1: لن يتم ارجاع العربون اذا تم الغاء الحجز قبل اقل من 24 ساعة منه.\n⚠️ ملاحظة 2: سيتم الغاء الموعد اذا تأخر الزبون 15 دقيقة عن الموعد.\n⚠️ ملاحظة 3: في حال عدم حضور الحلاق سيتم إخبارك ويمكنك التوجه للموظف الأجنبي، أو تأجيل الحجز إلى يوم آخر، أو إلغاء الحجز واسترداد الأموال.\n\nشكراً لاختيارك حلاق الشكر.`;
                sendWhatsAppMessage(app.phone, encodeURIComponent(confirmMsg));

                renderAppointmentsTable();
            } else {
                alert("فشل التأكيد: " + (result.error || "خطأ غير معروف"));
            }
        } catch (e) { 
            console.error(e);
            alert("حدث خطأ أثناء الاتصال بالسيرفر."); 
        }
    }
}

async function completeAppointment(id, name, startTime) {
    let app = state.appointments.find(a => a.id === id);
    if (!app && name && startTime) {
        app = state.appointments.find(a => a.name === name && a.startTime === startTime);
    }
    
    if (!app) return alert("لم يتم العثور على الحجز.");
    let finalPrice = app.price || 0;

    if (!finalPrice || finalPrice === 0) {
        const inputPrice = prompt(`تنبيه: حجز ${app.name} لا يحتوي على سعر. يرجى إدخل المبلغ (د.ب):`, "1.000");
        if (inputPrice === null) return;
        finalPrice = parseFloat(inputPrice) || 0;
    }

    // سؤال عن طريقة الدفع
    const pMethod = confirm(`هل دفع ${app.name} بقية المبلغ عن طريق "بينفت"؟\n(موافق = بينفت ، إلغاء = كاش)`) ? 'benefit' : 'cash';

    if (confirm(`هل انتهيت من حلاقة ${app.name}؟ (سيتم تسجيل ${finalPrice.toFixed(3)} د.ب في الأرباح وحذفه من قوقل)`)) {
        // 1. إرسال طلب حذف من قوقل كلندر
        try {
            await fetch(`${API_BASE}/api/calendar/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: app.id, name: app.name, startTime: app.startTime })
            });
        } catch (e) { console.error("Sync error:", e); }

        // 2. تسجيل العملية في السجل التاريخي
        const sale = {
            id: Date.now(),
            time: new Date().toLocaleTimeString('ar-BH'),
            date: state.managedDate, // استخدام التاريخ المختار
            role: 'owner', // يتسجل دائماً باسم "الحلاق الشكر" بناءً على طلبك
            total: finalPrice,
            items: app.service,
            paymentMethod: pMethod
        };
        state.history.unshift(sale);

        // 3. حذف الحجز محلياً وحفظ السجل
        state.appointments = state.appointments.filter(a => {
            // إذا كان هناك ID، نعتمد عليه كلياً لأنه الأدق
            if (id && id !== 'undefined') return a.id !== id;
            // إذا لم يتوفر ID، نستخدم الاسم والوقت كخيار بديل (مع التضحية باحتمالية وجود مكررات بنفس الاسم والوقت)
            return !(a.name === app.name && a.startTime === app.startTime);
        });
        await save();
        updateUI();
        alert("تم تسجيل الموعد بنجاح (" + (pMethod === 'cash' ? 'كاش' : 'بينفت') + ")");

        // 4. إرسال رسالة شكر وطلب تقييم عبر الواتساب
        const thanksMsg = `شكر لزيارتك "حلاق الشكر" ✂️\n\nعزيزي ${app.name}، سعدنا جداً بخدمتكم اليوم.\n✂️ الخدمة: ${app.service}\n💰 المبلغ: ${finalPrice.toFixed(3)} د.ب\n\nرأيكم يهمنا جداً ويساعدنا على التطوير المستمر ✨\nنرجو منكم قضاء ثوانٍ لتقييم تجربتكم عبر الرابط التالي:\nhttps://maps.app.goo.gl/7sZNJkuBXg6YeXRAA\n\nشكراً لاختيارك حلاق الشكر، ننتظر رؤيتكم مجدداً قريباً! 👋`;
        sendWhatsAppMessage(app.phone, encodeURIComponent(thanksMsg));
    }
}

async function deleteAppointment(id) {
    const app = state.appointments.find(a => a.id === id);
    if (!app) return;
    if (confirm("هل تريد إلغاء هذا الحجز نهائياً من السيستم وقوقل؟")) {
        try {
            await fetch(`${API_BASE}/api/calendar/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: app.id, name: app.name, startTime: app.startTime })
            });
        } catch (e) { console.error("Sync error:", e); }

        state.appointments = state.appointments.filter(a => {
            if (id && id !== 'undefined') return a.id !== id;
            return !(a.name === app.name && a.startTime === app.startTime);
        });
        await save();
        renderAppointmentsTable();
    }
}

function switchPosType(type) {
    state.currentPosType = type;
    document.getElementById('pos-tab-services').classList.toggle('active', type === 'service');
    document.getElementById('pos-tab-packages').classList.toggle('active', type === 'package');
    renderServices();
}

function renderServices() {
    const grid = document.getElementById('services-grid');
    if (!grid) return;

    let html = '';

    if (state.currentPosType === 'service') {
        // الخدمات العادية
        if (state.services.length > 0) {
            html += state.services.map((s, i) => `
                <div class="service-item" onclick="addToCart('service', ${i})">
                    <div style="font-weight:700; font-size:1rem; margin-bottom:5px;">${s.name}</div>
                    <div style="color:var(--primary); font-weight:800;">${s.price.toFixed(3)}</div>
                </div>
            `).join('');
        } else {
            html = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted);">لا توجد خدمات مضافة</div>';
        }
    } else {
        // البكجات
        if (state.packages.length > 0) {
            html += state.packages.map((p, i) => `
                <div class="service-item" onclick="addToCart('package', ${i})" style="border: 1px solid gold; background: rgba(255, 215, 0, 0.05);">
                    <div style="font-weight:700; font-size:1rem; margin-bottom:2px;">${p.name}</div>
                    <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:5px;">${p.description || ''}</div>
                    <div style="color:gold; font-weight:800;">${p.price.toFixed(3)}</div>
                </div>
            `).join('');
        } else {
            html = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted);">لا توجد بكجات مضافة</div>';
        }
    }

    grid.innerHTML = html;
}

function addToCart(type, i) {
    const item = type === 'service' ? state.services[i] : state.packages[i];
    state.cart.push(item);
    renderCart();
}

function removeFromCart(i) {
    state.cart.splice(i, 1);
    renderCart();
}

function renderCart() {
    const box = document.getElementById('cart-items');
    if (!box) return;
    box.innerHTML = state.cart.map((item, i) => `
        <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.02);">
            <span>${item.name}</span>
            <span>${item.price.toFixed(3)} <span onclick="removeFromCart(${i})" style="color:var(--danger); cursor:pointer; margin-right:10px;">✕</span></span>
        </div>
    `).join('');
    const sum = state.cart.reduce((a, b) => a + b.price, 0);
    document.getElementById('cart-total').innerText = sum.toFixed(3);
}

function clearCart() {
    state.cart = [];
    renderCart();
}

async function confirmSale() {
    if (state.cart.length === 0) return;

    const methodEl = document.querySelector('input[name="payment-method"]:checked');
    const paymentMethod = methodEl ? methodEl.value : 'cash';

    const sale = {
        id: Date.now(),
        time: new Date().toLocaleTimeString('ar-BH'),
        date: state.managedDate, // استخدام التاريخ المختار
        role: state.currentRole,
        total: state.cart.reduce((a, b) => a + b.price, 0),
        items: state.cart.map(c => c.name).join(', '),
        paymentMethod: paymentMethod // مضافة حديثاً
    };
    state.history.unshift(sale);
    save();
    clearCart();
    updateUI(); // تحديث فوري وشامل لكل أجزاء الواجهة
    showToast("تم تسجيل العملية بنجاح (" + (paymentMethod === 'cash' ? 'كاش' : 'بينفت') + ")");
}

async function addQuickProfit() {
    const amountInput = document.getElementById('quick-profit-amount');
    const noteInput = document.getElementById('quick-profit-note');
    const amount = parseFloat(amountInput.value);
    const note = noteInput.value.trim() || 'ربح سريع';

    if (isNaN(amount) || amount <= 0) {
        return alert("يرجى إدخال مبلغ صحيح");
    }

    const methodEl = document.querySelector('input[name="quick-payment-method"]:checked');
    const paymentMethod = methodEl ? methodEl.value : 'cash';

    const sale = {
        id: Date.now(),
        time: new Date().toLocaleTimeString('ar-BH'),
        date: state.managedDate,
        role: state.currentRole,
        total: amount,
        items: note,
        paymentMethod: paymentMethod
    };

    state.history.unshift(sale);
    await save();
    updateUI();

    amountInput.value = '';
    noteInput.value = '';
    showToast(`🚀 تم إضافة ${amount.toFixed(3)} د.ب بنجاح`);
}

function setQuickAmount(val) {
    const input = document.getElementById('quick-profit-amount');
    if (input) input.value = val.toFixed(3);
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.innerText = msg;
    toast.style.cssText = "position:fixed; bottom:20px; right:20px; background:var(--success); color:black; padding:15px 25px; border-radius:12px; z-index:9999; font-weight:800; animation: slideIn 0.3s ease;";
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "0.5s";
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

function initProfitChart() {
    const ctx = document.getElementById('profitChart');
    if (!ctx) return;

    // تهيئة القوائم المنسدلة للسنوات والشهور في حال لم تكن جاهزة
    initChartSelectors();

    const year = state.selectedChartYear;
    const month = state.selectedChartMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const labels = [];
    const profitData = [];
    
    for (let i = 1; i <= daysInMonth; i++) {
        const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        labels.push(i);
        const stats = getStatsForDate(dStr);
        profitData.push(stats.net);
    }
    
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'صافي الربح (د.ب)',
                data: profitData,
                borderColor: '#94a3b8',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                backgroundColor: 'rgba(148, 163, 184, 0.05)',
                pointBackgroundColor: profitData.map(v => v < 0 ? '#ef4444' : '#94a3b8')
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            },
            plugins: { legend: { display: false } }
        }
    });

    const currMonthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const mHistory = state.history.filter(h => h.date.startsWith(currMonthPrefix));
    const mTotalSales = mHistory.reduce((a, b) => a + b.total, 0);
    const mTotalExp = state.expenses.filter(e => e.date.startsWith(currMonthPrefix)).reduce((a, b) => a + b.amount, 0);
    
    document.getElementById('m-income').innerText = mTotalSales.toFixed(3);
    document.getElementById('m-exp').innerText = mTotalExp.toFixed(3);
    const mCustEl = document.getElementById('m-customers');
    if (mCustEl) mCustEl.innerText = mHistory.length;

    const yHistory = state.history.filter(h => h.date.startsWith(`${year}`));
    const yCustEl = document.getElementById('y-customers');
    if (yCustEl) yCustEl.innerText = yHistory.length;
}

function initChartSelectors() {
    const monthSelect = document.getElementById('chart-month-select');
    const yearSelect = document.getElementById('chart-year-select');
    if (!monthSelect || !yearSelect) return;

    // إذا كانت السنة والشهور مضافة مسبقاً لا نفعل شيئاً
    if (yearSelect.options.length > 0) return;

    // إضافة السنوات (من 2024 إلى السنة الحالية + 1)
    const currentYear = new Date().getFullYear();
    for (let y = 2024; y <= currentYear + 1; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
    }

    // تحديد القيم الحالية في الـ Selects
    monthSelect.value = state.selectedChartMonth;
    yearSelect.value = state.selectedChartYear;
}

function updateChartFilters() {
    const mSelect = document.getElementById('chart-month-select');
    const ySelect = document.getElementById('chart-year-select');
    if (mSelect && ySelect) {
        state.selectedChartMonth = parseInt(mSelect.value);
        state.selectedChartYear = parseInt(ySelect.value);
        initProfitChart();
    }
}

async function addFixedExpense() {
    const name = document.getElementById('fixed-name').value;
    const amount = parseFloat(document.getElementById('fixed-amount').value);
    if (!name || isNaN(amount)) return alert("يرجى إدخال البيانات");
    state.fixedExpenses.push({ id: Date.now(), name, amount });
    await save();
    renderFixedTable();
    updateGlobalStats();
    document.getElementById('fixed-name').value = '';
    document.getElementById('fixed-amount').value = '';
}

async function removeFixed(id) {
    state.fixedExpenses = state.fixedExpenses.filter(f => f.id !== id);
    await save();
    renderFixedTable();
    updateGlobalStats();
}

function renderFixedTable() {
    const body = document.querySelector('#fixed-table tbody');
    if (!body) return;
    body.innerHTML = state.fixedExpenses.map(f => `
        <tr><td>${f.name}</td><td>${f.amount.toFixed(3)}</td><td><span onclick="removeFixed(${f.id})" style="color:var(--danger); cursor:pointer;">💔 حذف</span></td></tr>
    `).join('');
}

async function saveExpense() {
    const amt = parseFloat(document.getElementById('exp-amount').value);
    const note = document.getElementById('exp-note').value;
    if (isNaN(amt) || amt <= 0) return alert("مبلغ غير صحيح");
    state.expenses.unshift({ id: Date.now(), date: state.managedDate, amount: amt, note });
    await save();
    showToast("تم حفظ المصروف بنجاح");
    document.getElementById('exp-amount').value = '';
    document.getElementById('exp-note').value = '';
    renderExpensesTable();
    updateUI();
}

function renderExpensesTable() {
    const tbody = document.getElementById('expenses-table-body');
    if (!tbody) return;

    // منع التحديث المتعارض مع الكتابة
    if (tbody.contains(document.activeElement)) return;

    // عرض مصاريف اليوم المدار فقط للسهولة، أو عرض الكل؟ سنعرض الكل مرتباً بالأحدث
    tbody.innerHTML = state.expenses.map(e => `
        <tr>
            <td>${e.note}</td>
            <td style="color:var(--danger); font-weight:800;">${e.amount.toFixed(3)}</td>
            <td style="font-size:0.8rem; color:var(--text-muted);">${e.date}</td>
            <td><button onclick="deleteExpense(${e.id})" style="color:var(--danger); background:none; border:none; cursor:pointer;">حذف</button></td>
        </tr>
    `).join('');
}

async function deleteSale(id) {
    if (confirm("هل أنت متأكد من حذف هذه العملية؟")) {
        state.history = state.history.filter(h => h.id != id);
        await save();
        updateUI();
    }
}

async function deleteExpense(id) {
    if (confirm("هل أنت متأكد من حذف هذا المصروف؟")) {
        state.expenses = state.expenses.filter(e => e.id != id);
        await save();
        renderExpensesTable();
        updateUI();
    }
}

async function clearDayAccounting(date) {
    if (confirm(`تحذير: سيتم مسح جميع مبيعات ومصاريف يوم ${date}. هل أنت متأكد؟`)) {
        state.history = state.history.filter(h => h.date !== date);
        state.expenses = state.expenses.filter(e => e.date !== date);
        await save();
        updateUI();
    }
}

function renderHistoryTable() {
    const monthSelect = document.getElementById('history-month');
    const yearSelect = document.getElementById('history-year');
    if (!monthSelect || !yearSelect) return;
    const month = parseInt(monthSelect.value);
    const year = parseInt(yearSelect.value);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const tableHeader = document.querySelector('#history-table thead tr');
    const body = document.querySelector('#history-table tbody');
    if (!body || !tableHeader) return;

    // تحديث الهيدر بناءً على الحلاقين الحاليين
    let headerHtml = `<th>اليوم</th><th>التاريخ</th>`;
    state.barbers.forEach(b => {
        headerHtml += `<th>${b.name}</th>`;
    });
    headerHtml += `<th>المجموع</th><th>المصاريف</th><th>الصافي</th>`;
    tableHeader.innerHTML = headerHtml;

    const arabicDays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    let html = "";
    const monthlyTotals = {};
    state.barbers.forEach(b => monthlyTotals[b.id] = 0);

    for (let day = 1; day <= daysInMonth; day++) {
        const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dateObj = new Date(year, month, day);
        const dayName = arabicDays[dateObj.getDay()];
        const s = getStatsForDate(dStr);
        const isToday = dStr === new Date().toISOString().split('T')[0];

        let barberCols = "";
        state.barbers.forEach(b => {
            const val = s.breakdown[b.id] || 0;
            monthlyTotals[b.id] += val;
            barberCols += `<td>${val.toFixed(3)}</td>`;
        });

        html += `<tr style="${isToday ? 'background: rgba(148, 163, 184, 0.1);' : ''}">
            <td>${dayName}</td>
            <td>${dStr}</td>
            ${barberCols}
            <td>${s.total.toFixed(3)}</td>
            <td style="color:var(--danger)">${s.expenses.toFixed(3)}</td>
            <td style="color:${s.net < 0 ? 'var(--danger)' : 'var(--success)'}; font-weight:800;">${s.net.toFixed(3)}</td>
        </tr>`;
    }
    body.innerHTML = html;
    document.getElementById('history-month-label').innerText = `${monthSelect.options[month].text} ${year}`;

    // تحديث ملخص الدخل الشهري في الواجهة (بالأسماء)
    const summaryContainer = document.getElementById('history-monthly-summary');
    if (summaryContainer) {
        summaryContainer.innerHTML = state.barbers.map(b => `
            <div style="color: var(--text-muted);">${b.name}: <span style="color: var(--primary); font-weight: 700;">${(monthlyTotals[b.id] || 0).toFixed(3)}</span> د.ب</div>
        `).join('');
    }
}

function performSearch() {
    const date = document.getElementById('search-date').value;
    if (!date) return;
    const s = getStatsForDate(date);
    const box = document.getElementById('search-result');
    if (!box) return;
    box.style.display = 'block';

    const daySales = state.history.filter(h => h.date === date);
    const dayExps = state.expenses.filter(e => e.date === date);

    box.innerHTML = `
        <h4 style="margin-bottom:15px; border-bottom:1px solid var(--primary); padding-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
            تقرير يوم: ${date}
            <button onclick="clearDayAccounting('${date}')" style="background:var(--danger); color:white; border:none; padding:5px 10px; border-radius:8px; font-size:0.7rem; cursor:pointer;">🗑️ مسح محاسبة اليوم</button>
        </h4>
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; font-size:1.1rem; margin-bottom: 20px;">
            ${state.barbers.map(b => `<div>${b.name}: <span style="font-weight:700;">${(s.breakdown[b.id] || 0).toFixed(3)}</span></div>`).join('')}
            <div>المصاريف: <span style="color:var(--danger); font-weight:700;">${s.expenses.toFixed(3)}</span></div>
            <div>صافي الربح: <span style="color:${s.net < 0 ? 'var(--danger)' : 'var(--success)'}; font-weight:800; border:1px solid; padding:2px 10px; border-radius:10px;">${s.net.toFixed(3)}</span></div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:20px;">
             <div style="background: rgba(255,255,255,0.02); padding: 15px; border-radius: 12px; border: 1px solid var(--border);">
                <h5 style="margin-bottom: 10px; color: var(--success); border-bottom:1px solid var(--border);">📊 العمليات (${daySales.length})</h5>
                <div style="max-height: 200px; overflow-y: auto; font-size:0.85rem;">
                    ${daySales.map(h => `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding-bottom:5px; border-bottom:1px dashed rgba(255,255,255,0.05);">
                            <span>${h.time} - ${h.items} (${h.total.toFixed(3)})</span>
                            <span onclick="deleteSale('${h.id}')" style="color:var(--danger); cursor:pointer; font-size:0.9rem;">🗑️</span>
                        </div>
                    `).join('') || '<div style="color:var(--text-muted)">لا توجد مبيعات</div>'}
                </div>
            </div>
            
            <div style="background: rgba(255,255,255,0.02); padding: 15px; border-radius: 12px; border: 1px solid var(--border);">
                <h5 style="margin-bottom: 10px; color: var(--danger); border-bottom:1px solid var(--border);">💸 المصاريف (${dayExps.length})</h5>
                <div style="max-height: 200px; overflow-y: auto; font-size:0.85rem;">
                    ${dayExps.map(e => `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding-bottom:5px; border-bottom:1px dashed rgba(255,255,255,0.05);">
                            <span>${e.note || 'مصرف'}: ${e.amount.toFixed(3)}</span>
                            <span onclick="deleteExpense('${e.id}')" style="color:var(--danger); cursor:pointer; font-size:0.9rem;">🗑️</span>
                        </div>
                    `).join('') || '<div style="color:var(--text-muted)">لا توجد مصاريف</div>'}
                </div>
            </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; background: rgba(255,255,255,0.02); padding: 15px; border-radius: 12px; border: 1px solid var(--border);">
            <div>
                <h5 style="margin-bottom: 5px; color: var(--primary);">تفصيل الدفع:</h5>
                <div style="display: flex; gap: 20px;">
                    <div style="color: var(--success);">💵 كاش: <b>${s.cash.toFixed(3)}</b></div>
                    <div style="color: #60a5fa;">🏦 بينفت: <b>${s.benefit.toFixed(3)}</b></div>
                </div>
            </div>
            <button class="btn-action" style="width:auto; padding:10px 20px; background:var(--primary); color:black;" onclick="setManagedDate('${date}')">⚙️ إدارة هذا التاريخ</button>
        </div>
    `;
}

function renderTopServices() {
    const counts = {};
    state.history.forEach(h => {
        const items = h.items.split(', ');
        items.forEach(it => { counts[it] = (counts[it] || 0) + 1; });
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const box = document.getElementById('top-services-list');
    if (!box || sorted.length === 0) return;
    box.innerHTML = sorted.map(([name, count], i) => `<div style="display:flex; align-items:center; background:rgba(255,255,255,0.03); padding:15px; border-radius:15px; border:1px solid var(--border);"><div style="width:40px; height:40px; background:var(--primary); color:black; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; margin-left:15px;">${i + 1}</div><div style="flex:1;"><div style="font-weight:700; font-size:1.1rem;">${name}</div><div style="color:var(--text-muted); font-size:0.9rem;">إجمالي الطلبات: ${count}</div></div><div style="font-weight:800; color:var(--primary); font-size:1.2rem;">${Math.round(count / state.history.length * 100)}%</div></div>`).join('');
}

function renderManageServices() {
    const body = document.querySelector('#manage-services-table tbody');
    if (!body) return;

    // إذا كان المستخدم يركز حالياً على أي خانة داخل الجدول، نؤجل التحديث لكي لا يقفز المؤشر
    if (body.contains(document.activeElement)) return;

    body.innerHTML = state.services.map((s, i) => `
        <tr>
            <td><input type="text" value="${s.name}" style="background:transparent; border:1px solid var(--border); color:white; padding:5px; width:100%; border-radius:5px;" onchange="updateService(${i}, 'name', this.value)"></td>
            <td><input type="number" step="0.5" value="${s.price.toFixed(3)}" style="background:transparent; border:1px solid var(--border); color:white; padding:5px; width:100%; border-radius:5px;" onchange="updateService(${i}, 'price', this.value)"></td>
            <td><input type="number" value="${s.duration !== undefined ? s.duration : 30}" style="background:transparent; border:1px solid var(--border); color:white; padding:5px; width:100%; border-radius:5px;" onchange="updateService(${i}, 'duration', this.value)"></td>
            <td style="display:flex; gap:5px;">
                <button onclick="moveService(${i}, -1)" class="btn-action" style="padding:5px; width:30px; font-size:12px;" ${i === 0 ? 'disabled style="opacity:0.3;"' : ''}>▲</button>
                <button onclick="moveService(${i}, 1)" class="btn-action" style="padding:5px; width:30px; font-size:12px;" ${i === state.services.length - 1 ? 'disabled style="opacity:0.3;"' : ''}>▼</button>
            </td>
            <td><button class="btn-action" style="padding: 5px 15px; background: var(--danger); color: white; border-radius:8px;" onclick="deleteService(${i})">حذف</button></td>
        </tr>
    `).join('');
}

async function moveService(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= state.services.length) return;
    [state.services[index], state.services[newIndex]] = [state.services[newIndex], state.services[index]];

    // تحديث الواجهة فوراً
    renderManageServices();
    renderServices();

    // إضافة الأنيميشن للصف المحرك
    setTimeout(() => {
        const rows = document.querySelectorAll('#manage-services-table tbody tr');
        if (rows[newIndex]) rows[newIndex].classList.add('row-move-anim');
    }, 10);

    // الحفظ في الخلفية
    await save();
}

async function addService() {
    const name = document.getElementById('new-service-name').value;
    const price = parseFloat(document.getElementById('new-service-price').value);
    const durationInput = document.getElementById('new-service-duration').value;
    const duration = durationInput === "" ? 30 : parseInt(durationInput);
    if (!name || isNaN(price)) return alert("يرجى إدخال اسم وسعر صحيح");
    state.services.push({ name, price, duration });
    await save();
    renderManageServices();
    renderServices();
    document.getElementById('new-service-name').value = '';
    document.getElementById('new-service-price').value = '';
    document.getElementById('new-service-duration').value = '';
}

async function updateService(index, field, value) {
    try {
        if (field === 'price') value = parseFloat(value);
        if (field === 'duration') value = parseInt(value);
        if ((field === 'price' || field === 'duration') && isNaN(value)) {
            renderManageServices();
            return;
        }
        state.services[index][field] = value;
        await save();
        renderManageServices();
        renderServices();
        showToast("✅ تم تحديث الخدمة");
    } catch (e) {
        console.error(e);
        showToast("❌ فشل تحديث الخدمة");
    }
}

async function deleteService(index) {
    if (confirm(`هل أنت متأكد من حذف خدمة "${state.services[index].name}"؟`)) {
        state.services.splice(index, 1);
        await save();
        renderManageServices();
        renderServices();
    }
}

function renderSettings() {
    renderSpecialDays();
    renderWorkIntervals();
    renderClosedDates();

    // تحديث زر وضع الصيانة
    const btn = document.getElementById('btn-toggle-maintenance');
    if (btn) {
        const isMaintenance = state.settings.maintenanceMode || false;
        btn.innerText = isMaintenance ? 'تفعيل الموقع (أونلاين)' : 'إيقاف الموقع (صيانة)';
        btn.style.background = isMaintenance ? 'var(--success)' : 'var(--danger)';
        btn.style.color = isMaintenance ? 'black' : 'white';
    }
}

async function toggleMaintenanceMode() {
    const currentStatus = state.settings.maintenanceMode || false;
    const newStatus = !currentStatus;
    
    if (confirm(newStatus ? "هل أنت متأكد من إيقاف الموقع وتفعيل وضع الصيانة؟" : "هل تريد تفعيل الموقع مرة أخرى ليكون متاحاً للزبائن؟")) {
        state.settings.maintenanceMode = newStatus;
        await save();
        renderSettings();
        showToast(newStatus ? "⚠️ تم تفعيل وضع الصيانة" : "✅ الموقع الآن متاح للجميع");
    }
}

function renderSpecialDays() {
    const list = document.getElementById('special-days-list');
    if (!list) return;
    const specialDays = state.settings.specialDays || {};
    let html = '';
    
    Object.entries(specialDays).forEach(([date, hours]) => {
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); padding: 10px 15px; border-radius: 12px; border: 1px solid var(--border);">
                <div style="font-weight: 700;">📅 ${date} <span style="color: var(--primary); margin-right: 15px;">⏰ ${hours.open} - ${hours.close}</span></div>
                <button onclick="deleteSpecialDay('${date}')" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 1.2rem;">🗑️</button>
            </div>
        `;
    });
    list.innerHTML = html || '<div style="color: var(--text-muted); font-size: 0.8rem;">لا توجد أيام خاصة مضافة</div>';
}

async function addSpecialDay() {
    const date = document.getElementById('special-date').value;
    const open = document.getElementById('special-open').value;
    const close = document.getElementById('special-close').value;

    if (!date || !open || !close) return alert("يرجى ملئ جميع الحقول");

    if (!state.settings.specialDays) state.settings.specialDays = {};
    state.settings.specialDays[date] = { open, close };
    
    await save();
    renderSpecialDays();
    alert("تمت إضافة التوقيت الخاص بنجاح");
}

async function deleteSpecialDay(date) {
    if (confirm(`هل تريد حذف التوقيت الخاص ليوم ${date}؟`)) {
        delete state.settings.specialDays[date];
        await save();
        renderSpecialDays();
    }
}

function renderWorkIntervals() {
    const list = document.getElementById('work-intervals-list');
    if (!list) return;
    const intervals = state.settings.workIntervals || [];
    
    // إذا لم توجد فترات وكان هناك وقت فتح وإغلاق قديم، نقوم بالتحويل التلقائي
    if (intervals.length === 0 && state.settings.openTime && state.settings.closeTime) {
        intervals.push({ open: state.settings.openTime, close: state.settings.closeTime });
        state.settings.workIntervals = intervals;
    }

    let html = '';
    intervals.forEach((interval, index) => {
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); padding: 10px 15px; border-radius: 12px; border: 1px solid var(--border);">
                <div style="font-weight: 700;">⏰ فترة ${index + 1}: <span style="color: var(--primary); margin-right: 15px;">${interval.open} - ${interval.close}</span></div>
                <button onclick="deleteWorkInterval(${index})" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 1.2rem;">🗑️</button>
            </div>
        `;
    });
    list.innerHTML = html || '<div style="color: var(--text-muted); font-size: 0.8rem;">لا توجد فترات عمل مضافة (الصالون مغلق دائماً)</div>';
}

async function addWorkInterval() {
    const open = document.getElementById('new-interval-open').value;
    const close = document.getElementById('new-interval-close').value;

    if (!open || !close) return alert("يرجى تحديد أوقات الفتح والإغلاق للفترة");

    if (!state.settings.workIntervals) state.settings.workIntervals = [];
    state.settings.workIntervals.push({ open, close });
    
    await save();
    renderWorkIntervals();
    showToast("✅ تمت إضافة فترة العمل");
}

async function deleteWorkInterval(index) {
    if (confirm(`هل تريد حذف هذه الفترة من أوقات العمل؟`)) {
        state.settings.workIntervals.splice(index, 1);
        await save();
        renderWorkIntervals();
    }
}

// --- CLOSED DATES MANAGEMENT ---
function renderClosedDates() {
    const list = document.getElementById('closed-dates-list');
    if (!list) return;
    let closedDates = state.settings.closedDates || [];
    
    // تصحيح البيانات القديمة لو كانت مصفوفة نصوص بسيطة
    if (closedDates.length > 0 && typeof closedDates[0] === 'string') {
        state.settings.closedDates = closedDates.map(d => ({ date: d, reason: '' }));
        closedDates = state.settings.closedDates;
    }

    let html = '';
    closedDates.sort((a,b) => a.date.localeCompare(b.date)).forEach((item, index) => {
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(239, 68, 68, 0.02); padding: 10px 15px; border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.2);">
                <div style="flex:1;">
                    <div style="font-weight: 700; color: #ef4444;">🔒 تاريخ الإغلاق: <span style="margin-right: 15px;">${item.date}</span></div>
                    ${item.reason ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:3px;">📝 السبب: ${item.reason}</div>` : ''}
                </div>
                <button onclick="deleteClosedDate(${index})" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 1.2rem;">🗑️</button>
            </div>
        `;
    });
    list.innerHTML = html || '<div style="color: var(--text-muted); font-size: 0.8rem;">لا توجد أيام إغلاق مضافة</div>';
}

async function addClosedDate() {
    const date = document.getElementById('closed-date-input').value;
    const reason = document.getElementById('closed-reason-input').value;
    if (!date) return alert("يرجى اختيار التاريخ");

    if (!state.settings.closedDates) state.settings.closedDates = [];
    if (state.settings.closedDates.some(d => d.date === date || d === date)) return alert("هذا التاريخ مضاف مسبقاً");

    state.settings.closedDates.push({ date, reason });
    await save();
    renderClosedDates();
    document.getElementById('closed-reason-input').value = '';
    showToast("✅ تم إغلاق الحجوزات لهذا اليوم");
}

async function deleteClosedDate(index) {
    if (confirm("هل تريد إعادة فتح الحجوزات لهذا اليوم؟")) {
        state.settings.closedDates.splice(index, 1);
        await save();
        renderClosedDates();
    }
}

// --- APPOINTMENT EDIT MODAL LOGIC ---
function openEditModal(id) {
    const app = state.appointments.find(a => String(a.id) === String(id));
    if (!app) return alert("الحجز غير موجود أو لا يمتلك ID صحيح");

    document.getElementById('edit-app-id').value = id;
    document.getElementById('edit-app-name').value = app.name;
    document.getElementById('edit-app-phone').value = app.phone;
    
    const startObj = new Date(app.startTime);
    document.getElementById('edit-app-date').value = startObj.toISOString().split('T')[0];
    document.getElementById('edit-app-time').value = startObj.toTimeString().substring(0, 5);
    
    // محاكاة الخدمات المختارة من النص
    state.editSelectedServices = [];
    const appServices = (app.service || "").split(' + ');
    
    const all = [...state.services, ...state.packages];
    all.forEach(s => {
        if (appServices.includes(s.name)) {
            state.editSelectedServices.push(s);
        }
    });

    renderEditServicesGrid();
    updateEditSummary();
    
    document.getElementById('edit-app-error').style.display = 'none';
    document.getElementById('edit-app-modal').style.display = 'flex';
}

function renderEditServicesGrid() {
    const grid = document.getElementById('edit-services-grid');
    if (!grid) return;
    
    const all = [...state.services, ...state.packages];
    grid.innerHTML = all.map(s => {
        const isSelected = state.editSelectedServices.some(sel => sel.name === s.name);
        return `
            <div class="service-item ${isSelected ? 'active' : ''}" 
                 onclick="toggleEditService('${s.name}')" 
                 style="padding: 10px; border-radius: 12px; border: 1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}; background: ${isSelected ? 'rgba(var(--primary-rgb), 0.1)' : 'transparent'}; cursor: pointer; text-align: center; transition: all 0.2s; border-width: 2px;">
                <div style="font-size: 0.8rem; font-weight: 700; color: ${isSelected ? 'var(--primary)' : 'inherit'};">${s.name}</div>
                <div style="font-size: 0.7rem; color: var(--text-muted);">${s.price.toFixed(3)} د.ب</div>
            </div>
        `;
    }).join('');
}

function toggleEditService(name) {
    const all = [...state.services, ...state.packages];
    const service = all.find(s => s.name === name);
    const index = state.editSelectedServices.findIndex(s => s.name === name);

    if (index > -1) {
        state.editSelectedServices.splice(index, 1);
    } else {
        state.editSelectedServices.push(service);
    }
    
    renderEditServicesGrid();
    updateEditSummary();
}

function updateEditSummary() {
    const names = state.editSelectedServices.map(s => s.name).join(' + ');
    const totalPrice = state.editSelectedServices.reduce((sum, s) => sum + s.price, 0);
    const totalDuration = state.editSelectedServices.reduce((sum, s) => sum + (s.duration || 30), 0);

    document.getElementById('e-selected-names').innerText = names || '--';
    document.getElementById('e-total-price').innerText = totalPrice.toFixed(3);
    document.getElementById('e-total-duration').innerText = totalDuration;
}

function closeEditModal() {
    document.getElementById('edit-app-modal').style.display = 'none';
}

async function saveAppointmentEdit() {
    const id = document.getElementById('edit-app-id').value;
    const name = document.getElementById('edit-app-name').value;
    const phone = document.getElementById('edit-app-phone').value;
    const dateStr = document.getElementById('edit-app-date').value;
    const timeStr = document.getElementById('edit-app-time').value;
    const syncCalendar = document.getElementById('edit-app-sync').checked;

    if (!name || !phone || !dateStr || !timeStr) {
        return alert("يرجى ملئ جميع البيانات الأساسية");
    }

    if (state.editSelectedServices.length === 0) {
        return alert("يرجى اختيار خدمة واحدة على الأقل");
    }

    const appIndex = state.appointments.findIndex(a => String(a.id) === String(id));
    if (appIndex === -1) return alert("الحجز غير موجود");
    const oldApp = state.appointments[appIndex];

    const startTime = new Date(`${dateStr}T${timeStr}`).toISOString();
    const totalDuration = state.editSelectedServices.reduce((sum, s) => sum + (s.duration || 30), 0);
    const totalPrice = state.editSelectedServices.reduce((sum, s) => sum + s.price, 0);
    const serviceNames = state.editSelectedServices.map(s => s.name).join(' + ');
    const endTime = new Date(new Date(startTime).getTime() + totalDuration * 60000).toISOString();

    // فحص التعارض مع المواعيد الأخرى (فقط إذا كانت المزامنة مفعلة)
    if (syncCalendar) {
        const errorEl = document.getElementById('edit-app-error');
        const startT = new Date(startTime).getTime();
        const endT = new Date(endTime).getTime();

        const conflict = state.appointments.find(o => {
            if (String(o.id) === String(id)) return false;
            const oStart = new Date(o.startTime).getTime();
            const oEnd = new Date(o.endTime || (oStart + 30 * 60000)).getTime();
            return (startT < oEnd && endT > oStart);
        });

        if (conflict) {
            errorEl.innerText = `⚠️ تعارض في الوقت! هناك حجز آخر (${conflict.name}) في هذا التوقيت. يرجى إلغاء المزامنة مع قوقل للسماح بالتجاوز وإضافة الحجز كنظام داخلي فقط.`;
            errorEl.style.display = 'block';
            return;
        }
    }

    // تحديث البيانات
    state.appointments[appIndex] = {
        ...oldApp,
        name,
        phone,
        startTime,
        endTime,
        service: serviceNames,
        price: totalPrice
    };

    // مزامنة مع قوقل إذا تم طلب ذلك
    if (syncCalendar) {
        try {
            await fetch(`${API_BASE}/api/calendar/book`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone, service: serviceNames, price: totalPrice, startTime, endTime, syncCalendar: true, status: 'confirmed' })
            });
        } catch (e) { console.error("Sync Edit Error:", e); }
    }

    try {
        await save();
        closeEditModal();
        renderAppointmentsTable();
        showToast("✅ تم تحديث وتخصيص الحجز بنجاح");
    } catch (e) {
        alert("فشل الحفظ");
    }
}

// --- PACKAGE MANAGEMENT ---

function renderManagePackages() {
    const body = document.querySelector('#manage-packages-table-body');
    if (!body) return;

    // إذا كان المستخدم يركز على خانة، لا نمسح الجدول
    if (body.contains(document.activeElement)) return;

    body.innerHTML = state.packages.map((p, i) => `
        <tr>
            <td><input type="text" value="${p.name}" style="background:transparent; border:1px solid var(--border); color:white; padding:5px; width:100%; border-radius:5px;" onchange="updatePackage(${i}, 'name', this.value)"></td>
            <td><input type="text" value="${p.description || ''}" style="background:transparent; border:1px solid var(--border); color:white; padding:5px; width:100%; border-radius:5px;" onchange="updatePackage(${i}, 'description', this.value)"></td>
            <td><input type="number" step="0.5" value="${p.price.toFixed(3)}" style="background:transparent; border:1px solid var(--border); color:white; padding:5px; width:100%; border-radius:5px;" onchange="updatePackage(${i}, 'price', this.value)"></td>
            <td><input type="number" value="${p.duration !== undefined ? p.duration : 30}" style="background:transparent; border:1px solid var(--border); color:white; padding:5px; width:100%; border-radius:5px;" onchange="updatePackage(${i}, 'duration', this.value)"></td>
            <td style="display:flex; gap:5px;">
                <button onclick="movePackage(${i}, -1)" class="btn-action" style="padding:5px; width:30px; font-size:12px;" ${i === 0 ? 'disabled style="opacity:0.3;"' : ''}>▲</button>
                <button onclick="movePackage(${i}, 1)" class="btn-action" style="padding:5px; width:30px; font-size:12px;" ${i === state.packages.length - 1 ? 'disabled style="opacity:0.3;"' : ''}>▼</button>
            </td>
            <td><button class="btn-action" style="padding: 5px 15px; background: var(--danger); color: white; border-radius:8px;" onclick="deletePackage(${i})">حذف</button></td>
        </tr>
    `).join('');
}

async function movePackage(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= state.packages.length) return;
    [state.packages[index], state.packages[newIndex]] = [state.packages[newIndex], state.packages[index]];

    // تحديث الواجهة فوراً
    renderManagePackages();
    renderServices();

    // إضافة الأنيميشن للصف المحرك
    setTimeout(() => {
        const rows = document.querySelectorAll('#manage-packages-table-body tr');
        if (rows[newIndex]) rows[newIndex].classList.add('row-move-anim');
    }, 10);

    // الحفظ في الخلفية
    await save();
}

async function addPackage() {
    const name = document.getElementById('new-package-name').value;
    const price = parseFloat(document.getElementById('new-package-price').value);
    const durationInput = document.getElementById('new-package-duration').value;
    const duration = durationInput === "" ? 30 : parseInt(durationInput);
    const description = document.getElementById('new-package-desc').value;

    if (!name || isNaN(price)) return alert("يرجى إدخال اسم وسعر صحيح للبكج");

    state.packages.push({ name, price, duration, description });
    await save();
    renderManagePackages();
    renderServices();

    document.getElementById('new-package-name').value = '';
    document.getElementById('new-package-price').value = '';
    document.getElementById('new-package-duration').value = '';
    document.getElementById('new-package-desc').value = '';
}

async function updatePackage(index, field, value) {
    try {
        if (field === 'price') value = parseFloat(value);
        if (field === 'duration') value = parseInt(value);
        if ((field === 'price' || field === 'duration') && isNaN(value)) {
            renderManagePackages();
            return;
        }
        state.packages[index][field] = value;
        await save();
        renderManagePackages();
        renderServices();
        showToast("✅ تم تحديث البكج");
    } catch (e) {
        console.error(e);
        showToast("❌ فشل تحديث البكج");
    }
}

async function deletePackage(index) {
    if (confirm(`هل أنت متأكد من حذف بكج "${state.packages[index].name}"؟`)) {
        state.packages.splice(index, 1);
        await save();
        renderManagePackages();
        renderServices();
    }
}

// --- EMPLOYEE MANAGEMENT ---

function renderManageBarbers() {
    const tbody = document.getElementById('manage-barbers-table-body');
    if (!tbody) return;

    if (tbody.contains(document.activeElement)) return;

    // حساب عدد العمليات لكل حلاق للتاريخ الحالي
    const dailySales = state.history.filter(h => h.date === state.managedDate);

    tbody.innerHTML = state.barbers.map((b, index) => {
        const count = dailySales.filter(h => h.role === b.id).length;
        return `
        <tr>
            <td><input type="text" value="${b.name}" onchange="updateBarber(${index}, 'name', this.value)" class="input-field" style="padding: 5px;"></td>
            <td>
                ${b.role === 'owner' ? 'مسؤول (مالك)' : 'حلاق موظف'}
                <div style="font-size: 0.75rem; color: var(--primary); margin-top: 4px; font-weight: 700;">${count} عملية اليوم</div>
            </td>
            <td>
                ${b.role !== 'owner' ? `<button onclick="deleteBarber(${index})" style="color:var(--danger); background:none; border:1px solid var(--danger); padding:4px 8px; border-radius:6px; cursor:pointer;">حذف</button>` : '<span style="color:var(--text-muted)">أساسي</span>'}
            </td>
        </tr>
    `}).join('');
}

async function addBarber() {
    const name = document.getElementById('new-barber-name').value;
    if (!name) return alert("يرجى كتابة اسم الموظف");
    const id = 'barber_' + Date.now();
    state.barbers.push({ id, name, role: 'employee' });
    await save();
    renderManageBarbers();
    renderBarberLinks();
    document.getElementById('new-barber-name').value = '';
}

async function updateBarber(index, field, value) {
    try {
        state.barbers[index][field] = value;
        await save();
        renderManageBarbers();
        renderBarberLinks();
        showToast("✅ تم تحديث الموظف");
    } catch (e) {
        console.error(e);
        showToast("❌ فشل التحديث");
    }
}

async function deleteBarber(index) {
    if (confirm(`هل أنت متأكد من حذف الموظف "${state.barbers[index].name}"؟`)) {
        state.barbers.splice(index, 1);
        await save();
        renderManageBarbers();
        renderBarberLinks();
    }
}

function updateGlobalStats() {
    const today = new Date().toISOString().split('T')[0];
    const s = getStatsForDate(today);
    if (document.getElementById('daily-total')) {
        document.getElementById('daily-total').innerText = s.total.toFixed(3);
        document.getElementById('daily-exp').innerText = s.expenses.toFixed(3);
        document.getElementById('daily-count').innerText = state.history.filter(h => h.date === today).length;
        const currMonth = today.substring(0, 7);
        const mTotalSales = state.history.filter(h => h.date.startsWith(currMonth)).reduce((a, b) => a + b.total, 0);
        const mTotalExp = state.expenses.filter(e => e.date.startsWith(currMonth)).reduce((a, b) => a + b.amount, 0);
        const mFixed = state.fixedExpenses.reduce((a, b) => a + b.amount, 0);
        document.getElementById('monthly-net').innerText = (mTotalSales - mTotalExp - mFixed).toFixed(3);
    }
}

function getStatsForDate(date) {
    const sales = state.history.filter(h => h.date === date);
    const exps = state.expenses.filter(e => e.date === date);
    const total = sales.reduce((a, b) => a + b.total, 0);

    // حساب تفصيلي لكل حلاق
    const breakdown = {};
    state.barbers.forEach(b => breakdown[b.id] = 0);

    sales.forEach(h => {
        if (breakdown[h.role] !== undefined) {
            breakdown[h.role] += h.total;
        } else {
            // معالجة الحالات القديمة أو غير المعروفة
            const bObj = state.barbers.find(b => b.id === h.role);
            if (bObj) {
                breakdown[bObj.id] = (breakdown[bObj.id] || 0) + h.total;
            } else if (h.role === 'owner') {
                breakdown['owner'] = (breakdown['owner'] || 0) + h.total;
            } else {
                breakdown['other'] = (breakdown['other'] || 0) + h.total;
            }
        }
    });

    const expenses = exps.reduce((a, b) => a + b.amount, 0);
    const cash = sales.filter(h => h.paymentMethod === 'cash' || !h.paymentMethod).reduce((a, b) => a + b.total, 0);
    const benefit = sales.filter(h => h.paymentMethod === 'benefit').reduce((a, b) => a + b.total, 0);

    return { breakdown, total, expenses, net: total - expenses, cash, benefit };
}

async function resetData() {
    if (confirm("سيتم مسح كااااامل البيانات. هل أنت متأكد؟")) {
        state.history = []; state.expenses = []; state.fixedExpenses = [];
        await save();
        localStorage.clear();
        location.reload();
    }
}

