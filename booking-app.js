// Debugging for older devices
window.onerror = function (msg, url, line) {
    alert("Error: " + msg + "\nLine: " + line);
};

const API_BASE = window.location.origin;

let currentLoadId = 0;
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

        // Check Maintenance Mode
        if (bookingData.settings && bookingData.settings.maintenanceMode) {
            const overlay = document.getElementById('maintenance-overlay');
            if (overlay) {
                overlay.style.display = 'flex';
                document.body.style.overflow = 'hidden'; // Prevent scrolling
            }
        }

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

    // تحديث تلقائي كل 10 ثواني للتحقق من وضع الصيانة والمواعيد المتاحة
    setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/data`);
            const data = await res.json();
            bookingData.settings = data.settings || bookingData.settings;

            const overlay = document.getElementById('maintenance-overlay');
            if (overlay) {
                const isMaintenance = bookingData.settings.maintenanceMode || false;
                if (isMaintenance && overlay.style.display !== 'flex') {
                    overlay.style.display = 'flex';
                    document.body.style.overflow = 'hidden';
                } else if (!isMaintenance && overlay.style.display === 'flex') {
                    overlay.style.display = 'none';
                    document.body.style.overflow = 'auto';
                }
            }

            // إذا كان المستخدم في خطوة اختيار الوقت، نحدث الخيارات مباشرة
            const step2 = document.getElementById('step-2');
            if (step2 && step2.classList.contains('active') && !bookingData.settings.maintenanceMode) {
                // نمرر true ليدل على أنه تحديث صامت في الخلفية
                loadTimeSlots(true);
            }
        } catch (e) { console.error("Periodic check error:", e); }
    }, 10000);
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
        const text = btn.innerText;
        btn.classList.toggle('active',
            (type === 'service' && (text.includes('خدمات') || text.includes('منفردة'))) ||
            (type === 'package' && text.includes('بكجات')) ||
            (type === 'product' && text.includes('منتجات'))
        );
    });
    renderServices();
}

function renderServices() {
    const list = document.getElementById('services-list');
    let html = "";

    if (bookingData.currentType === 'service') {
        const services = bookingData.services.filter(s => !s.type || s.type === 'service');
        html = services.map(s => {
            const isSelected = bookingData.selectedServices.some(item => item.name === s.name);
            return `
                <div class="option-item ${isSelected ? 'selected' : ''}" onclick="toggleService('${s.name}')">
                    <div style="font-weight:700;">${s.name}</div>
                    ${s.duration ? `<div style="font-size:0.7rem; color:var(--text-muted);">${s.duration} دقيقة</div>` : ''}
                    <div style="color:var(--primary); font-size:0.8rem;">${s.price.toFixed(3)} د.ب</div>
                    ${isSelected ? '<div class="check-mark">✓</div>' : ''}
                </div>
            `;
        }).join('');
    } else if (bookingData.currentType === 'package') {
        html = bookingData.packages.map(p => {
            const isSelected = bookingData.selectedServices.some(item => item.name === p.name);
            return `
                <div class="option-item ${isSelected ? 'selected' : ''}" onclick="toggleService('${p.name}')" style="border: 1px solid gold; background: rgba(255, 215, 0, 0.02);">
                    <div style="font-weight:700;">${p.name}</div>
                    ${p.description ? `<div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:5px;">${p.description}</div>` : ''}
                    <div style="color:gold; font-size:0.8rem;">${p.price.toFixed(3)} د.ب</div>
                    ${isSelected ? '<div class="check-mark">✓</div>' : ''}
                </div>
            `;
        }).join('');
    } else if (bookingData.currentType === 'product') {
        const products = bookingData.services.filter(s => s.type === 'product');
        html = products.map(s => {
            const isSelected = bookingData.selectedServices.some(item => item.name === s.name);
            return `
                <div class="option-item ${isSelected ? 'selected' : ''}" onclick="toggleService('${s.name}')" style="border: 1px dashed var(--border);">
                    <div style="font-weight:700;">${s.name}</div>
                    <div style="color:var(--primary); font-size:0.8rem;">${s.price.toFixed(3)} د.ب</div>
                    ${isSelected ? '<div class="check-mark">✓</div>' : ''}
                </div>
            `;
        }).join('');
    }

    list.innerHTML = html || `<p style="grid-column: 1/-1; text-align:center; padding:20px; color:var(--text-muted);">لا توجد عناصر مضافة حالياً</p>`;

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

async function loadTimeSlots(isSilent = false) {
    const loadId = ++currentLoadId;
    const date = document.getElementById('booking-date').value;
    bookingData.date = date;
    const grid = document.getElementById('time-slots');

    // إيقاف الكتابة لو كان التحديث صامت والاسم مكتوب مسبقاً (لمنع الوميض)
    if (!isSilent) {
        grid.innerHTML = '<p style="grid-column: span 2;">جاري تحميل المواعيد...</p>';
    }

    const now = new Date();
    // الحصول على تاريخ اليوم بالتوقيت المحلي (YYYY-MM-DD) لتجنب مشاكل المناطق الزمنية
    const currentDay = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');


    // فحص إذا كان اليوم مغلقاً تماماً (إجازة)
    const closedDates = (bookingData.settings && bookingData.settings.closedDates) || [];
    const closedEntry = Array.isArray(closedDates)
        ? closedDates.find(d => (typeof d === 'string' ? d === date : d.date === date))
        : null;

    if (closedEntry) {
        if (loadId !== currentLoadId) return;
        const reason = typeof closedEntry === 'object' ? closedEntry.reason : '';
        grid.innerHTML = `
            <div style="grid-column: span 2; padding: 30px; text-align: center; background: rgba(239, 68, 68, 0.1); border-radius: 20px; border: 1px solid rgba(239, 68, 68, 0.2);">
                <div style="font-size: 3rem; margin-bottom: 15px;">🔒</div>
                <h3 style="color: #ef4444; margin-bottom: 10px;">عذراً، الصالون مغلق في هذا التاريخ</h3>
                ${reason ? `<p style="color: var(--text-muted); font-size: 1.1rem; line-height: 1.6;">السبب: ${reason}</p>` : '<p style="color: var(--text-muted);">يرجى اختيار تاريخ آخر.</p>'}
            </div>
        `;
        return;
    }

    try {
        const start = `${date}T00:00:00Z`;
        const res = await fetch(`${API_BASE}/api/calendar/busy?start=${start}`);
        busyTime = await res.json();
    } catch (e) { console.error("Calendar fetch error:", e); }

    if (loadId !== currentLoadId) return;
    if (closedEntry) return;

    // Generate slots based on settings (Minute-based for precision)
    const settings = bookingData.settings || { openTime: '10:00', closeTime: '22:00' };

    // فترات العمل: نستخدم العمل الموزع لو موجود، وإلا نستخدم وقت الفتح والإغلاق التقليدي
    let intervals = settings.workIntervals || [];
    if (intervals.length === 0) {
        intervals = [{ open: settings.openTime || '10:00', close: settings.closeTime || '22:00' }];
    }

    // حساب المدة الإجمالية للخدمات المختارة للتأكد من توفر وقت كافٍ
    const totalDuration = bookingData.selectedServices.reduce((sum, s) => sum + (s.duration !== undefined ? s.duration : bookingData.settings.defaultServiceDuration || 30), 0);


    let html = "";

    intervals.forEach(interval => {
        // Convert current settings to total minutes
        const [openH, openM] = (interval.open || '10:00').split(':').map(Number);
        const [closeH, closeM] = (interval.close || '22:00').split(':').map(Number);

        const startTotalMinutes = (openH * 60) + (openM || 0);
        let endTotalMinutes = (closeH * 60) + (closeM || 0);

        // إذا كان وقت الإغلاق أقل من وقت الفتح، فهذا يعني أن الإغلاق في اليوم التالي (فجر)
        if (endTotalMinutes <= startTotalMinutes) {
            endTotalMinutes += 1440; // إضافة 24 ساعة
        }

        const intervalEndTime = new Date(new Date(`${date}T00:00:00`).getTime() + endTotalMinutes * 60000).getTime();

        // Loop every 30 minutes from start to end for THIS interval
        for (let totalMin = startTotalMinutes; totalMin < endTotalMinutes; totalMin += 30) {
            let currentLoopTotal = totalMin;
            const h = Math.floor((currentLoopTotal % 1440) / 60);
            const m = currentLoopTotal % 60;

            const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

            // تحويل العرض إلى نظام 12 ساعة (AM/PM)
            const displayH = h % 12 || 12;
            const ampm = h < 12 || h >= 24 ? 'AM' : 'PM';
            const displayTime = `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;

            // تحديد تاريخ الموعد
            let slotDate = date;
            if (currentLoopTotal >= 1440) {
                const nextDay = new Date(new Date(date).getTime() + 86400000);
                slotDate = nextDay.toISOString().split('T')[0];
            }

            const slotDateTime = new Date(`${slotDate}T${timeStr}:00`);
            const slotStart = slotDateTime.getTime();
            const slotEnd = slotStart + (totalDuration * 60000);

            // 1. فحص إذا كان الوقت قد مضى
            let isPast = false;
            if (date === currentDay) {
                if (slotDateTime < now) isPast = true;
            }

            // 2. فحص إذا كان الموعد يمتد لبعد وقت إغلاق الفترة الحالية
            const exceedsClosing = slotEnd > intervalEndTime;

            // 3. فحص التداخل مع مواعيد أخرى
            const isOverlap = busyTime.some(b => {
                const bStart = new Date(b.start).getTime();
                const bEnd = new Date(b.end).getTime();
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
            if (totalMin > 2880) break;
        }
    });

    if (loadId !== currentLoadId) return;
    if (!html) html = '<p style="grid-column: span 2; color: var(--danger);">لا توجد مواعيد متاحة في هذا الوقت.</p>';
    grid.innerHTML = html;
}

function selectTime(time) {
    bookingData.time = time;
    document.getElementById('summary-time').innerText = `${bookingData.date} | ${time}`;

    // فحص إذا كان الطلب منتجات فقط لتغيير العنوان
    const isProductOnly = bookingData.selectedServices.length > 0 &&
        bookingData.selectedServices.every(s => s.type === 'product');
    const step3Title = document.querySelector('#step-3 h2');
    if (step3Title) {
        step3Title.innerText = isProductOnly ? 'تأكيد موعد الاستلام' : 'تأكيد الحجز';
    }

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
    const totalDuration = bookingData.selectedServices.reduce((sum, s) => sum + (s.duration !== undefined ? s.duration : 30), 0);
    const endTime = new Date(new Date(startTime).getTime() + totalDuration * 60000).toISOString();

    const servicesNames = bookingData.selectedServices.map(s => s.name).join(' + ');
    const totalPrice = bookingData.selectedServices.reduce((sum, s) => sum + s.price, 0);

    // فحص إذا كان الطلب منتجات فقط
    const isProductOnly = bookingData.selectedServices.length > 0 &&
        bookingData.selectedServices.every(s => s.type === 'product');

    try {
        const res = await fetch(`${API_BASE}/api/calendar/book`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name, phone,
                service: servicesNames,
                price: totalPrice,
                startTime, endTime,
                isProductOnly: isProductOnly // إرسال العلم للسيرفر
            })
        });

        const data = await res.json();

        if (res.ok) {
            // تخزين بيانات الحجز للتحقق من الإلغاء
            bookingData.currentBooking = { name, startTime };

            goToStep('success');
            startCancellationCheck(); // بدء فحص الإلغاء التلقائي

            // تجهيز نص الوصف للنسخ (بدون ايموجي)
            const desc = isProductOnly ? `طلب منتجات: ${name} - ${bookingData.date} - ${bookingData.time}` : `حجز: ${name} - ${bookingData.date} - ${bookingData.time}`;
            document.getElementById('copy-desc').value = desc;

            setupCalendarButtons(name, servicesNames, startTime, endTime);

            // تعديل واجهة النجاح للمنتجات فقط
            if (isProductOnly) {
                const stepSuccess = document.getElementById('step-success');
                if (stepSuccess) {
                    stepSuccess.innerHTML = `
                        <div style="text-align: center; padding: 20px;">
                            <div style="font-size: 5rem; margin-bottom: 20px;">🛍️</div>
                            <h2 style="color: var(--primary); margin-bottom: 15px;">تم استلام طلبك للمنتجات بنجاح</h2>
                            <p style="color: var(--text-muted); line-height: 1.6; margin-bottom: 25px;">
                                يمكنك زيارة المحل في الوقت المحدد (${bookingData.time}) واستلام المنتجات. <br>
                                <span style="font-weight:700; color:var(--text);">يمكنك دفع المبلغ الآن لتأكيد الطلب:</span>
                            </p>
                            
                            <div style="background: var(--card-bg); border: 1px solid var(--border); padding: 20px; border-radius: 20px; margin-bottom: 25px; text-align: left;">
                                <div style="margin-bottom: 10px;"><b>المبلغ المطلوب:</b> <span style="color:var(--primary);">${totalPrice.toFixed(3)} د.ب</span></div>
                                <div style="margin-bottom: 5px;"><b>رقم الأيبان (IBAN):</b> <span style="color:var(--primary); font-size:0.85rem;">BH10BIBB00100002917431</span></div>
                                <div style="margin-bottom: 5px;"><b>رقم البينفت (Benefit):</b> <span style="color:var(--primary);">37055332</span></div>
                                <hr style="border:0; border-top:1px solid var(--border); margin:10px 0;">
                                <div style="font-size:0.8rem; color:var(--text-muted);">يرجى نسخ "وصف المعاملة" أدناه ووضعه في ملاحظات الدفع</div>
                            </div>

                            <input type="text" id="copy-desc" value="${desc}" readonly 
                                style="width:100%; padding:12px; border:1px solid var(--border); border-radius:12px; text-align:center; margin-bottom:10px; background:var(--bg-secondary); color:var(--text);">
                            
                            <button class="btn-confirm" onclick="copyDesc()" style="margin-bottom: 20px; background:var(--bg-secondary); color:var(--text); border:1px solid var(--border);">نسخ وصف المعاملة</button>
                            
                            <button class="btn-confirm" id="btn-whatsapp-confirm">✅ إرسال إيصال الدفع عبر واتساب</button>
                            
                            <div id="calendar-buttons-container" style="display: none; grid-template-columns: 1fr; gap: 10px; margin-top: 20px;">
                                <button class="btn-back" id="btn-add-google" style="margin-top:0;">📅 إضافة لتذكريات قوقل</button>
                            </div>
                        </div>
                    `;
                }
            }

            const waBtn = document.getElementById('btn-whatsapp-confirm');
            const waMsg = isProductOnly
                ? `تحية طيبة من حلاق الشكر\nلقد قمت بتقديم طلب شراء منتجات\n\nتفاصيل الطلب\nالاسم: ${name}\nالمنتجات: ${servicesNames}\nموعد الاستلام: ${bookingData.date} الساعة ${bookingData.time}\nالإجمالي: ${totalPrice.toFixed(3)} دب\n\nمرفق لكم ايصال الدفع لتأكيد الطلب\nشكرا لكم`
                : `تحية طيبة من حلاق الشكر\nلقد قمت بتقديم طلب حجز موعد\n\nتفاصيل الحجز\nالاسم: ${name}\nالخدمات: ${servicesNames}\nالتاريخ: ${bookingData.date}\nالوقت: ${bookingData.time}\nالإجمالي: ${totalPrice.toFixed(3)} دب\n\nمرفق لكم ايصال تحويل العربون لشراء وقتك وتأكيد الموعد\nشكرا لكم`;

            waBtn.onclick = () => window.open(`https://wa.me/97337055332?text=${encodeURIComponent(waMsg)}`);

            // Re-setup calendar if we replaced innerHTML
            if (isProductOnly) setupCalendarButtons(name, servicesNames, startTime, endTime);

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

function setupCalendarButtons(name, services, startTime, endTime) {
    const container = document.getElementById('calendar-buttons-container');
    if (!container) return;
    container.style.display = 'grid';

    const title = `موعد حلاقة: ${services}`;
    const location = "حلاق الشكر - البحرين";
    const desc = `حجز باسم: ${name}\nالخدمات: ${services}\nننتظركم في الموعد المحدد.`;

    // 1. Google Calendar Link
    const gStart = new Date(startTime).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const gEnd = new Date(endTime).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const gUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${gStart}/${gEnd}&details=${encodeURIComponent(desc)}&location=${encodeURIComponent(location)}`;

    document.getElementById('btn-add-google').onclick = () => window.open(gUrl, "_blank");
}
