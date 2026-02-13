const API_BASE = window.location.origin;

let bookingData = {
    service: null,
    date: null,
    time: null,
    services: []
};

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load services from the system
    try {
        const res = await fetch(`${API_BASE}/api/data`);
        const data = await res.json();
        bookingData.services = data.services || [];
        renderServices();
    } catch (e) { console.error("Load error:", e); }

    // Set default date to today
    const dateInput = document.getElementById('booking-date');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
        dateInput.min = today;
        dateInput.addEventListener('change', () => loadTimeSlots());
    }
});

function renderServices() {
    const list = document.getElementById('services-list');
    list.innerHTML = bookingData.services.map(s => `
        <div class="option-item" onclick="selectService('${s.name}')">
            <div style="font-weight:700;">${s.name}</div>
            <div style="color:var(--primary); font-size:0.8rem;">${s.price.toFixed(3)} د.ب</div>
        </div>
    `).join('');
}

function selectService(name) {
    bookingData.service = name;
    document.getElementById('summary-service').innerText = name;
    goToStep(2);
    loadTimeSlots();
}

async function loadTimeSlots() {
    const date = document.getElementById('booking-date').value;
    bookingData.date = date;
    const grid = document.getElementById('time-slots');
    grid.innerHTML = '<p style="grid-column: span 2;">جاري تحميل المواعيد...</p>';

    // Fetch busy slots from server (Google Calendar Proxy)
    let busyTime = [];
    try {
        const start = `${date}T00:00:00Z`;
        const end = `${date}T23:59:59Z`;
        const res = await fetch(`${API_BASE}/api/calendar/busy?start=${start}&end=${end}`);
        busyTime = await res.json();
    } catch (e) { console.error("Calendar fetch error:", e); }

    // Generate slots (from 9 AM to 10 PM, every 30 mins)
    let html = "";
    for (let h = 9; h < 22; h++) {
        for (let m of ["00", "30"]) {
            const timeStr = `${String(h).padStart(2, '0')}:${m}`;
            const slotStart = new Date(`${date}T${timeStr}:00`).getTime();

            // Check if this slot overlaps with busy times
            const isBusy = busyTime.some(b => {
                const bStart = new Date(b.start).getTime();
                const bEnd = new Date(b.end).getTime();
                return (slotStart >= bStart && slotStart < bEnd);
            });

            html += `
                <div class="option-item ${isBusy ? 'busy' : ''}" onclick="${isBusy ? '' : `selectTime('${timeStr}')`}">
                    ${timeStr}
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
    document.getElementById(`step-${n}`).classList.add('active');
}

async function confirmBooking() {
    const name = document.getElementById('cust-name').value;
    const phone = document.getElementById('cust-phone').value;

    if (!name || !phone) return alert("يرجى ملئ البيانات");

    const startTime = new Date(`${bookingData.date}T${bookingData.time}:00`).toISOString();
    // Add 30 minutes for duration
    const endTime = new Date(new Date(startTime).getTime() + 30 * 60000).toISOString();

    try {
        const res = await fetch(`${API_BASE}/api/calendar/book`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name, phone,
                service: bookingData.service,
                startTime, endTime
            })
        });
        const result = await res.json();
        if (result.success) {
            goToStep('success');
        } else {
            alert("حدث خطأ أثناء الحجز، حاول ثانية");
        }
    } catch (e) {
        alert("فشل الحجز، تأكد من اتصالك بالسيرفر");
    }
}
