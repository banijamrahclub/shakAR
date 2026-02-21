const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
    name: String,
    phone: String,
    service: String,
    price: Number,
    startTime: String,
    endTime: String,
    status: { type: String, default: 'pending' },
    date: { type: String, default: () => new Date().toISOString() }
});

const saleSchema = new mongoose.Schema({
    time: String,
    date: String,
    role: String,
    total: Number,
    items: String,
    paymentMethod: String
});

const expenseSchema = new mongoose.Schema({
    date: String,
    amount: Number,
    note: String
});

const fixedExpenseSchema = new mongoose.Schema({
    name: String,
    amount: Number
});

const serviceSchema = new mongoose.Schema({
    name: String,
    price: Number,
    duration: { type: Number, default: 30 }
});

module.exports = {
    Appointment: mongoose.model('Appointment', appointmentSchema),
    Sale: mongoose.model('Sale', saleSchema),
    Expense: mongoose.model('Expense', expenseSchema),
    FixedExpense: mongoose.model('FixedExpense', fixedExpenseSchema),
    Service: mongoose.model('Service', serviceSchema)
};
