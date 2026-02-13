const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.resolve(__dirname, 'db.json');

// الرابط الخاص بجسر قوقل كلندر المجاني
const GAS_URL = 'https://script.google.com/macros/s/AKfycbx6zJg_biskjjGKCvjGpVg6kdxR4-5ACoAmjOyCv1gqONCyxRF9uq1mxxt2VMhMdcH-/exec';

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
    const { name, phone, service, startTime, endTime } = req.body;
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        if (!data.appointments) data.appointments = [];
        data.appointments.push({ name, phone, service, startTime, endTime, date: new Date().toISOString() });
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        if (GAS_URL && !GAS_URL.includes('ضع_رابط')) {
            await fetch(GAS_URL, {
                method: 'POST',
                follow: 20,
                body: JSON.stringify({ name, phone, service, startTime, endTime })
            });
        }
        res.json({ success: true });
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
    const { phone, index } = req.body;
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        const customerApps = data.appointments.filter(a => a.phone === phone);
        const appToCancel = customerApps[index];

        if (appToCancel) {
            // حذف من القائمة الأصلية
            data.appointments = data.appointments.filter(a => !(a.phone === phone && a.startTime === appToCancel.startTime));
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
