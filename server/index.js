import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, saveDb } from './db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Endpoints da API

// 1. Configurações
app.get('/api/settings', (req, res) => {
  const db = getDb();
  res.json(db.settings);
});

app.put('/api/settings', (req, res) => {
  const db = getDb();
  db.settings = { ...db.settings, ...req.body };
  saveDb(db);
  res.json(db.settings);
});

// 2. Profissionais
app.get('/api/professionals', (req, res) => {
  const db = getDb();
  res.json(db.professionals || []);
});

app.post('/api/professionals', (req, res) => {
  const db = getDb();
  const newProf = {
    id: 'prof_' + Date.now(),
    name: req.body.name,
    role: req.body.role || 'Profissional',
    phone: req.body.phone || '',
    access: req.body.access || 'Profissional de Servicos',
    avatar: req.body.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(req.body.name)}`,
    showInBooking: req.body.showInBooking ?? true,
    commissionDefault: Number(req.body.commissionDefault) || 50,
    active: true
  };
  db.professionals.push(newProf);
  saveDb(db);
  res.status(201).json(newProf);
});

// 3. Serviços
app.get('/api/services', (req, res) => {
  const db = getDb();
  res.json(db.services || []);
});

app.post('/api/services', (req, res) => {
  const db = getDb();
  const newServ = {
    id: 'serv_' + Date.now(),
    name: req.body.name,
    category: req.body.category || 'Geral',
    price: Number(req.body.price) || 0,
    durationMinutes: Number(req.body.durationMinutes) || 60,
    observation: req.body.observation || '',
    commissionPercent: Number(req.body.commissionPercent) || 50,
    assistantCommissionPercent: Number(req.body.assistantCommissionPercent) || 0
  };
  db.services.push(newServ);
  saveDb(db);
  res.status(201).json(newServ);
});

// 4. Clientes
app.get('/api/clients', (req, res) => {
  const db = getDb();
  res.json(db.clients || []);
});

app.post('/api/clients', (req, res) => {
  const db = getDb();
  const newCli = {
    id: 'cli_' + Date.now(),
    name: req.body.name,
    phone: req.body.phone || '',
    birthday: req.body.birthday || '',
    status: 'ativo',
    balance: Number(req.body.balance) || 0,
    notes: req.body.notes || ''
  };
  db.clients.push(newCli);
  saveDb(db);
  res.status(201).json(newCli);
});

// 5. Agendamentos
app.get('/api/appointments', (req, res) => {
  const db = getDb();
  const { date, professionalId } = req.query;
  let list = db.appointments || [];
  if (date) {
    list = list.filter(a => a.date === date);
  }
  if (professionalId) {
    list = list.filter(a => a.professionalId === professionalId);
  }
  res.json(list);
});

app.post('/api/appointments', (req, res) => {
  const db = getDb();
  const newApp = {
    id: 'app_' + Date.now(),
    professionalId: req.body.professionalId,
    clientId: req.body.clientId || null,
    clientName: req.body.clientName || 'Cliente sem nome',
    clientPhone: req.body.clientPhone || '',
    serviceId: req.body.serviceId || null,
    serviceName: req.body.serviceName || 'Atendimento Geral',
    date: req.body.date,
    startTime: req.body.startTime,
    endTime: req.body.endTime,
    price: Number(req.body.price) || 0,
    status: req.body.status || 'agendado', // agendado, indisponivel, concluido, cancelado
    notes: req.body.notes || ''
  };
  db.appointments.push(newApp);
  saveDb(db);
  res.status(201).json(newApp);
});

// 6. Produtos
app.get('/api/products', (req, res) => {
  const db = getDb();
  res.json(db.products || []);
});

app.post('/api/products', (req, res) => {
  const db = getDb();
  const newProd = {
    id: 'prod_' + Date.now(),
    name: req.body.name,
    category: req.body.category || 'Geral',
    brand: req.body.brand || '',
    barcode: req.body.barcode || '',
    canSell: req.body.canSell ?? true,
    price: Number(req.body.price) || 0,
    commissionPercent: Number(req.body.commissionPercent) || 0,
    stock: Number(req.body.stock) || 0
  };
  db.products.push(newProd);
  saveDb(db);
  res.status(201).json(newProd);
});

// 7. Despesas
app.get('/api/expenses', (req, res) => {
  const db = getDb();
  const { monthYear } = req.query;
  let list = db.expenses || [];
  if (monthYear) {
    list = list.filter(e => e.monthYear === monthYear);
  }
  res.json(list);
});

app.post('/api/expenses', (req, res) => {
  const db = getDb();
  const dueDate = req.body.dueDate || new Date().toISOString().split('T')[0];
  const newExp = {
    id: 'exp_' + Date.now(),
    description: req.body.description,
    category: req.body.category || 'Geral',
    paymentType: req.body.paymentType || 'Pix',
    amount: Number(req.body.amount) || 0,
    dueDate: dueDate,
    status: req.body.status || 'pendente', // pendente, pago
    monthYear: dueDate.substring(0, 7)
  };
  db.expenses.push(newExp);
  saveDb(db);
  res.status(201).json(newExp);
});

// 8. Comissões
app.get('/api/commissions', (req, res) => {
  const db = getDb();
  res.json(db.commissions || []);
});

app.post('/api/commissions/pay/:id', (req, res) => {
  const db = getDb();
  const item = db.commissions.find(c => c.id === req.params.id);
  if (item) {
    item.status = 'paga';
    item.paymentDate = new Date().toISOString().split('T')[0];
    saveDb(db);
    res.json(item);
  } else {
    res.status(404).json({ error: 'Comissao nao encontrada' });
  }
});

// Rota fallback para agendamento online público ou admin
app.get('/agendar', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/agendar.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[CRM Salon Soft] Servidor rodando com sucesso na porta ${PORT}`);
  console.log(`- Painel Geral: http://localhost:${PORT}`);
  console.log(`- Agendamento Publico: http://localhost:${PORT}/agendar`);
});
