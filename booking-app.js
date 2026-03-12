const API_BASE = window.location.origin;

let bookingData = {
    selectedServices: [],
    date: null,
    time: null,
    services: [],
    packages: [],
    currentType: 'service'
};

// دالة تحويل الأرقام العربية إلى إنجليزية تلقائياً
function arToEn(str) {
    if (!str) return "";
    return str.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function switchMainTab(tab) {
    document.getElementById('main-tab-book').style.display = tab === 'book' ? 'block' : 'none';
    document.getElementById('main-tab-my-apps').style.display = tab === 'my-apps' ? 'block' : 'none';

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.includes(tab === 'book' ? 'حجز' : 'مواعيد'));
    });
}

async function fetchMyApps() {
    let phone = document.getElementById('search-phone').value;
    phone = arToEn(phone); // تحويل الأرقام
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

        list.innerHTML = myApps.map((app, index) => {
            const isPending = app.status === 'pending';
            const startTimeFormatted = new Date(app.startTime).toLocaleDateString('ar-BH') + ' - ' + new Date(app.startTime).toLocaleTimeString('ar-BH', { hour: '2-digit', minute: '2-digit' });

            // تجهيز رسالة الواتساب
            const waMsg = `تحية طيبة من حلاق الشكر\nلقد قمت بتقديم طلب حجز موعد\n\nتفاصيل الحجز\nالاسم: ${app.name}\nالخدمات: ${app.service}\nالموعد: ${startTimeFormatted}\n\nمرفق لكم ايصال تحويل العربون (1.000 دينار) لتأكيد الموعد\nشكرا لكم`;
            const waLink = `https://wa.me/97337055332?text=${encodeURIComponent(waMsg)}`;

            return `
                <div class="app-item">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span class="status-badge ${isPending ? 'status-pending' : 'status-confirmed'}">
                            ${isPending ? '⏳ قيد المراجعة' : '✅ مؤكد'}
                        </span>
                        <div style="font-weight:700; color:var(--primary);">${startTimeFormatted}</div>
                    </div>
                    <div style="font-size:0.9rem; margin:5px 0;">${app.service}</div>
                    
                    ${isPending ? `
                        <a href="${waLink}" target="_blank" class="btn-pay">💰 ادفع العربون الآن</a>
                    ` : ''}

                    <button class="btn-back" style="color:var(--danger); border:1px solid var(--danger); padding:5px 10px; border-radius:8px; margin-top:10px; width:100%; transition: 0.3s;" 
                        onclick="cancelApp('${phone}', ${index})">إلغاء الموعد</button>
                </div>
            `;
        }).join('');
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
        bookingData.packages = data.packages || [];
        bookingData.settings = data.settings || { openTime: '10:00', closeTime: '22:00' };

        // Save fetched data to localStorage
        localStorage.setItem('sh_services', JSON.stringify(bookingData.services));
        localStorage.setItem('sh_packages', JSON.stringify(bookingData.packages));
        localStorage.setItem('sh_settings', JSON.stringify(bookingData.settings));

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

function switchServiceType(type) {
    bookingData.currentType = type;
    document.querySelectorAll('.type-tab-btn').forEach(btn => {
        btn.classList.toggle('active', (type === 'service' && btn.innerText.includes('منفردة')) || (type === 'package' && btn.innerText.includes('بكجات')));
    });
    renderServices();
}

function renderServices() {
    const list = document.getElementById('services-list');
    const items = bookingData.currentType === 'service' ? bookingData.services : bookingData.packages;

    list.innerHTML = items.map(s => {
        const isSelected = bookingData.selectedServices.some(item => item.name === s.name);
        return `
            <div class="option-item ${isSelected ? 'selected' : ''}" onclick="toggleService('${s.name}')" style="${bookingData.currentType === 'package' ? 'border:1px solid gold; background:rgba(255,215,0,0.02);' : ''}">
                <div style="font-weight:700;">${s.name}</div>
                ${s.description ? `<div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:5px;">${s.description}</div>` : ''}
                <div style="color:${bookingData.currentType === 'package' ? 'gold' : 'var(--primary)'}; font-size:0.8rem;">${s.price.toFixed(3)} د.ب</div>
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
    const service = [...bookingData.services, ...bookingData.packages].find(s => s.name === name);
    const index = bookingData.selectedServices.findIndex(item => item.name === name);
    if (index > -1) {
        bookingData.selectedServices.splice(index, 1);
    } else {
        if (service) bookingData.selectedServices.push(service);
    }
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

    // Generate slots based on settings (Minute-based for precision)
    const settings = bookingData.settings || { openTime: '10:00', closeTime: '22:00' };

    // حساب المدة الإجمالية للخدمات المختارة للتأكد من توفر وقت كافٍ
    const totalDuration = bookingData.selectedServices.reduce((sum, s) => sum + (s.duration || 30), 0);

    // Convert current settings to total minutes
    const [openH, openM] = (settings.openTime || '10:00').split(':').map(Number);
    const [closeH, closeM] = (settings.closeTime || '22:00').split(':').map(Number);

    const startTotalMinutes = (openH * 60) + (openM || 0);
    let endTotalMinutes = (closeH * 60) + (closeM || 0);

    // إذا كان وقت الإغلاق أقل من وقت الفتح، فهذا يعني أن الإغلاق في اليوم التالي (فجر)
    if (endTotalMinutes <= startTotalMinutes) {
        endTotalMinutes += 1440; // إضافة 24 ساعة
    }

    let html = "";

    // Loop every 30 minutes from start to end
    for (let totalMin = startTotalMinutes; totalMin < endTotalMinutes; totalMin += 30) {
        let currentLoopTotal = totalMin;
        const h = Math.floor((currentLoopTotal % 1440) / 60);
        const m = currentLoopTotal % 60;

        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

        // تحويل العرض إلى نظام 12 ساعة (AM/PM)
        const displayH = h % 12 || 12;
        const ampm = h < 12 || h >= 24 ? 'AM' : 'PM';
        const displayTime = `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;

        // تحديد تاريخ الموعد (ممكن يكون اليوم التالي لو طاف الساعة 12 بالليل)
        let slotDate = date;
        if (currentLoopTotal >= 1440) {
            const nextDay = new Date(new Date(date).getTime() + 86400000);
            slotDate = nextDay.toISOString().split('T')[0];
        }

        const slotDateTime = new Date(`${slotDate}T${timeStr}:00`);
        const slotStart = slotDateTime.getTime();
        const slotEnd = slotStart + (totalDuration * 60000);

        // 1. فحص إذا كان الوقت قد مضى (لليوم الحالي)
        let isPast = false;
        if (date === currentDay) {
            if (slotDateTime < now) isPast = true;
        }

        // 2. فحص إذا كان الموعد يمتد لبعد وقت الإغلاق
        const shopEndTime = new Date(new Date(`${date}T00:00:00`).getTime() + endTotalMinutes * 60000).getTime();
        const exceedsClosing = slotEnd > shopEndTime;

        // 3. فحص إذا كان الموعد يتداخل مع أي موعد موجود
        const isOverlap = busyTime.some(b => {
            const bStart = new Date(b.start).getTime();
            const bEnd = new Date(b.end).getTime();
            // تداخل الفترات [slotStart, slotEnd] مع [bStart, bEnd]
            return (slotStart < bEnd && slotEnd > bStart);
        });

        const disabled = isPast || isOverlap || exceedsClosing;

        html += `
            <div class="option-item ${disabled ? 'busy' : ''}" 
                 onclick="${disabled ? '' : `selectTime('${timeStr}')`}">
                ${displayTime}
                ${isPast ? '<div style="font-size:0.6rem; color:var(--danger)">مضى</div>' : ''}
                ${!isPast && exceedsClosing ? '<div style="font-size:0.5rem; color:var(--danger)">يفوق الإغلاق</div>' : ''}
            </div>
        `;

        // Safety break
        if (totalMin > 2880) break; // بحد أقصى يومين
    }

    if (!html) html = '<p style="grid-column: span 2; color: var(--danger);">لا توجد مواعيد متاحة في هذا الوقت.</p>';
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

let isSubmitting = false;
async function confirmBooking() {
    if (isSubmitting) return;

    const name = document.getElementById('cust-name').value;
    let phone = document.getElementById('cust-phone').value;
    const btn = document.querySelector('#step-3 .btn-confirm');

    phone = arToEn(phone); // تحويل الأرقام
    if (!name || !phone) return alert("يرجى ملئ البيانات");

    isSubmitting = true;
    if (btn) {
        btn.disabled = true;
        btn.innerText = "جاري التأكيد...";
        btn.style.opacity = "0.7";
    }

    const startTime = new Date(`${bookingData.date}T${bookingData.time}:00`).toISOString();

    // حساب المدة الإجمالية بناءً على الخدمات المختارة
    const totalDuration = bookingData.selectedServices.reduce((sum, s) => sum + (s.duration || 30), 0);
    const endTime = new Date(new Date(startTime).getTime() + totalDuration * 60000).toISOString();

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

        const data = await res.json();

        if (res.ok) {
            // تخزين بيانات الحجز للتحقق من الإلغاء
            bookingData.currentBooking = { name, startTime };

            goToStep('success');
            startCancellationCheck(); // بدء فحص الإلغاء التلقائي

            // تجهيز نص الوصف للنسخ (بدون ايموجي)
            const desc = `حجز: ${name} - ${bookingData.date} - ${bookingData.time}`;
            document.getElementById('copy-desc').value = desc;

            const waBtn = document.getElementById('btn-whatsapp-confirm');
            const waMsg = `تحية طيبة من حلاق الشكر\nلقد قمت بتقديم طلب حجز موعد\n\nتفاصيل الحجز\nالاسم: ${name}\nالخدمات: ${servicesNames}\nالتاريخ: ${bookingData.date}\nالوقت: ${bookingData.time}\nالإجمالي: ${totalPrice.toFixed(3)} دب\n\nمرفق لكم ايصال تحويل العربون لشراء وقتك وتأكيد الموعد\nشكرا لكم`;
            waBtn.onclick = () => window.open(`https://wa.me/97337055332?text=${encodeURIComponent(waMsg)}`);
        } else {
            alert(data.error || "حدث خطأ أثناء الحجز، يرجى المحاولة مرة أخرى.");
        }
    } catch (e) {
        alert("خطأ في الاتصال بالسيرفر");
    } finally {
        isSubmitting = false;
        if (btn) {
            btn.disabled = false;
            btn.innerText = "تأكيد الحجز";
            btn.style.opacity = "1";
        }
    }
}

function copyDesc() {
    const copyText = document.getElementById("copy-desc");
    copyText.select();
    copyText.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(copyText.value);
    alert("تم نسخ وصف المعاملة: " + copyText.value);
}

let cancelCheckInterval = null;
function startCancellationCheck() {
    if (cancelCheckInterval) clearInterval(cancelCheckInterval);

    cancelCheckInterval = setInterval(async () => {
        if (!bookingData.currentBooking) {
            clearInterval(cancelCheckInterval);
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/data`);
            const data = await res.json();

            // البحث عن الحجز في القائمة
            const exists = (data.appointments || []).some(a =>
                a.name === bookingData.currentBooking.name &&
                a.startTime === bookingData.currentBooking.startTime
            );

            if (!exists) {
                clearInterval(cancelCheckInterval);
                showCancellationOverlay();
            }
        } catch (e) {
            console.error("Check error:", e);
        }
    }, 5000); // فحص كل 5 ثوانٍ
}

function showCancellationOverlay() {
    const stepSuccess = document.getElementById('step-success');
    if (stepSuccess) {
        stepSuccess.innerHTML = `
            <div style="text-align: center; padding: 40px 20px;">
                <div style="font-size: 5rem; margin-bottom: 20px;">🚫</div>
                <h2 style="color: var(--danger); margin-bottom: 15px;">عذراً، تم إلغاء حجزك</h2>
                <p style="color: var(--text-muted); line-height: 1.6; margin-bottom: 25px;">
                    لقد تم إزالة هذا الحجز من النظام من قبل الإدارة. <br>
                    يرجى إعادة الحجز في وقت آخر أو التواصل معنا للاستفسار: <br>
                    <b style="color: var(--primary); font-size: 1.5rem; display: block; margin-top: 10px;">37055332</b>
                </p>
                <button class="btn-confirm" onclick="location.reload()">العودة للحجز من جديد</button>
            </div>
        `;
    }
}
