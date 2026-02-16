const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.resolve(__dirname, 'db.json');

// الرابط الخاص بجسر قوقل كلندر المجاني
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyPZSbr_vKRODsj9YP2aBPaoE53z-0Jsmn3HBebX84skye35CiS_70AplD-GDLnMs4W/exec';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

function initializeDB() {
    if (!fs.existsSync(DB_FILE)) {
        const defaultServices = [
            { name: "قص الشعر", price: 1.0 }, { name: "قص اللحية", price: 1.0 },
            { name: "شمع الوجه", price: 1.0 }, { name: "صباغة اللحية", price: 1.0 },
            { name: "مساج كتف وراس", price: 1.0 }, { name: "حلاقة الأطفال", price: 1.0 },
            { name: "تسريحة", price: 1.0 }, { name: "غسل الشعر", price: 0.5 },
            { name: "لصقة أنف", price: 0.5 }, { name: "الخيط", price: 0.5 },
            { name: "صباغة الشعر", price: 1.5 }, { name: "تنظيف الوجه", price: 2.0 },
            { name: "التمليس", price: 3.0 }, { name: "البروتين", price: 15.0 }
        ];
        fs.writeFileSync(DB_FILE, JSON.stringify({
            history: [],
            expenses: [],
            fixedExpenses: [],
            services: defaultServices,
            appointments: []
        }, null, 2));
    }
}
initializeDB();

// --- API ROUTES ---

app.get('/api/calendar/busy', async (req, res) => {
    const { start } = req.query;
    if (!GAS_URL || GAS_URL.includes('ضع_رابط')) return res.json([]);
    try {
        const response = await fetch(`${GAS_URL}?date=${start.split('T')[0]}`);
        const busyData = await response.json();
        res.json(busyData);
    } catch (err) { res.json([]); }
});

app.post('/api/calendar/book', async (req, res) => {
    const { name, phone, service, price, startTime, endTime } = req.body;
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        if (!data.appointments) data.appointments = [];
        data.appointments.push({
            name, phone, service, price, startTime, endTime,
            status: 'pending',
            date: new Date().toISOString()
        });
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/calendar/confirm', async (req, res) => {
    const { name, startTime } = req.body;
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        const app = data.appointments.find(a => a.name === name && a.startTime === startTime);
        if (app) {
            app.status = 'confirmed';
            fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

            // الآن نرسل لقوقل كلندر بعد التأكيد (باستخدام GET المضمونة)
            if (GAS_URL && !GAS_URL.includes('ضع_رابط')) {
                try {
                    const encodedName = encodeURIComponent(app.name);
                    const encodedPhone = encodeURIComponent(app.phone);
                    const encodedService = encodeURIComponent(app.service);
                    const encodedStart = encodeURIComponent(app.startTime);
                    const encodedEnd = encodeURIComponent(app.endTime);

                    const bookUrl = `${GAS_URL}?action=book&name=${encodedName}&phone=${encodedPhone}&service=${encodedService}&startTime=${encodedStart}&endTime=${encodedEnd}`;
                    await fetch(bookUrl);
                } catch (e) { console.error("GAS Booking Error:", e); }
            }
            res.json({ success: true });
        } else {
            res.json({ success: false, error: "Not found" });
        }
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/data', (req, res) => {
    try {
        if (!fs.existsSync(DB_FILE)) initializeDB();
        const data = fs.readFileSync(DB_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (e) { res.json({ history: [], expenses: [], fixedExpenses: [], services: [], appointments: [] }); }
});

app.post('/api/calendar/cancel', async (req, res) => {
    const { phone, index, name, startTime } = req.body;
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        let appToCancel = null;

        if (phone && index !== undefined) {
            const customerApps = data.appointments.filter(a => a.phone === phone);
            appToCancel = customerApps[index];
        } else if (name && startTime) {
            appToCancel = data.appointments.find(a => a.name === name && a.startTime === startTime);
        }

        if (appToCancel) {
            // 1. حذف من قوقل كلندر (باستخدام GET المضمونة)
            if (GAS_URL && !GAS_URL.includes('ضع_رابط')) {
                try {
                    const encodedName = encodeURIComponent(appToCancel.name);
                    const encodedStart = encodeURIComponent(appToCancel.startTime);

                    // نضمن أن نطاق البحث في الكالندر هو 30 دقيقة على الأقل ليجده السكريبت
                    const end = appToCancel.endTime || new Date(new Date(appToCancel.startTime).getTime() + 30 * 60000).toISOString();
                    const encodedEnd = encodeURIComponent(end);

                    const deleteUrl = `${GAS_URL}?action=delete&name=${encodedName}&startTime=${encodedStart}&endTime=${encodedEnd}`;
                    await fetch(deleteUrl);
                } catch (e) { console.error("GAS Delete Error:", e); }
            }

            // 2. حذف من قاعدة البيانات المحلية
            data.appointments = data.appointments.filter(a => !(a.name === appToCancel.name && a.startTime === appToCancel.startTime));
            fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
            res.json({ success: true });
        } else {
            res.json({ success: false, error: "Not found" });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/save', (req, res) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
});

// --- إعداد الروابط الأساسية (Routing) ---
// يجب وضع هذه الروابط قبل express.static لضمان الأولوية

// 1. رابط الزبائن (الحجز) - الرابط المباشر
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'booking.html'));
});

// 2. رابط الإدارة الخاص بك
app.get('/h-shakar', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'index.html'));
});

// تقديم باقي الملفات (CSS, JS)
app.use(express.static(__dirname));

// أي رابط غير معروف يرجع لصفحة الحجز
app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'booking.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
