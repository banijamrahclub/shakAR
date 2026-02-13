const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.resolve(__dirname, 'db.json');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// دالة ذكية لإدارة قاعدة البيانات دون تحطم السيرفر
function initializeDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            const initialData = { history: [], expenses: [], fixedExpenses: [], services: [] };
            fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
            console.log("Database initialized successfully.");
        }
    } catch (err) {
        console.error("Could not write initial DB file:", err);
    }
}

initializeDB();

// قراءة البيانات
app.get('/api/data', (req, res) => {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(500).json({ error: "Read Error" });
    }
});

// حفظ البيانات
app.post('/api/save', (req, res) => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Save Error" });
    }
});

// تشغيل الصفحة الرئيسية
app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is now live on port ${PORT}`);
});
