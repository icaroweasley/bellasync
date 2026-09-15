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

// Middleware para extrair tenantId das requisições autenticadas/painel
function getTenantId(req) {
  const headerTenant = req.headers['x-tenant-id'];
  if (headerTenant) return headerTenant;
  const queryTenant = req.query.tenantId;
  if (queryTenant) return queryTenant;
  return 'tenant_metamorfose';
}

// -------------------------------------------------------------
// AUTENTICAÇÃO E GESTÃO MULTI-TENANT
// -------------------------------------------------------------

// Registrar novo Salão (Tenant)
app.post('/api/auth/register-salon', (req, res) => {
  const db = getDb();
  const { salonName, slug, phone, address, adminName, adminEmail, adminPassword } = req.body;

  if (!salonName || !adminEmail || !adminPassword) {
    return res.status(400).json({ error: 'Nome do salão, email e senha são obrigatórios.' });
  }

  const cleanSlug = (slug || salonName)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_');

  if (db.tenants.some(t => t.slug === cleanSlug)) {
    return res.status(409).json({ error: 'Já existe um salão cadastrado com este identificador / slug.' });
  }

  const tenantId = 'tenant_' + Date.now();
  const newTenant = {
    id: tenantId,
    name: salonName,
    slug: cleanSlug,
    phone: phone || '',
    address: address || '',
    createdAt: new Date().toISOString().split('T')[0],
    settings: {
      intervalMinutes: 30,
      showPricesOnline: true,
      groupByCategory: true,
      theme: 'falcon'
    }
  };

  const userId = 'user_' + Date.now();
  const profId = 'prof_' + Date.now();

  const newAdminProf = {
    id: profId,
    tenantId: tenantId,
    name: adminName || 'Gestor Geral',
    role: 'Gestor Geral',
    phone: phone || '',
    email: adminEmail,
    access: 'Gestor',
    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(adminName || 'Gestor')}`,
    showInBooking: false,
    commissionDefault: 0,
    active: true
  };

  const newUser = {
    id: userId,
    tenantId: tenantId,
    professionalId: profId,
    name: adminName || 'Gestor Geral',
    email: adminEmail,
    password: adminPassword,
    role: 'admin'
  };

  db.tenants.push(newTenant);
  db.users.push(newUser);
  db.professionals.push(newAdminProf);

  saveDb(db);

  res.status(201).json({
    message: 'Salão cadastrado com sucesso!',
    tenant: newTenant,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      tenantId: tenantId,
      professionalId: profId
    }
  });
});

// Login (para administradores ou profissionais de qualquer salão)
app.post('/api/auth/login', (req, res) => {
  const db = getDb();
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }

  const user = (db.users || []).find(
    u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );

  if (!user) {
    return res.status(401).json({ error: 'Email ou senha incorretos.' });
  }

  const tenant = (db.tenants || []).find(t => t.id === user.tenantId) || {
    id: user.tenantId,
    name: 'Salão',
    slug: 'default'
  };

  res.json({
    token: 'token_' + user.id + '_' + Date.now(),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      professionalId: user.professionalId || null
    },
    tenant: tenant
  });
});

// Listar/Criar Usuários do Salão (Para Gestores criarem logins para seus profissionais)
app.get('/api/users', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const users = (db.users || []).filter(u => u.tenantId === tenantId).map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    tenantId: u.tenantId,
    professionalId: u.professionalId
  }));
  res.json(users);
});

app.post('/api/users', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const { name, email, password, role, professionalId } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, email e senha são obrigatórios.' });
  }

  if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'Este email já está cadastrado no sistema.' });
  }

  const newUser = {
    id: 'user_' + Date.now(),
    tenantId,
    name,
    email,
    password,
    role: role || 'professional',
    professionalId: professionalId || null
  };

  db.users.push(newUser);
  saveDb(db);

  res.status(201).json({
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    role: newUser.role,
    tenantId: newUser.tenantId,
    professionalId: newUser.professionalId
  });
});

// Endpoint Público para buscar dados do salão pelo SLUG (usado na página de agendamento online)
app.get('/api/public/salon/:slug', (req, res) => {
  const db = getDb();
  const slug = req.params.slug;
  const tenant = (db.tenants || []).find(t => t.slug === slug || t.id === slug) || db.tenants[0];

  if (!tenant) {
    return res.status(404).json({ error: 'Salão não encontrado.' });
  }

  const professionals = (db.professionals || [])
    .filter(p => p.tenantId === tenant.id && p.active && p.showInBooking)
    .map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      avatar: p.avatar
    }));

  const services = (db.services || []).filter(s => s.tenantId === tenant.id);

  res.json({
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      phone: tenant.phone,
      address: tenant.address,
      settings: tenant.settings
    },
    professionals,
    services
  });
});

// -------------------------------------------------------------
// ENDPOINTS DO CRM POR TENANT
// -------------------------------------------------------------

// 1. Configurações
app.get('/api/settings', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const tenant = (db.tenants || []).find(t => t.id === tenantId) || db.tenants[0];
  res.json({
    salonName: tenant.name,
    slug: tenant.slug,
    phone: tenant.phone,
    address: tenant.address,
    ...(tenant.settings || {})
  });
});

app.put('/api/settings', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const tenant = (db.tenants || []).find(t => t.id === tenantId);
  if (tenant) {
    if (req.body.salonName) tenant.name = req.body.salonName;
    if (req.body.phone) tenant.phone = req.body.phone;
    if (req.body.address) tenant.address = req.body.address;
    tenant.settings = { ...tenant.settings, ...req.body };
    saveDb(db);
    res.json({
      salonName: tenant.name,
      slug: tenant.slug,
      phone: tenant.phone,
      address: tenant.address,
      ...tenant.settings
    });
  } else {
    res.status(404).json({ error: 'Salão não encontrado' });
  }
});

// 2. Profissionais
app.get('/api/professionals', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const list = (db.professionals || []).filter(p => p.tenantId === tenantId);
  res.json(list);
});

app.post('/api/professionals', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const newProf = {
    id: 'prof_' + Date.now(),
    tenantId: tenantId,
    name: req.body.name,
    role: req.body.role || 'Profissional',
    phone: req.body.phone || '',
    email: req.body.email || '',
    access: req.body.access || 'Profissional de Servicos',
    avatar: req.body.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(req.body.name)}`,
    showInBooking: req.body.showInBooking ?? true,
    commissionDefault: Number(req.body.commissionDefault) || 50,
    active: true
  };
  db.professionals.push(newProf);

  // Se senha foi enviada, já cria o usuário correspondente
  if (req.body.email && req.body.password) {
    db.users.push({
      id: 'user_' + Date.now(),
      tenantId: tenantId,
      professionalId: newProf.id,
      name: newProf.name,
      email: newProf.email,
      password: req.body.password,
      role: newProf.access === 'Gestor' ? 'admin' : 'professional'
    });
  }

  saveDb(db);
  res.status(201).json(newProf);
});

// 3. Serviços
app.get('/api/services', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const list = (db.services || []).filter(s => s.tenantId === tenantId);
  res.json(list);
});

app.post('/api/services', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const newServ = {
    id: 'serv_' + Date.now(),
    tenantId: tenantId,
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
  const tenantId = getTenantId(req);
  const list = (db.clients || []).filter(c => c.tenantId === tenantId);
  res.json(list);
});

app.post('/api/clients', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const newCli = {
    id: 'cli_' + Date.now(),
    tenantId: tenantId,
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
  const tenantId = getTenantId(req);
  const { date, professionalId } = req.query;
  let list = (db.appointments || []).filter(a => a.tenantId === tenantId);
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
  const tenantId = getTenantId(req);
  const { date, professionalId, serviceId } = req.query;

  if (!date || !professionalId) {
    return res.status(400).json({ error: 'date e professionalId são obrigatórios' });
  }

  const tenant = (db.tenants || []).find(t => t.id === tenantId) || db.tenants[0];

  // Duração do serviço solicitado (padrão 30 min se não fornecido)
  let serviceDuration = 30;
  if (serviceId) {
    const serv = (db.services || []).find(s => s.id === serviceId && s.tenantId === tenantId);
    if (serv && serv.durationMinutes) {
      serviceDuration = Number(serv.durationMinutes);
    }
  }

  const interval = Number(tenant?.settings?.intervalMinutes || db.settings.intervalMinutes) || 30;
  const startDayMin = 8 * 60;   // 08:00
  const endDayMin = 19 * 60;    // 19:00

  // Agendamentos existentes do profissional nessa data
  const dayAppointments = (db.appointments || []).filter(
    a => a.tenantId === tenantId && a.professionalId === professionalId && a.date === date && a.status !== 'cancelado'
  );

  // Obter data e hora atual no fuso horário do Mato Grosso do Sul (America/Campo_Grande)
  const nowMs = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Campo_Grande' }));
  const todayMsStr = `${nowMs.getFullYear()}-${String(nowMs.getMonth() + 1).padStart(2, '0')}-${String(nowMs.getDate()).padStart(2, '0')}`;
  const currentMinutesMs = nowMs.getHours() * 60 + nowMs.getMinutes();

  const isToday = (date === todayMsStr);

  const slots = [];
  for (let m = startDayMin; m + interval <= endDayMin; m += interval) {
    const slotStart = minutesToTime(m);
    const slotEnd = minutesToTime(m + serviceDuration);
    const slotEndMin = m + serviceDuration;

    // Se a data selecionada é hoje e o horário de início já passou
    if (isToday && m < currentMinutesMs) {
      slots.push({
        time: slotStart,
        endTime: slotEnd,
        available: false,
        reason: 'Horário já passou'
      });
      continue;
    }

    // Se o serviço ultrapassa o horário de funcionamento do salão
    if (slotEndMin > endDayMin) {
      slots.push({
        time: slotStart,
        endTime: slotEnd,
        available: false,
        reason: 'Fora do expediente'
      });
      continue;
    }

    // Verificar se o intervalo completo [m, slotEndMin] colide com algum agendamento existente
    const conflict = dayAppointments.find(a => {
      const aStart = timeToMinutes(a.startTime);
      const aEnd = timeToMinutes(a.endTime);
      return Math.max(m, aStart) < Math.min(slotEndMin, aEnd);
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
    serverTimeMS: `${String(nowMs.getHours()).padStart(2, '0')}:${String(nowMs.getMinutes()).padStart(2, '0')}`,
    slots
  });
});

app.post('/api/appointments', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const { professionalId, clientId, clientName, clientPhone, serviceId, serviceName, date, startTime, notes, status } = req.body;

  let price = Number(req.body.price) || 0;
  let duration = 30;

  // Busca serviço para validar duração e preço exatos
  if (serviceId) {
    const serv = (db.services || []).find(s => s.id === serviceId && s.tenantId === tenantId);
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
    if (a.tenantId !== tenantId || a.professionalId !== professionalId || a.date !== date || a.status === 'cancelado') return false;
    const aStart = timeToMinutes(a.startTime);
    const aEnd = timeToMinutes(a.endTime);
    return Math.max(startMin, aStart) < Math.min(endMin, aEnd);
  });

  if (hasConflict) {
    return res.status(409).json({ error: 'Horário indisponível ou em conflito com outro agendamento.' });
  }

  const newApp = {
    id: 'app_' + Date.now(),
    tenantId: tenantId,
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

  // Se o cliente ainda não existir na base do salão, já cadastra automaticamente
  if (clientName && clientPhone) {
    const existingClient = (db.clients || []).find(
      c => c.tenantId === tenantId && c.phone.replace(/\D/g, '') === clientPhone.replace(/\D/g, '')
    );
    if (!existingClient) {
      db.clients.push({
        id: 'cli_' + Date.now(),
        tenantId: tenantId,
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

// Excluir / Cancelar Agendamento
app.delete('/api/appointments/:id', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const idx = (db.appointments || []).findIndex(a => a.id === req.params.id && a.tenantId === tenantId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Agendamento não encontrado.' });
  }
  const removed = db.appointments.splice(idx, 1)[0];
  saveDb(db);
  res.json({ message: 'Agendamento removido com sucesso.', removed });
});

// 6. Produtos
app.get('/api/products', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  res.json((db.products || []).filter(p => p.tenantId === tenantId));
});

app.post('/api/products', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const newProd = {
    id: 'prod_' + Date.now(),
    tenantId: tenantId,
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
  const tenantId = getTenantId(req);
  const { monthYear } = req.query;
  let list = (db.expenses || []).filter(e => e.tenantId === tenantId);
  if (monthYear) {
    list = list.filter(e => e.monthYear === monthYear);
  }
  res.json(list);
});

app.post('/api/expenses', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const dueDate = req.body.dueDate || new Date().toISOString().split('T')[0];
  const newExp = {
    id: 'exp_' + Date.now(),
    tenantId: tenantId,
    description: req.body.description,
    category: req.body.category || 'Geral',
    paymentType: req.body.paymentType || 'Pix',
    amount: Number(req.body.amount) || 0,
    dueDate: dueDate,
    status: req.body.status || 'pendente',
    monthYear: dueDate.substring(0, 7)
  };
  db.expenses.push(newExp);
  saveDb(db);
  res.status(201).json(newExp);
});

// 8. Comissões
app.get('/api/commissions', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  res.json((db.commissions || []).filter(c => c.tenantId === tenantId));
});

app.post('/api/commissions/pay/:id', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const item = (db.commissions || []).find(c => c.id === req.params.id && c.tenantId === tenantId);
  if (item) {
    item.status = 'paga';
    item.paymentDate = new Date().toISOString().split('T')[0];
    saveDb(db);
    res.json(item);
  } else {
    res.status(404).json({ error: 'Comissão não encontrada' });
  }
});

// Rota fallback para agendamento online público ou admin
app.get('/agendar', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/agendar.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[CRM Salon Soft Multi-Tenant] Servidor rodando na porta ${PORT}`);
  console.log(`- Painel: http://localhost:${PORT}`);
  console.log(`- Login: http://localhost:${PORT}/login`);
  console.log(`- Agendamento: http://localhost:${PORT}/agendar`);
});
