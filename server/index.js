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

// Helper para converter "HH:MM" em minutos do dia
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Helper para converter minutos do dia em "HH:MM"
function minutesToTime(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

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

// Endpoint para consultar a grade completa de horários e disponibilidade de um profissional em determinada data
app.get('/api/appointments/availability', (req, res) => {
  const db = getDb();
  const { date, professionalId, serviceId } = req.query;

  if (!date || !professionalId) {
    return res.status(400).json({ error: 'date e professionalId são obrigatórios' });
  }

  // Duração do serviço solicitado (padrão 30 min se não fornecido)
  let serviceDuration = 30;
  if (serviceId) {
    const serv = db.services.find(s => s.id === serviceId);
    if (serv && serv.durationMinutes) {
      serviceDuration = Number(serv.durationMinutes);
    }
  }

  const interval = Number(db.settings.intervalMinutes) || 30;
  const startDayMin = 8 * 60;   // 08:00
  const endDayMin = 19 * 60;    // 19:00

  // Agendamentos existentes do profissional nessa data
  const dayAppointments = (db.appointments || []).filter(
    a => a.professionalId === professionalId && a.date === date && a.status !== 'cancelado'
  );

  const slots = [];
  for (let m = startDayMin; m + interval <= endDayMin; m += interval) {
    const slotStart = minutesToTime(m);
    const slotEnd = minutesToTime(m + serviceDuration);
    const slotEndMin = m + serviceDuration;

    // Se o serviço ultrapassa o horário de funcionamento do salão
    if (slotEndMin > endDayMin) {
      slots.push({
        time: slotStart,
        endTime: slotEnd,
        available: false,
        reason: 'Ultrapassa expediente'
      });
      continue;
    }

    // Verifica se colide com algum agendamento já existente
    const conflict = dayAppointments.find(a => {
      const appStart = timeToMinutes(a.startTime);
      const appEnd = timeToMinutes(a.endTime);
      // Há colisão se o novo intervalo [m, slotEndMin) sobrepõe [appStart, appEnd)
      return Math.max(m, appStart) < Math.min(slotEndMin, appEnd);
    });

    if (conflict) {
      slots.push({
        time: slotStart,
        endTime: slotEnd,
        available: false,
        reason: conflict.status === 'indisponivel' ? 'Indisponível' : 'Ocupado',
        conflictDetails: conflict.status === 'agendado' ? { service: conflict.serviceName } : null
      });
    } else {
      slots.push({
        time: slotStart,
        endTime: slotEnd,
        available: true,
        reason: 'Disponível'
      });
    }
  }

  res.json({
    date,
    professionalId,
    serviceDuration,
    slots
  });
});

app.post('/api/appointments', (req, res) => {
  const db = getDb();
  const { professionalId, clientId, clientName, clientPhone, serviceId, serviceName, date, startTime, notes, status } = req.body;

  let price = Number(req.body.price) || 0;
  let duration = 30;

  // Busca serviço para validar duração e preço exatos
  if (serviceId) {
    const serv = db.services.find(s => s.id === serviceId);
    if (serv) {
      duration = Number(serv.durationMinutes) || 30;
      if (!price) price = Number(serv.price) || 0;
    }
  }

  const startMin = timeToMinutes(startTime);
  const endMin = req.body.endTime ? timeToMinutes(req.body.endTime) : (startMin + duration);
  const endTime = minutesToTime(endMin);

  // Validação de conflito no backend para garantir integridade
  const hasConflict = (db.appointments || []).some(a => {
    if (a.professionalId !== professionalId || a.date !== date || a.status === 'cancelado') return false;
    const aStart = timeToMinutes(a.startTime);
    const aEnd = timeToMinutes(a.endTime);
    return Math.max(startMin, aStart) < Math.min(endMin, aEnd);
  });

  if (hasConflict) {
    return res.status(409).json({ error: 'Horário indisponível ou em conflito com outro agendamento.' });
  }

  const newApp = {
    id: 'app_' + Date.now(),
    professionalId,
    clientId: clientId || null,
    clientName: clientName || 'Cliente sem nome',
    clientPhone: clientPhone || '',
    serviceId: serviceId || null,
    serviceName: serviceName || 'Atendimento Geral',
    date,
    startTime,
    endTime,
    price,
    status: status || 'agendado', // agendado, indisponivel, concluido, cancelado
    notes: notes || ''
  };

  db.appointments.push(newApp);

  // Se o cliente ainda não existir na base, já cadastra automaticamente
  if (clientName && clientPhone) {
    const existingClient = (db.clients || []).find(c => c.phone.replace(/\D/g, '') === clientPhone.replace(/\D/g, ''));
    if (!existingClient) {
      db.clients.push({
        id: 'cli_' + Date.now(),
        name: clientName,
        phone: clientPhone,
        birthday: '',
        status: 'ativo',
        balance: 0,
        notes: 'Cadastrado via Agendamento Online'
      });
    }
  }

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
