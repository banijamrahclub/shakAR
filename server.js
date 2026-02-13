const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.resolve(__dirname, 'db.json');

// الرابط الخاص بجسر قوقل كلندر المجاني
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzJce7BwOakPfjoe4oWzgeNW1Waj9UFzBsIx3XHM1i6d6wWWpOaak-_pRNixDWNobY06g/exec';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

function initializeDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ history: [], expenses: [], fixedExpenses: [], services: [], appointments: [] }, null, 2));
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
    try { res.json(JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); } catch (e) { res.json({}); }
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
