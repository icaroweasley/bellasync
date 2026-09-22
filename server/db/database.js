import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'database.json');

const initialData = {
  platformSettings: {
    name: "BellaSync",
    defaultMonthlyPrice: 49.90,
    mpPublicKey: "APP_USR-7d79674f-eedd-4802-8d7d-56b2199e3163",
    mpAccessToken: "APP_USR-416005814942310-091716-e0c6ab2c6991cd4497a54154940227b8-3698639606"
  },
  tenants: [
    {
      id: "tenant_metamorfose",
      name: "Metamorfose Hair",
      slug: "metamorfose_hair",
      phone: "(67) 98424-8821",
      address: "R. Hugo Pereira do Vale, 791 - Mata do Jacinto, Campo Grande - MS",
      createdAt: "2026-09-01",
      subscription: {
        status: "active",
        isLifetime: true,
        monthlyPrice: 49.90,
        expiresAt: "2099-12-31T23:59:59.000Z"
      },
      settings: {
        intervalMinutes: 30,
        showPricesOnline: true,
        groupByCategory: true,
        theme: "falcon"
      }
    }
  ],
  users: [
    {
      id: "user_superadmin_karu",
      tenantId: "tenant_metamorfose",
      professionalId: null,
      name: "Administrador Master",
      username: "karuadmin",
      email: "karuadmin@bellasync.online",
      password: "C3lvl@rz1nh0.",
      role: "superadmin"
    },
    {
      id: "user_sarah",
      tenantId: "tenant_metamorfose",
      professionalId: "prof_1",
      name: "Sarah Beatriz",
      username: "sarah",
      email: "sarah@metamorfose.com",
      password: "123",
      role: "admin"
    },
    {
      id: "user_ana",
      tenantId: "tenant_metamorfose",
      professionalId: "prof_2",
      name: "Ana Alice",
      username: "ana",
      email: "ana@metamorfose.com",
      password: "123",
      role: "professional"
    }
  ],
  settings: {
    salonName: "Metamorfose Hair",
    slug: "metamorfose_hair",
    phone: "(67) 98424-8821",
    address: "R. Hugo Pereira do Vale, 791 - Mata do Jacinto, Campo Grande - MS",
    intervalMinutes: 30,
    showPricesOnline: true,
    groupByCategory: true,
    theme: "falcon"
  },
  professionals: [
    {
      id: "prof_1",
      tenantId: "tenant_metamorfose",
      name: "Sarah Beatriz",
      role: "Trancista",
      phone: "(67) 98424-8821",
      email: "sarah@metamorfose.com",
      access: "Gestor",
      avatar: "/images/butterflies/butterfly-1.svg",
      showInBooking: true,
      commissionDefault: 50,
      active: true
    },
    {
      id: "prof_2",
      tenantId: "tenant_metamorfose",
      name: "Ana Alice",
      role: "Hairstylist & Barbeira",
      phone: "(67) 99162-9269",
      email: "ana@metamorfose.com",
      access: "Gestor",
      avatar: "/images/butterflies/butterfly-2.svg",
      showInBooking: true,
      commissionDefault: 50,
      active: true
    },
    {
      id: "prof_3",
      tenantId: "tenant_metamorfose",
      name: "Ilda Rodrigues dos Santos",
      role: "Hairstylist & Colorista",
      phone: "(67) 99273-4259",
      email: "ilda@metamorfose.com",
      access: "Gestor",
      avatar: "/images/butterflies/butterfly-5.svg",
      showInBooking: true,
      commissionDefault: 50,
      active: true
    },
    {
      id: "prof_4",
      tenantId: "tenant_metamorfose",
      name: "Priscila dos Santos Jove",
      role: "Manicure e Auxiliar",
      phone: "(67) 98454-0935",
      email: "priscila@metamorfose.com",
      access: "Profissional de Servicos",
      avatar: "/images/butterflies/butterfly-4.svg",
      showInBooking: true,
      commissionDefault: 40,
      active: true
    },
    {
      id: "prof_5",
      tenantId: "tenant_metamorfose",
      name: "Icaro",
      role: "Gestor Geral",
      phone: "(67) 8134-8704",
      email: "admin@metamorfose.com",
      access: "Gestor",
      avatar: "/images/butterflies/butterfly-3.svg",
      showInBooking: false,
      commissionDefault: 0,
      active: true
    }
  ],
  services: [
    {
      id: "serv_1",
      tenantId: "tenant_metamorfose",
      name: "Alisamento / Progressiva Formol",
      category: "Alisamentos",
      price: 120.00,
      durationMinutes: 180,
      observation: "Comissao padrao e materiais inclusos",
      commissionPercent: 50,
      assistantCommissionPercent: 10
    },
    {
      id: "serv_2",
      tenantId: "tenant_metamorfose",
      name: "Barba Terapia e Alinhamento",
      category: "Barba",
      price: 40.00,
      durationMinutes: 60,
      observation: "Toalha quente e massagem facial",
      commissionPercent: 50,
      assistantCommissionPercent: 0
    },
    {
      id: "serv_3",
      tenantId: "tenant_metamorfose",
      name: "Aplicacao de Tintura",
      category: "Coloracao",
      price: 75.00,
      durationMinutes: 120,
      observation: "Tinta por conta do salao",
      commissionPercent: 50,
      assistantCommissionPercent: 10
    },
    {
      id: "serv_4",
      tenantId: "tenant_metamorfose",
      name: "Corte Maquina / Fade",
      category: "Corte",
      price: 50.00,
      durationMinutes: 60,
      observation: "Acabamento na lamina",
      commissionPercent: 60,
      assistantCommissionPercent: 0
    },
    {
      id: "serv_5",
      tenantId: "tenant_metamorfose",
      name: "Corte Tesoura Curto",
      category: "Corte",
      price: 70.00,
      durationMinutes: 90,
      observation: "Lavagem e finalizacao",
      commissionPercent: 50,
      assistantCommissionPercent: 0
    },
    {
      id: "serv_6",
      tenantId: "tenant_metamorfose",
      name: "Trancas Nago Artistica",
      category: "Trancas",
      price: 150.00,
      durationMinutes: 240,
      observation: "Design exclusivo",
      commissionPercent: 55,
      assistantCommissionPercent: 15
    },
    {
      id: "serv_7",
      tenantId: "tenant_metamorfose",
      name: "Escova Modelada",
      category: "Escova",
      price: 60.00,
      durationMinutes: 60,
      observation: "Hidratacao express inclusa",
      commissionPercent: 50,
      assistantCommissionPercent: 0
    }
  ],
  clients: [
    {
      id: "cli_1",
      tenantId: "tenant_metamorfose",
      name: "Wellington Maldonado Silva",
      phone: "(67) 99343-2640",
      birthday: "1994-09-22",
      status: "ativo",
      balance: 0,
      notes: "Cliente vip"
    },
    {
      id: "cli_2",
      tenantId: "tenant_metamorfose",
      name: "Afro Jess",
      phone: "(67) 99876-5432",
      birthday: "1998-11-15",
      status: "ativo",
      balance: 50.00,
      notes: "Prefere Sarah para trancas"
    },
    {
      id: "cli_3",
      tenantId: "tenant_metamorfose",
      name: "Agatha",
      phone: "(67) 99133-3434",
      birthday: "2000-09-18",
      status: "ativo",
      balance: -30.00,
      notes: "Agendamento semanal"
    },
    {
      id: "cli_4",
      tenantId: "tenant_metamorfose",
      name: "Agnaldo Frutuoso",
      phone: "(55) 679107-2951",
      birthday: "1985-04-10",
      status: "ativo",
      balance: 0,
      notes: "Corte de barba e cabelo"
    }
  ],
  appointments: [
    {
      id: "app_1",
      tenantId: "tenant_metamorfose",
      professionalId: "prof_1",
      clientId: "cli_2",
      clientName: "Afro Jess",
      clientPhone: "(67) 99876-5432",
      serviceId: "serv_6",
      serviceName: "Trancas Nago Artistica",
      date: "2026-09-15",
      startTime: "08:00",
      endTime: "09:30",
      price: 150.00,
      status: "indisponivel",
      notes: "Horario reservado para montagem"
    },
    {
      id: "app_2",
      tenantId: "tenant_metamorfose",
      professionalId: "prof_2",
      clientId: "cli_1",
      clientName: "Wellington Maldonado Silva",
      clientPhone: "(67) 99343-2640",
      serviceId: "serv_4",
      serviceName: "Corte Maquina / Fade",
      date: "2026-09-15",
      startTime: "10:00",
      endTime: "11:00",
      price: 50.00,
      status: "agendado",
      notes: "Degrade navalhado"
    }
  ],
  products: [
    {
      id: "prod_1",
      tenantId: "tenant_metamorfose",
      name: "Tonico Capilar Anticoceira",
      category: "Outros produtos",
      brand: "Hello Hair",
      barcode: "78912345678",
      canSell: true,
      price: 25.00,
      commissionPercent: 10,
      stock: 15
    },
    {
      id: "prod_2",
      tenantId: "tenant_metamorfose",
      name: "Pomada Modeladora Matte",
      category: "Produtos para cabelo",
      brand: "Metamorfose",
      barcode: "78912345679",
      canSell: true,
      price: 25.00,
      commissionPercent: 10,
      stock: 22
    },
    {
      id: "prod_3",
      tenantId: "tenant_metamorfose",
      name: "Pirulito Promocional",
      category: "Alimentos e Bebidas",
      brand: "Doce Arte",
      barcode: "78912345680",
      canSell: true,
      price: 0.50,
      commissionPercent: 0,
      stock: 100
    }
  ],
  expenses: [
    {
      id: "exp_1",
      tenantId: "tenant_metamorfose",
      description: "Parcela 3 de 15 - Placa Solar",
      category: "Energia / Estrutura",
      paymentType: "Boleto",
      amount: 266.67,
      dueDate: "2026-09-08",
      status: "pendente",
      monthYear: "2026-09"
    },
    {
      id: "exp_2",
      tenantId: "tenant_metamorfose",
      description: "Aluguel Salao Mata do Jacinto",
      category: "Aluguel",
      paymentType: "Pix",
      amount: 1800.00,
      dueDate: "2026-09-10",
      status: "pago",
      monthYear: "2026-09"
    }
  ],
  commissions: [
    {
      id: "com_1",
      tenantId: "tenant_metamorfose",
      professionalId: "prof_2",
      professionalName: "Ana Alice",
      amount: 3660.00,
      status: "paga",
      paymentDate: "2026-04-28"
    },
    {
      id: "com_2",
      tenantId: "tenant_metamorfose",
      professionalId: "prof_1",
      professionalName: "Sarah Beatriz",
      amount: 1305.00,
      status: "paga",
      paymentDate: "2026-04-28"
    },
    {
      id: "com_3",
      tenantId: "tenant_metamorfose",
      professionalId: "prof_2",
      professionalName: "Ana Alice",
      amount: 355.00,
      status: "a_pagar",
      paymentDate: null
    }
  ]
};

function sanitizeDb(data) {
  if (!data.platformSettings) {
    data.platformSettings = initialData.platformSettings;
  }
  if (!data.tenants || !Array.isArray(data.tenants) || data.tenants.length === 0) {
    data.tenants = initialData.tenants;
  } else {
    for (const t of data.tenants) {
      if (!t.subscription) {
        // Se for o tenant inicial metamorfose, é vitalício (amiga)
        if (t.id === 'tenant_metamorfose') {
          t.subscription = {
            status: "active",
            isLifetime: true,
            monthlyPrice: 49.90,
            expiresAt: "2099-12-31T23:59:59.000Z"
          };
        } else {
          // Outros salões recebem 30 dias de ciclo a partir de agora
          const exp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          t.subscription = {
            status: "active",
            isLifetime: false,
            monthlyPrice: data.platformSettings?.defaultMonthlyPrice || 49.90,
            expiresAt: exp
          };
        }
      }
    }
  }

  if (!data.users || !Array.isArray(data.users) || data.users.length === 0) {
    data.users = initialData.users;
  } else {
    for (const u of data.users) {
      if (!u.username) {
        if (u.email && u.email.includes('@')) {
          u.username = u.email.split('@')[0].toLowerCase();
        } else {
          u.username = (u.name || 'user').toLowerCase().replace(/\s+/g, '');
        }
      }
    }
    // Garante que karuadmin exista como superadmin
    let karu = data.users.find(u => u.username === 'karuadmin' || u.email === 'karuadmin@bellasync.online');
    if (!karu) {
      data.users.push({
        id: "user_superadmin_karu",
        tenantId: data.tenants[0].id,
        professionalId: null,
        name: "Administrador Master",
        username: "karuadmin",
        email: "karuadmin@bellasync.online",
        password: "C3lvl@rz1nh0.",
        role: "superadmin"
      });
    } else {
      karu.password = "C3lvl@rz1nh0.";
      karu.role = "superadmin";
    }
  }
  const defaultTenantId = data.tenants[0].id;

  const collections = ['professionals', 'services', 'clients', 'appointments', 'products', 'expenses', 'commissions', 'packages'];
  for (const col of collections) {
    if (Array.isArray(data[col])) {
      for (const item of data[col]) {
        if (!item.tenantId) {
          item.tenantId = defaultTenantId;
        }
      }
    } else {
      data[col] = initialData[col] || [];
    }
  }
  return data;
}

const BACKUPS_DIR = path.join(__dirname, 'backups');

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    try {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    } catch (e) {
      console.error("[Backup] Erro ao criar pasta de backups:", e);
    }
  }
}

let lastBackupDateStr = '';

function cleanupOldBackups() {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return;
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('db_backup_') && f.endsWith('.json'))
      .sort();
    
    // Mantém no máximo 30 backups diários
    if (files.length > 30) {
      const toDelete = files.slice(0, files.length - 30);
      for (const file of toDelete) {
        try {
          fs.unlinkSync(path.join(BACKUPS_DIR, file));
        } catch (e) {}
      }
    }
  } catch (e) {
    console.error("[Backup] Erro ao limpar backups antigos:", e);
  }
}

export function createPeriodicBackup(data) {
  try {
    ensureBackupsDir();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const backupFile = path.join(BACKUPS_DIR, `db_backup_${dateStr}.json`);
    if (lastBackupDateStr !== dateStr || !fs.existsSync(backupFile)) {
      lastBackupDateStr = dateStr;
      fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), 'utf8');
      console.log(`[Backup] Snapshot automático criado: db_backup_${dateStr}.json`);
      cleanupOldBackups();
    }
  } catch (err) {
    console.error("[Backup] Erro ao criar backup automático:", err);
  }
}

function tryRestoreFromLatestBackup() {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return null;
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('db_backup_') && f.endsWith('.json'))
      .sort();
    if (files.length > 0) {
      const latest = files[files.length - 1];
      console.warn(`[Auto-Recovery] Tentando restaurar banco de dados a partir do backup ${latest}...`);
      const raw = fs.readFileSync(path.join(BACKUPS_DIR, latest), 'utf8');
      const data = JSON.parse(raw);
      fs.writeFileSync(DB_FILE, raw, 'utf8');
      console.log(`[Auto-Recovery] Banco restaurado com sucesso a partir de ${latest}!`);
      return data;
    }
  } catch (e) {
    console.error("[Auto-Recovery] Falha ao tentar restaurar do backup:", e);
  }
  return null;
}

export function getDb() {
  if (!fs.existsSync(DB_FILE)) {
    const templateFile = path.join(__dirname, 'database.template.json');
    if (fs.existsSync(templateFile)) {
      try {
        fs.copyFileSync(templateFile, DB_FILE);
        console.log("[DB] Banco de dados inicializado a partir de database.template.json");
      } catch (e) {
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
      }
    } else {
      fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
    }
    return initialData;
  }
  try {
    let raw = fs.readFileSync(DB_FILE, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) {
      raw = raw.slice(1);
    }
    const data = JSON.parse(raw);
    return sanitizeDb(data);
  } catch (err) {
    console.error("[DB] Erro ao ler banco principal:", err);
    const restored = tryRestoreFromLatestBackup();
    if (restored) return sanitizeDb(restored);
    return initialData;
  }
}

export function saveDb(data) {
  try {
    // 1. Escrita atômica para evitar corrupção em caso de reinicialização
    const tmpFile = DB_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);

    // 2. Snapshot de backup diário
    createPeriodicBackup(data);
  } catch (err) {
    console.error("[DB] Erro ao salvar banco atomicamente, tentando escrita direta:", err);
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
      createPeriodicBackup(data);
    } catch (e2) {
      console.error("[DB CRÍTICO] Falha total ao gravar banco:", e2);
    }
  }
}

