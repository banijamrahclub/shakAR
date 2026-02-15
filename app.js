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
    appointments: []
};

const PASSWORD = "1";
let myChart = null;

// API URL (Auto detect if local or server)
const API_BASE = window.location.origin;

// 2. INITIALIZATION & DATA SYNC
document.addEventListener('DOMContentLoaded', async () => {
    initHistorySelectors();
    await loadData(); // تحميل البيانات من السيرفر
    renderServices();
    updateUI();
    if (document.getElementById('search-date')) document.getElementById('search-date').valueAsDate = new Date();

    // تحديث تلقائي كل 20 ثانية لجلب الحجوزات الجديدة بدون ريفريش
    setInterval(async () => {
        await loadData();
        if (state.currentPage === 'appointments') renderAppointmentsTable();
    }, 20000);
});

async function loadData() {
    try {
        const res = await fetch(`${API_BASE}/api/data`);
        const cloudData = await res.json();

        // تحديث حالة النظام ببيانات السيرفر إذا كانت موجودة
        state.history = cloudData.history || [];
        state.expenses = cloudData.expenses || [];
        state.fixedExpenses = cloudData.fixedExpenses || [];
        state.services = (cloudData.services && cloudData.services.length > 0) ? cloudData.services : defaultServices;
        state.appointments = cloudData.appointments || [];

        // نحفظ في المتصفح فقط كاحتياط (نسخة محلية)
        localStorage.setItem('sh_history', JSON.stringify(state.history));
        localStorage.setItem('sh_expenses', JSON.stringify(state.expenses));
        localStorage.setItem('sh_fixed', JSON.stringify(state.fixedExpenses));
        localStorage.setItem('sh_services', JSON.stringify(state.services));

        console.log("Data synced from server correctly.");
    } catch (err) {
        console.log("Server not found, using local storage...");
        state.history = JSON.parse(localStorage.getItem('sh_history')) || [];
        state.expenses = JSON.parse(localStorage.getItem('sh_expenses')) || [];
        state.fixedExpenses = JSON.parse(localStorage.getItem('sh_fixed')) || [];
        state.services = JSON.parse(localStorage.getItem('sh_services')) || defaultServices;
        state.appointments = [];
    }
}

async function save() {
    // 1. حفظ في المتصفح كاحتياط
    localStorage.setItem('sh_history', JSON.stringify(state.history));
    localStorage.setItem('sh_expenses', JSON.stringify(state.expenses));
    localStorage.setItem('sh_fixed', JSON.stringify(state.fixedExpenses));
    localStorage.setItem('sh_services', JSON.stringify(state.services));

    // 2. إرسال للسيرفر ليحفظها في ملف db.json
    try {
        await fetch(`${API_BASE}/api/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                history: state.history,
                expenses: state.expenses,
                fixedExpenses: state.fixedExpenses,
                services: state.services,
                appointments: state.appointments
            })
        });
    } catch (err) {
        console.error("Failed to save to server:", err);
    }
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
    if (target === 'employee') {
        state.isAuthorized = false;
        state.currentRole = 'employee';
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

function processNav(target) {
    if (target === 'owner') {
        state.currentRole = 'owner';
        state.currentPage = 'pos';
    } else {
        state.currentPage = target;
    }
    updateUI();
}

function closeAuth() { document.getElementById('auth-overlay').style.display = 'none'; }

function updateUI() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        const text = link.innerText;
        if (text.includes('موظف') && state.currentPage === 'pos' && state.currentRole === 'employee') link.classList.add('active');
        if (text.includes('الشكر') && state.currentPage === 'pos' && state.currentRole === 'owner') link.classList.add('active');
        if (text.includes('الرسوم') && state.currentPage === 'analytics') link.classList.add('active');
        if (text.includes('المصاريف الثابتة') && state.currentPage === 'fixed-exp') link.classList.add('active');
        if (text.includes('طارئة') && state.currentPage === 'emergency-exp') link.classList.add('active');
        if (text.includes('كشف') && state.currentPage === 'history') link.classList.add('active');
        if (text.includes('أكثر طلباً') && state.currentPage === 'top-services') link.classList.add('active');
        if (text.includes('إدارة الخدمات') && state.currentPage === 'manage-services') link.classList.add('active');
        if (text.includes('الحجوزات') && state.currentPage === 'appointments') link.classList.add('active');
    });

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById(`page-${state.currentPage}`);
    if (targetPage) targetPage.classList.add('active');

    document.getElementById('role-status').innerText = `المسؤول: ${state.currentRole === 'owner' ? 'الشكر' : 'الموظف'}`;
    const ownerOnlyElements = document.querySelectorAll('.owner-only');
    ownerOnlyElements.forEach(el => el.style.display = (state.isAuthorized || state.currentRole === 'owner' ? 'block' : 'none'));

    if (state.currentPage === 'analytics') initProfitChart();
    if (state.currentPage === 'fixed-exp') renderFixedTable();
    if (state.currentPage === 'history') renderHistoryTable();
    if (state.currentPage === 'top-services') renderTopServices();
    if (state.currentPage === 'manage-services') renderManageServices();
    if (state.currentPage === 'appointments') renderAppointmentsTable();
    updateGlobalStats();
}

async function renderAppointmentsTable() {
    const body = document.querySelector('#appointments-table tbody');
    if (!body) return;

    body.innerHTML = '<tr><td colspan="5">جاري تحميل الحجوزات...</td></tr>';

    try {
        const res = await fetch(`${API_BASE}/api/data`);
        const data = await res.json();
        state.appointments = data.appointments || [];

        // ترتيب الحجوزات من الأقرب موعداً
        state.appointments.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

        body.innerHTML = state.appointments.map((app, index) => {
            const isPending = app.status === 'pending';
            const startTimeFormatted = new Date(app.startTime).toLocaleString('ar-BH');

            // روابط الواتساب المجهزة
            const depositMsg = `تحية طيبة صالون "حسين الشكر"،\nمرحباً ${app.name}، لقد استلمنا حجزك المبدئي:\n⏰ الموعد: ${startTimeFormatted}\n✂️ الخدمة: ${app.service}\n\nيرجى إرسال صورة إيصال دفع العربون (نصف المبلغ) عبر بينفت أو آيبان لتأكيد الموعد نهائياً.\nشكراً لك.`;
            const confirmMsg = `تم التأكيد ✅\nعزيزي ${app.name}، تم استلام العربون وتأكيد موعدك بنجاح.\n⏰ ننتظرك في: ${startTimeFormatted}\n\nشكراً لاختيارك صالون حسين الشكر.`;

            return `
            <tr style="${isPending ? 'border-right: 4px solid orange;' : 'border-right: 4px solid var(--success);'}">
                <td style="color:var(--primary); font-weight:700;">
                    ${startTimeFormatted}
                    <div style="font-size:0.7rem; color:${isPending ? 'orange' : 'var(--success)'}">${isPending ? '⏳ بانتظار العربون' : '✅ موعد مؤكد'}</div>
                </td>
                <td>${app.name}</td>
                <td>${app.phone}</td>
                <td>${app.service}</td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 5px;">
                        ${isPending ? `
                            <button class="btn-action" style="background:orange; color:black;" onclick="verifyBooking(${index})">💰 تأكيد العربون</button>
                            <button class="btn-action" style="background:#25d366; color:white;" onclick="sendWhatsAppMessage('${app.phone}', '${encodeURIComponent(depositMsg)}')">💬 اطلب العربون</button>
                        ` : `
                            <button class="btn-action" style="background:var(--success); color:black;" onclick="completeAppointment(${index})">✅ انتهى</button>
                            <button class="btn-action" style="background:#25d366; color:white;" onclick="sendWhatsAppMessage('${app.phone}', '${encodeURIComponent(confirmMsg)}')">💬 أرسل تأكيد</button>
                        `}
                        <button class="btn-action" style="background:var(--danger); color:white;" onclick="deleteAppointment(${index})">🗑️ إلغاء</button>
                    </div>
                </td>
            </tr>
            `;
        }).join('') || '<tr><td colspan="5">لا توجد حجوزات حالياً</td></tr>';
    } catch (e) {
        body.innerHTML = '<tr><td colspan="5">فشل جلب الحجوزات</td></tr>';
    }
}

function sendWhatsAppMessage(phone, encodedMsg) {
    // تنظيف رقم الهاتف إذا كان يبدأ بـ 0 أو بدون مفتاح الدولة
    let cleanPhone = phone.replace(/\s+/g, '').replace('+', '');
    if (!cleanPhone.startsWith('973')) cleanPhone = '973' + cleanPhone;
    window.open(`https://wa.me/${cleanPhone}?text=${encodedMsg}`);
}

async function verifyBooking(index) {
    const app = state.appointments[index];
    if (confirm(`هل استلمت العربون من ${app.name}؟ (سيتم تأكيد الحجز وإرساله لقوقل كلندر)`)) {
        try {
            const res = await fetch(`${API_BASE}/api/calendar/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: app.name, startTime: app.startTime })
            });
            const result = await res.json();
            if (result.success) {
                alert("تم تأكيد الحجز وإضافته للتقويم!");
                renderAppointmentsTable();
            }
        } catch (e) { alert("خطأ في التأكيد"); }
    }
}

async function completeAppointment(index) {
    const app = state.appointments[index];
    let finalPrice = app.price || 0;

    if (!finalPrice || finalPrice === 0) {
        const inputPrice = prompt(`تنبيه: حجز ${app.name} لا يحتوي على سعر. يرجى إدخل المبلغ (د.ب):`, "1.000");
        if (inputPrice === null) return;
        finalPrice = parseFloat(inputPrice) || 0;
    }

    // سؤال عن طريقة الدفع
    const pMethod = confirm(`هل دفع ${app.name} بقية المبلغ عن طريق "بينفت"؟\n(موافق = بينفت ، إلغاء = كاش)`) ? 'benefit' : 'cash';

    if (confirm(`هل انتهيت من حलाقة ${app.name}؟ (سيتم تسجيل ${finalPrice.toFixed(3)} د.ب في الأرباح وحذفه من قوقل)`)) {
        // 1. إرسال طلب حذف من قوقل كلندر
        try {
            await fetch(`${API_BASE}/api/calendar/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: app.name, startTime: app.startTime })
            });
        } catch (e) { console.error("Sync error:", e); }

        // 2. تسجيل العملية في السجل التاريخي
        const sale = {
            id: Date.now(),
            time: new Date().toLocaleTimeString('ar-BH'),
            date: new Date().toISOString().split('T')[0],
            role: state.currentRole,
            total: finalPrice,
            items: `حجز: ${app.service}`,
            paymentMethod: pMethod // مضافة حديثاً
        };
        state.history.unshift(sale);

        // 3. حذف الحجز محلياً وحفظ السجل
        state.appointments.splice(index, 1);
        await save();
        updateUI();
        alert("تم تسجيل الموعد بنجاح (" + (pMethod === 'cash' ? 'كاش' : 'بينفت') + ")");
    }
}

async function deleteAppointment(index) {
    const app = state.appointments[index];
    if (confirm("هل تريد إلغاء هذا الحجز نهائياً من السيستم وقوقل؟")) {
        try {
            await fetch(`${API_BASE}/api/calendar/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: app.name, startTime: app.startTime })
            });
        } catch (e) { console.error("Sync error:", e); }

        state.appointments.splice(index, 1);
        await save();
        renderAppointmentsTable();
    }
}

function renderServices() {
    const grid = document.getElementById('services-grid');
    if (!grid) return;
    grid.innerHTML = state.services.map((s, i) => `
        <div class="service-item" onclick="addToCart(${i})">
            <div style="font-weight:700; font-size:1rem; margin-bottom:5px;">${s.name}</div>
            <div style="color:var(--primary); font-weight:800;">${s.price.toFixed(3)}</div>
        </div>
    `).join('');
}

function addToCart(i) {
    state.cart.push(state.services[i]);
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
        date: new Date().toISOString().split('T')[0],
        role: state.currentRole,
        total: state.cart.reduce((a, b) => a + b.price, 0),
        items: state.cart.map(c => c.name).join(', '),
        paymentMethod: paymentMethod // مضافة حديثاً
    };
    state.history.unshift(sale);
    await save();
    clearCart();
    updateGlobalStats();
    alert("تم تسجيل العملية بنجاح (" + (paymentMethod === 'cash' ? 'كاش' : 'بينفت') + ")");
}

function initProfitChart() {
    const ctx = document.getElementById('profitChart');
    if (!ctx) return;
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
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

    const currMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
    const mTotalSales = state.history.filter(h => h.date.startsWith(currMonth)).reduce((a, b) => a + b.total, 0);
    const mTotalExp = state.expenses.filter(e => e.date.startsWith(currMonth)).reduce((a, b) => a + b.amount, 0);
    document.getElementById('m-income').innerText = mTotalSales.toFixed(3);
    document.getElementById('m-exp').innerText = mTotalExp.toFixed(3);
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
    state.expenses.unshift({ id: Date.now(), date: new Date().toISOString().split('T')[0], amount: amt, note });
    await save();
    alert("تم حفظ المصروف بنجاح");
    document.getElementById('exp-amount').value = '';
    document.getElementById('exp-note').value = '';
    updateGlobalStats();
}

function renderHistoryTable() {
    const monthSelect = document.getElementById('history-month');
    const yearSelect = document.getElementById('history-year');
    if (!monthSelect || !yearSelect) return;
    const month = parseInt(monthSelect.value);
    const year = parseInt(yearSelect.value);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const body = document.querySelector('#history-table tbody');
    if (!body) return;
    const arabicDays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    let html = "";
    for (let day = 1; day <= daysInMonth; day++) {
        const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dateObj = new Date(year, month, day);
        const dayName = arabicDays[dateObj.getDay()];
        const s = getStatsForDate(dStr);
        const isToday = dStr === new Date().toISOString().split('T')[0];
        html += `<tr style="${isToday ? 'background: rgba(148, 163, 184, 0.1);' : ''}"><td>${dayName}</td><td>${dStr}</td><td>${s.barber.toFixed(3)}</td><td>${s.employee.toFixed(3)}</td><td>${s.total.toFixed(3)}</td><td style="color:var(--danger)">${s.expenses.toFixed(3)}</td><td style="color:${s.net < 0 ? 'var(--danger)' : 'var(--success)'}; font-weight:800;">${s.net.toFixed(3)}</td></tr>`;
    }
    body.innerHTML = html;
    document.getElementById('history-month-label').innerText = `${monthSelect.options[month].text} ${year}`;
}

function performSearch() {
    const date = document.getElementById('search-date').value;
    if (!date) return;
    const s = getStatsForDate(date);
    const box = document.getElementById('search-result');
    box.style.display = 'block';
    box.innerHTML = `
        <h4 style="margin-bottom:15px; border-bottom:1px solid var(--primary); padding-bottom:10px;">تقرير يوم: ${date}</h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; font-size:1.1rem; margin-bottom: 20px;">
            <div>دخل الحلاق: <span style="font-weight:700;">${s.barber.toFixed(3)}</span></div>
            <div>دخل الموظف: <span style="font-weight:700;">${s.employee.toFixed(3)}</span></div>
            <div>المصاريف: <span style="color:var(--danger); font-weight:700;">${s.expenses.toFixed(3)}</span></div>
            <div>صافي الربح: <span style="color:${s.net < 0 ? 'var(--danger)' : 'var(--success)'}; font-weight:800; border:1px solid; padding:2px 10px; border-radius:10px;">${s.net.toFixed(3)}</span></div>
        </div>
        <div style="background: rgba(255,255,255,0.02); padding: 15px; border-radius: 12px; border: 1px solid var(--border);">
            <h5 style="margin-bottom: 10px; color: var(--primary);">تفصيل الدفع:</h5>
            <div style="display: flex; gap: 20px;">
                <div style="color: var(--success);">💵 كاش: <b>${s.cash.toFixed(3)}</b></div>
                <div style="color: #60a5fa;">🏦 بينفت: <b>${s.benefit.toFixed(3)}</b></div>
            </div>
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
    body.innerHTML = state.services.map((s, i) => `<tr><td><input type="text" value="${s.name}" style="background:transparent; border:1px solid var(--border); color:white; padding:5px; width:100%; border-radius:5px;" onchange="updateService(${i}, 'name', this.value)"></td><td><input type="number" step="0.5" value="${s.price.toFixed(3)}" style="background:transparent; border:1px solid var(--border); color:white; padding:5px; width:100%; border-radius:5px;" onchange="updateService(${i}, 'price', this.value)"></td><td><button class="btn-action" style="padding: 5px 15px; background: var(--danger); color: white; border-radius:8px;" onclick="deleteService(${i})">حذف</button></td></tr>`).join('');
}

async function addService() {
    const name = document.getElementById('new-service-name').value;
    const price = parseFloat(document.getElementById('new-service-price').value);
    if (!name || isNaN(price)) return alert("يرجى إدخال اسم وسعر صحيح");
    state.services.push({ name, price });
    await save();
    renderManageServices();
    renderServices();
    document.getElementById('new-service-name').value = '';
    document.getElementById('new-service-price').value = '';
}

async function updateService(index, field, value) {
    if (field === 'price') value = parseFloat(value);
    if (field === 'price' && isNaN(value)) return;
    state.services[index][field] = value;
    await save();
    renderServices();
}

async function deleteService(index) {
    if (confirm(`هل أنت متأكد من حذف خدمة "${state.services[index].name}"؟`)) {
        state.services.splice(index, 1);
        await save();
        renderManageServices();
        renderServices();
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
    const barber = sales.filter(h => h.role === 'owner').reduce((a, b) => a + b.total, 0);
    const employee = sales.filter(h => h.role === 'employee').reduce((a, b) => a + b.total, 0);
    const expenses = exps.reduce((a, b) => a + b.amount, 0);

    // حساب الكاش والبينفت
    const cash = sales.filter(h => h.paymentMethod === 'cash' || !h.paymentMethod).reduce((a, b) => a + b.total, 0);
    const benefit = sales.filter(h => h.paymentMethod === 'benefit').reduce((a, b) => a + b.total, 0);

    return { barber, employee, total, expenses, net: total - expenses, cash, benefit };
}

async function resetData() {
    if (confirm("سيتم مسح كااااامل البيانات. هل أنت متأكد؟")) {
        state.history = []; state.expenses = []; state.fixedExpenses = [];
        await save();
        localStorage.clear();
        location.reload();
    }
}
