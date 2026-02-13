const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // سنحتاج هذه للمراسلة

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.resolve(__dirname, 'db.json');

// الرابط الخاص بجسر قوقل كلندر المجاني
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzJce7BwOakPfjoe4oWzgeNW1Waj9UFzBsIx3XHM1i6d6wWWpOaak-_pRNixDWNobY06g/exec';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

function initializeDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ history: [], expenses: [], fixedExpenses: [], services: [], appointments: [] }, null, 2));
    }
}
initializeDB();

// جلب الأوقات المشغولة من قوقل (عبر الجسر المجاني)
app.get('/api/calendar/busy', async (req, res) => {
    const { start } = req.query; // الموعد المطلوب
    if (!GAS_URL || GAS_URL.includes('ضع_رابط')) return res.json([]);

    try {
        const response = await fetch(`${GAS_URL}?date=${start.split('T')[0]}`);
        const busyData = await response.json();
        res.json(busyData);
    } catch (err) {
        res.status(500).json({ error: "GAS Connection Error" });
    }
});

// تسجيل حجز جديد في قوقل والموقع
app.post('/api/calendar/book', async (req, res) => {
    const { name, phone, service, startTime, endTime } = req.body;

    // 1. حفظ محلي
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    data.appointments.push({ name, phone, service, startTime, endTime, date: new Date().toISOString() });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

    // 2. إرسال لقوقل (عبر الجسر المجاني)
    if (GAS_URL && !GAS_URL.includes('ضع_رابط')) {
        try {
            await fetch(GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ name, phone, service, startTime, endTime })
            });
        } catch (err) { console.error("GAS Post Error"); }
    }

    res.json({ success: true });
});

app.get('/api/data', (req, res) => {
    res.json(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
});

app.post('/api/save', (req, res) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
});

app.get('/booking', (req, res) => { res.sendFile(path.resolve(__dirname, 'booking.html')); });
app.get('*', (req, res) => { res.sendFile(path.resolve(__dirname, 'index.html')); });

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
