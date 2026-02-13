const API_BASE = window.location.origin;

let bookingData = {
    selectedServices: [],
    date: null,
    time: null,
    services: []
};

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

    let html = "";
    for (let h = 9; h < 22; h++) {
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

    try {
        const res = await fetch(`${API_BASE}/api/calendar/book`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, service: servicesNames, startTime, endTime })
        });
        const result = await res.json();
        if (result.success) goToStep('success'); else alert("خطأ في الحجز");
    } catch (e) { alert("فشل الاتصال"); }
}
