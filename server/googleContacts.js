// server/googleContacts.js
// Módulo de integração direta com a Google People API (Google Contacts)
// Suporta OAuth 2.0, renovação automática de tokens e sincronização em segundo plano

export function getGoogleConfig(tenantId, db, req) {
  const tenant = (db.tenants || []).find(t => t.id === tenantId) || db.tenants[0];
  const gSettings = tenant?.settings?.googleContacts || {};

  const clientId = gSettings.clientId || process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = gSettings.clientSecret || process.env.GOOGLE_CLIENT_SECRET || '';

  const redirectUri = getRedirectUri(req, gSettings);

  return {
    enabled: !!gSettings.enabled,
    connected: !!(gSettings.connected && gSettings.tokens?.refresh_token),
    connectedEmail: gSettings.connectedEmail || '',
    connectedName: gSettings.connectedName || '',
    connectedAt: gSettings.connectedAt || '',
    nameSuffix: gSettings.nameSuffix !== undefined ? gSettings.nameSuffix : ' (Cliente)',
    autoSyncNewClients: gSettings.autoSyncNewClients !== false,
    hasClientId: !!clientId,
    hasClientSecret: !!clientSecret,
    clientId: clientId ? (clientId.substring(0, 12) + '...' + clientId.substring(clientId.length - 8)) : '',
    rawClientId: clientId,
    redirectUri
  };
}

export function saveGoogleConfig(tenantId, db, configData) {
  const tenant = (db.tenants || []).find(t => t.id === tenantId);
  if (!tenant) throw new Error('Salão não encontrado.');
  if (!tenant.settings) tenant.settings = {};
  if (!tenant.settings.googleContacts) tenant.settings.googleContacts = {};

  const g = tenant.settings.googleContacts;

  if (configData.clientId !== undefined) g.clientId = String(configData.clientId).trim();
  if (configData.clientSecret !== undefined) g.clientSecret = String(configData.clientSecret).trim();
  if (configData.nameSuffix !== undefined) g.nameSuffix = String(configData.nameSuffix);
  if (configData.autoSyncNewClients !== undefined) g.autoSyncNewClients = !!configData.autoSyncNewClients;
  if (configData.redirectUri !== undefined) g.redirectUri = String(configData.redirectUri).trim();
  if (configData.enabled !== undefined) g.enabled = !!configData.enabled;

  return g;
}

export function getRedirectUri(req, gSettings) {
  if (gSettings?.redirectUri && gSettings.redirectUri.trim()) {
    return gSettings.redirectUri.trim();
  }
  if (process.env.GOOGLE_REDIRECT_URI && process.env.GOOGLE_REDIRECT_URI.trim()) {
    return process.env.GOOGLE_REDIRECT_URI.trim();
  }
  if (req) {
    let proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'bellasync.online';
    if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
      proto = 'https';
    }
    return `${proto}://${host}/api/integrations/google/callback`;
  }
  return 'https://bellasync.online/api/integrations/google/callback';
}

export function getAuthUrl(tenantId, db, req) {
  const tenant = (db.tenants || []).find(t => t.id === tenantId) || db.tenants[0];
  const gSettings = tenant?.settings?.googleContacts || {};

  const clientId = gSettings.clientId || process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('Client ID do Google não configurado. Por favor, insira o Client ID nas configurações da integração.');
  }

  const redirectUri = getRedirectUri(req, gSettings);
  const scopes = [
    'https://www.googleapis.com/auth/contacts',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ].join(' ');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
    state: tenantId
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function handleAuthCallback(code, stateTenantId, db, req) {
  const tenantId = stateTenantId || 'tenant_metamorfose';
  const tenant = (db.tenants || []).find(t => t.id === tenantId) || db.tenants[0];
  if (!tenant) throw new Error('Salão não encontrado para este retorno de autenticação.');

  if (!tenant.settings) tenant.settings = {};
  if (!tenant.settings.googleContacts) tenant.settings.googleContacts = {};
  const gSettings = tenant.settings.googleContacts;

  const clientId = gSettings.clientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = gSettings.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getRedirectUri(req, gSettings);

  if (!clientId || !clientSecret) {
    throw new Error('Credenciais OAuth (Client ID ou Client Secret) ausentes.');
  }

  // Troca o código pelo token
  const tokenParams = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString()
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    console.error('[Google Contacts OAuth] Erro ao trocar token:', tokenData);
    throw new Error(tokenData.error_description || tokenData.error || 'Erro ao obter token do Google.');
  }

  // Busca dados do perfil do usuário para confirmar o email
  let userEmail = '';
  let userName = '';
  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    if (userRes.ok) {
      const userData = await userRes.json();
      userEmail = userData.email || '';
      userName = userData.name || '';
    }
  } catch (e) {
    console.error('[Google Contacts OAuth] Erro ao obter dados do usuário:', e);
  }

  // Salva tokens
  gSettings.enabled = true;
  gSettings.connected = true;
  gSettings.connectedEmail = userEmail;
  gSettings.connectedName = userName;
  gSettings.connectedAt = new Date().toISOString();
  gSettings.tokens = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || gSettings.tokens?.refresh_token || '',
    token_type: tokenData.token_type || 'Bearer',
    scope: tokenData.scope || '',
    expiry_date: Date.now() + (Number(tokenData.expires_in) || 3600) * 1000
  };

  return {
    success: true,
    email: userEmail,
    name: userName
  };
}

export function disconnectGoogle(tenantId, db) {
  const tenant = (db.tenants || []).find(t => t.id === tenantId);
  if (!tenant || !tenant.settings?.googleContacts) return;

  tenant.settings.googleContacts.connected = false;
  tenant.settings.googleContacts.connectedEmail = '';
  tenant.settings.googleContacts.connectedName = '';
  tenant.settings.googleContacts.tokens = null;
}

export async function getValidAccessToken(tenantId, db) {
  const tenant = (db.tenants || []).find(t => t.id === tenantId);
  if (!tenant || !tenant.settings?.googleContacts) return null;

  const g = tenant.settings.googleContacts;
  if (!g.connected || !g.tokens || !g.tokens.refresh_token) return null;

  // Se o access_token ainda for válido por mais de 2 minutos
  if (g.tokens.access_token && g.tokens.expiry_date && (g.tokens.expiry_date - Date.now() > 120000)) {
    return g.tokens.access_token;
  }

  // Renova o token via refresh_token
  const clientId = g.clientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = g.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: g.tokens.refresh_token,
      grant_type: 'refresh_token'
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
      console.error('[Google Contacts] Erro ao renovar token:', data);
      return null;
    }

    g.tokens.access_token = data.access_token;
    g.tokens.expiry_date = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    return data.access_token;
  } catch (err) {
    console.error('[Google Contacts] Falha na requisição de refresh:', err);
    return null;
  }
}

// Formata o número de telefone para o formato padrão do Google Contacts (+55 DD 9XXXX-XXXX)
export function formatPhoneForGoogle(rawPhone) {
  if (!rawPhone) return '';
  const digits = String(rawPhone).replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  if (digits.length === 12 || digits.length === 13) {
    if (digits.startsWith('55')) return `+${digits}`;
  }
  return digits.startsWith('+') ? digits : `+${digits}`;
}

// Sincroniza um cliente individual no Google Contatos
export async function syncClientToGoogle(tenantId, db, client) {
  if (!client || !client.name) return { success: false, reason: 'Cliente sem nome' };

  const tenant = (db.tenants || []).find(t => t.id === tenantId);
  const gSettings = tenant?.settings?.googleContacts;
  if (!gSettings || !gSettings.connected) {
    return { success: false, reason: 'Google Contatos não conectado' };
  }

  const accessToken = await getValidAccessToken(tenantId, db);
  if (!accessToken) {
    return { success: false, reason: 'Não foi possível obter token de acesso válido' };
  }

  const suffix = gSettings.nameSuffix !== undefined ? gSettings.nameSuffix : ' (Cliente)';
  const formattedPhone = formatPhoneForGoogle(client.phone);

  const cleanName = client.name.trim();
  const displayName = cleanName.endsWith(suffix.trim()) ? cleanName : `${cleanName}${suffix}`;

  // Verifica se o contato já existe no Google procurando pelo telefone para evitar duplicatas
  let existingResourceName = client.googleContactId || null;

  if (!existingResourceName && formattedPhone) {
    try {
      const searchRes = await fetch(
        `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(formattedPhone)}&readMask=names,phoneNumbers`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.results && searchData.results.length > 0) {
          existingResourceName = searchData.results[0].person?.resourceName || null;
        }
      }
    } catch (e) {
      console.warn('[Google Contacts] Aviso ao buscar contato existente:', e.message);
    }
  }

  const notesText = `Cliente BellaSync • ${tenant.name || 'Salão de Beleza'}\n` +
    (client.birthday ? `Aniversário: ${client.birthday}\n` : '') +
    (client.notes ? `Observações: ${client.notes}\n` : '') +
    `Sincronizado automaticamente via BellaSync CRM`;

  try {
    if (existingResourceName) {
      // Contato já existe no Google
      client.googleContactSynced = true;
      client.googleContactId = existingResourceName;
      client.googleSyncedAt = new Date().toISOString();
      return { success: true, contactId: existingResourceName, alreadyExisted: true };
    }

    // Cria novo contato
    const body = {
      names: [
        {
          givenName: displayName,
          displayName: displayName
        }
      ],
      biographies: [
        {
          value: notesText,
          contentType: 'TEXT_PLAIN'
        }
      ]
    };

    if (formattedPhone) {
      body.phoneNumbers = [
        {
          value: formattedPhone,
          type: 'mobile'
        }
      ];
    }

    const createRes = await fetch('https://people.googleapis.com/v1/people:createContact', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const createData = await createRes.json();
    if (!createRes.ok || !createData.resourceName) {
      console.error('[Google Contacts] Erro ao criar contato:', createData);
      return { success: false, error: createData.error?.message || 'Falha na API Google People' };
    }

    client.googleContactSynced = true;
    client.googleContactId = createData.resourceName;
    client.googleSyncedAt = new Date().toISOString();

    console.log(`[Google Contacts] Contato "${displayName}" criado com sucesso (${createData.resourceName}).`);
    return { success: true, contactId: createData.resourceName, created: true };
  } catch (err) {
    console.error('[Google Contacts] Exceção ao sincronizar contato:', err);
    return { success: false, error: err.message };
  }
}

// Sincroniza todos os clientes do salão para o Google Contatos em lote
export async function syncAllClientsToGoogle(tenantId, db) {
  const tenantClients = (db.clients || []).filter(c => c.tenantId === tenantId);
  let synced = 0;
  let skipped = 0;
  let errors = 0;

  for (const cli of tenantClients) {
    try {
      const res = await syncClientToGoogle(tenantId, db, cli);
      if (res.success) {
        synced++;
      } else {
        errors++;
      }
      // Pequena pausa de 100ms para respeitar limites de taxa da API do Google
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      errors++;
    }
  }

  return {
    total: tenantClients.length,
    synced,
    skipped,
    errors
  };
}
