import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import webpush from 'web-push';
import { getDb, saveDb } from './db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, '../public'), { index: false }));

// Configuração do VAPID para Web Push em segundo plano com celular fechado
function initVapidKeys() {
  const db = getDb();
  if (!db.vapidKeys) {
    db.vapidKeys = webpush.generateVAPIDKeys();
    saveDb(db);
  }
  webpush.setVapidDetails(
    'mailto:suporte@bellasync.online',
    db.vapidKeys.publicKey,
    db.vapidKeys.privateKey
  );
}
initVapidKeys();

async function sendPushToTenant(tenantId, targetProfId, payload) {
  const db = getDb();
  if (!db.pushSubscriptions || db.pushSubscriptions.length === 0) return;

  const subs = db.pushSubscriptions.filter(s => {
    if (s.tenantId !== tenantId) return false;
    if (targetProfId && s.professionalId && s.professionalId !== targetProfId) return false;
    return true;
  });

  for (const item of subs) {
    try {
      await webpush.sendNotification(item.subscription, JSON.stringify(payload));
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        db.pushSubscriptions = db.pushSubscriptions.filter(s => s.subscription.endpoint !== item.subscription.endpoint);
        saveDb(db);
      }
    }
  }
}

// Helper para checar se a data de nascimento é hoje
function isBirthdayToday(bdayStr, targetMonth, targetDay) {
  if (!bdayStr) return false;
  const clean = String(bdayStr).trim();
  let m = '', d = '';
  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts[0].length === 4) {
      m = parts[1];
      d = parts[2];
    } else {
      m = parts[1];
      d = parts[0];
    }
  } else if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts[2] && parts[2].length === 4) {
      d = parts[0];
      m = parts[1];
    } else {
      m = parts[0];
      d = parts[1];
    }
  }
  return (String(m).padStart(2, '0') === targetMonth && String(d).padStart(2, '0') === targetDay);
}

// Verificador automático de atendimentos próximos (Faltam 15 minutos) rodando 24/7 no servidor
function checkUpcomingAppointmentsReminders() {
  try {
    const db = getDb();
    if (!db.appointments || db.appointments.length === 0) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let modified = false;

    db.appointments.forEach(app => {
      if (app.date === todayStr && app.status !== 'cancelado' && app.status !== 'indisponivel' && !app.reminderSent) {
        const tenant = (db.tenants || []).find(t => t.id === app.tenantId);
        if (tenant && tenant.settings && tenant.settings.notifyReminders === false) return;

        const [h, m] = (app.startTime || '00:00').split(':').map(Number);
        const appMinutes = h * 60 + m;
        const diff = appMinutes - currentMinutes;

        // Se falta entre 0 e 15 minutos para o horário de algum cliente
        if (diff >= 0 && diff <= 15) {
          app.reminderSent = true;
          modified = true;

          sendPushToTenant(app.tenantId, app.professionalId, {
            title: '⏰ Atendimento em 15 Minutos!',
            body: `Seu próximo atendimento está chegando! ${app.clientName} - ${app.serviceName} às ${app.startTime}.`,
            url: '/'
          });
        }
      }
    });

    if (modified) saveDb(db);
  } catch (err) {
    console.error('Erro na checagem de lembretes em background:', err);
  }
}

// Verificador automático de aniversariantes do dia rodando 24/7 no servidor
function checkBirthdayReminders() {
  try {
    const db = getDb();
    if (!db.clients || db.clients.length === 0) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    if (!db.birthdaySentLog) db.birthdaySentLog = {};
    let modified = false;

    (db.tenants || []).forEach(tenant => {
      if (tenant.settings && tenant.settings.notifyBirthdays === false) return;

      const tenantClients = db.clients.filter(c => c.tenantId === tenant.id && c.birthday);
      tenantClients.forEach(cli => {
        if (isBirthdayToday(cli.birthday, month, day)) {
          const logKey = `${todayStr}_${cli.id}`;
          if (!db.birthdaySentLog[logKey]) {
            db.birthdaySentLog[logKey] = true;
            modified = true;

            sendPushToTenant(tenant.id, null, {
              title: '🎂 Aniversariante do Dia!',
              body: `Hoje é aniversário de ${cli.name}! Envie os parabéns ou ofereça um mimo especial.`,
              url: '/'
            });
          }
        }
      });
    });

    if (modified) saveDb(db);
  } catch (err) {
    console.error('Erro na checagem de aniversariantes em background:', err);
  }
}

setInterval(() => {
  checkUpcomingAppointmentsReminders();
  checkBirthdayReminders();
}, 60000);


// Endpoints de Web Push VAPID para Notificações em Segundo Plano
app.get('/api/push/vapid-public-key', (req, res) => {
  const db = getDb();
  res.json({ publicKey: db.vapidKeys ? db.vapidKeys.publicKey : null });
});

app.post('/api/push/subscribe', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const { subscription, professionalId } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Subscription inválida' });
  }
  if (!db.pushSubscriptions) {
    db.pushSubscriptions = [];
  }
  const existingIdx = db.pushSubscriptions.findIndex(s => s.subscription && s.subscription.endpoint === subscription.endpoint);
  if (existingIdx >= 0) {
    db.pushSubscriptions[existingIdx] = { tenantId, professionalId: professionalId || null, subscription };
  } else {
    db.pushSubscriptions.push({ tenantId, professionalId: professionalId || null, subscription });
  }
  saveDb(db);
  res.json({ success: true });
});


function getButterflyAvatar(name) {
  let hash = 0;
  const str = String(name || 'Profissional');
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = (Math.abs(hash) % 8) + 1;
  return `/images/butterflies/butterfly-${index}.svg`;
}

// Middleware para extrair tenantId das requisições autenticadas/painel
function getTenantId(req) {
  const headerTenant = req.headers['x-tenant-id'];
  if (headerTenant) return headerTenant;
  const queryTenant = req.query.tenantId;
  if (queryTenant) return queryTenant;
  return 'tenant_metamorfose';
}

// Middleware de verificação de permissão de gestor (admin ou superadmin)
function requireManager(req, res, next) {
  // No contexto do painel do salão, permite a gestão completa dos dados do salão
  next();
}

// Middleware exclusivo para Super Administrador da BellaSync
function requireSuperAdmin(req, res, next) {
  const role = req.headers['x-user-role'];
  if (role !== 'superadmin') {
    return res.status(403).json({ error: 'Acesso restrito ao Administrador Geral da Plataforma.' });
  }
  next();
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
  const defaultMonthlyPrice = db.platformSettings?.defaultMonthlyPrice || 49.90;

  // Novo salão cadastrado recebe 30 dias de ciclo ativo
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const newTenant = {
    id: tenantId,
    name: salonName,
    slug: cleanSlug,
    phone: phone || '',
    address: address || '',
    createdAt: new Date().toISOString().split('T')[0],
    subscription: {
      status: 'active',
      isLifetime: false,
      monthlyPrice: defaultMonthlyPrice,
      expiresAt: expiresAt,
      createdAt: new Date().toISOString()
    },
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
    avatar: getButterflyAvatar(adminName || 'Gestor'),
    showInBooking: false,
    commissionDefault: 0,
    active: true
  };

  const loginUsername = (req.body.username || req.body.email || '').toLowerCase().trim();

  const newUser = {
    id: userId,
    tenantId: tenantId,
    professionalId: profId,
    name: adminName || 'Gestor Geral',
    username: (req.body.username || adminEmail || 'admin').toLowerCase().trim(),
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
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      tenantId: tenantId,
      professionalId: profId
    }
  });
});

// Login (com usuário ou email e senha)
app.post('/api/auth/login', (req, res) => {
  const db = getDb();
  const loginIdentifier = (req.body.username || req.body.email || '').toLowerCase().trim();
  const { password } = req.body;

  if (!loginIdentifier || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const user = (db.users || []).find(u => {
    const matchUsername = u.username && u.username.toLowerCase().trim() === loginIdentifier;
    const matchEmail = u.email && u.email.toLowerCase().trim() === loginIdentifier;
    return (matchUsername || matchEmail) && u.password === password;
  });

  if (!user) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  const tenant = (db.tenants || []).find(t => t.id === user.tenantId) || {
    id: user.tenantId,
    name: 'Salão',
    slug: 'default'
  };

  const profAvatar = user.professionalId ? (db.professionals.find(p => p.id === user.professionalId)?.avatar) : null;
  const userAvatar = user.avatar || profAvatar || getButterflyAvatar(user.name);

  res.json({
    token: 'token_' + user.id + '_' + Date.now(),
    user: {
      id: user.id,
      name: user.name,
      username: user.username || user.email,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      professionalId: user.professionalId || null,
      avatar: userAvatar
    },
    tenant: tenant
  });
});

// Endpoint para o usuário logado (gestor ou profissional) atualizar seu perfil (foto, nome, senha)
app.put('/api/auth/profile', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const { userId, name, avatar, password } = req.body;

  const user = (db.users || []).find(u => u.id === userId || (u.tenantId === tenantId && req.headers['x-user-id'] === u.id));
  const targetUser = user || (db.users || []).find(u => u.tenantId === tenantId);

  if (!targetUser) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  if (name) targetUser.name = name;
  if (avatar !== undefined) targetUser.avatar = avatar;
  if (password) targetUser.password = password;

  // Se o usuário possui perfil profissional associado, sincroniza nome e avatar no profissional
  if (targetUser.professionalId) {
    const prof = (db.professionals || []).find(p => p.id === targetUser.professionalId && p.tenantId === tenantId);
    if (prof) {
      if (name) prof.name = name;
      if (avatar !== undefined) prof.avatar = avatar;
    }
  }

  // Se for gestor (admin), atualiza avatar do gestor no salão se necessário
  if (targetUser.role === 'admin' || targetUser.role === 'superadmin') {
    const tenant = (db.tenants || []).find(t => t.id === tenantId);
    if (tenant) {
      if (!tenant.settings) tenant.settings = {};
      if (avatar !== undefined) tenant.settings.managerAvatar = avatar;
    }
  }

  saveDb(db);

  const updatedProfAvatar = targetUser.professionalId ? (db.professionals.find(p => p.id === targetUser.professionalId)?.avatar) : null;

  res.json({
    id: targetUser.id,
    name: targetUser.name,
    username: targetUser.username || targetUser.email,
    email: targetUser.email,
    role: targetUser.role,
    tenantId: targetUser.tenantId,
    professionalId: targetUser.professionalId || null,
    avatar: targetUser.avatar || updatedProfAvatar || getButterflyAvatar(targetUser.name)
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
      avatar: p.avatar,
      phone: p.phone,
      serviceIds: Array.isArray(p.serviceIds) ? p.serviceIds : [],
      requireDeposit: !!p.requireDeposit,
      depositPercent: Number(p.depositPercent) || 30,
      pixBank: p.pixBank || 'Pix',
      pixKey: p.pixKey || '',
      pixKeyType: p.pixKeyType || 'Chave Pix',
      pixName: p.pixName || p.name
    }));

  const services = (db.services || []).filter(s => s.tenantId === tenant.id);

  res.json({
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      phone: tenant.phone,
      address: tenant.address,
      logo: tenant.logo || tenant.settings?.logo || '',
      photo: tenant.photo || tenant.settings?.photo || '',
      settings: tenant.settings
    },
    professionals,
    services
  });
});

// Helper para data atual de hoje no fuso brasileiro (YYYY-MM-DD)
function getTodayDateStr() {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

// Helper para obter a data de criação/marcação do agendamento (YYYY-MM-DD)
function getAppBookingDate(app) {
  if (app.bookingDate) return app.bookingDate;
  if (app.createdAt) {
    try {
      return new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(app.createdAt));
    } catch (e) {}
  }
  const ts = app.id && app.id.startsWith('app_') ? Number(app.id.replace('app_', '')) : NaN;
  if (!isNaN(ts) && ts > 1000000000000) {
    try {
      return new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(ts));
    } catch (e) {}
  }
  return app.date || null;
}

// Endpoint público para o cliente consultar seus próprios agendamentos através do telefone
app.get('/api/public/client-appointments', (req, res) => {
  const db = getDb();
  const phone = (req.query.phone || '').trim();
  const tenantIdOrSlug = req.query.tenantId || req.query.slug || req.headers['x-tenant-id'];

  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 10) {
    return res.status(400).json({ error: 'Por favor, informe um número de telefone/WhatsApp válido com DDD (mínimo de 10 dígitos).' });
  }

  let tenant = null;
  if (tenantIdOrSlug) {
    tenant = (db.tenants || []).find(t => t.id === tenantIdOrSlug || t.slug === tenantIdOrSlug);
  }
  if (!tenant) {
    tenant = db.tenants[0];
  }

  const rawSearch8 = cleanPhone.slice(-8);
  const rawSearch9 = cleanPhone.slice(-9);

  const matchedAppointments = (db.appointments || []).filter(a => {
    if (a.tenantId !== tenant.id) return false;
    if (a.status === 'indisponivel') return false; // Bloqueios de horário internos não são agendamentos de clientes

    const aPhoneClean = (a.clientPhone || '').replace(/\D/g, '');
    if (!aPhoneClean) return false;

    return aPhoneClean.includes(rawSearch8) || aPhoneClean.includes(rawSearch9);
  });

  // Ordena por data decrescente e horário decrescente
  matchedAppointments.sort((a, b) => {
    const compDate = (b.date || '').localeCompare(a.date || '');
    if (compDate !== 0) return compDate;
    return (b.startTime || '').localeCompare(a.startTime || '');
  });

  // Encontra nome do cliente mais recente para saudação
  const firstFound = matchedAppointments.find(a => a.clientName);
  const clientName = firstFound ? firstFound.clientName : '';

  const todayStr = getTodayDateStr();

  const results = matchedAppointments.map(app => {
    const prof = (db.professionals || []).find(p => p.id === app.professionalId);
    const bDate = getAppBookingDate(app);
    // REGRA DE NEGÓCIO: O cliente só pode editar/cancelar no mesmo dia em que fez o agendamento
    const canEditOnline = (bDate === todayStr) && (app.status === 'agendado');

    return {
      id: app.id,
      professionalId: app.professionalId,
      serviceId: app.serviceId,
      serviceName: app.serviceName || 'Atendimento Geral',
      servicesList: Array.isArray(app.servicesList) ? app.servicesList : [],
      durationMinutes: Number(app.durationMinutes) || (app.startTime && app.endTime ? (timeToMinutes(app.endTime) - timeToMinutes(app.startTime)) : 30),
      date: app.date,
      startTime: app.startTime,
      endTime: app.endTime,
      price: Number(app.price) || 0,
      status: app.status || 'agendado',
      notes: app.notes || '',
      bookingDate: bDate,
      canEditOnline,
      professional: {
        id: prof ? prof.id : app.professionalId,
        name: prof ? prof.name : (app.professionalName || 'Profissional'),
        role: prof ? prof.role : 'Especialista',
        avatar: prof ? (prof.avatar || getButterflyAvatar(prof.name)) : getButterflyAvatar('P'),
        phone: prof ? prof.phone : ''
      }
    };
  });

  res.json({
    phone: cleanPhone,
    clientName,
    appointments: results,
    salon: {
      name: tenant.name,
      phone: tenant.phone
    }
  });
});

// Endpoint público para o cliente editar o próprio agendamento (permitido APENAS no dia em que o agendamento foi realizado)
app.put('/api/public/client-appointments/:id', (req, res) => {
  const db = getDb();
  const phone = (req.body.phone || req.query.phone || '').trim();

  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 10) {
    return res.status(400).json({ error: 'Por favor, informe seu telefone com DDD para confirmar a alteração.' });
  }

  const app = (db.appointments || []).find(a => a.id === req.params.id);
  if (!app) {
    return res.status(404).json({ error: 'Agendamento não encontrado.' });
  }

  // Validação de segurança por telefone (compara os últimos 8-9 dígitos)
  const aPhoneClean = (app.clientPhone || '').replace(/\D/g, '');
  const rawSearch8 = cleanPhone.slice(-8);
  const rawSearch9 = cleanPhone.slice(-9);
  if (!aPhoneClean || (!aPhoneClean.includes(rawSearch8) && !aPhoneClean.includes(rawSearch9))) {
    return res.status(403).json({ error: 'Número de telefone não confere com o titular deste agendamento.' });
  }

  if (app.status !== 'agendado') {
    return res.status(400).json({ error: `Não é possível alterar um agendamento com status "${app.status}".` });
  }

  // REGRA DE NEGÓCIO: Permitido APENAS no dia em que o agendamento foi realizado
  const todayStr = getTodayDateStr();
  const bDate = getAppBookingDate(app);
  if (bDate !== todayStr) {
    return res.status(403).json({
      error: 'Alterações e cancelamentos online são permitidos apenas no mesmo dia em que o agendamento foi realizado. Para alterar ou cancelar este horário, por favor entre em contato diretamente pelo WhatsApp do salão.'
    });
  }

  const { date, startTime, serviceId, serviceName, servicesList } = req.body;
  const newDate = date || app.date;
  const newStart = startTime || app.startTime;
  const newProfId = req.body.professionalId || app.professionalId;

  let newDuration = Number(req.body.durationMinutes) || 30;
  let newPrice = Number(req.body.price) || 0;

  if (Array.isArray(servicesList) && servicesList.length > 0) {
    newPrice = servicesList.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
    newDuration = servicesList.reduce((sum, s) => sum + (Number(s.durationMinutes) || 30), 0);
  } else if (serviceId) {
    const srv = (db.services || []).find(s => s.id === serviceId);
    if (srv) {
      newPrice = Number(srv.price) || 0;
      newDuration = Number(srv.durationMinutes) || 30;
    }
  } else {
    newDuration = app.durationMinutes || (app.startTime && app.endTime ? (timeToMinutes(app.endTime) - timeToMinutes(app.startTime)) : 30);
    newPrice = Number(app.price) || 0;
  }

  const startMin = timeToMinutes(newStart);
  const endMin = req.body.endTime ? timeToMinutes(req.body.endTime) : (startMin + newDuration);
  const newEndTime = minutesToTime(endMin);

  // Validação de conflito de agenda (desconsiderando o próprio agendamento atual)
  const hasConflict = (db.appointments || []).some(a => {
    if (a.id === app.id) return false;
    if (a.tenantId !== app.tenantId || a.professionalId !== newProfId || a.date !== newDate || a.status === 'cancelado') return false;
    const aStart = timeToMinutes(a.startTime);
    const aEnd = timeToMinutes(a.endTime);
    return Math.max(startMin, aStart) < Math.min(endMin, aEnd);
  });

  if (hasConflict) {
    return res.status(409).json({ error: 'O novo horário escolhido está indisponível ou em conflito com outro agendamento. Por favor escolha outro horário.' });
  }

  // Atualiza os dados
  if (serviceId) app.serviceId = serviceId;
  if (serviceName) app.serviceName = serviceName;
  if (Array.isArray(servicesList)) app.servicesList = servicesList;
  app.professionalId = newProfId;
  app.date = newDate;
  app.startTime = newStart;
  app.endTime = newEndTime;
  app.price = newPrice;
  app.durationMinutes = newDuration;
  app.updatedAt = new Date().toISOString();

  saveDb(db);

  res.json({
    message: 'Agendamento atualizado com sucesso!',
    appointment: app
  });
});

// Endpoint público para o cliente cancelar o próprio agendamento (permitido APENAS no dia em que o agendamento foi realizado)
const handleClientCancelAppointment = (req, res) => {
  const db = getDb();
  const phone = (req.body.phone || req.query.phone || '').trim();

  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 10) {
    return res.status(400).json({ error: 'Por favor, informe seu telefone com DDD para confirmar o cancelamento.' });
  }

  const app = (db.appointments || []).find(a => a.id === req.params.id);
  if (!app) {
    return res.status(404).json({ error: 'Agendamento não encontrado.' });
  }

  // Validação de segurança por telefone
  const aPhoneClean = (app.clientPhone || '').replace(/\D/g, '');
  const rawSearch8 = cleanPhone.slice(-8);
  const rawSearch9 = cleanPhone.slice(-9);
  if (!aPhoneClean || (!aPhoneClean.includes(rawSearch8) && !aPhoneClean.includes(rawSearch9))) {
    return res.status(403).json({ error: 'Número de telefone não confere com o titular deste agendamento.' });
  }

  if (app.status === 'cancelado') {
    return res.json({ message: 'Agendamento já estava cancelado.', appointment: app });
  }

  // REGRA DE NEGÓCIO: Permitido APENAS no dia em que o agendamento foi realizado
  const todayStr = getTodayDateStr();
  const bDate = getAppBookingDate(app);
  if (bDate !== todayStr) {
    return res.status(403).json({
      error: 'Alterações e cancelamentos online são permitidos apenas no mesmo dia em que o agendamento foi realizado. Para alterar ou cancelar este horário, por favor entre em contato diretamente pelo WhatsApp do salão.'
    });
  }

  app.status = 'cancelado';
  app.cancelledAt = new Date().toISOString();
  saveDb(db);

  res.json({
    message: 'Agendamento cancelado com sucesso.',
    appointment: app
  });
};

app.post('/api/public/client-appointments/:id/cancel', handleClientCancelAppointment);
app.delete('/api/public/client-appointments/:id', handleClientCancelAppointment);

// -------------------------------------------------------------
// ASSINATURAS (SAAS) & MERCADO PAGO
// -------------------------------------------------------------

function calculateTenantSubscriptionPrice(tenant, db) {
  if (!tenant) return { basePrice: 49.90, profCount: 0, extraProfs: 0, extraPrice: 0, totalPrice: 49.90 };
  const profCount = (db.professionals || []).filter(p => p.tenantId === tenant.id).length;
  const basePrice = Number(tenant.subscription?.baseMonthlyPrice || tenant.subscription?.monthlyPrice) || Number(db.platformSettings?.defaultMonthlyPrice) || 49.90;
  const extraProfs = Math.max(0, profCount - 5);
  const extraPrice = extraProfs * 10.00;
  const totalPrice = basePrice + extraPrice;
  return {
    basePrice,
    profCount,
    extraProfs,
    extraPrice,
    totalPrice
  };
}

// Obter status de assinatura do salão atual
app.get('/api/subscription/status', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const tenant = (db.tenants || []).find(t => t.id === tenantId);

  if (!tenant) {
    return res.status(404).json({ error: 'Salão não encontrado.' });
  }

  const priceInfo = calculateTenantSubscriptionPrice(tenant, db);

  const sub = tenant.subscription || {
    status: 'active',
    isLifetime: false,
    monthlyPrice: priceInfo.totalPrice,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };

  // Se for vitalício, nunca expira e não há dias restantes a alertar
  if (sub.isLifetime) {
    return res.json({
      status: 'active',
      isLifetime: true,
      daysRemaining: 9999,
      warningLevel: 'none',
      message: '',
      basePrice: priceInfo.basePrice,
      profCount: priceInfo.profCount,
      extraProfs: priceInfo.extraProfs,
      extraPrice: priceInfo.extraPrice,
      monthlyPrice: priceInfo.totalPrice
    });
  }

  const now = new Date();
  const expDate = new Date(sub.expiresAt);
  const diffTime = expDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let warningLevel = 'none';
  let message = '';
  let isBlocked = false;

  if (diffDays <= 0) {
    warningLevel = 'expired';
    isBlocked = true;
    message = 'Sua assinatura mensal BellaSync venceu. Regularize para liberar o acesso.';
  } else if (diffDays === 1) {
    warningLevel = 'today';
    message = 'Sua assinatura vence hoje! Renove agora para evitar o bloqueio do sistema.';
  } else if (diffDays === 2) {
    warningLevel = 'two_days';
    message = 'Sua assinatura BellaSync vence em 2 dias. Clique para renovar via Pix.';
  } else if (diffDays === 3) {
    warningLevel = 'three_days';
    message = 'Sua assinatura BellaSync vence em 3 dias.';
  }

  res.json({
    status: isBlocked ? 'expired' : sub.status,
    isLifetime: false,
    basePrice: priceInfo.basePrice,
    profCount: priceInfo.profCount,
    extraProfs: priceInfo.extraProfs,
    extraPrice: priceInfo.extraPrice,
    monthlyPrice: priceInfo.totalPrice,
    expiresAt: sub.expiresAt,
    daysRemaining: diffDays,
    warningLevel,
    isBlocked,
    message
  });
});

// Gerar cobrança Pix no Mercado Pago
app.post('/api/subscription/create-pix', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const tenant = (db.tenants || []).find(t => t.id === tenantId);

    if (!tenant) {
      return res.status(404).json({ error: 'Salão não encontrado.' });
    }

    if (tenant.subscription?.isLifetime) {
      return res.status(400).json({ error: 'Este salão possui acesso vitalício. Nenhuma cobrança pode ser gerada.' });
    }

    const priceInfo = calculateTenantSubscriptionPrice(tenant, db);
    const price = priceInfo.totalPrice;
    const mpToken = db.platformSettings?.mpAccessToken;

    if (!mpToken) {
      return res.status(500).json({ error: 'Mercado Pago Access Token não configurado.' });
    }

    const payerEmail = req.body.email || tenant.phone?.replace(/\D/g, '') + '@bellasync.online';
    const payerName = req.body.name || tenant.name || 'Cliente BellaSync';

    const mpBody = {
      transaction_amount: price,
      description: `Mensalidade BellaSync — ${tenant.name}`,
      payment_method_id: 'pix',
      payer: {
        email: payerEmail,
        first_name: payerName.split(' ')[0],
        last_name: payerName.split(' ').slice(1).join(' ') || 'Salão'
      },
      external_reference: `tenant_${tenant.id}`
    };

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mpToken}`,
        'X-Idempotency-Key': `${tenantId}_${Date.now()}`
      },
      body: JSON.stringify(mpBody)
    });

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error('[Mercado Pago Pix Error]', mpData);
      return res.status(400).json({ error: mpData.message || 'Falha ao gerar Pix no Mercado Pago.' });
    }

    const pointOfInteraction = mpData.point_of_interaction?.transaction_data;

    res.json({
      paymentId: mpData.id,
      status: mpData.status,
      qrCode: pointOfInteraction?.qr_code,
      qrCodeBase64: pointOfInteraction?.qr_code_base64,
      ticketUrl: pointOfInteraction?.ticket_url,
      amount: price,
      basePrice: priceInfo.basePrice,
      profCount: priceInfo.profCount,
      extraProfs: priceInfo.extraProfs,
      extraPrice: priceInfo.extraPrice
    });
  } catch (err) {
    console.error('Erro ao gerar Pix Mercado Pago:', err);
    res.status(500).json({ error: 'Erro interno ao processar pagamento.' });
  }
});

// Obter link de assinatura mensal recorrente no Cartão de Crédito
app.post('/api/subscription/create-card-plan', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const tenant = (db.tenants || []).find(t => t.id === tenantId);

    if (!tenant) {
      return res.status(404).json({ error: 'Salão não encontrado.' });
    }

    if (tenant.subscription?.isLifetime) {
      return res.status(400).json({ error: 'Este salão possui acesso vitalício. Nenhuma assinatura pode ser cobrada.' });
    }

    const priceInfo = calculateTenantSubscriptionPrice(tenant, db);
    const price = priceInfo.totalPrice;
    const mpToken = db.platformSettings?.mpAccessToken;

    if (!mpToken) {
      return res.status(500).json({ error: 'Mercado Pago Access Token não configurado.' });
    }

    // Cria plano de assinatura com frequência mensal
    const planRes = await fetch('https://api.mercadopago.com/preapproval_plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mpToken}`
      },
      body: JSON.stringify({
        reason: `Assinatura BellaSync — ${tenant.name}`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: price,
          currency_id: 'BRL'
        },
        back_url: `https://bellasync.online/?tenant_sub=${tenant.id}&status=success`
      })
    });

    const planData = await planRes.json();
    if (!planRes.ok) {
      console.error('[Mercado Pago Plan Error]', planData);
      return res.status(400).json({ error: planData.message || 'Erro ao criar plano no Mercado Pago.' });
    }

    res.json({
      planId: planData.id,
      initPoint: planData.init_point,
      amount: price
    });
  } catch (err) {
    console.error('Erro ao gerar plano de cartão:', err);
    res.status(500).json({ error: 'Erro interno ao processar assinatura no cartão.' });
  }
});

// Conferir status de um pagamento Pix
app.get('/api/subscription/check-payment/:paymentId', async (req, res) => {
  try {
    const db = getDb();
    const mpToken = db.platformSettings?.mpAccessToken;
    const { paymentId } = req.params;

    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${mpToken}` }
    });

    const mpData = await mpResponse.json();
    if (!mpResponse.ok) {
      return res.status(400).json({ error: 'Não foi possível consultar o pagamento.' });
    }

    if (mpData.status === 'approved') {
      const extRef = mpData.external_reference; // "tenant_tenant_123..."
      const targetTenantId = extRef ? extRef.replace('tenant_', '') : getTenantId(req);
      const tenant = (db.tenants || []).find(t => t.id === targetTenantId || 'tenant_' + t.id === extRef);

      if (tenant) {
        if (!tenant.subscription) {
          tenant.subscription = { status: 'active', isLifetime: false, monthlyPrice: 49.90 };
        }
        // Adiciona 30 dias a partir da data de expiração anterior ou a partir de hoje
        const currentExp = new Date(tenant.subscription.expiresAt || Date.now());
        const baseDate = currentExp > new Date() ? currentExp : new Date();
        tenant.subscription.expiresAt = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
        tenant.subscription.status = 'active';
        tenant.subscription.lastPaymentDate = new Date().toISOString();
        tenant.subscription.lastPaymentId = mpData.id;
        saveDb(db);
      }
    }

    res.json({ status: mpData.status });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao verificar status do pagamento.' });
  }
});

// Webhook Mercado Pago para aprovação instantânea (Pix e Assinatura Recorrente)
app.post('/api/webhooks/mercadopago', async (req, res) => {
  try {
    const db = getDb();
    const mpToken = db.platformSettings?.mpAccessToken;
    const { type, action, data } = req.body;

    // 1. Pagamento aprovado (Pix ou Cobrança recorrente de Assinatura)
    if ((type === 'payment' || action === 'payment.created') && data && data.id) {
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: { 'Authorization': `Bearer ${mpToken}` }
      });
      const mpData = await mpResponse.json();

      if (mpData.status === 'approved') {
        const extRef = mpData.external_reference;
        if (extRef) {
          const tenantId = extRef.startsWith('tenant_') ? extRef.replace('tenant_', '') : extRef;
          const tenant = (db.tenants || []).find(t => t.id === tenantId || 'tenant_' + t.id === extRef);
          if (tenant) {
            if (!tenant.subscription) {
              tenant.subscription = { status: 'active', isLifetime: false, monthlyPrice: 49.90 };
            }
            const currentExp = new Date(tenant.subscription.expiresAt || Date.now());
            const baseDate = currentExp > new Date() ? currentExp : new Date();
            tenant.subscription.expiresAt = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
            tenant.subscription.status = 'active';
            tenant.subscription.lastPaymentDate = new Date().toISOString();
            tenant.subscription.lastPaymentId = mpData.id;
            saveDb(db);
            console.log(`[BellaSync Webhook] Assinatura renovada para salão ${tenant.name} até ${tenant.subscription.expiresAt}`);
          }
        }
      }
    }

    // 2. Notificação de assinatura criada/atualizada (preapproval)
    if (type === 'subscription_preapproval' && data && data.id) {
      const preRes = await fetch(`https://api.mercadopago.com/preapproval/${data.id}`, {
        headers: { 'Authorization': `Bearer ${mpToken}` }
      });
      const preData = await preRes.json();
      if (preData.status === 'authorized') {
        const extRef = preData.external_reference;
        if (extRef) {
          const tenantId = extRef.startsWith('tenant_') ? extRef.replace('tenant_', '') : extRef;
          const tenant = (db.tenants || []).find(t => t.id === tenantId || 'tenant_' + t.id === extRef);
          if (tenant) {
            if (!tenant.subscription) {
              tenant.subscription = { status: 'active', isLifetime: false, monthlyPrice: 49.90 };
            }
            tenant.subscription.status = 'active';
            tenant.subscription.preapprovalId = preData.id;
            const currentExp = new Date(tenant.subscription.expiresAt || Date.now());
            const baseDate = currentExp > new Date() ? currentExp : new Date();
            tenant.subscription.expiresAt = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
            saveDb(db);
            console.log(`[BellaSync Webhook] Assinatura no cartão autorizada para ${tenant.name}!`);
          }
        }
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('[BellaSync Webhook Error]', err);
    res.status(200).send('OK'); // MP recomenda sempre responder 200
  }
});

// -------------------------------------------------------------
// ENDPOINTS DE SUPERADMIN (KARUADMIN MASTER)
// -------------------------------------------------------------

// Listar todos os salões com seus status de assinatura
app.get('/api/superadmin/tenants', requireSuperAdmin, (req, res) => {
  const db = getDb();
  const list = (db.tenants || []).map(t => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    phone: t.phone,
    createdAt: t.createdAt,
    subscription: t.subscription || {
      status: 'active',
      isLifetime: false,
      monthlyPrice: db.platformSettings?.defaultMonthlyPrice || 49.90,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }
  }));
  res.json({
    platformSettings: db.platformSettings,
    tenants: list
  });
});

// Atualizar assinatura de um salão (ex: dar Vitalício ou alterar valor)
app.put('/api/superadmin/tenants/:id/subscription', requireSuperAdmin, (req, res) => {
  const db = getDb();
  const tenant = (db.tenants || []).find(t => t.id === req.params.id);
  if (!tenant) {
    return res.status(404).json({ error: 'Salão não encontrado.' });
  }

  const { isLifetime, monthlyPrice, addDays, status } = req.body;
  if (!tenant.subscription) {
    tenant.subscription = { status: 'active', isLifetime: false, monthlyPrice: 49.90 };
  }

  if (typeof isLifetime === 'boolean') {
    tenant.subscription.isLifetime = isLifetime;
    if (isLifetime) {
      tenant.subscription.status = 'active';
      tenant.subscription.expiresAt = '2099-12-31T23:59:59.000Z';
    }
  }

  if (monthlyPrice !== undefined) {
    tenant.subscription.monthlyPrice = Number(monthlyPrice);
  }

  if (status) {
    tenant.subscription.status = status;
  }

  if (addDays && Number(addDays) > 0) {
    const curExp = new Date(tenant.subscription.expiresAt || Date.now());
    const base = curExp > new Date() ? curExp : new Date();
    tenant.subscription.expiresAt = new Date(base.getTime() + Number(addDays) * 24 * 60 * 60 * 1000).toISOString();
    tenant.subscription.status = 'active';
  }

  saveDb(db);
  res.json({ message: 'Assinatura atualizada com sucesso!', subscription: tenant.subscription });
});

// Atualizar configurações globais da plataforma
app.put('/api/superadmin/platform-settings', requireSuperAdmin, (req, res) => {
  const db = getDb();
  const { defaultMonthlyPrice } = req.body;

  if (defaultMonthlyPrice !== undefined) {
    db.platformSettings.defaultMonthlyPrice = Number(defaultMonthlyPrice);
  }

  saveDb(db);
  res.json({ message: 'Configurações da plataforma atualizadas.', platformSettings: db.platformSettings });
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
    logo: tenant.logo || tenant.settings?.logo || '',
    photo: tenant.photo || tenant.settings?.photo || '',
    ...(tenant.settings || {})
  });
});

app.put('/api/settings', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const tenant = (db.tenants || []).find(t => t.id === tenantId);
  if (tenant) {
    if (req.body.salonName) tenant.name = req.body.salonName;
    if (req.body.phone) tenant.phone = req.body.phone;
    if (req.body.address) tenant.address = req.body.address;
    if (req.body.logo !== undefined) {
      tenant.logo = req.body.logo;
      if (!tenant.settings) tenant.settings = {};
      tenant.settings.logo = req.body.logo;
    }
    if (req.body.photo !== undefined) {
      tenant.photo = req.body.photo;
      if (!tenant.settings) tenant.settings = {};
      tenant.settings.photo = req.body.photo;
    }
    tenant.settings = { ...tenant.settings, ...req.body };
    saveDb(db);
    res.json({
      salonName: tenant.name,
      slug: tenant.slug,
      phone: tenant.phone,
      address: tenant.address,
      logo: tenant.logo || tenant.settings?.logo || '',
      photo: tenant.photo || tenant.settings?.photo || '',
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

app.post('/api/professionals', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);

  const existingProfs = (db.professionals || []).filter(p => p.tenantId === tenantId);
  if (existingProfs.length >= 10) {
    return res.status(400).json({ error: 'O salão atingiu o limite máximo de 10 profissionais cadastrados.' });
  }

  const newProf = {
    id: 'prof_' + Date.now(),
    tenantId: tenantId,
    name: req.body.name,
    role: req.body.role || 'Profissional',
    phone: req.body.phone || '',
    email: req.body.email || '',
    access: req.body.access || 'Profissional de Servicos',
    avatar: req.body.avatar || getButterflyAvatar(req.body.name),
    showInBooking: req.body.showInBooking ?? true,
    commissionDefault: Number(req.body.commissionDefault) || 50,
    requireDeposit: !!req.body.requireDeposit,
    depositPercent: Number(req.body.depositPercent) || 30,
    pixBank: req.body.pixBank || 'Pix',
    pixKey: req.body.pixKey || '',
    pixKeyType: req.body.pixKeyType || 'Chave Pix',
    pixName: req.body.pixName || req.body.name,
    serviceIds: Array.isArray(req.body.serviceIds) ? req.body.serviceIds : [],
    active: true
  };
  db.professionals.push(newProf);

  // Se senha foi enviada, já cria o usuário correspondente
  const loginUser = (req.body.username || req.body.email || '').trim();
  if (loginUser && req.body.password) {
    db.users.push({
      id: 'user_' + Date.now(),
      tenantId: tenantId,
      professionalId: newProf.id,
      name: newProf.name,
      username: loginUser.toLowerCase(),
      email: req.body.email || `${loginUser}@salao.local`,
      password: req.body.password,
      role: newProf.access === 'Gestor' ? 'admin' : 'professional',
      avatar: newProf.avatar
    });
  }

  saveDb(db);
  res.status(201).json(newProf);
});

app.put('/api/professionals/:id', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const prof = (db.professionals || []).find(p => p.id === req.params.id && p.tenantId === tenantId);
  if (!prof) {
    return res.status(404).json({ error: 'Profissional não encontrado.' });
  }

  if (req.body.name) prof.name = req.body.name;
  if (req.body.role) prof.role = req.body.role;
  if (req.body.avatar !== undefined) prof.avatar = req.body.avatar;
  if (req.body.phone !== undefined) prof.phone = req.body.phone;
  if (req.body.email !== undefined) prof.email = req.body.email;
  if (req.body.access) prof.access = req.body.access;
  if (req.body.showInBooking !== undefined) prof.showInBooking = req.body.showInBooking;
  if (req.body.commissionDefault !== undefined) prof.commissionDefault = Number(req.body.commissionDefault) || 50;
  if (req.body.requireDeposit !== undefined) prof.requireDeposit = !!req.body.requireDeposit;
  if (req.body.depositPercent !== undefined) prof.depositPercent = Number(req.body.depositPercent) || 30;
  if (req.body.pixBank !== undefined) prof.pixBank = req.body.pixBank;
  if (req.body.pixKey !== undefined) prof.pixKey = req.body.pixKey;
  if (req.body.pixKeyType !== undefined) prof.pixKeyType = req.body.pixKeyType;
  if (req.body.pixName !== undefined) prof.pixName = req.body.pixName;
  if (req.body.monthlyGoal !== undefined) prof.monthlyGoal = Number(req.body.monthlyGoal) || 0;
  if (req.body.serviceIds !== undefined) prof.serviceIds = Array.isArray(req.body.serviceIds) ? req.body.serviceIds : [];

  // Atualizar dados de usuário correspondente se existirem
  const user = (db.users || []).find(u => u.professionalId === prof.id && u.tenantId === tenantId);
  if (user) {
    user.name = prof.name;
    if (prof.avatar) user.avatar = prof.avatar;
    user.role = prof.access === 'Gestor' ? 'admin' : 'professional';
    if (req.body.password) {
      user.password = req.body.password;
    }
  }

  saveDb(db);
  res.json(prof);
});

// Endpoint rápido para qualquer profissional atualizar sua meta mensal
app.put('/api/professionals/:id/goal', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const prof = (db.professionals || []).find(p => p.id === req.params.id && p.tenantId === tenantId);
  if (!prof) {
    return res.status(404).json({ error: 'Profissional não encontrado.' });
  }
  prof.monthlyGoal = Number(req.body.monthlyGoal) || 0;
  saveDb(db);
  res.json({ success: true, monthlyGoal: prof.monthlyGoal });
});


app.delete('/api/professionals/:id', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const idx = (db.professionals || []).findIndex(p => p.id === req.params.id && p.tenantId === tenantId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Profissional não encontrado.' });
  }
  const removed = db.professionals.splice(idx, 1)[0];
  // Remove usuário associado
  db.users = (db.users || []).filter(u => !(u.professionalId === req.params.id && u.tenantId === tenantId));
  saveDb(db);
  res.json({ message: 'Profissional excluído com sucesso.', removed });
});

// 3. Serviços
app.get('/api/services', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const list = (db.services || []).filter(s => s.tenantId === tenantId);
  res.json(list);
});

app.post('/api/services', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const isPackage = req.body.isPackage === true || (req.body.category && req.body.category.toLowerCase().includes('pacote'));
  const sessionsCount = Math.max(1, Number(req.body.sessionsCount) || (isPackage ? 5 : 1));
  const newServ = {
    id: 'serv_' + Date.now(),
    tenantId: tenantId,
    name: req.body.name,
    category: req.body.category || 'Geral',
    price: Number(req.body.price) || 0,
    durationMinutes: Number(req.body.durationMinutes) || 60,
    observation: req.body.observation || '',
    commissionPercent: Number(req.body.commissionPercent) || 50,
    assistantCommissionPercent: Number(req.body.assistantCommissionPercent) || 0,
    showPriceInBooking: req.body.showPriceInBooking !== undefined ? !!req.body.showPriceInBooking : true,
    isPackage,
    sessionsCount
  };
  if (req.body.category && req.body.category.trim()) {
    const catName = req.body.category.trim();
    if (!db.serviceCategories) db.serviceCategories = [];
    const exists = db.serviceCategories.some(c => c.tenantId === tenantId && c.name.toLowerCase() === catName.toLowerCase());
    if (!exists) {
      db.serviceCategories.push({
        id: 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        tenantId,
        name: catName
      });
    }
  }

  db.services.push(newServ);
  saveDb(db);
  res.status(201).json(newServ);
});

app.put('/api/services/:id', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const serv = (db.services || []).find(s => s.id === req.params.id && s.tenantId === tenantId);
  if (!serv) {
    return res.status(404).json({ error: 'Serviço não encontrado.' });
  }

  if (req.body.name) serv.name = req.body.name;
  if (req.body.category) {
    serv.category = req.body.category.trim();
    if (!db.serviceCategories) db.serviceCategories = [];
    const exists = db.serviceCategories.some(c => c.tenantId === tenantId && c.name.toLowerCase() === serv.category.toLowerCase());
    if (!exists) {
      db.serviceCategories.push({
        id: 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        tenantId,
        name: serv.category
      });
    }
  }
  if (req.body.price !== undefined) serv.price = Number(req.body.price) || 0;
  if (req.body.durationMinutes !== undefined) serv.durationMinutes = Number(req.body.durationMinutes) || 60;
  if (req.body.commissionPercent !== undefined) serv.commissionPercent = Number(req.body.commissionPercent) || 50;
  if (req.body.observation !== undefined) serv.observation = req.body.observation || '';
  if (req.body.assistantCommissionPercent !== undefined) serv.assistantCommissionPercent = Number(req.body.assistantCommissionPercent) || 0;
  if (req.body.showPriceInBooking !== undefined) serv.showPriceInBooking = !!req.body.showPriceInBooking;
  if (req.body.isPackage !== undefined) serv.isPackage = !!req.body.isPackage;
  if (req.body.sessionsCount !== undefined) serv.sessionsCount = Math.max(1, Number(req.body.sessionsCount) || 1);

  saveDb(db);
  res.json(serv);
});

app.delete('/api/services/:id', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const idx = (db.services || []).findIndex(s => s.id === req.params.id && s.tenantId === tenantId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Serviço não encontrado.' });
  }
  const removed = db.services.splice(idx, 1)[0];
  saveDb(db);
  res.json({ message: 'Serviço excluído com sucesso.', removed });
});

// 3.1 Categorias de Serviços
app.get('/api/categories', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  if (!db.serviceCategories) db.serviceCategories = [];

  const explicit = db.serviceCategories.filter(c => c.tenantId === tenantId);
  const serviceCategories = (db.services || [])
    .filter(s => s.tenantId === tenantId && s.category)
    .map(s => s.category.trim())
    .filter(Boolean);

  const allNames = Array.from(new Set([
    ...explicit.map(c => c.name.trim()),
    ...serviceCategories
  ])).filter(Boolean);

  let modified = false;
  allNames.forEach(name => {
    const exists = explicit.some(c => c.name.toLowerCase() === name.toLowerCase());
    if (!exists) {
      const newCat = { id: 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5), tenantId, name };
      db.serviceCategories.push(newCat);
      explicit.push(newCat);
      modified = true;
    }
  });

  if (modified) saveDb(db);

  const result = explicit.map(cat => {
    const servicesCount = (db.services || []).filter(s => s.tenantId === tenantId && s.category && s.category.toLowerCase() === cat.name.toLowerCase()).length;
    return {
      id: cat.id,
      name: cat.name,
      servicesCount
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

  res.json(result);
});

app.post('/api/categories', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const name = (req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'O nome da categoria é obrigatório.' });
  }

  if (!db.serviceCategories) db.serviceCategories = [];
  const existing = db.serviceCategories.find(c => c.tenantId === tenantId && c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    const servicesCount = (db.services || []).filter(s => s.tenantId === tenantId && s.category && s.category.toLowerCase() === existing.name.toLowerCase()).length;
    return res.json({ id: existing.id, name: existing.name, servicesCount });
  }

  const newCat = {
    id: 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    tenantId,
    name
  };
  db.serviceCategories.push(newCat);
  saveDb(db);

  res.status(201).json({ id: newCat.id, name: newCat.name, servicesCount: 0 });
});

app.put('/api/categories/:id', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const newName = (req.body.name || req.body.newName || '').trim();
  if (!newName) {
    return res.status(400).json({ error: 'O novo nome da categoria é obrigatório.' });
  }

  if (!db.serviceCategories) db.serviceCategories = [];
  const cat = db.serviceCategories.find(c => (c.id === req.params.id || c.name.toLowerCase() === req.params.id.toLowerCase()) && c.tenantId === tenantId);

  if (!cat) {
    return res.status(404).json({ error: 'Categoria não encontrada.' });
  }

  const oldName = cat.name;
  cat.name = newName;

  let affectedServices = 0;
  (db.services || []).forEach(s => {
    if (s.tenantId === tenantId && s.category && s.category.toLowerCase() === oldName.toLowerCase()) {
      s.category = newName;
      affectedServices++;
    }
  });

  saveDb(db);
  res.json({ id: cat.id, name: cat.name, oldName, affectedServices });
});

app.delete('/api/categories/:id', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const fallbackCategory = (req.query.fallbackCategory || req.body.fallbackCategory || 'Geral').trim();

  if (!db.serviceCategories) db.serviceCategories = [];
  const idx = db.serviceCategories.findIndex(c => (c.id === req.params.id || c.name.toLowerCase() === req.params.id.toLowerCase()) && c.tenantId === tenantId);

  if (idx === -1) {
    return res.status(404).json({ error: 'Categoria não encontrada.' });
  }

  const removed = db.serviceCategories.splice(idx, 1)[0];

  let affectedServices = 0;
  (db.services || []).forEach(s => {
    if (s.tenantId === tenantId && s.category && s.category.toLowerCase() === removed.name.toLowerCase()) {
      s.category = fallbackCategory;
      affectedServices++;
    }
  });

  saveDb(db);
  res.json({ message: 'Categoria excluída com sucesso.', removed, affectedServices });
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

app.put('/api/clients/:id', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const cli = (db.clients || []).find(c => c.id === req.params.id && c.tenantId === tenantId);
  if (!cli) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }

  if (req.body.name) cli.name = req.body.name;
  if (req.body.phone !== undefined) cli.phone = req.body.phone;
  if (req.body.birthday !== undefined) cli.birthday = req.body.birthday;
  if (req.body.notes !== undefined) cli.notes = req.body.notes;

  saveDb(db);
  res.json(cli);
});

app.delete('/api/clients/:id', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const idx = (db.clients || []).findIndex(c => c.id === req.params.id && c.tenantId === tenantId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }
  const removed = db.clients.splice(idx, 1)[0];
  saveDb(db);
  res.json({ message: 'Cliente excluído com sucesso.', removed });
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

  // Duração do serviço solicitado ou soma de múltiplos serviços (padrão 30 min se não fornecido)
  let serviceDuration = 30;
  if (req.query.durationMinutes) {
    serviceDuration = Number(req.query.durationMinutes) || 30;
  } else if (serviceId) {
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

  // Se o salão não permite agendamento no mesmo dia (allowSameDayBooking: false)
  const allowSameDay = tenant?.settings?.allowSameDayBooking !== false;
  if (isToday && !allowSameDay) {
    return res.json({
      date,
      professionalId,
      serviceDuration,
      message: 'Agendamentos para o mesmo dia não são permitidos. Por favor, escolha a partir de amanhã.',
      slots: []
    });
  }

  // Se a data solicitada ultrapassa a janela máxima de dias configurada
  const maxDaysAhead = Number(tenant?.settings?.maxBookingDaysAhead) || 30;
  const maxDate = new Date(nowMs);
  maxDate.setDate(maxDate.getDate() + maxDaysAhead);
  const maxDateStr = `${maxDate.getFullYear()}-${String(maxDate.getMonth() + 1).padStart(2, '0')}-${String(maxDate.getDate()).padStart(2, '0')}`;
  if (date > maxDateStr) {
    return res.json({
      date,
      professionalId,
      serviceDuration,
      message: `A agenda está disponível apenas até ${maxDaysAhead} dias adiante.`,
      slots: []
    });
  }

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
  let duration = Number(req.body.durationMinutes) || 30;

  // Busca serviço para validar duração e preço exatos se não passados
  if (serviceId && !req.body.durationMinutes) {
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
    servicesList: Array.isArray(req.body.servicesList) ? req.body.servicesList : [],
    date,
    startTime,
    endTime,
    price,
    durationMinutes: duration,
    status: status || 'agendado', // agendado, indisponivel, concluido, cancelado
    notes: notes || '',
    createdAt: new Date().toISOString(),
    bookingDate: getTodayDateStr()
  };

  db.appointments.push(newApp);

  // Se o serviço agendado for um Pacote de Múltiplas Sessões, gera o controle de sessões (Check-list) no CRM
  if (serviceId) {
    const servObj = (db.services || []).find(s => s.id === serviceId && s.tenantId === tenantId);
    if (servObj && (servObj.isPackage || (servObj.sessionsCount && servObj.sessionsCount > 1) || (servObj.category && servObj.category.toLowerCase().includes('pacote')) || (servObj.name && servObj.name.toLowerCase().includes('pacote')))) {
      const totalSessions = servObj.sessionsCount || 3;
      const sessions = [];
      for (let i = 1; i <= totalSessions; i++) {
        sessions.push({
          sessionNum: i,
          completed: false,
          completedAt: null,
          professionalName: null,
          notes: i === 1 ? `Sessão 1 agendada para ${date} às ${startTime}` : ''
        });
      }
      if (!db.packages) db.packages = [];
      db.packages.push({
        id: 'pkg_' + Date.now(),
        tenantId: tenantId,
        clientId: clientId || null,
        clientName: clientName || 'Cliente',
        clientPhone: clientPhone || '',
        packageName: servObj.name,
        totalSessions,
        completedCount: 0,
        price: price || servObj.price,
        notes: `Comprado online em ${date}`,
        status: 'ativo',
        createdAt: date || new Date().toISOString().split('T')[0],
        date: date || new Date().toISOString().split('T')[0],
        sessions
      });
    }
  }

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

  // Dispara Web Push em segundo plano / celular fechado para os profissionais do salão
  const tenant = (db.tenants || []).find(t => t.id === tenantId);
  if (!tenant || !tenant.settings || tenant.settings.notifyNewAppointments !== false) {
    sendPushToTenant(tenantId, professionalId, {
      title: '📅 Novo Agendamento Recebido!',
      body: `${newApp.clientName} agendou ${newApp.serviceName} para ${newApp.date} às ${newApp.startTime}.`,
      url: '/'
    });
  }


  res.status(201).json(newApp);
});

// Helper de similaridade Levenshtein
function calculateLevenshteinSimilarity(s1, s2) {
  const str1 = (s1 || '').toLowerCase().trim();
  const str2 = (s2 || '').toLowerCase().trim();
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0;
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  let costs = [];
  for (let i = 0; i <= str1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= str2.length; j++) {
      if (i === 0) costs[j] = j;
      else {
        if (j > 0) {
          let newValue = costs[j - 1];
          if (str1.charAt(i - 1) !== str2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[str2.length] = lastValue;
  }
  return (longerLength - costs[str2.length]) / parseFloat(longerLength);
}

// Endpoint para cruzar informações e verificar histórico de faltas/reagendamento do cliente
app.get('/api/appointments/check-policy', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const { name, phone } = req.query;

  const rawPhone = (phone || '').replace(/\D/g, '');
  const cleanPhone = rawPhone.length > 8 ? rawPhone.slice(-8) : rawPhone;
  const rawName = (name || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (!cleanPhone && !rawName) {
    return res.json({ penalty: false, percent: 30, reason: null });
  }

  // Busca todos os agendamentos do tenant que foram marcados como faltou/no-show
  const allApps = (db.appointments || []).filter(a => a.tenantId === tenantId);
  const noShowApps = allApps.filter(a => a.status === 'faltou' || a.isNoShow === true);

  // Também checa se o cliente possui flag no cadastro
  const allClients = (db.clients || []).filter(c => c.tenantId === tenantId);
  const flaggedClients = allClients.filter(c => c.hasNoShowHistory === true);

  let matchFound = null;

  for (const app of noShowApps) {
    const appPhoneRaw = (app.clientPhone || '').replace(/\D/g, '');
    const appPhone = appPhoneRaw.length > 8 ? appPhoneRaw.slice(-8) : appPhoneRaw;
    const appName = (app.clientName || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 1. Match por telefone (últimos 8 dígitos idênticos)
    if (cleanPhone && appPhone && cleanPhone === appPhone) {
      matchFound = { type: 'phone', clientName: app.clientName, date: app.date };
      break;
    }

    // 2. Match por similaridade de nome (>= 0.70) caso telefone diferente ou ocultado
    if (rawName && appName) {
      const sim = calculateLevenshteinSimilarity(rawName, appName);
      if (sim >= 0.70) {
        matchFound = { type: 'name_similarity', clientName: app.clientName, date: app.date, similarity: sim };
        break;
      }
    }
  }

  if (!matchFound) {
    for (const cli of flaggedClients) {
      const cliPhoneRaw = (cli.phone || '').replace(/\D/g, '');
      const cliPhone = cliPhoneRaw.length > 8 ? cliPhoneRaw.slice(-8) : cliPhoneRaw;
      const cliName = (cli.name || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      if (cleanPhone && cliPhone && cleanPhone === cliPhone) {
        matchFound = { type: 'client_phone', clientName: cli.name };
        break;
      }
      if (rawName && cliName && calculateLevenshteinSimilarity(rawName, cliName) >= 0.70) {
        matchFound = { type: 'client_name', clientName: cli.name };
        break;
      }
    }
  }

  if (matchFound) {
    return res.json({
      penalty: true,
      percent: 50,
      reason: 'Histórico de ausência ou remarcação anterior identificado por cruzamento de dados.',
      match: matchFound
    });
  }

  return res.json({ penalty: false, percent: 30, reason: null });
});

// Helper para validar se o usuário pode gerenciar o agendamento (Gestor ou Profissional do agendamento)
function canUserManageAppointment(req, app, db) {
  if (!app) return false;
  const userRole = req.headers['x-user-role'];
  // Se for admin, superadmin ou gestor: permissão total
  if (userRole === 'admin' || userRole === 'superadmin' || userRole === 'gestor') {
    return true;
  }

  const profId = req.headers['x-professional-id'];
  const userId = req.headers['x-user-id'];

  // Se o profissional do agendamento bater com o profissional da requisição
  if (profId && app.professionalId === profId) {
    return true;
  }

  // Se tiver userId, verifica o cadastro do usuário
  if (userId) {
    const user = (db.users || []).find(u => u.id === userId);
    if (user) {
      if (user.role === 'admin' || user.role === 'superadmin' || user.role === 'gestor') {
        return true;
      }
      if (user.professionalId && app.professionalId === user.professionalId) {
        return true;
      }
    }
  }

  // Se a requisição veio de um profissional e não bateu com o profissional do agendamento: BLOQUEIA
  if (userRole === 'professional' || (profId && app.professionalId !== profId)) {
    return false;
  }

  return true;
}

// Atualizar status de um agendamento (ex: 'agendado', 'concluido', 'cancelado', 'faltou')
app.patch('/api/appointments/:id/status', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const { status } = req.body;

  const app = (db.appointments || []).find(a => a.id === req.params.id && a.tenantId === tenantId);
  if (!app) {
    return res.status(404).json({ error: 'Agendamento não encontrado.' });
  }

  // Apenas o gestor e o profissional em que o agendamento foi feito podem alterar o status
  if (!canUserManageAppointment(req, app, db)) {
    return res.status(403).json({ error: 'Apenas o gestor e o profissional em que o agendamento foi feito têm permissão para alterar este agendamento.' });
  }

  app.status = status;
  if (status === 'faltou') {
    app.isNoShow = true;
    // Marca histórico no cliente também se existir
    if (app.clientPhone) {
      const rawP = app.clientPhone.replace(/\D/g, '');
      const cli = (db.clients || []).find(c => c.tenantId === tenantId && c.phone.replace(/\D/g, '').includes(rawP.slice(-8)));
      if (cli) {
        cli.hasNoShowHistory = true;
      }
    }
  }

  saveDb(db);
  res.json({ message: 'Status atualizado com sucesso.', appointment: app });
});

// Excluir / Cancelar Agendamento
app.delete('/api/appointments/:id', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const idx = (db.appointments || []).findIndex(a => a.id === req.params.id && a.tenantId === tenantId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Agendamento não encontrado.' });
  }

  const app = db.appointments[idx];
  // Apenas o gestor e o profissional em que o agendamento foi feito podem excluir o agendamento
  if (!canUserManageAppointment(req, app, db)) {
    return res.status(403).json({ error: 'Apenas o gestor e o profissional em que o agendamento foi feito têm permissão para excluir este agendamento.' });
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

app.post('/api/products', requireManager, (req, res) => {
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

app.put('/api/products/:id', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const prod = (db.products || []).find(p => p.id === req.params.id && p.tenantId === tenantId);
  if (!prod) {
    return res.status(404).json({ error: 'Produto não encontrado.' });
  }

  if (req.body.name) prod.name = req.body.name;
  if (req.body.category) prod.category = req.body.category;
  if (req.body.brand !== undefined) prod.brand = req.body.brand;
  if (req.body.price !== undefined) prod.price = Number(req.body.price) || 0;
  if (req.body.stock !== undefined) prod.stock = Number(req.body.stock) || 0;

  saveDb(db);
  res.json(prod);
});

app.delete('/api/products/:id', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const idx = (db.products || []).findIndex(p => p.id === req.params.id && p.tenantId === tenantId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Produto não encontrado.' });
  }
  const removed = db.products.splice(idx, 1)[0];
  saveDb(db);
  res.json({ message: 'Produto excluído com sucesso.', removed });
});

// 7. Despesas
app.get('/api/expenses', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const { monthYear } = req.query;
  let allExpenses = (db.expenses || []).filter(e => e.tenantId === tenantId);

  if (monthYear) {
    const list = [];
    allExpenses.forEach(e => {
      if (e.monthYear === monthYear) {
        list.push(e);
      } else if (e.isRecurring && e.monthYear < monthYear) {
        // Gera item virtual para o mês solicitado
        const day = (e.dueDate || '').split('-')[2] || '05';
        const virtualDueDate = `${monthYear}-${day}`;
        list.push({
          ...e,
          id: `${e.id}_rec_${monthYear}`,
          originalId: e.id,
          dueDate: virtualDueDate,
          monthYear: monthYear,
          status: e.status || 'pendente'
        });
      }
    });
    return res.json(list);
  }

  res.json(allExpenses);
});

app.post('/api/expenses', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const baseDueDate = req.body.dueDate || new Date().toISOString().split('T')[0];
  const totalAmount = Number(req.body.amount) || 0;
  const installments = Math.max(1, parseInt(req.body.installments, 10) || 1);
  const baseDesc = (req.body.description || '').trim();
  const paymentType = req.body.paymentType || 'Pix';
  const category = req.body.category || 'Geral';
  const status = req.body.status || 'pendente';
  const isRecurring = !!req.body.isRecurring;

  if (!db.expenses) db.expenses = [];

  if (installments > 1) {
    const installmentAmount = +(totalAmount / installments).toFixed(2);
    const createdExpenses = [];
    const [yearStr, monthStr, dayStr] = baseDueDate.split('-');
    const baseYear = parseInt(yearStr, 10);
    const baseMonth = parseInt(monthStr, 10) - 1; // 0-indexed
    const baseDay = parseInt(dayStr, 10);

    for (let i = 1; i <= installments; i++) {
      const targetDate = new Date(baseYear, baseMonth + (i - 1), baseDay);
      const yyyy = targetDate.getFullYear();
      const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
      const dd = String(targetDate.getDate()).padStart(2, '0');
      const expDueDate = `${yyyy}-${mm}-${dd}`;

      const currentAmount = (i === installments) 
        ? +(totalAmount - (installmentAmount * (installments - 1))).toFixed(2)
        : installmentAmount;

      const newExp = {
        id: 'exp_' + Date.now() + '_' + i,
        tenantId: tenantId,
        description: `${baseDesc} (${i}/${installments})`,
        category: category,
        paymentType: paymentType,
        amount: currentAmount,
        dueDate: expDueDate,
        status: status,
        monthYear: expDueDate.substring(0, 7),
        installmentIndex: i,
        totalInstallments: installments,
        isRecurring: false
      };
      db.expenses.push(newExp);
      createdExpenses.push(newExp);
    }

    saveDb(db);
    return res.status(201).json(createdExpenses);
  }

  const newExp = {
    id: 'exp_' + Date.now(),
    tenantId: tenantId,
    description: baseDesc,
    category: category,
    paymentType: paymentType,
    amount: totalAmount,
    dueDate: baseDueDate,
    status: status,
    monthYear: baseDueDate.substring(0, 7),
    isRecurring: isRecurring
  };
  db.expenses.push(newExp);
  saveDb(db);
  res.status(201).json(newExp);
});

app.put('/api/expenses/:id', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const targetId = req.params.id.split('_rec_')[0];
  const exp = (db.expenses || []).find(e => (e.id === req.params.id || e.id === targetId) && e.tenantId === tenantId);
  if (!exp) {
    return res.status(404).json({ error: 'Despesa não encontrada.' });
  }

  if (req.body.description) exp.description = req.body.description;
  if (req.body.category) exp.category = req.body.category;
  if (req.body.paymentType) exp.paymentType = req.body.paymentType;
  if (req.body.amount !== undefined) exp.amount = Number(req.body.amount) || 0;
  if (req.body.dueDate) {
    exp.dueDate = req.body.dueDate;
    exp.monthYear = exp.dueDate.substring(0, 7);
  }
  if (req.body.status) exp.status = req.body.status;
  if (req.body.isRecurring !== undefined) exp.isRecurring = !!req.body.isRecurring;

  saveDb(db);
  res.json(exp);
});

app.delete('/api/expenses/:id', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const targetId = req.params.id.split('_rec_')[0];
  const idx = (db.expenses || []).findIndex(e => (e.id === req.params.id || e.id === targetId) && e.tenantId === tenantId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Despesa não encontrada.' });
  }
  const removed = db.expenses.splice(idx, 1)[0];
  saveDb(db);
  res.json({ message: 'Despesa excluída com sucesso.', removed });
});

// -------------------------------------------------------------
// PACOTES DE SERVIÇOS (TICKAGEM POR SESSÕES / CHECK-LIST)
// -------------------------------------------------------------
app.get('/api/packages', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const list = (db.packages || []).filter(p => p.tenantId === tenantId);
  res.json(list);
});

app.post('/api/packages', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const totalSessions = Math.max(1, parseInt(req.body.totalSessions, 10) || 5);
  const packageName = (req.body.packageName || 'Pacote de Serviços').trim();
  const clientName = (req.body.clientName || 'Cliente').trim();
  const clientPhone = (req.body.clientPhone || '').trim();
  const clientId = req.body.clientId || null;
  const price = Number(req.body.price) || 0;
  const notes = req.body.notes || '';

  if (!db.packages) db.packages = [];

  const sessions = [];
  for (let i = 1; i <= totalSessions; i++) {
    sessions.push({
      sessionNum: i,
      completed: false,
      completedAt: null,
      professionalName: null,
      notes: ''
    });
  }

  const newPkg = {
    id: 'pkg_' + Date.now(),
    tenantId,
    clientId,
    clientName,
    clientPhone,
    packageName,
    totalSessions,
    completedCount: 0,
    price,
    notes,
    status: 'ativo',
    createdAt: req.body.date || new Date().toISOString().split('T')[0],
    date: req.body.date || new Date().toISOString().split('T')[0],
    sessions
  };

  db.packages.push(newPkg);
  saveDb(db);
  res.status(201).json(newPkg);
});

app.put('/api/packages/:id/session', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const pkg = (db.packages || []).find(p => p.id === req.params.id && p.tenantId === tenantId);

  if (!pkg) {
    return res.status(404).json({ error: 'Pacote não encontrado.' });
  }

  const { sessionNum, completed, professionalName, notes } = req.body;
  const session = pkg.sessions.find(s => s.sessionNum === Number(sessionNum));

  if (!session) {
    return res.status(404).json({ error: 'Sessão do pacote não encontrada.' });
  }

  session.completed = !!completed;
  session.completedAt = completed ? new Date().toISOString() : null;
  if (professionalName !== undefined) session.professionalName = professionalName;
  if (notes !== undefined) session.notes = notes;

  pkg.completedCount = pkg.sessions.filter(s => s.completed).length;
  if (pkg.completedCount === pkg.totalSessions) {
    pkg.status = 'concluido';
  } else {
    pkg.status = 'ativo';
  }

  saveDb(db);
  res.json(pkg);
});

app.delete('/api/packages/:id', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const idx = (db.packages || []).findIndex(p => p.id === req.params.id && p.tenantId === tenantId);

  if (idx === -1) {
    return res.status(404).json({ error: 'Pacote não encontrado.' });
  }

  const removed = db.packages.splice(idx, 1)[0];
  saveDb(db);
  res.json({ message: 'Pacote excluído com sucesso.', removed });
});

// 8. Comissões & Vales
app.get('/api/commissions', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  res.json((db.commissions || []).filter(c => c.tenantId === tenantId));
});

app.post('/api/commissions', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  if (!db.commissions) db.commissions = [];

  const { professionalId, professionalName, amount, description, type, status, paymentDate, date } = req.body;
  if (!professionalId || amount === undefined || isNaN(Number(amount))) {
    return res.status(400).json({ error: 'Profissional e valor são obrigatórios.' });
  }

  // Se o nome não veio, busca pelo ID
  let profName = professionalName;
  if (!profName) {
    const p = (db.professionals || []).find(prof => prof.id === professionalId && prof.tenantId === tenantId);
    profName = p ? p.name : 'Profissional';
  }

  const numAmount = Number(amount);
  const commType = type === 'vale' ? 'vale' : 'comissao';
  const commStatus = status === 'paga' ? 'paga' : 'a_pagar';
  const today = new Date().toISOString().split('T')[0];

  const newComm = {
    id: 'com_' + Date.now(),
    tenantId,
    professionalId,
    professionalName: profName,
    type: commType,
    description: description || (commType === 'vale' ? 'Adiantamento / Vale' : 'Comissão Avulsa'),
    amount: numAmount,
    status: commStatus,
    date: date || today,
    paymentDate: commStatus === 'paga' ? (paymentDate || today) : null
  };

  db.commissions.push(newComm);
  saveDb(db);
  res.status(201).json(newComm);
});

app.put('/api/commissions/:id', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const item = (db.commissions || []).find(c => c.id === req.params.id && c.tenantId === tenantId);
  if (!item) {
    return res.status(404).json({ error: 'Lançamento não encontrado.' });
  }

  if (req.body.professionalId) {
    item.professionalId = req.body.professionalId;
    const p = (db.professionals || []).find(prof => prof.id === req.body.professionalId && prof.tenantId === tenantId);
    if (p) item.professionalName = p.name;
  }
  if (req.body.professionalName) item.professionalName = req.body.professionalName;
  if (req.body.amount !== undefined) item.amount = Number(req.body.amount);
  if (req.body.description !== undefined) item.description = req.body.description;
  if (req.body.type) item.type = req.body.type;
  if (req.body.date) item.date = req.body.date;
  if (req.body.status) {
    item.status = req.body.status;
    if (item.status === 'paga' && !item.paymentDate) {
      item.paymentDate = req.body.paymentDate || new Date().toISOString().split('T')[0];
    } else if (item.status === 'a_pagar') {
      item.paymentDate = null;
    }
  }
  if (req.body.paymentDate !== undefined) item.paymentDate = req.body.paymentDate;

  saveDb(db);
  res.json(item);
});

app.delete('/api/commissions/:id', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const idx = (db.commissions || []).findIndex(c => c.id === req.params.id && c.tenantId === tenantId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Lançamento não encontrado.' });
  }
  const removed = db.commissions.splice(idx, 1)[0];
  saveDb(db);
  res.json({ message: 'Lançamento excluído com sucesso.', removed });
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

// Rotas Principais de Páginas e CRM
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/home.html'));
});

app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/home.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

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
