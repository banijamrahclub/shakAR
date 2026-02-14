const API_BASE = window.location.origin;

let bookingData = {
    selectedServices: [],
    date: null,
    time: null,
    services: []
};

function switchMainTab(tab) {
    document.getElementById('main-tab-book').style.display = tab === 'book' ? 'block' : 'none';
    document.getElementById('main-tab-my-apps').style.display = tab === 'my-apps' ? 'block' : 'none';

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.includes(tab === 'book' ? 'حجز' : 'مواعيد'));
    });
}

async function fetchMyApps() {
    const phone = document.getElementById('search-phone').value;
    if (!phone) return alert("أدخل رقم الهاتف");

    const list = document.getElementById('my-apps-list');
    list.innerHTML = 'جاري البحث...';

    try {
        const res = await fetch(`${API_BASE}/api/data`);
        const data = await res.json();
        const myApps = (data.appointments || []).filter(a => a.phone === phone);

        if (myApps.length === 0) {
            list.innerHTML = '<p style="color:var(--text-muted)">لا توجد حجوزات لهذا الرقم</p>';
            return;
        }

        list.innerHTML = myApps.map((app, index) => `
            <div class="app-item">
                <div style="font-weight:700; color:var(--primary);">${new Date(app.startTime).toLocaleDateString('ar-BH')} - ${new Date(app.startTime).toLocaleTimeString('ar-BH', { hour: '2-digit', minute: '2-digit' })}</div>
                <div style="font-size:0.9rem; margin:5px 0;">${app.service}</div>
                <button class="btn-back" style="color:var(--danger); border:1px solid var(--danger); padding:5px 10px; border-radius:8px; margin-top:5px; text-decoration:none;" 
                    onclick="cancelApp('${phone}', ${index})">إلغاء الموعد</button>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = 'خطأ في جلب البيانات';
    }
}

async function cancelApp(phone, index) {
    if (!confirm("هل أنت متأكد من إلغاء الموعد؟")) return;

    try {
        const res = await fetch(`${API_BASE}/api/calendar/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, index })
        });
        const result = await res.json();
        if (result.success) {
            alert("تم إلغاء الموعد بنجاح");
            fetchMyApps();
        } else {
            alert("فشل الإلغاء");
        }
    } catch (e) { alert("خطأ في الاتصال"); }
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. تحميل الخدمات من السيرفر
    try {
        const res = await fetch(`${API_BASE}/api/data`);
        const data = await res.json();
        bookingData.services = data.services || [];
        renderServices();
    } catch (e) { console.error("Load error:", e); }

    // إعداد تاريخ اليوم
    const dateInput = document.getElementById('booking-date');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
        dateInput.min = today;
        updateDayLabel(today);
        dateInput.addEventListener('change', (e) => {
            updateDayLabel(e.target.value);
            loadTimeSlots();
        });
    }
});

function updateDayLabel(dateStr) {
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const d = new Date(dateStr);
    const dayName = days[d.getDay()];
    // سنضيف حقل لعرض اسم اليوم في الواجهة
    const label = document.getElementById('day-name-label');
    if (label) label.innerText = `يوم ${dayName}`;
}

function renderServices() {
    const list = document.getElementById('services-list');
    list.innerHTML = bookingData.services.map(s => {
        const isSelected = bookingData.selectedServices.some(item => item.name === s.name);
        return `
            <div class="option-item ${isSelected ? 'selected' : ''}" onclick="toggleService('${s.name}')">
                <div style="font-weight:700;">${s.name}</div>
                <div style="color:var(--primary); font-size:0.8rem;">${s.price.toFixed(3)} د.ب</div>
                ${isSelected ? '<div class="check-mark">✓</div>' : ''}
            </div>
        `;
    }).join('');

    if (bookingData.selectedServices.length > 0) {
        if (!document.getElementById('btn-step-1-next')) {
            const nextBtn = document.createElement('button');
            nextBtn.id = 'btn-step-1-next';
            nextBtn.className = 'btn-confirm';
            nextBtn.innerText = 'استمرار لاختيار الموعد';
            nextBtn.onclick = () => {
                goToStep(2);
                loadTimeSlots();
            };
            document.getElementById('step-1').appendChild(nextBtn);
        }
    } else {
        const existingBtn = document.getElementById('btn-step-1-next');
        if (existingBtn) existingBtn.remove();
    }
}

function toggleService(name) {
    const service = bookingData.services.find(s => s.name === name);
    const index = bookingData.selectedServices.findIndex(item => item.name === name);
    index > -1 ? bookingData.selectedServices.splice(index, 1) : bookingData.selectedServices.push(service);
    renderServices();
    updateSummary();
}

function updateSummary() {
    const names = bookingData.selectedServices.map(s => s.name).join(' + ');
    const totalPrice = bookingData.selectedServices.reduce((sum, s) => sum + s.price, 0);
    document.getElementById('summary-service').innerText = `${names} (${totalPrice.toFixed(3)} د.ب)`;
}

async function loadTimeSlots() {
    const date = document.getElementById('booking-date').value;
    bookingData.date = date;
    const grid = document.getElementById('time-slots');
    grid.innerHTML = '<p style="grid-column: span 2;">جاري تحميل المواعيد...</p>';

    const now = new Date();
    const currentDay = now.toISOString().split('T')[0];

    let busyTime = [];
    try {
        const start = `${date}T00:00:00Z`;
        const res = await fetch(`${API_BASE}/api/calendar/busy?start=${start}`);
        busyTime = await res.json();
    } catch (e) { console.error("Calendar fetch error:", e); }

    // Generate slots (from 9 AM to 11 PM, every 30 mins)
    let html = "";
    for (let h = 9; h < 23; h++) {
        for (let m of ["00", "30"]) {
            const timeStr = `${String(h).padStart(2, '0')}:${m}`;
            const slotDateTime = new Date(`${date}T${timeStr}:00`);
            const slotStart = slotDateTime.getTime();

            // 1. فحص إذا كان الوقت قد مضى (لليوم الحالي)
            let isPast = false;
            if (date === currentDay) {
                if (slotDateTime < now) isPast = true;
            }

            // 2. فحص إذا كان الموعد محجوز في قوقل
            const isBusy = busyTime.some(b => {
                const bStart = new Date(b.start).getTime();
                const bEnd = new Date(b.end).getTime();
                return (slotStart >= bStart && slotStart < bEnd);
            });

            const disabled = isPast || isBusy;

            html += `
                <div class="option-item ${disabled ? 'busy' : ''}" 
                     onclick="${disabled ? '' : `selectTime('${timeStr}')`}">
                    ${timeStr}
                    ${isPast ? '<div style="font-size:0.6rem; color:var(--danger)">مضى</div>' : ''}
                </div>
            `;
        }
    }
    grid.innerHTML = html;
}

function selectTime(time) {
    bookingData.time = time;
    document.getElementById('summary-time').innerText = `${bookingData.date} | ${time}`;
    goToStep(3);
}

function goToStep(n) {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`step-${n}`);
    if (target) target.classList.add('active');
}

async function confirmBooking() {
    const name = document.getElementById('cust-name').value;
    const phone = document.getElementById('cust-phone').value;
    if (!name || !phone) return alert("يرجى ملئ البيانات");

    const startTime = new Date(`${bookingData.date}T${bookingData.time}:00`).toISOString();
    const durationMinutes = Math.max(30, bookingData.selectedServices.length * 20);
    const endTime = new Date(new Date(startTime).getTime() + durationMinutes * 60000).toISOString();
    const servicesNames = bookingData.selectedServices.map(s => s.name).join(' + ');
    const totalPrice = bookingData.selectedServices.reduce((sum, s) => sum + s.price, 0);

    try {
        const res = await fetch(`${API_BASE}/api/calendar/book`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name, phone,
                service: servicesNames,
                price: totalPrice,
                startTime, endTime
            })
        });

        if (res.ok) {
            goToStep('success');
            const waBtn = document.getElementById('btn-whatsapp-confirm');
            const waMsg = `مرحباً حلاق الشكر، قمت بطلب حجز:\n👤 الاسم: ${name}\n✂️ الخدمة: ${servicesNames}\n⏰ الموعد: ${bookingData.date} | ${bookingData.time}\n💰 السعر: ${totalPrice.toFixed(3)} د.ب\n\n- أرفق لكم صورة العربون للتأكيد.`;
            // ضع رقمك هنا مكان الـ 97333xxxxxx
            waBtn.onclick = () => window.open(`https://wa.me/97333333333?text=${encodeURIComponent(waMsg)}`);
        }
    } catch (e) { alert("خطأ في الاتصال"); }
}
