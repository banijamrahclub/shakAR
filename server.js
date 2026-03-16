const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// تحديد مسار قاعدة البيانات (التخزين الدائم)
const DB_DIR = (process.env.RENDER || fs.existsSync('/var/data')) ? '/var/data' : __dirname;
if (!fs.existsSync(DB_DIR)) {
    try { fs.mkdirSync(DB_DIR, { recursive: true }); } catch (e) { console.error("Could not create DB dir:", e); }
}
const DB_FILE = path.resolve(DB_DIR, 'db.json');

// الرابط الخاص بجسر قوقل الخارق (Sheets + Calendar)
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyKLr46PjGylPxJJk11Tr1XpwmNYjY2BNc8rdyKkueTZ9a8BXztllOkeMvF7iudkt3g/exec';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// توجيه النطاقات (SEO & Redirection)
app.use((req, res, next) => {
    const targetHost = 'salonshakar.onrender.com';
    // إذا كان النطاق الحالي ليس النطاق المطلوب وليس localhost، قم بالتوجيه
    if (req.hostname && req.hostname !== targetHost && !req.hostname.includes('localhost')) {
        console.log(`🔀 Redirecting from ${req.hostname} to ${targetHost}`);
        return res.redirect(301, `https://${targetHost}${req.originalUrl}`);
    }
    next();
});

const defaultServices = [
    { name: "قص الشعر", price: 1.0, duration: 20 },
    { name: "قص اللحية", price: 1.0, duration: 15 },
    { name: "شمع الوجه", price: 1.0, duration: 10 },
    { name: "صباغة اللحية", price: 1.0, duration: 15 },
    { name: "مساج كتف وراس", price: 1.0, duration: 15 },
    { name: "حلاقة الأطفال", price: 1.0, duration: 20 },
    { name: "تسريحة", price: 1.0, duration: 15 },
    { name: "غسل الشعر", price: 0.5, duration: 10 },
    { name: "لصقة أنف", price: 0.5, duration: 5 },
    { name: "الخيط", price: 0.5, duration: 10 },
    { name: "صباغة الشعر", price: 1.5, duration: 30 },
    { name: "تنظيف الوجه", price: 2.0, duration: 30 },
    { name: "التمليس", price: 3.0, duration: 45 },
    { name: "البروتين", price: 15.0, duration: 90 }
];

const defaultPackages = [
    { name: "بكج الشكر المميز", price: 5.0, duration: 60, description: "قص شعر ولحية + تنظيف وجه + سكراب" },
    { name: "بكج التوفير", price: 3.0, duration: 40, description: "قص شعر ولحية + غسل شعر + تسريحة" }
];

// --- SYNC WITH GOOGLE SHEETS ---

async function syncWithCloud() {
    console.log("🔄 Syncing with Google Sheets...");
    try {
        const res = await fetch(`${GAS_URL}?action=loadState`, { redirect: 'follow' });

        // فحص إذا كان الرابط يطلب تسجيل دخول
        if (res.url && res.url.includes('accounts.google.com')) {
            console.error("❌ Cloud Sync Failed: Google requires login. Make sure deployment is set to 'Anyone'.");
            return; // نخرج فوراً ولا نمسح البيانات المحلية
        }

        const cloudData = await res.json();

        // إذا البيانات السحابية فارغة أو غير موجودة، لا نفعل شيئاً لنحمي البيانات المحلية
        if (!cloudData || typeof cloudData !== 'object' || Object.keys(cloudData).length === 0) {
            console.log("⚠️ Google Sheets is empty or unreachable. Preserving local data.");
            return;
        }

        let currentLocalData = {};
        if (fs.existsSync(DB_FILE)) {
            try {
                currentLocalData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            } catch (e) { console.error("Error reading local DB:", e); }
        }

        // دمج ذكي: ندمج التاريخ (history) والمصاريف (expenses) لضمان عدم ضياع أي عملية جديدة
        const mergedData = { ...currentLocalData, ...cloudData };

        // التأكد من عدم ضياع العمليات الجديدة في التاريخ (المبيعات)
        if (currentLocalData.history && cloudData.history) {
            const localIds = new Set(currentLocalData.history.map(h => h.id));
            const newFromCloud = cloudData.history.filter(h => !localIds.has(h.id));
            mergedData.history = [...currentLocalData.history, ...newFromCloud].sort((a, b) => b.id - a.id);
        }

        // دمج المصاريف اليومية (Expenses) لمنع اختفائها
        if (currentLocalData.expenses && cloudData.expenses) {
            const localIds = new Set(currentLocalData.expenses.map(e => e.id));
            const newFromCloud = cloudData.expenses.filter(e => !localIds.has(e.id));
            mergedData.expenses = [...currentLocalData.expenses, ...newFromCloud].sort((a, b) => b.id - a.id);
        }

        // دمج المصاريف الثابتة (Fixed Expenses)
        if (currentLocalData.fixedExpenses && cloudData.fixedExpenses) {
            const localIds = new Set(currentLocalData.fixedExpenses.map(f => f.id));
            const newFromCloud = cloudData.fixedExpenses.filter(f => !localIds.has(f.id));
            mergedData.fixedExpenses = [...currentLocalData.fixedExpenses, ...newFromCloud];
        }

        // --- دمج الحجوزات (Appointments) لضمان عدم ضياعها خاصة غير المؤكدة ---
        if (currentLocalData.appointments && cloudData.appointments) {
            // دمج العناصر الجديدة من السحاب
            const localKeys = new Set(currentLocalData.appointments.map(a => `${a.name}-${a.startTime}`));
            const newFromCloud = cloudData.appointments.filter(a => !localKeys.has(`${a.name}-${a.startTime}`));
            
            // إضافة IDs للعناصر التي تفتقر إليها
            newFromCloud.forEach(a => {
                if (!a.id) a.id = 'app_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
            });

            mergedData.appointments = [...currentLocalData.appointments, ...newFromCloud].sort((a,b) => new Date(a.startTime) - new Date(b.startTime));
        } else if (currentLocalData.appointments && (!cloudData.appointments || cloudData.appointments.length === 0)) {
            mergedData.appointments = currentLocalData.appointments;
        }

        // التأكد من أن جميع الحجوزات الحالية لها IDs مستقرة وفريدة
        if (mergedData.appointments) {
            const seenIds = new Set();
            mergedData.appointments.forEach((a, idx) => {
                // إذا لم يكن هناك ID أو كان مكرراً، نولد واحداً جديداً
                if (!a.id || seenIds.has(a.id)) {
                    const stableKey = (a.name || 'anon') + (a.startTime || Date.now()) + idx + Math.random();
                    a.id = 'app_' + Buffer.from(stableKey).toString('hex').slice(0, 16);
                }
                seenIds.add(a.id);
            });
        }

        // حماية الخدمات والبكجات: إذا كانت موجودة محلياً وغير موجودة أو فارغة في السحاب، نحتفظ بالمحلي
        if ((!mergedData.services || mergedData.services.length === 0) && currentLocalData.services && currentLocalData.services.length > 0) {
            mergedData.services = currentLocalData.services;
        }
        if ((!mergedData.packages || mergedData.packages.length === 0) && currentLocalData.packages && currentLocalData.packages.length > 0) {
            mergedData.packages = currentLocalData.packages;
        }

        fs.writeFileSync(DB_FILE, JSON.stringify(mergedData, null, 2));
        console.log("✅ Data successfully merged from Cloud!");
    } catch (e) {
        console.error("❌ Cloud Sync Error:", e.message);
    }
}

function initializeLocalDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({
            history: [],
            expenses: [],
            fixedExpenses: [],
            services: defaultServices,
            packages: defaultPackages,
            appointments: [],
            barbers: [
                { id: 'owner', name: 'الحلاق الشكر', role: 'owner' },
                { id: 'employee', name: 'الموظف 1', role: 'employee' }
            ],
            settings: { openTime: '10:00', closeTime: '22:00' }
        }, null, 2));
    } else {
        try {
            const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            let changed = false;
            if (changed) fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error("Error patching DB:", e);
        }
    }
}

async function saveToCloud(data) {
    try {
        console.log("☁️ Sending update to Google Sheets...");
        const response = await fetch(GAS_URL + "?action=saveState", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            redirect: 'follow'
        });

        if (response.url && response.url.includes('accounts.google.com')) {
            console.error("❌ فشل الحفظ: قوقل يرفض الوصول (Unauthorized 401).");
            return { success: false, error: "401_UNAUTHORIZED" };
        }

        if (response.ok) {
            console.log("✅ State backed up to Google Sheets!");
            return { success: true };
        } else {
            return { success: false, error: "HTTP_" + response.status };
        }
    } catch (e) {
        console.error("❌ Cloud Backup Failed:", e.message);
        return { success: false, error: e.message };
    }
}

// Start sequence
async function startServer() {
    initializeLocalDB(); // التأكد من وجود ملف البيانات والهيكل الصحيح
    // محاولة أولية للمزامنة 
    await syncWithCloud();
    app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT} (Cloud Sync Enabled) 🚀`));
}

// --- API ROUTES ---

function readDB() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
async function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    const cloudResult = await saveToCloud(data);
    return cloudResult;
}

async function cleanExpiredPending() {
    try {
        const now = new Date().getTime();
        const data = readDB();
        const initialCount = data.appointments.length;
        data.appointments = data.appointments.filter(app => {
            if (app.status === 'confirmed') return true;
            const startTime = new Date(app.startTime).getTime();
            return startTime >= now;
        });
        if (data.appointments.length !== initialCount) await writeDB(data);
    } catch (e) { console.error("Cleanup error:", e); }
}

app.get('/api/calendar/busy', async (req, res) => {
    const { start } = req.query;
    if (!start) return res.json([]);
    await cleanExpiredPending();
    const requestDay = start.split('T')[0];
    let allBusy = [];
    try {
        const data = readDB();
        
        // 1. إضافة الحجوزات المحلية
        allBusy = (data.appointments || [])
            .filter(app => app.startTime && app.startTime.startsWith(requestDay))
            .map(app => ({ start: app.startTime, end: app.endTime }));

        // 2. التحقق من أوقات العمل الخاصة (Special Days)
        if (data.settings && data.settings.specialDays && data.settings.specialDays[requestDay]) {
            const spec = data.settings.specialDays[requestDay];
            // إضافة بلوك قبل الوقت المفتوح
            allBusy.push({
                start: `${requestDay}T00:00:00`,
                end: `${requestDay}T${spec.open}:00`
            });
            // إضافة بلوك بعد وقت الإغلاق
            allBusy.push({
                start: `${requestDay}T${spec.close}:00`,
                end: `${requestDay}T23:59:59`
            });
        }
    } catch (e) { console.error("Local Busy/Settings Error:", e); }

    try {
        const response = await fetch(`${GAS_URL}?action=getBusy&date=${requestDay}`);
        const gasBusy = await response.json();
        if (Array.isArray(gasBusy)) allBusy = [...allBusy, ...gasBusy];
    } catch (err) { console.error("GAS Fetch Error:", err); }

    res.json(allBusy);
});

app.post('/api/calendar/book', async (req, res) => {
    const { name, phone, service, price, startTime, endTime, syncCalendar, status } = req.body;
    await cleanExpiredPending();
    try {
        const data = readDB();

        // فحص التكرار السريع (نفس العميل يحجز مرتين في دقيقة)
        const isDuplicate = data.appointments.some(app =>
            app.phone === phone &&
            app.startTime === startTime &&
            (new Date() - new Date(app.date)) < 60000
        );
        if (isDuplicate) return res.json({ success: true, duplicated: true });

        // فحص التداخل الفعلي
        const requestStart = new Date(startTime).getTime();
        const requestEnd = new Date(endTime).getTime();
        const requestDay = startTime.split('T')[0];

        let allBusyForCheck = (data.appointments || [])
            .filter(app => app.startTime && app.startTime.startsWith(requestDay))
            .map(app => ({ start: app.startTime, end: app.endTime }));

        try {
            const gasRes = await fetch(`${GAS_URL}?action=getBusy&date=${requestDay}`);
            const gasBusy = await gasRes.json();
            if (Array.isArray(gasBusy)) allBusyForCheck = [...allBusyForCheck, ...gasBusy];
        } catch (e) { console.error("Overlap Check GAS Error:", e); }

        const hasOverlap = allBusyForCheck.some(b => {
            const bStart = new Date(b.start).getTime();
            const bEnd = new Date(b.end).getTime();
            return (requestStart < bEnd && requestEnd > bStart);
        });

        if (hasOverlap) {
            return res.status(400).json({ success: false, error: "عذراً، هذا الوقت تم حجزه للتو." });
        }

        const appStatus = status || 'pending';
        const newApp = { 
            id: 'app_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            name, phone, service, price, startTime, endTime, status: appStatus, date: new Date().toISOString() 
        };
        
        data.appointments.push(newApp);
        await writeDB(data);

        // إذا تم طلب المزامنة وكان الحجز مؤكد
        if (syncCalendar && appStatus === 'confirmed') {
            try {
                const params = `action=book&name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}&service=${encodeURIComponent(service)}&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`;
                await fetch(GAS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: params
                });
            } catch (e) { console.error("Manual GAS Sync Error:", e); }
        }

        res.json({ success: true });
    } catch (err) { 
        console.error("Booking Error:", err);
        res.status(500).json({ success: false }); 
    }
});

app.post('/api/calendar/confirm', async (req, res) => {
    const { id, name, startTime, syncCalendar } = req.body;
    try {
        const data = readDB();
        let appData = null;
        
        if (id) {
            appData = data.appointments.find(a => a.id === id);
        } else if (name && startTime) {
            appData = data.appointments.find(a => a.name === name && a.startTime === startTime);
        }

        if (appData) {
            appData.status = 'confirmed';
            await writeDB(data);
            
            if (syncCalendar) {
                try {
                    const params = `action=book&name=${encodeURIComponent(appData.name)}&phone=${encodeURIComponent(appData.phone)}&service=${encodeURIComponent(appData.service)}&startTime=${encodeURIComponent(appData.startTime)}&endTime=${encodeURIComponent(appData.endTime)}`;
                    await fetch(GAS_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: params
                    });
                } catch (e) { console.error("GAS Booking Error:", e); }
            }
            res.json({ success: true });
        } else { res.json({ success: false, error: "Not found" }); }
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/data', (req, res) => {
    try {
        res.json(readDB());
    } catch (e) { res.json({ history: [], expenses: [], fixedExpenses: [], services: [], barbers: [], appointments: [], settings: { openTime: '10:00', closeTime: '22:00' } }); }
});

app.get('/api/sync-down', async (req, res) => {
    try {
        await syncWithCloud();
        res.json({ success: true, data: readDB() });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/calendar/cancel', async (req, res) => {
    const { id, name, startTime } = req.body;
    try {
        const data = readDB();
        let index = -1;
        
        if (id) {
            index = data.appointments.findIndex(a => a.id === id);
        } 
        
        if (index === -1 && name && startTime) {
            index = data.appointments.findIndex(a => a.name === name && a.startTime === startTime);
        }

        if (index !== -1) {
            const appToCancel = data.appointments[index];
            data.appointments.splice(index, 1);
            await writeDB(data);
            try {
                const end = appToCancel.endTime || new Date(new Date(appToCancel.startTime).getTime() + 30 * 60000).toISOString();
                const deleteUrl = `${GAS_URL}?action=delete&name=${encodeURIComponent(appToCancel.name)}&startTime=${encodeURIComponent(appToCancel.startTime)}&endTime=${encodeURIComponent(end)}`;
                await fetch(deleteUrl);
            } catch (e) { console.error("GAS Delete Error:", e); }
            res.json({ success: true });
        } else { res.json({ success: false, error: "Not found" }); }
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/save', async (req, res) => {
    try {
        const cloudResult = await writeDB(req.body);
        res.json({
            success: true,
            cloudSuccess: cloudResult.success,
            cloudError: cloudResult.error || null
        });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/robots.txt', (req, res) => res.status(410).sendFile(path.resolve(__dirname, '404.html')));
app.get('/', (req, res) => res.sendFile(path.resolve(__dirname, 'booking.html')));
app.get('/h-shakar', (req, res) => res.sendFile(path.resolve(__dirname, 'index.html')));
app.use(express.static(__dirname));
app.get('*', (req, res) => res.status(404).sendFile(path.resolve(__dirname, '404.html')));

startServer();
