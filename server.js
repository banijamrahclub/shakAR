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

function initializeDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({
            history: [],
            expenses: [],
            fixedExpenses: [],
            services: defaultServices,
            appointments: [],
            barbers: [
                { id: 'owner', name: 'الحلاق الشكر', role: 'owner' },
                { id: 'employee', name: 'الموظف 1', role: 'employee' }
            ],
            settings: { openTime: '10:00', closeTime: '22:00' }
        }, null, 2));
    }
}
initializeDB();

// --- API ROUTES ---

function readDB() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function writeDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

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
        if (data.appointments.length !== initialCount) writeDB(data);
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
        allBusy = (data.appointments || [])
            .filter(app => app.startTime && app.startTime.startsWith(requestDay))
            .map(app => ({ start: app.startTime, end: app.endTime }));
    } catch (e) { console.error("Local Busy Error:", e); }

    if (GAS_URL && !GAS_URL.includes('ضع_رابط')) {
        try {
            const response = await fetch(`${GAS_URL}?date=${requestDay}`);
            const gasBusy = await response.json();
            if (Array.isArray(gasBusy)) allBusy = [...allBusy, ...gasBusy];
        } catch (err) { console.error("GAS Fetch Error:", err); }
    }
    res.json(allBusy);
});

app.post('/api/calendar/book', async (req, res) => {
    const { name, phone, service, price, startTime, endTime } = req.body;
    await cleanExpiredPending();
    try {
        const data = readDB();
        data.appointments.push({ name, phone, service, price, startTime, endTime, status: 'pending', date: new Date().toISOString() });
        writeDB(data);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/calendar/confirm', async (req, res) => {
    const { name, startTime } = req.body;
    try {
        const data = readDB();
        const appData = data.appointments.find(a => a.name === name && a.startTime === startTime);
        if (appData) {
            appData.status = 'confirmed';
            writeDB(data);
            if (GAS_URL && !GAS_URL.includes('ضع_رابط')) {
                try {
                    const params = `action=book&name=${encodeURIComponent(appData.name)}&phone=${encodeURIComponent(appData.phone)}&service=${encodeURIComponent(appData.service)}&startTime=${encodeURIComponent(appData.startTime)}&endTime=${encodeURIComponent(appData.endTime)}`;
                    await fetch(`${GAS_URL}?${params}`);
                } catch (e) { console.error("GAS Booking Error:", e); }
            }
            res.json({ success: true });
        } else { res.json({ success: false, error: "Not found" }); }
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/data', (req, res) => {
    try {
        res.json(readDB());
    } catch (e) { res.json({ history: [], expenses: [], fixedExpenses: [], services: [], appointments: [], settings: { openTime: '10:00', closeTime: '22:00' } }); }
});

app.post('/api/calendar/cancel', async (req, res) => {
    const { phone, index, name, startTime } = req.body;
    try {
        const data = readDB();
        let appToCancel = null;
        if (phone && index !== undefined) {
            const customerApps = data.appointments.filter(a => a.phone === phone);
            appToCancel = customerApps[index];
        } else if (name && startTime) {
            appToCancel = data.appointments.find(a => a.name === name && a.startTime === startTime);
        }
        if (appToCancel) {
            data.appointments = data.appointments.filter(a => !(a.name === appToCancel.name && a.startTime === appToCancel.startTime));
            writeDB(data);
            if (GAS_URL && !GAS_URL.includes('ضع_رابط')) {
                try {
                    const end = appToCancel.endTime || new Date(new Date(appToCancel.startTime).getTime() + 30 * 60000).toISOString();
                    const deleteUrl = `${GAS_URL}?action=delete&name=${encodeURIComponent(appToCancel.name)}&startTime=${encodeURIComponent(appToCancel.startTime)}&endTime=${encodeURIComponent(end)}`;
                    await fetch(deleteUrl);
                } catch (e) { console.error("GAS Delete Error:", e); }
            }
            res.json({ success: true });
        } else { res.json({ success: false, error: "Not found" }); }
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/save', (req, res) => {
    try {
        writeDB(req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/', (req, res) => res.sendFile(path.resolve(__dirname, 'booking.html')));
app.get('/h-shakar', (req, res) => res.sendFile(path.resolve(__dirname, 'index.html')));
app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(path.resolve(__dirname, 'booking.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT} (Local Mode) 🚀`));
