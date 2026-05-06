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
    currentType: 'service',
    currentSubCategory: 'all',
    personCount: 1,
    personNames: []
};

let tempServiceSelection = null;

// دالة تحويل الأرقام العربية إلى إنجليزية تلقائياً
function arToEn(str) {
    if (!str) return "";
    return str.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function setPersonCount(n) {
    bookingData.personCount = n;
    document.querySelectorAll('.person-count-btn').forEach((btn, idx) => {
        btn.classList.toggle('active', (idx + 1) === n);
    });

    const namesContainer = document.getElementById('names-container');
    const namesInputs = document.getElementById('names-inputs');
    
    if (n > 1) {
        namesContainer.style.display = 'block';
        namesInputs.innerHTML = '';
        for (let i = 1; i <= n; i++) {
            namesInputs.innerHTML += `
                <input type="text" class="input-field person-name-input" 
                    placeholder="اسم الشخص ${i}" 
                    style="margin-bottom:0; padding:10px; font-size:0.85rem;"
                    onchange="updatePersonNames()">
            `;
        }
    } else {
        namesContainer.style.display = 'none';
    }

    // تصفير الخدمات المختارة عند تغيير عدد الأشخاص الكلي لتجنب التعارض
    bookingData.selectedServices = [];
    updatePersonNames();
    renderServices();
    updateSummary();
}

function updatePersonNames() {
    const inputs = document.querySelectorAll('.person-name-input');
    bookingData.personNames = Array.from(inputs).map((input, idx) => input.value.trim() || `الشخص ${idx + 1}`);
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
        bookingData.categories = data.categories || [
            { id: 'hair', name: '💇‍♂️ خدمات الشعر' },
            { id: 'beard', name: '🧔 خدمات اللحية' },
            { id: 'skincare', name: '✨ خدمات الوجه' },
            { id: 'dye', name: '🎨 الصبغ' }
        ];
        bookingData.settings = data.settings || { openTime: '10:00', closeTime: '22:00' };

        renderCategoryFilters();
        renderServices();

        // Check Maintenance Mode
        if (bookingData.settings && bookingData.settings.maintenanceMode) {
            const overlay = document.getElementById('maintenance-overlay');
            if (overlay) {
                overlay.style.display = 'flex';
                document.body.style.overflow = 'hidden';
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

            const step2 = document.getElementById('step-2');
            if (step2 && step2.classList.contains('active') && !bookingData.settings.maintenanceMode) {
                loadTimeSlots(true);
            }
        } catch (e) { console.error("Periodic check error:", e); }
    }, 10000);
});

function updateDayLabel(dateStr) {
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const d = new Date(dateStr);
    const dayName = days[d.getDay()];
    const label = document.getElementById('day-name-label');
    if (label) label.innerText = `يوم ${dayName}`;
}

function switchServiceType(type) {
    bookingData.currentType = type;
    document.querySelectorAll('.type-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.id === `tab-${type}`);
    });

    const subFilters = document.getElementById('sub-category-filters');
    if (subFilters) {
        subFilters.style.display = type === 'service' ? 'grid' : 'none';
    }

    renderServices();
}

function setSubCategory(cat, el) {
    bookingData.currentSubCategory = cat;
    document.querySelectorAll('.sub-tab').forEach(tab => tab.classList.remove('active'));
    if (el) el.classList.add('active');
    renderServices();
}

function renderCategoryFilters() {
    const container = document.getElementById('sub-category-filters');
    if (!container) return;

    let html = `<button class="sub-tab ${bookingData.currentSubCategory === 'all' ? 'active' : ''}" onclick="setSubCategory('all', this)">الكل</button>`;
    
    bookingData.categories.forEach(cat => {
        html += `<button class="sub-tab ${bookingData.currentSubCategory === cat.id ? 'active' : ''}" onclick="setSubCategory('${cat.id}', this)">${cat.name}</button>`;
    });

    container.innerHTML = html;
}

function renderServices() {
    const list = document.getElementById('services-list');
    let html = "";

    if (bookingData.currentType === 'service') {
        let services = bookingData.services.filter(s => !s.type || s.type === 'service');
        
        // تطبيق فلتر التصنيف الفرعي
        if (bookingData.currentSubCategory !== 'all') {
            services = services.filter(s => s.category === bookingData.currentSubCategory);
        }

        html = services.map(s => {
            const isSelected = bookingData.selectedServices.some(item => item.name === s.name);
            return `
                <div class="option-item ${isSelected ? 'selected' : ''}" onclick="toggleService('${s.name}')">
                    <div style="font-weight:700;">${s.name} ${s.category === 'skincare' ? '✨' : ''}</div>
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
        renderServices();
        updateSummary();
    } else {
        if (bookingData.personCount > 1) {
            openCountModal(service);
        } else {
            if (service) {
                bookingData.selectedServices.push({ ...service, count: 1, assignedNames: [] });
                renderServices();
                updateSummary();
            }
        }
    }
}

function openCountModal(service) {
    tempServiceSelection = service;
    document.getElementById('modal-service-name').innerText = service.name;
    const optionsCont = document.getElementById('modal-count-options');
    optionsCont.innerHTML = '';
    
    updatePersonNames(); // التأكد من جلب أحدث الأسماء من المدخلات

    bookingData.personNames.forEach((name, idx) => {
        const btn = document.createElement('div');
        btn.className = 'count-btn';
        btn.innerText = name;
        btn.onclick = () => {
            btn.classList.toggle('active');
        };
        optionsCont.appendChild(btn);
    });
    
    document.getElementById('service-count-modal').style.display = 'flex';
}

function confirmServiceCount() {
    const activeBtns = document.querySelectorAll('.count-btn.active');
    const selectedNames = Array.from(activeBtns).map(btn => btn.innerText);
    const count = selectedNames.length;
    
    if (count === 0) return alert("يرجى اختيار شخص واحد على الأقل لهذه الخدمة");

    if (tempServiceSelection) {
        bookingData.selectedServices.push({ 
            ...tempServiceSelection, 
            count: count,
            assignedNames: selectedNames 
        });
        tempServiceSelection = null;
    }
    
    closeCountModal();
    renderServices();
    updateSummary();
}

function closeCountModal() {
    document.getElementById('service-count-modal').style.display = 'none';
}

function updateSummary() {
    const servicesStrings = bookingData.selectedServices.map(s => {
        if (s.assignedNames && s.assignedNames.length > 0) {
            return `${s.name} (${s.assignedNames.join(', ')})`;
        }
        return s.count > 1 ? `${s.name} (×${s.count})` : s.name;
    });
    const names = servicesStrings.join(' + ');
    const totalPrice = bookingData.selectedServices.reduce((sum, s) => sum + (s.price * (s.count || 1)), 0);
    
    if (bookingData.personCount > 1) {
        document.getElementById('summary-service').innerText = `${names} - الإجمالي: ${totalPrice.toFixed(3)} د.ب`;
    } else {
        document.getElementById('summary-service').innerText = `${names} (${totalPrice.toFixed(3)} د.ب)`;
    }
}

async function loadTimeSlots(isSilent = false) {
    const loadId = ++currentLoadId;
    const date = document.getElementById('booking-date').value;
    bookingData.date = date;
    const grid = document.getElementById('time-slots');

    if (!isSilent) {
        grid.innerHTML = '<p style="grid-column: span 2;">جاري تحميل المواعيد...</p>';
    }

    const now = new Date();
    const currentDay = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

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

    let busyTime = [];
    try {
        const start = `${date}T00:00:00Z`;
        const res = await fetch(`${API_BASE}/api/calendar/busy?start=${start}`);
        busyTime = await res.json();
    } catch (e) { console.error("Calendar fetch error:", e); }

    if (loadId !== currentLoadId) return;

    const settings = bookingData.settings || { openTime: '10:00', closeTime: '22:00' };
    let intervals = settings.workIntervals || [];
    if (intervals.length === 0) {
        intervals = [{ open: settings.openTime || '10:00', close: settings.closeTime || '22:00' }];
    }

    // حساب المدة الإجمالية بناءً على عدد الأشخاص لكل خدمة
    let totalDuration = bookingData.selectedServices.reduce((sum, s) => {
        const baseDur = (s.duration !== undefined ? s.duration : 30);
        return sum + (baseDur * (s.count || 1));
    }, 0);

    let html = "";
    intervals.forEach(interval => {
        const [openH, openM] = (interval.open || '10:00').split(':').map(Number);
        const [closeH, closeM] = (interval.close || '22:00').split(':').map(Number);
        const startTotalMinutes = (openH * 60) + (openM || 0);
        let endTotalMinutes = (closeH * 60) + (closeM || 0);
        if (endTotalMinutes <= startTotalMinutes) endTotalMinutes += 1440;

        const intervalEndTime = new Date(new Date(`${date}T00:00:00`).getTime() + endTotalMinutes * 60000).getTime();

        for (let totalMin = startTotalMinutes; totalMin < endTotalMinutes; totalMin += 30) {
            let currentLoopTotal = totalMin;
            const h = Math.floor((currentLoopTotal % 1440) / 60);
            const m = currentLoopTotal % 60;
            const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            const displayH = h % 12 || 12;
            const ampm = (h % 24) < 12 ? 'AM' : 'PM';
            const displayTime = `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;

            let slotDate = date;
            if (currentLoopTotal >= 1440) {
                const nextDay = new Date(new Date(date).getTime() + 86400000);
                slotDate = nextDay.toISOString().split('T')[0];
            }

            const slotDateTime = new Date(`${slotDate}T${timeStr}:00`);
            const slotStart = slotDateTime.getTime();
            const slotEnd = slotStart + (totalDuration * 60000);

            let isPast = (date === currentDay) && (slotDateTime < now);
            const exceedsClosing = slotEnd > intervalEndTime;
            const isOverlap = busyTime.some(b => {
                const bStart = new Date(b.start).getTime();
                const bEnd = new Date(b.end).getTime();
                return (slotStart < bEnd && slotEnd > bStart);
            });

            const disabled = isPast || isOverlap || exceedsClosing;
            html += `
                <div class="option-item ${disabled ? 'busy' : ''}" onclick="${disabled ? '' : `selectTime('${timeStr}')`}">
                    ${displayTime}
                    ${isPast ? '<div style="font-size:0.6rem; color:var(--danger)">مضى</div>' : ''}
                    ${!isPast && exceedsClosing ? '<div style="font-size:0.5rem; color:var(--danger)">يفوق الإغلاق</div>' : ''}
                </div>
            `;
            if (totalMin > 2880) break;
        }
    });

    if (loadId !== currentLoadId) return;
    grid.innerHTML = html || '<p style="grid-column: span 2; color: var(--danger);">لا توجد مواعيد متاحة.</p>';
}

function selectTime(time) {
    bookingData.time = time;
    document.getElementById('summary-time').innerText = `${bookingData.date} | ${time}`;
    const isProductOnly = bookingData.selectedServices.length > 0 && bookingData.selectedServices.every(s => s.type === 'product');
    const step3Title = document.querySelector('#step-3 h2');
    if (step3Title) step3Title.innerText = isProductOnly ? 'تأكيد موعد الاستلام' : 'تأكيد الحجز';
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
    phone = arToEn(phone);
    if (!name || !phone) return alert("يرجى ملئ البيانات");

    isSubmitting = true;
    if (btn) { btn.disabled = true; btn.innerText = "جاري التأكيد..."; btn.style.opacity = "0.7"; }

    const startTime = new Date(`${bookingData.date}T${bookingData.time}:00`).toISOString();
    
    let totalDuration = bookingData.selectedServices.reduce((sum, s) => {
        const baseDur = (s.duration !== undefined ? s.duration : 30);
        return sum + (baseDur * (s.count || 1));
    }, 0);
    
    const endTime = new Date(new Date(startTime).getTime() + totalDuration * 60000).toISOString();

    const servicesStrings = bookingData.selectedServices.map(s => {
        if (s.assignedNames && s.assignedNames.length > 0) {
            return `${s.name} (${s.assignedNames.join(', ')})`;
        }
        return s.count > 1 ? `${s.name} (×${s.count})` : s.name;
    });
    const servicesNames = servicesStrings.join(' + ');
    
    let totalPrice = bookingData.selectedServices.reduce((sum, s) => sum + (s.price * (s.count || 1)), 0);

    const isProductOnly = bookingData.selectedServices.length > 0 && bookingData.selectedServices.every(s => s.type === 'product');

    try {
        const res = await fetch(`${API_BASE}/api/calendar/book`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, service: servicesNames, price: totalPrice, startTime, endTime, isProductOnly })
        });
        const data = await res.json();

        if (res.ok) {
            bookingData.currentBooking = { name, startTime };
            goToStep('success');
            startCancellationCheck();
            const desc = isProductOnly ? `طلب منتجات: ${name} - ${bookingData.date} - ${bookingData.time}` : `حجز: ${name} - ${bookingData.date} - ${bookingData.time}`;
            document.getElementById('copy-desc').value = desc;

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
                            <input type="text" id="copy-desc" value="${desc}" readonly style="width:100%; padding:12px; border:1px solid var(--border); border-radius:12px; text-align:center; margin-bottom:10px; background:var(--bg-secondary); color:var(--text);">
                            <button class="btn-confirm" onclick="copyDesc()" style="margin-bottom: 20px; background:var(--bg-secondary); color:var(--text); border:1px solid var(--border);">نسخ وصف المعاملة</button>
                            <button class="btn-confirm" id="btn-whatsapp-confirm">✅ إرسال إيصال الدفع عبر واتساب</button>
                        </div>`;
                }
            }

            const waBtn = document.getElementById('btn-whatsapp-confirm');
            const waMsg = isProductOnly
                ? `تحية طيبة من حلاق الشكر\nلقد قمت بتقديم طلب شراء منتجات\n\nتفاصيل الطلب\nالاسم: ${name}\nالمنتجات: ${servicesNames}\nموعد الاستلام: ${bookingData.date} الساعة ${bookingData.time}\nالإجمالي: ${totalPrice.toFixed(3)} دب\n\nمرفق لكم ايصال الدفع لتأكيد الطلب\nشكرا لكم`
                : `تحية طيبة من حلاق الشكر\nلقد قمت بتقديم طلب حجز موعد\n\nتفاصيل الحجز\nالاسم: ${name}\nالخدمات: ${servicesNames}\nالتاريخ: ${bookingData.date}\nالوقت: ${bookingData.time}\nالإجمالي: ${totalPrice.toFixed(3)} دب\n\nمرفق لكم ايصال تحويل العربون لشراء وقتك وتأكيد الموعد\nشكرا لكم`;
            waBtn.onclick = () => window.open(`https://wa.me/97337055332?text=${encodeURIComponent(waMsg)}`);
        } else alert(data.error || "حدث خطأ.");
    } catch (e) { alert("خطأ في الاتصال."); } finally {
        isSubmitting = false;
        if (btn) { btn.disabled = false; btn.innerText = "تأكيد الحجز"; btn.style.opacity = "1"; }
    }
}

function copyDesc() {
    const copyText = document.getElementById("copy-desc");
    copyText.select();
    navigator.clipboard.writeText(copyText.value);
    alert("تم نسخ وصف المعاملة.");
}

let cancelCheckInterval = null;
function startCancellationCheck() {
    if (cancelCheckInterval) clearInterval(cancelCheckInterval);
    cancelCheckInterval = setInterval(async () => {
        if (!bookingData.currentBooking) { clearInterval(cancelCheckInterval); return; }
        try {
            const res = await fetch(`${API_BASE}/api/data`);
            const data = await res.json();
            const exists = (data.appointments || []).some(a => a.name === bookingData.currentBooking.name && a.startTime === bookingData.currentBooking.startTime);
            if (!exists) { clearInterval(cancelCheckInterval); showCancellationOverlay(); }
        } catch (e) { console.error("Check error:", e); }
    }, 5000);
}

function showCancellationOverlay() {
    const stepSuccess = document.getElementById('step-success');
    if (stepSuccess) {
        stepSuccess.innerHTML = `<div style="text-align: center; padding: 40px 20px;"><h2>عذراً، تم إلغاء حجزك</h2><button class="btn-confirm" onclick="location.reload()">العودة</button></div>`;
    }
}
