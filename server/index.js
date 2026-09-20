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

  res.json({
    token: 'token_' + user.id + '_' + Date.now(),
    user: {
      id: user.id,
      name: user.name,
      username: user.username || user.email,
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
      avatar: p.avatar,
      phone: p.phone,
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
      settings: tenant.settings
    },
    professionals,
    services
  });
});

// -------------------------------------------------------------
// ASSINATURAS (SAAS) & MERCADO PAGO
// -------------------------------------------------------------

// Obter status de assinatura do salão atual
app.get('/api/subscription/status', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const tenant = (db.tenants || []).find(t => t.id === tenantId);

  if (!tenant) {
    return res.status(404).json({ error: 'Salão não encontrado.' });
  }

  const sub = tenant.subscription || {
    status: 'active',
    isLifetime: false,
    monthlyPrice: 49.90,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };

  // Se for vitalício, nunca expira e não há dias restantes a alertar
  if (sub.isLifetime) {
    return res.json({
      status: 'active',
      isLifetime: true,
      daysRemaining: 9999,
      warningLevel: 'none',
      message: ''
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
    monthlyPrice: sub.monthlyPrice || db.platformSettings?.defaultMonthlyPrice || 49.90,
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

    const price = Number(tenant.subscription?.monthlyPrice) || Number(db.platformSettings?.defaultMonthlyPrice) || 49.90;
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
      amount: price
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

    const price = Number(tenant.subscription?.monthlyPrice) || Number(db.platformSettings?.defaultMonthlyPrice) || 49.90;
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

app.post('/api/professionals', requireManager, (req, res) => {
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
    avatar: req.body.avatar || getButterflyAvatar(req.body.name),
    showInBooking: req.body.showInBooking ?? true,
    commissionDefault: Number(req.body.commissionDefault) || 50,
    requireDeposit: !!req.body.requireDeposit,
    depositPercent: Number(req.body.depositPercent) || 30,
    pixBank: req.body.pixBank || 'Pix',
    pixKey: req.body.pixKey || '',
    pixKeyType: req.body.pixKeyType || 'Chave Pix',
    pixName: req.body.pixName || req.body.name,
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
      role: newProf.access === 'Gestor' ? 'admin' : 'professional'
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

  // Atualizar dados de usuário correspondente se existirem
  const user = (db.users || []).find(u => u.professionalId === prof.id && u.tenantId === tenantId);
  if (user) {
    user.name = prof.name;
    user.role = prof.access === 'Gestor' ? 'admin' : 'professional';
    if (req.body.password) {
      user.password = req.body.password;
    }
  }

  saveDb(db);
  res.json(prof);
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

app.put('/api/services/:id', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const serv = (db.services || []).find(s => s.id === req.params.id && s.tenantId === tenantId);
  if (!serv) {
    return res.status(404).json({ error: 'Serviço não encontrado.' });
  }

  if (req.body.name) serv.name = req.body.name;
  if (req.body.category) serv.category = req.body.category;
  if (req.body.price !== undefined) serv.price = Number(req.body.price) || 0;
  if (req.body.durationMinutes !== undefined) serv.durationMinutes = Number(req.body.durationMinutes) || 60;
  if (req.body.commissionPercent !== undefined) serv.commissionPercent = Number(req.body.commissionPercent) || 50;

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

// Atualizar status de um agendamento (ex: 'agendado', 'concluido', 'cancelado', 'faltou')
app.patch('/api/appointments/:id/status', (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const { status } = req.body;

  const app = (db.appointments || []).find(a => a.id === req.params.id && a.tenantId === tenantId);
  if (!app) {
    return res.status(404).json({ error: 'Agendamento não encontrado.' });
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
  let list = (db.expenses || []).filter(e => e.tenantId === tenantId);
  if (monthYear) {
    list = list.filter(e => e.monthYear === monthYear);
  }
  res.json(list);
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

  if (!db.expenses) db.expenses = [];

  if (installments > 1) {
    const installmentAmount = +(totalAmount / installments).toFixed(2);
    const createdExpenses = [];
    const [yearStr, monthStr, dayStr] = baseDueDate.split('-');
    const baseYear = parseInt(yearStr, 10);
    const baseMonth = parseInt(monthStr, 10) - 1; // 0-indexed
    const baseDay = parseInt(dayStr, 10);

    for (let i = 1; i <= installments; i++) {
      // Ajustar data mês a mês
      const targetDate = new Date(baseYear, baseMonth + (i - 1), baseDay);
      const yyyy = targetDate.getFullYear();
      const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
      const dd = String(targetDate.getDate()).padStart(2, '0');
      const expDueDate = `${yyyy}-${mm}-${dd}`;

      // Ajusta centavos na última parcela se houver dízima
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
        totalInstallments: installments
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
    monthYear: baseDueDate.substring(0, 7)
  };
  db.expenses.push(newExp);
  saveDb(db);
  res.status(201).json(newExp);
});

app.put('/api/expenses/:id', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const exp = (db.expenses || []).find(e => e.id === req.params.id && e.tenantId === tenantId);
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

  saveDb(db);
  res.json(exp);
});

app.delete('/api/expenses/:id', requireManager, (req, res) => {
  const db = getDb();
  const tenantId = getTenantId(req);
  const idx = (db.expenses || []).findIndex(e => e.id === req.params.id && e.tenantId === tenantId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Despesa não encontrada.' });
  }
  const removed = db.expenses.splice(idx, 1)[0];
  saveDb(db);
  res.json({ message: 'Despesa excluída com sucesso.', removed });
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
