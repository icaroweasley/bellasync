// Sessão de Usuário e Multi-Tenant
let currentUser = null;
let currentTenant = null;

try {
  currentUser = JSON.parse(localStorage.getItem('salon_user'));
  currentTenant = JSON.parse(localStorage.getItem('salon_tenant'));
} catch (e) {
  currentUser = null;
  currentTenant = null;
}

// Se não estiver logado, redireciona para a página de login
if (!currentUser || !currentTenant) {
  window.location.href = '/login';
}

function getButterflyAvatar(name) {
  let hash = 0;
  const str = String(name || 'Profissional');
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = (Math.abs(hash) % 8) + 1;
  return `/images/butterflies/butterfly-${index}.svg`;
}

const VALID_VIEWS = ['agenda', 'comissões', 'profissionais', 'clientes', 'servicos', 'pacotes', 'produtos', 'despesas', 'aniversarios', 'balanco', 'configuracoes', 'superadmin'];

function getInitialView() {
  try {
    const hash = decodeURIComponent(window.location.hash.replace('#', '')).trim();
    if (hash && VALID_VIEWS.includes(hash)) {
      return hash;
    }
  } catch (e) {}
  const saved = localStorage.getItem('bellasync_current_view');
  if (saved && VALID_VIEWS.includes(saved)) {
    return saved;
  }
  return 'agenda';
}

let currentView = getInitialView();

window.addEventListener('hashchange', () => {
  try {
    const hash = decodeURIComponent(window.location.hash.replace('#', '')).trim();
    if (hash && VALID_VIEWS.includes(hash) && hash !== currentView) {
      renderView(hash);
    }
  } catch (e) {}
});

let selectedProfessionalId = null;
let selectedDate = new Date().toISOString().split('T')[0];

let state = {
  settings: {},
  professionals: [],
  services: [],
  clients: [],
  appointments: [],
  products: [],
  expenses: [],
  commissions: []
};

const isSuperAdmin = currentUser && (currentUser.role === 'superadmin' || currentUser.username === 'karuadmin');
const isManager = Boolean(!currentUser || currentUser.role === 'admin' || currentUser.role === 'superadmin' || currentUser.role === 'gestor' || currentUser.isManager === true);
window.isSuperAdmin = isSuperAdmin;
window.isManager = isManager;

// Helper universal de fetch para injetar o x-tenant-id e autenticação automaticamente
async function tenantFetch(url, options = {}) {
  options.headers = {
    ...(options.headers || {}),
    'x-tenant-id': currentTenant ? currentTenant.id : 'tenant_metamorfose',
    'x-user-role': (currentUser && currentUser.role) || 'professional'
  };
  return fetch(url, options);
}

function updateBodyScrollLock() {
  setTimeout(() => {
    const anyOpen = document.querySelector('.modal-backdrop.open, .modal-backdrop.active');
    if (anyOpen) {
      document.body.classList.add('modal-open');
      document.documentElement.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
    }
  }, 10);
}

// Sistema de Modais Customizados (Substitutos de confirm() e alert() nativos)
window.asyncConfirm = function(message, title = 'Confirmação', options = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customConfirmModal');
    if (!modal) {
      resolve(window.confirm(message));
      return;
    }
    const titleEl = document.getElementById('customConfirmTitle');
    const msgEl = document.getElementById('customConfirmMessage');
    const okBtn = document.getElementById('customConfirmOkBtn');
    const cancelBtn = document.getElementById('customConfirmCancelBtn');
    const iconEl = document.getElementById('customConfirmIcon');

    if (titleEl) titleEl.innerText = title;
    if (msgEl) msgEl.innerText = message;

    if (options.isDanger) {
      if (okBtn) okBtn.className = 'btn-falcon btn-danger';
      if (iconEl) {
        iconEl.style.background = 'rgba(211, 47, 47, 0.12)';
        iconEl.style.color = '#d32f2f';
      }
    } else {
      if (okBtn) okBtn.className = 'btn-falcon btn-primary';
      if (iconEl) {
        iconEl.style.background = 'rgba(255, 105, 0, 0.12)';
        iconEl.style.color = '#ff6900';
      }
    }

    if (options.okText && okBtn) okBtn.innerText = options.okText;
    else if (okBtn) okBtn.innerText = 'Confirmar';

    if (options.cancelText && cancelBtn) cancelBtn.innerText = options.cancelText;
    else if (cancelBtn) cancelBtn.innerText = 'Cancelar';

    modal.classList.add('open');
    modal.classList.add('active');
    updateBodyScrollLock();

    function cleanup(result) {
      modal.classList.remove('open');
      modal.classList.remove('active');
      updateBodyScrollLock();
      if (okBtn) okBtn.removeEventListener('click', onOk);
      if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }

    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }

    if (okBtn) okBtn.addEventListener('click', onOk);
    if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
  });
};

const nativeAlert = window.alert;
window.asyncAlert = function(message, title = 'Aviso', type = 'info') {
  return new Promise((resolve) => {
    const modal = document.getElementById('customAlertModal');
    if (!modal) {
      if (typeof nativeAlert === 'function') nativeAlert(message);
      resolve();
      return;
    }
    const titleEl = document.getElementById('customAlertTitle');
    const msgEl = document.getElementById('customAlertMessage');
    const okBtn = document.getElementById('customAlertOkBtn');
    const iconEl = document.getElementById('customAlertIcon');

    if (titleEl) titleEl.innerText = title;
    if (msgEl) msgEl.innerText = message;

    if (type === 'error' || type === 'danger') {
      if (iconEl) {
        iconEl.style.background = 'rgba(211, 47, 47, 0.12)';
        iconEl.style.color = '#d32f2f';
        iconEl.innerHTML = `<svg width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
      }
    } else if (type === 'success') {
      if (iconEl) {
        iconEl.style.background = 'rgba(26, 102, 54, 0.14)';
        iconEl.style.color = '#1a6636';
        iconEl.innerHTML = `<svg width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
      }
    } else {
      if (iconEl) {
        iconEl.style.background = 'rgba(255, 105, 0, 0.12)';
        iconEl.style.color = '#ff6900';
        iconEl.innerHTML = `<svg width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
      }
    }

    modal.classList.add('open');
    modal.classList.add('active');
    updateBodyScrollLock();

    let resolved = false;
    function cleanup() {
      if (resolved) return;
      resolved = true;
      modal.classList.remove('open');
      modal.classList.remove('active');
      updateBodyScrollLock();
      if (okBtn) okBtn.removeEventListener('click', onOk);
      modal.removeEventListener('click', onBackdrop);
      window.removeEventListener('keydown', onKeyDown);
      resolve();
    }

    function onOk() { cleanup(); }
    function onBackdrop(e) { if (e.target === modal) cleanup(); }
    function onKeyDown(e) { if (e.key === 'Enter' || e.key === 'Escape') cleanup(); }

    if (okBtn) okBtn.addEventListener('click', onOk);
    modal.addEventListener('click', onBackdrop);
    window.addEventListener('keydown', onKeyDown);
  });
};

window.alert = function(msg) {
  window.asyncAlert(msg, 'Aviso', 'info');
};

window.logout = async function() {
  try {
    const confirmed = await asyncConfirm('Deseja realmente sair do sistema?', 'Sair do Sistema', { isDanger: true });
    if (confirmed) {
      localStorage.removeItem('salon_token');
      localStorage.removeItem('salon_user');
      localStorage.removeItem('salon_tenant');
      window.location.href = '/login';
    }
  } catch (err) {
    console.error('Erro ao efetuar logout:', err);
    localStorage.removeItem('salon_token');
    localStorage.removeItem('salon_user');
    localStorage.removeItem('salon_tenant');
    window.location.href = '/login';
  }
};

// Sistema de Notificações Nativas do Navegador & Push PWA
let knownAppointmentIds = new Set();
let notificationsInitialized = false;
let notificationHistory = [];

// Carrega histórico salvo em localStorage
try {
  const savedNotifs = localStorage.getItem('salon_notif_history');
  if (savedNotifs) {
    notificationHistory = JSON.parse(savedNotifs);
  }
} catch (e) {
  notificationHistory = [];
}

function saveNotificationToHistory(notifItem) {
  notificationHistory.unshift(notifItem);
  if (notificationHistory.length > 20) {
    notificationHistory = notificationHistory.slice(0, 20);
  }
  try {
    localStorage.setItem('salon_notif_history', JSON.stringify(notificationHistory));
  } catch (e) {}
  renderNotificationDropdown();
}

function renderNotificationDropdown() {
  const listEl = document.getElementById('notifDropdownList');
  if (!listEl) return;

  if (notificationHistory.length === 0) {
    listEl.innerHTML = '<div class="notif-empty">Nenhuma notificação recente.</div>';
    return;
  }

  listEl.innerHTML = notificationHistory.map(item => `
    <div class="notif-item" onclick="handleNotificationItemClick('${item.id}', '${item.date || ''}', '${item.profId || ''}')">
      <div class="notif-item-icon">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
      </div>
      <div class="notif-item-content">
        <div class="notif-item-title">${item.title}</div>
        <div class="notif-item-desc">${item.body}</div>
        <div class="notif-item-time">${item.timeStr || 'Agora'}</div>
      </div>
    </div>
  `).join('');
}

window.handleNotificationItemClick = function(id, date, profId) {
  const drop = document.getElementById('notifDropdown');
  if (drop) drop.style.display = 'none';

  if (date) selectedDate = date;
  if (profId) selectedProfessionalId = profId;
  if (typeof renderView === 'function') {
    renderView('agenda');
  }
};

window.handleNotificationBellClick = async function() {
  const dropdown = document.getElementById('notifDropdown');
  if (!dropdown) return;

  // Se não tem permissão concedida ainda, primeiro solicita permissão
  if ('Notification' in window && Notification.permission === 'default') {
    await requestPushPermissionManually();
    return;
  }

  // Se já tem permissão concedida ou recusada, abre/fecha o painel com as últimas notificações
  const isCurrentlyOpen = dropdown.style.display === 'block';
  if (isCurrentlyOpen) {
    dropdown.style.display = 'none';
  } else {
    renderNotificationDropdown();
    dropdown.style.display = 'block';
  }
};

// Fecha o dropdown ao clicar fora
document.addEventListener('click', (e) => {
  const notifWrapper = document.querySelector('.notif-wrapper');
  const dropdown = document.getElementById('notifDropdown');
  if (dropdown && dropdown.style.display === 'block') {
    if (notifWrapper && !notifWrapper.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  }
});

function playNotificationSound() {
  if (state && state.settings && state.settings.notifySound === false) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    // Tom suave e agradável: acorde rápido de notificação
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (e) {
    // Áudio opcional se bloqueado pelo navegador
  }
}

function updateNotificationBadge() {
  const badge = document.getElementById('notifBadge');
  const btn = document.getElementById('notifToggleBtn');
  const permBtn = document.getElementById('notifPermBtn');
  if (!btn || !badge) return;

  if (!('Notification' in window)) {
    btn.style.display = 'none';
    return;
  }

  if (Notification.permission === 'granted') {
    btn.classList.add('active');
    btn.classList.remove('denied');
    btn.title = 'Notificações ativadas (Clique para ver o histórico)';
    badge.style.display = 'block';
    if (permBtn) permBtn.innerText = 'Push Ativo ✓';
  } else if (Notification.permission === 'denied') {
    btn.classList.remove('active');
    btn.classList.add('denied');
    btn.title = 'Notificações bloqueadas nas permissões do navegador';
    badge.style.display = 'block';
    if (permBtn) permBtn.innerText = 'Bloqueado';
  } else {
    btn.classList.remove('active');
    btn.classList.remove('denied');
    btn.title = 'Clique para ativar notificações de novos agendamentos';
    badge.style.display = 'none';
    if (permBtn) permBtn.innerText = 'Ativar Push';
  }
}

window.requestPushPermissionManually = async function() {
  if (!('Notification' in window)) {
    asyncAlert('Seu navegador não suporta notificações.');
    return;
  }

  if (Notification.permission === 'denied') {
    asyncAlert('As notificações estão bloqueadas nas configurações do navegador para este site. Por favor, clique no ícone de ajustes/cadeado na barra de endereços para permitir notificações.');
    return;
  }

  try {
    const perm = await Notification.requestPermission();
    updateNotificationBadge();
    if (perm === 'granted') {
      // Registra Service Worker se suportado para push em background
      if ('serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.register('/sw.js');
        } catch (swErr) {
          console.warn('SW register note:', swErr);
        }
      }

      playNotificationSound();
      showSystemOrSwNotification('BellaSync — Notificações Ativadas! 🔔', {
        body: 'Pronto! Você receberá alertas de agendamentos na tela do seu celular e computador.',
        icon: '/images/logo.png'
      });

      // Inscreve dispositivo no Web Push VAPID do servidor
      subscribeUserToWebPush();
    }
  } catch (e) {
    console.error('Erro ao pedir permissão:', e);
  }
};

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeUserToWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const res = await fetch('/api/push/vapid-public-key');
      const { publicKey } = await res.json();
      if (!publicKey) return;

      const convertedKey = urlBase64ToUint8Array(publicKey);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey
      });
    }

    const tenantId = currentUser?.tenantId || (typeof getTenantIdFromUrl === 'function' ? getTenantIdFromUrl() : 'tenant_metamorfose');
    const professionalId = currentUser?.professionalId || null;

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId
      },
      body: JSON.stringify({
        subscription: sub,
        professionalId
      })
    });
  } catch (err) {
    console.warn('Erro ao assinar Web Push VAPID:', err);
  }
}


window.toggleBrowserNotifications = window.handleNotificationBellClick;

async function showSystemOrSwNotification(title, options) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  // Se o Service Worker estiver ativo no celular/PWA, exibe através dele para notificação push no sistema
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) {
        return reg.showNotification(title, options);
      }
    } catch (e) {
      // Fallback para new Notification
    }
  }

  // Fallback padrão
  try {
    const notif = new Notification(title, options);
    if (options.data && options.data.url) {
      notif.onclick = () => {
        window.focus();
      };
    }
  } catch (e) {}
}

function checkAndNotifyNewAppointments(appointmentsList) {
  if (!Array.isArray(appointmentsList)) return;
  if (state.settings && state.settings.notifyNewAppointments === false) return;

  // Na primeira carga, apenas memoriza os IDs existentes para não disparar enxurrada
  if (!notificationsInitialized) {
    appointmentsList.forEach(a => knownAppointmentIds.add(a.id));
    notificationsInitialized = true;
    return;
  }

  const myProfId = currentUser?.professionalId;
  const isAdm = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  appointmentsList.forEach(app => {
    if (!knownAppointmentIds.has(app.id)) {
      knownAppointmentIds.add(app.id);

      // Dispara se for para o profissional logado OU se for gestor/admin
      const shouldNotify = (myProfId && app.professionalId === myProfId) || isAdm;
      if (shouldNotify && app.status !== 'cancelado' && app.status !== 'indisponivel') {
        playNotificationSound();

        const profName = state.professionals.find(p => p.id === app.professionalId)?.name || '';
        const bodyText = isAdm && !myProfId 
          ? `${app.clientName} agendou ${app.serviceName} com ${profName} para ${app.date} às ${app.startTime}.`
          : `Olá! ${app.clientName} agendou ${app.serviceName} com você para ${app.date} às ${app.startTime}.`;

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        // Salva no histórico do sino
        saveNotificationToHistory({
          id: app.id,
          title: 'Novo Agendamento Confirmado! 📅',
          body: bodyText,
          timeStr: timeStr,
          date: app.date,
          profId: app.professionalId
        });

        // Dispara notificação push / nativa
        showSystemOrSwNotification('Novo Agendamento Confirmado! 📅', {
          body: bodyText,
          icon: '/images/logo.png',
          badge: '/images/logo.png',
          tag: app.id,
          data: {
            url: '/',
            appId: app.id
          }
        });
      }
    }
  });
}

let birthdayNotificationsChecked = false;
function checkAndNotifyBirthdays() {
  if (birthdayNotificationsChecked) return;
  if (!state.clients || !Array.isArray(state.clients)) return;
  if (state.settings && state.settings.notifyBirthdays === false) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const todayBirthdays = state.clients.filter(c => c.birthday && isBirthdayToday(c.birthday, month, day));

  if (todayBirthdays.length > 0) {
    birthdayNotificationsChecked = true;
    todayBirthdays.forEach(cli => {
      const notifId = `bday_${todayStr}_${cli.id}`;
      saveNotificationToHistory({
        id: notifId,
        title: '🎂 Aniversariante do Dia!',
        body: `Hoje é aniversário de ${cli.name}! Envie os parabéns ou ofereça um mimo especial.`,
        timeStr: '08:00',
        date: todayStr
      });

      showSystemOrSwNotification('🎂 Aniversariante do Dia!', {
        body: `Hoje é aniversário de ${cli.name}! Envie os parabéns ou ofereça um mimo especial.`,
        icon: '/images/logo.png',
        badge: '/images/logo.png',
        tag: notifId,
        data: { url: '/' }
      });
    });
  }
}


// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  // Se as notificações já estiverem concedidas, garante a assinatura Web Push VAPID em segundo plano
  if ('Notification' in window && Notification.permission === 'granted') {
    subscribeUserToWebPush();
  }

  // Atualiza identificação do usuário e salão na tela
  const nameEl = document.getElementById('userDisplayName');
  const roleEl = document.getElementById('userDisplayRole');
  const userAvatarEl = document.getElementById('sidebarUserAvatar');
  const salonNameEl = document.getElementById('salonHeaderName');
  const salonLogoEl = document.getElementById('sidebarSalonLogo');
  const publicLinkEl = document.getElementById('publicBookingLink');

  if (nameEl && currentUser) nameEl.innerText = currentUser.name;
  if (roleEl && currentUser) {
    if (currentUser.role === 'superadmin') {
      roleEl.innerText = 'Administrador Master';
    } else if (currentUser.role === 'admin') {
      roleEl.innerText = 'Gestor Geral';
    } else {
      roleEl.innerText = 'Profissional';
    }
  }

  if (userAvatarEl && currentUser) {
    const profMatch = currentUser.professionalId ? (state.professionals || []).find(p => p.id === currentUser.professionalId) : null;
    const userPhoto = currentUser.avatar || profMatch?.avatar || getButterflyAvatar(currentUser.name);
    userAvatarEl.src = userPhoto;
  }

  if (salonNameEl && currentTenant) salonNameEl.innerText = currentTenant.name;
  if (salonLogoEl && currentTenant) {
    const sLogo = currentTenant.logo || currentTenant.photo || state.settings?.logo || state.settings?.photo;
    if (sLogo) salonLogoEl.src = sLogo;
  }
  if (publicLinkEl && currentTenant) {
    publicLinkEl.href = `/agendar?salao=${currentTenant.slug || currentTenant.id}`;
  }

  // Se for superadmin, exibe o botão da Gestão Master no sidebar
  const navSuperAdmin = document.getElementById('navItemSuperAdmin');
  if (navSuperAdmin && isSuperAdmin) {
    navSuperAdmin.style.display = 'flex';
  }

  const navBalanco = document.getElementById('navItemBalanco');
  const navConfig = document.getElementById('navItemConfiguracoes');
  if (navBalanco) navBalanco.style.display = 'flex';
  if (navConfig) navConfig.style.display = 'flex';

  // Se o usuário logado for profissional com ID associado, foca nele por padrão
  if (currentUser && currentUser.professionalId) {
    selectedProfessionalId = currentUser.professionalId;
  }

  setupNavigation();
  setupMobileToggle();
  await loadInitialData();
  
  // Se voltou do checkout de assinatura do Mercado Pago com sucesso
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('status') === 'success' || urlParams.get('subscription') === 'success') {
    asyncAlert('Sua assinatura no Cartão foi cadastrada com sucesso! O acesso está liberado.');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  await checkSubscriptionStatus();
  renderView(currentView);

  const fab = document.getElementById('fabBtn');
  if (fab) {
    fab.addEventListener('click', () => {
      handleFabClick();
    });
  }

  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('modalCancelBtn').addEventListener('click', closeModal);

  // Registra Service Worker se suportado
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  let lastAppointmentsHash = '';

  // Polling inteligente em segundo plano a cada 4s para sincronia instantânea sem re-render desnecessário
  setInterval(async () => {
    try {
      const res = await tenantFetch('/api/appointments');
      if (res.ok) {
        const apps = await res.json();
        const newHash = JSON.stringify(apps);
        checkAndNotifyNewAppointments(apps);
        
        if (newHash !== lastAppointmentsHash) {
          lastAppointmentsHash = newHash;
          state.appointments = apps;
          if (currentView === 'agenda') {
            updateScheduleView();
          }
        }
      }
    } catch (e) {
      // Ignora pequenos soluços de rede transitórios
    }
  }, 4000);
});

async function loadInitialData() {
  try {
    const [settings, profs, servs, clis, apps, prods, exps, comms, pkgs] = await Promise.all([
      tenantFetch('/api/settings').then(r => r.json()),
      tenantFetch('/api/professionals').then(r => r.json()),
      tenantFetch('/api/services').then(r => r.json()),
      tenantFetch('/api/clients').then(r => r.json()),
      tenantFetch('/api/appointments').then(r => r.json()),
      tenantFetch('/api/products').then(r => r.json()),
      tenantFetch('/api/expenses').then(r => r.json()),
      tenantFetch('/api/commissions').then(r => r.json()),
      tenantFetch('/api/packages').then(r => r.json()).catch(() => [])
    ]);

    state = {
      settings,
      professionals: profs,
      services: servs,
      clients: clis,
      appointments: apps,
      products: prods,
      expenses: exps,
      commissions: comms,
      packages: pkgs || []
    };

    checkAndNotifyNewAppointments(apps);
    checkAndNotifyBirthdays();
    updateNotificationBadge();

    if (state.professionals.length > 0 && !selectedProfessionalId) {
      selectedProfessionalId = state.professionals[0].id;
    }
  } catch (err) {
    console.error("Erro ao carregar dados da API:", err);
  }
}

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      currentView = item.dataset.view;
      renderView(currentView);

      // Fecha sidebar no mobile
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebarOverlay');
      if (sidebar) sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('active');
    });
  });
}

function setupMobileToggle() {
  const toggleBtn = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('active', sidebar.classList.contains('open'));
    });
  }

  if (overlay && sidebar) {
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });
  }

  document.addEventListener('click', (e) => {
    if (sidebar && sidebar.classList.contains('open')) {
      if (!sidebar.contains(e.target) && (!toggleBtn || !toggleBtn.contains(e.target))) {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
      }
    }
  });
}

// Controle de Ação Contextual do Botão Flutuante (+)
function updateFabButton(view) {
  const fab = document.getElementById('fabBtn');
  if (!fab) return;

  // Determina se deve exibir o FAB e qual o título
  let title = '';
  let show = true;

  switch (view) {
    case 'agenda':
      title = 'Novo Agendamento';
      show = true;
      break;
    case 'clientes':
      title = 'Novo Cliente';
      show = true;
      break;
    case 'profissionais':
      title = 'Novo Profissional';
      show = isManager;
      break;
    case 'servicos':
      title = 'Novo Serviço';
      show = isManager;
      break;
    case 'produtos':
      title = 'Novo Produto';
      show = isManager;
      break;
    case 'despesas':
      title = 'Nova Despesa';
      show = isManager;
      break;
    case 'comissões':
      title = 'Lançar Comissão / Vale';
      show = isManager;
      break;
    case 'aniversarios':
    case 'configuracoes':
    default:
      show = false;
      break;
  }

  fab.style.display = show ? 'grid' : 'none';
  fab.title = title;
}

window.handleFabClick = function() {
  switch (currentView) {
    case 'agenda':
      openNewAppointmentModal();
      break;
    case 'comissões':
      if (isManager) openNewCommissionModal();
      break;
    case 'clientes':
      openNewClientModal();
      break;
    case 'profissionais':
      if (isManager) openNewProfessionalModal();
      break;
    case 'servicos':
      if (isManager) openNewServiceModal();
      break;
    case 'produtos':
      if (isManager) openNewProductModal();
      break;
    case 'despesas':
      if (isManager) openNewExpenseModal();
      break;
    default:
      break;
  }
};

// Router simples das Views
function renderView(view) {
  if (!VALID_VIEWS.includes(view)) view = 'agenda';
  currentView = view;

  try {
    localStorage.setItem('bellasync_current_view', view);
    if (window.location.hash !== '#' + view) {
      window.history.replaceState(null, '', '#' + view);
    }
  } catch (e) {}

  // Sincroniza classe active nos botões do menu lateral
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });

  const container = document.getElementById('viewContainer');
  const title = document.getElementById('currentViewTitle');
  if (title) title.style.display = 'block';
  const actions = document.getElementById('topBarActions');
  actions.innerHTML = '';

  updateFabButton(view);


  switch (view) {
    case 'agenda':
      title.innerText = 'Agenda do Salão';
      renderAgenda(container, actions);
      break;
    case 'comissões':
      title.innerText = 'Comissões & Vales';
      renderCommissions(container, actions);
      break;
    case 'profissionais':
      title.innerText = 'Profissionais Cadastrados';
      renderProfessionals(container, actions);
      break;
    case 'clientes':
      title.innerText = 'Clientes';
      renderClients(container, actions);
      break;
    case 'servicos':
      title.innerText = 'Serviços';
      renderServices(container, actions);
      break;
    case 'pacotes':
      title.innerText = 'Pacotes de Serviços & Check-list';
      renderPackages(container, actions);
      break;
    case 'produtos':
      title.innerText = 'Produtos & Estoque';
      renderProducts(container, actions);
      break;
    case 'despesas':
      title.innerText = 'Controle de Despesas';
      renderExpenses(container, actions);
      break;
    case 'aniversarios':
      title.innerText = 'Aniversariantes';
      renderBirthdays(container, actions);
      break;
    case 'balanco':
      title.innerText = 'Balanço Mensal & Metas';
      renderBalanco(container, actions);
      break;
    case 'configuracoes':
      title.innerText = isManager ? 'Configurações do Salão' : 'Notificações & Preferências';
      renderSettings(container, actions);
      break;
    case 'superadmin':
      title.innerText = 'Gestão Master — BellaSync SaaS';
      renderSuperAdmin(container, actions);
      break;
    default:
      container.innerHTML = `<div class="card-shell"><h3>Em desenvolvimento...</h3></div>`;
  }
}

// 1. Render Agenda
// Helper de Formatação da Data (ex: "seg, 21/09/2026")
function formatFormattedDateTitle(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const weekDays = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const dayName = weekDays[dt.getDay()];
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${dayName}, ${dd}/${mm}/${y}`;
}

window.navigateAgendaDate = function(daysDelta) {
  const [y, m, d] = selectedDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + daysDelta);
  const newY = dt.getFullYear();
  const newM = String(dt.getMonth() + 1).padStart(2, '0');
  const newD = String(dt.getDate()).padStart(2, '0');
  selectedDate = `${newY}-${newM}-${newD}`;
  
  const container = document.getElementById('viewContainer');
  const actions = document.getElementById('topBarActions');
  renderAgenda(container, actions);
};

let popoverMonthState = null;

window.toggleCalendarPopover = function(e) {
  if (e) e.stopPropagation();
  let existing = document.getElementById('calendarPopover');
  if (existing) {
    existing.remove();
    return;
  }

  const [y, m] = selectedDate.split('-').map(Number);
  popoverMonthState = { year: y, month: m - 1 };

  const triggerBtn = document.getElementById('agendaDatePickerTrigger');
  if (!triggerBtn) return;

  const popover = document.createElement('div');
  popover.className = 'calendar-popover';
  popover.id = 'calendarPopover';

  renderPopoverCalendarContent(popover);

  const rect = triggerBtn.getBoundingClientRect();
  const leftPos = Math.min(window.innerWidth - 175, Math.max(175, rect.left + rect.width / 2));
  popover.style.position = 'fixed';
  popover.style.top = `${rect.bottom + 8}px`;
  popover.style.left = `${leftPos}px`;
  popover.style.transform = 'translateX(-50%)';
  popover.style.zIndex = '999999';

  document.body.appendChild(popover);

  setTimeout(() => {
    const closeListener = (evt) => {
      if (popover && !popover.contains(evt.target) && evt.target !== triggerBtn && !triggerBtn.contains(evt.target)) {
        popover.remove();
        document.removeEventListener('click', closeListener);
      }
    };
    document.addEventListener('click', closeListener);
  }, 50);
};

window.toggleMobileActionsDropdown = function(e) {
  if (e) e.stopPropagation();
  let existing = document.getElementById('mobileActionsDropdown');
  if (existing) {
    existing.remove();
    return;
  }

  const triggerBtn = document.getElementById('mobileActionsTrigger');
  if (!triggerBtn) return;

  const drop = document.createElement('div');
  drop.id = 'mobileActionsDropdown';
  drop.className = 'mobile-actions-dropdown';

  const isList = state.settings.agendaViewMode === 'list';
  const maxDays = state.settings.maxBookingDaysAhead || 30;

  drop.innerHTML = `
    <div class="mobile-action-menu-item" onclick="openAgendaViewModeModal(); document.getElementById('mobileActionsDropdown')?.remove();">
      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">${isList ? '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>' : '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line>'}</svg>
      <div>
        <div style="font-weight:700; color:#0f172a;">Modo: ${isList ? 'Lista' : 'Calendário'}</div>
        <div style="font-size:0.75rem; color:#64748b;">Alternar exibição da agenda</div>
      </div>
    </div>

    <div class="mobile-action-menu-item" onclick="openBlockTimeModal(); document.getElementById('mobileActionsDropdown')?.remove();">
      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
      <div>
        <div style="font-weight:700; color:#0f172a;">Bloquear Horários</div>
        <div style="font-size:0.75rem; color:#64748b;">Fechar horários / folgas</div>
      </div>
    </div>

    ${isManager ? `
    <div class="mobile-action-menu-item" onclick="openBookingRulesModal(); document.getElementById('mobileActionsDropdown')?.remove();">
      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line></svg>
      <div>
        <div style="font-weight:700; color:#0f172a;">Agendamento Online (${maxDays}d)</div>
        <div style="font-size:0.75rem; color:#64748b;">Janela de dias futuros</div>
      </div>
    </div>
    ` : ''}

    <div class="mobile-action-menu-item" onclick="refreshAgendaData(); document.getElementById('mobileActionsDropdown')?.remove();">
      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
      <div>
        <div style="font-weight:700; color:#0f172a;">Atualizar Dados</div>
        <div style="font-size:0.75rem; color:#64748b;">Recarregar informações</div>
      </div>
    </div>
  `;

  const rect = triggerBtn.getBoundingClientRect();
  drop.style.position = 'fixed';
  drop.style.top = `${rect.bottom + 8}px`;
  drop.style.left = `${Math.min(window.innerWidth - 130, Math.max(130, rect.left + rect.width / 2))}px`;
  drop.style.transform = 'translateX(-50%)';
  drop.style.zIndex = '999999';

  document.body.appendChild(drop);

  setTimeout(() => {
    const closeListener = (evt) => {
      if (drop && !drop.contains(evt.target) && evt.target !== triggerBtn && !triggerBtn.contains(evt.target)) {
        drop.remove();
        document.removeEventListener('click', closeListener);
      }
    };
    document.addEventListener('click', closeListener);
  }, 50);
};

function renderPopoverCalendarContent(popover) {
  const { year, month } = popoverMonthState;
  const monthNames = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
  const monthLabel = `${monthNames[month].slice(0, 4)}. DE ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const appointmentDates = new Set();
  (state.appointments || []).forEach(a => {
    if (a.status !== 'cancelado' && a.date) {
      const [ay, am, ad] = a.date.split('-').map(Number);
      if (ay === year && am === month + 1) {
        appointmentDates.add(ad);
      }
    }
  });

  let cellsHtml = '';

  for (let i = firstDay - 1; i >= 0; i--) {
    const dayNum = prevMonthDays - i;
    cellsHtml += `<div class="popover-day-cell other-month">${dayNum}</div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const currentMonthStr = String(month + 1).padStart(2, '0');
    const currentDayStr = String(day).padStart(2, '0');
    const fullDateStr = `${year}-${currentMonthStr}-${currentDayStr}`;

    const isSelected = fullDateStr === selectedDate;
    const hasApp = appointmentDates.has(day);

    cellsHtml += `
      <div class="popover-day-cell ${isSelected ? 'selected' : ''}" onclick="selectDateFromPopover('${fullDateStr}')">
        <span>${day}</span>
        ${hasApp ? '<span class="dot-indicator"></span>' : ''}
      </div>
    `;
  }

  const totalCellsSoFar = firstDay + daysInMonth;
  const trailingCells = (7 - (totalCellsSoFar % 7)) % 7;
  for (let i = 1; i <= trailingCells; i++) {
    cellsHtml += `<div class="popover-day-cell other-month">${i}</div>`;
  }

  popover.innerHTML = `
    <div class="popover-month-header">
      <span style="display:flex; align-items:center; gap:4px;">${monthLabel} ▾</span>
      <div style="display:flex; align-items:center; gap:8px;">
        <button class="btn-date-nav" onclick="navigatePopoverMonth(-1)">‹</button>
        <button class="btn-date-nav" onclick="navigatePopoverMonth(1)">›</button>
      </div>
    </div>
    <div class="popover-days-grid">
      <div class="popover-weekday-label">D</div>
      <div class="popover-weekday-label">S</div>
      <div class="popover-weekday-label">T</div>
      <div class="popover-weekday-label">Q</div>
      <div class="popover-weekday-label">Q</div>
      <div class="popover-weekday-label">S</div>
      <div class="popover-weekday-label">S</div>
      ${cellsHtml}
    </div>
  `;
}

window.navigatePopoverMonth = function(delta) {
  let { year, month } = popoverMonthState;
  month += delta;
  if (month < 0) {
    month = 11;
    year--;
  } else if (month > 11) {
    month = 0;
    year++;
  }
  popoverMonthState = { year, month };
  const popover = document.getElementById('calendarPopover');
  if (popover) renderPopoverCalendarContent(popover);
};

window.selectDateFromPopover = function(fullDateStr) {
  selectedDate = fullDateStr;
  const popover = document.getElementById('calendarPopover');
  if (popover) popover.remove();

  const container = document.getElementById('viewContainer');
  const actions = document.getElementById('topBarActions');
  renderAgenda(container, actions);
};

let agendaPollingInterval = null;

window.changeAgendaDate = function(dayOffset) {
  if (!selectedDate) selectedDate = new Date().toISOString().split('T')[0];
  const [y, m, d] = selectedDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + dayOffset);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  selectedDate = `${year}-${month}-${day}`;
  const container = document.getElementById('viewContainer');
  const actions = document.getElementById('topBarActions');
  if (container && actions) {
    renderAgenda(container, actions);
  }
};

function renderAgenda(container, actions) {
  const titleEl = document.getElementById('currentViewTitle');
  if (titleEl) {
    titleEl.style.display = 'block';
  }
  const maxDays = state.settings.maxBookingDaysAhead || 30;

  actions.innerHTML = `
    <div class="agenda-actions-wrapper">
      <div class="agenda-header-datepicker">
        <button class="btn-date-nav" onclick="navigateAgendaDate(-1)" title="Dia anterior">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg>
        </button>

        <button class="btn-date-picker-trigger" id="agendaDatePickerTrigger" onclick="toggleCalendarPopover(event)">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <span>${formatFormattedDateTitle(selectedDate)}</span>
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"></path></svg>
        </button>

        <button class="btn-date-nav" onclick="navigateAgendaDate(1)" title="Próximo dia">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"></path></svg>
        </button>
      </div>

      <div class="desktop-topbar-actions" style="display:flex; align-items:center; gap:6px;">
        <button class="btn-falcon btn-secondary" onclick="openAgendaViewModeModal()" title="Alternar modo de visualização (Calendário ou Lista)">
          ${state.settings.agendaViewMode === 'list' ? `
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
            <span>Modo: Lista</span>
          ` : `
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            <span>Modo: Calendário</span>
          `}
        </button>

        <button class="btn-falcon btn-secondary" onclick="openBlockTimeModal()" title="Bloquear horários ou fechar mais cedo">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
          <span>Bloquear</span>
        </button>

        <button class="btn-falcon btn-secondary" onclick="openBookingRulesModal()" title="Configurar janela de dias futuros e regras de agendamento online">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <span>Online: ${maxDays}d</span>
        </button>

        <button class="btn-falcon btn-secondary" onclick="refreshAgendaData()" title="Atualizar dados da grade">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          <span>Atualizar</span>
        </button>
      </div>

      <div class="mobile-topbar-actions">
        <button class="btn-falcon btn-secondary" id="mobileActionsTrigger" onclick="toggleMobileActionsDropdown(event)" title="Opções da Agenda">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        </button>
      </div>
    </div>
  `;

  // Filtro de profissionais (com opção Todos inclusa)
  const isAllSelected = selectedProfessionalId === 'all' || !selectedProfessionalId;
  let profsHtml = `
    <div class="prof-badge-card ${isAllSelected ? 'active' : ''}" data-prof-id="all" onclick="selectProfessional('all')">
      <div style="width:36px; height:36px; border-radius:50%; background:#f1f5f9; display:flex; align-items:center; justify-content:center; font-weight:700; color:#334155; border: 2px solid var(--orange);">
        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
      </div>
      <span>Todos</span>
    </div>
  ` + state.professionals.map(p => `
    <div class="prof-badge-card ${p.id === selectedProfessionalId ? 'active' : ''}" data-prof-id="${p.id}" onclick="selectProfessional('${p.id}')">
      <img src="${p.avatar}" alt="${p.name}">
      <span>${p.name.split(' ')[0]}</span>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="card-shell agenda-container-card">
      <div class="profs-horizontal-bar" id="profsHorizontalBar">${profsHtml}</div>
      <div class="schedule-table" id="scheduleTableWrapper"></div>
    </div>
  `;

  updateScheduleView();
}

window.selectProfessional = function(profId) {
  selectedProfessionalId = profId;
  const cards = document.querySelectorAll('.prof-badge-card');
  cards.forEach(card => {
    if (card.dataset.profId === profId) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });
  updateScheduleView();
};

function updateScheduleView() {
  const wrapper = document.getElementById('scheduleTableWrapper');
  if (!wrapper) return;

  const isListMode = state.settings.agendaViewMode === 'list';
  const isAllProf = selectedProfessionalId === 'all' || !selectedProfessionalId;

  const currentProfAppointments = (state.appointments || []).filter(
    a => (isAllProf || a.professionalId === selectedProfessionalId) &&
         a.date === selectedDate &&
         a.status !== 'cancelado'
  );

  if (isListMode) {
    let listHtml = `
      <div class="agenda-date-group-title">
        ${formatFormattedDateTitle(selectedDate)}
      </div>
    `;

    if (currentProfAppointments.length === 0) {
      listHtml += `
        <div style="text-align: center; padding: 40px 20px; background: #ffffff; border-radius: 16px; border: 1px dashed #cbd5e1; color: #64748b;">
          <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="margin-bottom: 12px; color: #94a3b8;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <p style="font-weight: 600; font-size: 0.95rem; margin-bottom: 4px;">Nenhum agendamento para este dia</p>
          <p style="font-size: 0.82rem; margin-bottom: 16px;">Clique no botão acima para adicionar um novo atendimento.</p>
        </div>
      `;
    } else {
      currentProfAppointments.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

      currentProfAppointments.forEach(app => {
        const prof = (state.professionals || []).find(p => p.id === app.professionalId);
        const profName = prof ? prof.name : (app.professionalName || '');
        const profSubText = isAllProf && profName ? ` com ${profName}` : '';
        const initial = (app.clientName || 'C').charAt(0).toUpperCase();

        let statusClass = 'agendado';
        let statusLabel = 'Agendado';
        if (app.status === 'indisponivel') {
          statusClass = 'cancelado';
          statusLabel = 'Bloqueado';
        } else if (app.status === 'concluido') {
          statusClass = 'concluido';
          statusLabel = 'Concluído';
        } else if (app.status === 'faltou') {
          statusClass = 'cancelado';
          statusLabel = 'Faltou';
        }

        if (app.status === 'indisponivel') {
          listHtml += `
            <div class="agenda-list-item-card" style="background:#fef2f2; border-color:#fecaca;">
              <div class="agenda-list-client-info">
                <div class="agenda-list-client-avatar" style="background:#fee2e2; color:#b91c1c;">
                  <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                </div>
                <div>
                  <div class="agenda-list-client-name" style="color:#b91c1c;">Horário Bloqueado</div>
                  <div class="agenda-list-service-sub">${app.notes || 'Sem observações'}${profSubText}</div>
                </div>
              </div>
              <div class="agenda-list-badge-time">
                <span class="status-badge-pill cancelado">Bloqueado</span>
                <span class="agenda-list-time-range">${app.startTime} - ${app.endTime}</span>
                <button class="btn-delete-app" onclick="deleteAppointment('${app.id}', event)" style="margin-top:4px;">Desbloquear</button>
              </div>
            </div>
          `;
        } else {
          listHtml += `
            <div class="agenda-list-item-card">
              <div class="agenda-list-client-info">
                <div class="agenda-list-client-avatar">
                  <span style="font-weight:700; font-size:1.1rem; color:var(--orange);">${initial}</span>
                </div>
                <div>
                  <div class="agenda-list-client-name">${app.clientName || 'Cliente sem nome'}</div>
                  <div class="agenda-list-service-sub">${app.serviceName || 'Serviço'}${profSubText} • R$ ${Number(app.price || 0).toFixed(2)}</div>
                </div>
              </div>
              <div class="agenda-list-badge-time">
                <span class="status-badge-pill ${statusClass}">${statusLabel}</span>
                <span class="agenda-list-time-range">${app.startTime} - ${app.endTime}</span>
                <div style="display:flex; gap:4px; margin-top:4px;">
                  ${app.clientPhone ? `
                    <button class="btn-remind-app" onclick="sendAppointmentReminder('${app.id}', event)" title="Lembrete WhatsApp">
                      <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.062-2.18-.553-1.614-.668-2.673-2.316-2.753-2.423-.081-.107-.655-.873-.655-1.664 0-.792.414-1.182.56-1.341.144-.16.315-.2.42-.2.106 0 .211.002.304.006.098.005.23-.037.36.275.132.318.45 1.096.488 1.176.04.08.067.174.013.28-.053.106-.08.172-.158.264-.078.093-.164.208-.234.28-.08.082-.164.172-.07.334.093.16.417.689.896 1.116.617.55 1.137.72 1.298.8.16.08.254.07.35-.04.095-.11.408-.475.517-.638.11-.164.218-.137.368-.081.15.054.954.45 1.118.532.164.082.273.123.313.192.04.068.04.399-.104.804z"/></svg>
                    </button>
                  ` : ''}
                  <button class="btn-delete-app" onclick="deleteAppointment('${app.id}', event)" title="Excluir">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            </div>
          `;
        }
      });
    }

    wrapper.innerHTML = listHtml;
    return;
  }

  const startHour = Math.max(4, Math.min(9, Number(state.settings.agendaStartHour) || 8));
  const endHour = 20;
  const times = [];
  for (let h = startHour; h <= endHour; h++) {
    const hStr = String(h).padStart(2, '0');
    times.push(`${hStr}:00`);
    if (h < endHour) {
      times.push(`${hStr}:30`);
    }
  }

  let html = `<table class="salon-schedule-table"><tbody>`;
  let skipCount = 0;

  for (let i = 0; i < times.length; i++) {
    const time = times[i];
    html += `<tr>`;
    html += `<td class="salon-time-cell">${time}</td>`;

    if (skipCount > 0) {
      skipCount--;
      html += `</tr>`;
      continue;
    }

    const appStartingHere = currentProfAppointments.find(a => a.startTime === time);

    if (appStartingHere) {
      const [sh, sm] = appStartingHere.startTime.split(':').map(Number);
      const [eh, em] = appStartingHere.endTime.split(':').map(Number);
      const spanMin = (eh * 60 + em) - (sh * 60 + sm);
      const rowSpan = Math.max(1, Math.round(spanMin / 30));

      skipCount = rowSpan - 1;

      const prof = (state.professionals || []).find(p => p.id === appStartingHere.professionalId);
      const profBadgeText = isAllProf && prof ? ` • ${prof.name}` : '';

      if (appStartingHere.status === 'indisponivel') {
        html += `
          <td class="salon-block-indisponivel" rowspan="${rowSpan}">
            <div>
              <strong>${appStartingHere.startTime} às ${appStartingHere.endTime}</strong>
              <div style="font-weight: 600; color: #555; margin-top: 4px;">Horário Bloqueado / Indisponível</div>
              <span>${appStartingHere.notes || ''}</span>
            </div>
            <div style="margin-top: 10px;">
              <button class="btn-delete-app" onclick="deleteAppointment('${appStartingHere.id}', event)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Desbloquear Horário
              </button>
            </div>
          </td>
        `;
      } else {
        html += `
          <td class="cell-agendado" rowspan="${rowSpan}">
            <div class="salon-block-agendado">
              <div class="app-top-row">
                <div class="app-info">
                  <strong>${appStartingHere.clientName}</strong>
                  <span>${appStartingHere.serviceName}${profBadgeText}</span>
                  <small>${appStartingHere.clientPhone || 'Sem telefone'} • Duração: ${spanMin} min</small>
                  ${appStartingHere.notes ? `<small style="color:#666; display:block; margin-top:4px;">Obs: ${appStartingHere.notes}</small>` : ''}
                </div>
                <div class="app-actions">
                  <div class="app-price">
                    R$ ${Number(appStartingHere.price).toFixed(2)}
                  </div>
                  ${appStartingHere.clientPhone ? `
                    <button class="btn-remind-app" onclick="sendAppointmentReminder('${appStartingHere.id}', event)" title="Enviar lembrete via WhatsApp">
                      <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.062-2.18-.553-1.614-.668-2.673-2.316-2.753-2.423-.081-.107-.655-.873-.655-1.664 0-.792.414-1.182.56-1.341.144-.16.315-.2.42-.2.106 0 .211.002.304.006.098.005.23-.037.36.275.132.318.45 1.096.488 1.176.04.08.067.174.013.28-.053.106-.08.172-.158.264-.078.093-.164.208-.234.28-.08.082-.164.172-.07.334.093.16.417.689.896 1.116.617.55 1.137.72 1.298.8.16.08.254.07.35-.04.095-.11.408-.475.517-.638.11-.164.218-.137.368-.081.15.054.954.45 1.118.532.164.082.273.123.313.192.04.068.04.399-.104.804z"/></svg>
                      Lembrete
                    </button>
                  ` : ''}
                  ${appStartingHere.status !== 'faltou' ? `
                    <button class="btn-delete-app" style="background:#fef2f2; color:#b91c1c; border-color:#fecaca;" onclick="markAppointmentNoShow('${appStartingHere.id}', event)" title="Registrar que o cliente faltou (Gera histórico para taxa de 50% de remarcação)">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                      Faltou
                    </button>
                  ` : `
                    <span style="font-size:0.72rem; font-weight:bold; color:#b91c1c; background:#fee2e2; padding:3px 6px; border-radius:6px;">Faltou</span>
                  `}
                  <button class="btn-delete-app" onclick="deleteAppointment('${appStartingHere.id}', event)" title="Excluir / Cancelar este agendamento">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Cancelar
                  </button>
                </div>
              </div>
              <div class="app-bottom-bar">
                <span>Horário reservado: <b>${appStartingHere.startTime} às ${appStartingHere.endTime}</b></span>
                <span style="color: var(--orange); font-weight: 600;">Sessão Ativa (${spanMin}m)</span>
              </div>
            </div>
          </td>
        `;
      }
    } else {
      html += `
        <td class="salon-empty-cell" onclick="openNewAppointmentModal('${time}')" title="Clique para agendar às ${time}"></td>
      `;
    }

    html += `</tr>`;
  }

  html += `</tbody></table>`;
  wrapper.innerHTML = html;
}

window.refreshAgendaData = async function() {
  await loadInitialData();
  updateScheduleView();
};

window.deleteAppointment = async function(appId, event) {
  if (event) event.stopPropagation();
  const confirmed = await asyncConfirm("Tem certeza que deseja excluir / desmarcar este agendamento?", "Excluir Agendamento", { isDanger: true });
  if (!confirmed) return;
  
  try {
    const res = await fetch(`/api/appointments/${appId}`, {
      method: 'DELETE',
      headers: {
        'x-tenant-id': (window.currentUser && window.currentUser.tenantId) || 'tenant_metamorfose'
      }
    });
    if (!res.ok) {
      const err = await res.json();
      await asyncAlert("Erro ao excluir: " + (err.error || 'Falha na requisição'), "Erro", "error");
      return;
    }
    await loadInitialData();
    updateScheduleView();
  } catch (err) {
    await asyncAlert("Erro de conexão ao excluir agendamento.", "Erro de Conexão", "error");
  }
};

window.markAppointmentNoShow = async function(appId, event) {
  if (event) event.stopPropagation();
  const app = state.appointments.find(a => a.id === appId);
  const clientName = app ? app.clientName : 'este cliente';
  
  const confirmed = await asyncConfirm(`Confirmar que ${clientName} Frizou / Faltou ao agendamento?\n\nIsso registrará histórico de ausência no sistema. Em caso de remarcação, a taxa de garantia de 50% será aplicada automaticamente pelo cruzamento de dados.`, "Registrar Falta / Ausência", { isDanger: true });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/appointments/${appId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': (window.currentUser && window.currentUser.tenantId) || 'tenant_metamorfose'
      },
      body: JSON.stringify({ status: 'faltou' })
    });

    if (!res.ok) {
      const err = await res.json();
      await asyncAlert("Erro ao registrar falta: " + (err.error || 'Falha na requisição'), "Erro", "error");
      return;
    }

    await asyncAlert(`Falta registrada com sucesso para ${clientName}.\nO cruzamento de dados já ativou a proteção de 50% para remarcações.`, "Falta Registrada", "success");
    await loadInitialData();
    updateScheduleView();
  } catch (err) {
    await asyncAlert("Erro de conexão ao registrar falta.", "Erro de Conexão", "error");
  }
};

window.sendAppointmentReminder = async function(appId, event) {
  if (event) event.stopPropagation();
  const app = state.appointments.find(a => a.id === appId);
  if (!app || !app.clientPhone) {
    await asyncAlert("Este cliente não possui telefone/WhatsApp cadastrado.", "Sem WhatsApp", "warning");
    return;
  }

  const cleanPhone = app.clientPhone.replace(/\D/g, '');
  const salonName = state.settings.salonName || currentTenant?.name || 'Salão';
  const [y, m, d] = (app.date || '').split('-');
  const dateFormatted = (d && m && y) ? `${d}/${m}/${y}` : app.date;

  const text = `Olá, ${app.clientName}! Tudo bem?\nPassando para confirmar seu horário agendado conosco na *${salonName}*:\n\n` +
    `• *Serviço:* ${app.serviceName}\n` +
    `• *Data:* ${dateFormatted}\n` +
    `• *Horário:* ${app.startTime} às ${app.endTime}\n\n` +
    `Qualquer imprevisto, por favor nos avise com antecedência. Te aguardamos!`;

  const waUrl = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(text)}`;
  window.open(waUrl, '_blank');
};


// 2. Render Comissões & Vales
function renderCommissions(container, actions) {
  actions.innerHTML = '';

  const toPay = (state.commissions || []).filter(c => c.status === 'a_pagar');
  const paid = (state.commissions || []).filter(c => c.status === 'paga');

  container.innerHTML = `
    <div class="tabs-header" style="margin-bottom: 16px;">
      <button class="tab-btn active" id="tabToPay" onclick="switchCommissionTab('toPay')">A Pagar (${toPay.length})</button>
      <button class="tab-btn" id="tabPaid" onclick="switchCommissionTab('paid')">Pagas (${paid.length})</button>
    </div>
    <div id="commissionsList" class="data-list">
      ${renderCommissionsList(toPay, true)}
    </div>
  `;
}

function renderCommissionsList(list, canPay) {
  if (!list || list.length === 0) {
    return `<div class="card-shell" style="text-align:center; color:var(--muted); padding:32px 16px;">Nenhum registro encontrado.</div>`;
  }
  return list.map(c => {
    const isVale = c.type === 'vale' || (c.amount < 0) || (c.description && c.description.toLowerCase().includes('vale'));
    const amountAbs = Math.abs(c.amount || 0);
    const badgeColor = isVale ? '#dc2626' : 'var(--green)';
    const typeLabel = isVale ? 'Vale / Adiantamento' : 'Comissão';
    const typeBadgeBg = isVale ? 'rgba(220,38,38,0.1)' : 'rgba(16,185,129,0.1)';
    const typeBadgeColor = isVale ? '#dc2626' : '#059669';

    return `
      <div class="data-item-card" style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;">
        <div class="item-main-info" style="flex:1; min-width:200px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap;">
            <h4 style="margin:0;">${c.professionalName || 'Profissional'}</h4>
            <span style="font-size:0.75rem; font-weight:600; padding:2px 8px; border-radius:999px; background:${typeBadgeBg}; color:${typeBadgeColor};">
              ${typeLabel}
            </span>
          </div>
          <p style="margin:0; font-size:0.85rem; color:var(--muted);">
            ${c.description ? c.description + ' • ' : ''}
            ${c.status === 'paga' ? (c.paymentDate ? 'Pago em ' + c.paymentDate : 'Pago') : (c.date ? 'Data: ' + c.date : 'Aguardando repasse')}
          </p>
        </div>

        <div style="display:flex; align-items:center; gap:12px;">
          <span class="item-badge-price" style="color:${badgeColor}; font-size:1.15rem; font-weight:700;">
            ${isVale ? '- ' : ''}R$ ${amountAbs.toFixed(2)}
          </span>

          <div class="item-actions-group">
            ${canPay ? `
              <button class="btn-card-action pay" onclick="payCommission('${c.id}')" title="Marcar comissão como paga">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Pagar
              </button>
            ` : ''}
            <button class="btn-card-action edit" onclick="openEditCommissionModal('${c.id}')" title="Editar Lançamento">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              Editar
            </button>
            <button class="btn-card-action delete" onclick="deleteCommission('${c.id}')" title="Excluir Lançamento">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Excluir
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.switchCommissionTab = function(type) {
  const toPay = (state.commissions || []).filter(c => c.status === 'a_pagar');
  const paid = (state.commissions || []).filter(c => c.status === 'paga');
  const listEl = document.getElementById('commissionsList');

  if (type === 'toPay') {
    document.getElementById('tabToPay').classList.add('active');
    document.getElementById('tabPaid').classList.remove('active');
    listEl.innerHTML = renderCommissionsList(toPay, true);
  } else {
    document.getElementById('tabPaid').classList.add('active');
    document.getElementById('tabToPay').classList.remove('active');
    listEl.innerHTML = renderCommissionsList(paid, false);
  }
};

window.payCommission = async function(id) {
  const confirmed = await asyncConfirm('Deseja confirmar o pagamento desta comissão?', 'Pagar Comissão');
  if (!confirmed) return;
  await tenantFetch(`/api/commissions/pay/${id}`, { method: 'POST' });
  await loadInitialData();
  renderView('comissões');
};

// 3. Render Profissionais
function renderProfessionals(container, actions) {
  const profCount = state.professionals.length;
  const extraProfs = Math.max(0, profCount - 5);
  const basePrice = Number(currentSubscriptionData?.basePrice || currentSubscriptionData?.monthlyPrice) || 49.90;
  const totalMonthly = basePrice + (extraProfs * 10);

  actions.innerHTML = isManager ? `
    <span style="font-size:0.84rem; font-weight:500; color:var(--muted); background:rgba(255,255,255,0.85); padding:6px 14px; border-radius:999px; border:1px solid rgba(0,0,0,0.06); height:38px; display:inline-flex; align-items:center; box-sizing:border-box;">
      <strong style="color:var(--ink); margin-right:4px;">${profCount} / 10</strong> Profissionais
    </span>
  ` : '';

  const profsHtml = state.professionals.map(p => `
    <div class="data-item-card">
      <div style="display: flex; align-items: center; gap: 14px;">
        <img src="${p.avatar}" alt="${p.name}" style="width: 48px; height: 48px; border-radius: 50%;">
        <div class="item-main-info">
          <h4>${p.name}</h4>
          <p>${p.role} • ${p.phone} • Acesso: <strong>${p.access}</strong></p>
        </div>
      </div>
      <div class="item-actions-group">
        ${p.requireDeposit ? `
          <button class="btn-card-action edit" onclick="openEditProfessionalModal('${p.id}')" style="margin-right: 4px; font-size: 0.76rem; padding: 4px 10px;" title="Chave Pix: ${p.pixKey || 'Não informada'}">
            Sinal ${p.depositPercent || 30}% (${p.pixBank || 'InfinitePay'})
          </button>
        ` : ''}
        <button class="btn-card-action ${p.showInBooking ? 'pay' : 'edit'}" onclick="toggleProfBookingVisibility('${p.id}')" style="margin-right: 4px;" title="Clique para alternar visibilidade no agendamento online">
          ${p.showInBooking ? 'Visível no Link' : 'Oculto'}
        </button>
        <button class="btn-card-action edit" onclick="openEditProfessionalModal('${p.id}')" title="Editar Profissional">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          Editar
        </button>
        <button class="btn-card-action delete" onclick="deleteProfessional('${p.id}')" title="Excluir Profissional">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          Excluir
        </button>
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 18px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.03);">
      <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 240px;">
        <div style="background: rgba(255, 105, 0, 0.1); width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <svg width="22" height="22" fill="none" stroke="var(--orange)" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        </div>
        <div>
          <h5 style="margin: 0; font-size: 0.92rem; color: var(--ink); font-weight: 700;">Regra de Assinatura por Profissionais</h5>
          <p style="margin: 2px 0 0 0; font-size: 0.8rem; color: var(--muted); line-height: 1.4;">
            O plano inclui até <strong>5 profissionais</strong>. Do 6º ao 10º profissional (máximo 10), acrescenta <strong>+R$ 10,00/mês</strong> por cada profissional.
          </p>
        </div>
      </div>
      <div style="text-align: right; background: #f8fafc; padding: 8px 16px; border-radius: 12px; border: 1px solid #e2e8f0;">
        <small style="display: block; font-size: 0.72rem; color: var(--muted); font-weight: 500;">Mensalidade do Salão (${profCount}/10 profs)</small>
        <strong style="font-size: 1.05rem; color: var(--orange); font-weight: 800;">R$ ${totalMonthly.toFixed(2).replace('.', ',')} <span style="font-size: 0.75rem; font-weight: normal; color: var(--muted);">/ mês</span></strong>
      </div>
    </div>
    <div class="data-list">${profsHtml}</div>
  `;
}

// 4. Render Clientes
function renderClients(container, actions) {
  actions.innerHTML = `
    <span style="font-size:0.84rem; font-weight:500; color:var(--muted); background:rgba(255,255,255,0.7); padding:6px 14px; border-radius:999px; border:1px solid rgba(0,0,0,0.06); height:38px; display:inline-flex; align-items:center; box-sizing:border-box;">
      <strong style="color:var(--ink); margin-right:4px;">${state.clients.length}</strong> clientes
    </span>
  `;

  const clientsHtml = state.clients.map(c => `
    <div class="data-item-card">
      <div class="item-main-info">
        <h4>
          ${c.name}
          ${c.hasNoShowHistory ? `<span style="font-size:0.72rem; font-weight:700; color:#b91c1c; background:#fee2e2; border:1px solid #fecaca; padding:2px 8px; border-radius:12px; margin-left:8px;">⚠️ Histórico de Falta (Taxa 50%)</span>` : ''}
        </h4>
        <p>WhatsApp: ${c.phone} ${c.birthday ? '• Aniversário: ' + c.birthday : ''}</p>
        ${c.notes ? `<p style="font-size:0.78rem; color:var(--muted); margin-top:2px;">Obs: ${c.notes}</p>` : ''}
      </div>
      <div class="item-actions-group">
        <a href="https://wa.me/55${c.phone.replace(/\D/g, '')}" target="_blank" class="btn-falcon btn-secondary">
          WhatsApp
        </a>
        <button class="btn-card-action edit" onclick="openEditClientModal('${c.id}')" title="Editar Cliente">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          Editar
        </button>
        <button class="btn-card-action delete" onclick="deleteClient('${c.id}')" title="Excluir Cliente">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          Excluir
        </button>
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="data-list">${clientsHtml}</div>
  `;
}

// 5. Render Serviços
function renderServices(container, actions) {
  actions.innerHTML = '';

  const servsHtml = state.services.map(s => `
    <div class="data-item-card">
      <div class="item-main-info">
        <h4>${s.name}</h4>
        <p>Categoria: <strong>${s.category}</strong> • Duração: ${s.durationMinutes} min • Comissão: ${s.commissionPercent}%</p>
      </div>
      <div class="item-actions-group">
        <span class="item-badge-price" style="margin-right: 6px;">R$ ${s.price.toFixed(2)}</span>
        ${isManager ? `
          <button class="btn-card-action edit" onclick="openEditServiceModal('${s.id}')" title="Editar Serviço">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            Editar
          </button>
          <button class="btn-card-action delete" onclick="deleteService('${s.id}')" title="Excluir Serviço">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Excluir
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="data-list">${servsHtml}</div>
  `;
}

// 5.5 Render Pacotes de Serviços (Check-list / Tickagem por Sessões)
function renderPackages(container, actions) {
  actions.innerHTML = '';

  if (!state.packages || state.packages.length === 0) {
    container.innerHTML = `
      <div class="card-shell" style="text-align: center; padding: 36px 20px;">
        <div style="background: rgba(255,105,0,0.1); width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px;">
          <svg width="28" height="28" fill="none" stroke="var(--orange)" stroke-width="2" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
        </div>
        <h4 style="margin-bottom: 6px; color: var(--ink); font-weight:700;">Nenhum Pacote de Serviços Ativo</h4>
        <p style="color: var(--muted); font-size: 0.88rem; max-width: 420px; margin: 0 auto 18px;">
          Venda pacotes com múltiplas sessões (ex: Alisamento em 5 dias, Tratamento semanal) e acompanhe o check-list de OKs de cada sessão realizada!
        </p>
        ${isManager ? `<button class="btn-falcon btn-primary" onclick="openNewPackageModal()">Criar Primeiro Pacote</button>` : ''}
      </div>
    `;
    return;
  }

  const pkgCards = state.packages.map(pkg => {
    const pct = Math.round((pkg.completedCount / pkg.totalSessions) * 100);
    const sessionsHtml = (pkg.sessions || []).map(s => `
      <div style="background: ${s.completed ? '#f0fdf4' : '#ffffff'}; border: 1px solid ${s.completed ? '#bbf7d0' : '#e2e8f0'}; border-radius: 10px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="btn-falcon ${s.completed ? 'btn-success' : 'btn-secondary'}" onclick="togglePackageSessionTick('${pkg.id}', ${s.sessionNum}, ${!s.completed})" style="padding: 4px 10px; font-size: 0.78rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
            ${s.completed ? '✓ Concluído' : '○ Marcar OK'}
          </button>
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--ink);">Sessão ${s.sessionNum} de ${pkg.totalSessions}</span>
        </div>
        <div style="font-size: 0.76rem; color: var(--muted); text-align: right;">
          ${s.completed ? `Realizado ${s.completedAt ? 'em ' + new Date(s.completedAt).toLocaleDateString('pt-BR') : ''} ${s.professionalName ? 'por ' + s.professionalName : ''}` : 'Pendente'}
        </div>
      </div>
    `).join('');

    return `
      <div class="card-shell" style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;">
          <div>
            <h3 style="margin: 0; font-size: 1.05rem; color: var(--ink); font-weight: 700;">${pkg.packageName}</h3>
            <p style="margin: 2px 0 0 0; font-size: 0.85rem; color: var(--muted);">Cliente: <strong>${pkg.clientName}</strong> ${pkg.price ? '• R$ ' + Number(pkg.price).toFixed(2).replace('.', ',') : ''}</p>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="background: ${pkg.status === 'concluido' ? '#dcfce7' : '#fff7ed'}; color: ${pkg.status === 'concluido' ? '#15803d' : '#c2410c'}; font-size: 0.78rem; font-weight: 700; padding: 4px 10px; border-radius: 999px;">
              ${pkg.status === 'concluido' ? '✓ Pacote Concluído' : `${pkg.completedCount}/${pkg.totalSessions} Sessões`}
            </span>
            ${isManager ? `
              <button class="btn-card-action delete" onclick="deletePackage('${pkg.id}')" title="Excluir Pacote">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            ` : ''}
          </div>
        </div>

        <div style="background: #e2e8f0; height: 8px; border-radius: 999px; overflow: hidden; margin-bottom: 12px;">
          <div style="background: var(--orange); height: 100%; width: ${pct}%; transition: width 0.3s;"></div>
        </div>

        ${pkg.notes ? `<p style="font-size: 0.8rem; color: var(--muted); margin-bottom: 8px; background: #f8fafc; padding: 6px 10px; border-radius: 8px;">📝 Obs: ${pkg.notes}</p>` : ''}

        <div style="margin-top: 10px;">
          <strong style="font-size: 0.82rem; color: var(--muted); display: block; margin-bottom: 4px;">Tickagem de Sessões:</strong>
          ${sessionsHtml}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `<div class="data-list">${pkgCards}</div>`;
}

window.openNewPackageModal = function() {
  const clientOptions = (state.clients || []).map(c => `<option value="${c.name}">${c.name} (${c.phone || 'Sem telefone'})</option>`).join('');

  const html = `
    <div class="form-group">
      <label>Cliente</label>
      <select class="form-control" id="mPkgClientSelect" onchange="document.getElementById('mPkgClientCustom').value = this.value">
        <option value="">-- Selecione uma Cliente da Lista --</option>
        ${clientOptions}
      </select>
      <input type="text" class="form-control" id="mPkgClientCustom" placeholder="Ou digite o nome da cliente" style="margin-top: 6px;">
    </div>
    <div class="form-group">
      <label>Nome do Pacote / Procedimento</label>
      <input type="text" class="form-control" id="mPkgName" placeholder="Ex: Pacote Alisamento 5 Dias, Tratamento Cronograma">
    </div>
    <div class="form-group">
      <label>Quantidade de Sessões / Etapas</label>
      <input type="number" class="form-control" id="mPkgSessions" value="5" min="1" max="30">
    </div>
    <div class="form-group">
      <label>Valor Total do Pacote (R$)</label>
      <input type="number" class="form-control" id="mPkgPrice" placeholder="Ex: 350.00" step="0.50">
    </div>
    <div class="form-group">
      <label>Observações / Recomendações Técnicas</label>
      <textarea class="form-control" id="mPkgNotes" rows="2" placeholder="Instruções para os profissionais durante as sessões"></textarea>
    </div>
  `;

  openModal('Vender / Criar Pacote de Serviços', html, async () => {
    const clientName = document.getElementById('mPkgClientCustom').value.trim() || document.getElementById('mPkgClientSelect').value;
    const packageName = document.getElementById('mPkgName').value.trim();
    const totalSessions = parseInt(document.getElementById('mPkgSessions').value, 10) || 5;
    const price = Number(document.getElementById('mPkgPrice').value) || 0;
    const notes = document.getElementById('mPkgNotes').value.trim();

    if (!clientName || !packageName) {
      asyncAlert('Nome da Cliente e Nome do Pacote são obrigatórios.');
      return;
    }

    const clientMatch = (state.clients || []).find(c => c.name === clientName);

    const res = await tenantFetch('/api/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: clientMatch ? clientMatch.id : null,
        clientName,
        packageName,
        totalSessions,
        price,
        notes
      })
    });

    if (!res.ok) {
      const err = await res.json();
      asyncAlert(err.error || 'Erro ao criar pacote.');
      return;
    }

    closeModal();
    await loadInitialData();
    renderView('pacotes');
  });
};

window.togglePackageSessionTick = async function(pkgId, sessionNum, completed) {
  const profName = currentUser ? currentUser.name : 'Profissional';
  const res = await tenantFetch(`/api/packages/${pkgId}/session`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionNum,
      completed,
      professionalName: profName
    })
  });

  if (!res.ok) {
    const err = await res.json();
    asyncAlert(err.error || 'Erro ao atualizar sessão do pacote.');
    return;
  }

  await loadInitialData();
  renderView('pacotes');
};

window.deletePackage = async function(pkgId) {
  if (!isManager) {
    await asyncAlert('Apenas gestores têm permissão para excluir pacotes.', 'Acesso Restrito', 'warning');
    return;
  }
  const confirmed = await asyncConfirm('Deseja realmente excluir este pacote e seu histórico de sessões?', 'Excluir Pacote', { isDanger: true });
  if (!confirmed) return;

  const res = await tenantFetch(`/api/packages/${pkgId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    await asyncAlert(err.error || 'Erro ao excluir pacote.', 'Erro', 'error');
    return;
  }

  await loadInitialData();
  renderView('pacotes');
};

// 6. Render Produtos
function renderProducts(container, actions) {
  actions.innerHTML = '';

  const prodsHtml = state.products.map(p => `
    <div class="data-item-card">
      <div class="item-main-info">
        <h4>${p.name}</h4>
        <p>${p.category} • Marca: ${p.brand || 'Geral'} • Estoque: <strong>${p.stock} un.</strong></p>
      </div>
      <div class="item-actions-group">
        <span class="item-badge-price" style="margin-right: 6px;">R$ ${p.price.toFixed(2)}</span>
        ${isManager ? `
          <button class="btn-card-action edit" onclick="openEditProductModal('${p.id}')" title="Editar Produto">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            Editar
          </button>
          <button class="btn-card-action delete" onclick="deleteProduct('${p.id}')" title="Excluir Produto">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Excluir
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="data-list">${prodsHtml}</div>
  `;
}

// 7. Render Despesas
function renderExpenses(container, actions) {
  actions.innerHTML = '';

  const total = state.expenses.reduce((acc, e) => acc + e.amount, 0);
  const paid = state.expenses.filter(e => e.status === 'pago').reduce((acc, e) => acc + e.amount, 0);
  const pending = state.expenses.filter(e => e.status === 'pendente').reduce((acc, e) => acc + e.amount, 0);

  const expsHtml = state.expenses.map(e => `
    <div class="data-item-card">
      <div class="item-main-info">
        <h4>${e.description}</h4>
        <p>${e.category} • Vencimento: ${e.dueDate} • Pagamento: ${e.paymentType}</p>
      </div>
      <div class="item-actions-group">
        <div style="text-align: right; margin-right: 6px;">
          <span class="item-badge-price" style="color: ${e.status === 'pago' ? 'var(--green)' : 'var(--red)'};">
            R$ ${e.amount.toFixed(2)}
          </span>
        </div>
        <button class="btn-card-action ${e.status === 'pago' ? 'pay' : 'edit'}" onclick="toggleExpenseStatus('${e.id}')" title="Clique para alternar o status de pagamento">
          ${e.status === 'pago' ? '✓ Pago' : 'Pagar'}
        </button>
        <button class="btn-card-action edit" onclick="openEditExpenseModal('${e.id}')" title="Editar Despesa">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          Editar
        </button>
        <button class="btn-card-action delete" onclick="deleteExpense('${e.id}')" title="Excluir Despesa">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          Excluir
        </button>
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="metrics-grid">
      <div class="metric-card red">
        <div class="metric-label">Total Despesas</div>
        <div class="metric-value">R$ ${total.toFixed(2)}</div>
      </div>
      <div class="metric-card green">
        <div class="metric-label">Total Pago</div>
        <div class="metric-value">R$ ${paid.toFixed(2)}</div>
      </div>
      <div class="metric-card orange">
        <div class="metric-label">Pendente</div>
        <div class="metric-value">R$ ${pending.toFixed(2)}</div>
      </div>
    </div>
    <div class="data-list">${expsHtml}</div>
  `;
}

// 8. Render Aniversariantes
function renderBirthdays(container, actions) {
  const now = new Date();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const birthdays = state.clients.filter(c => {
    if (!c.birthday) return false;
    return isBirthdayToday(c.birthday, currentMonth, String(c.birthday).split('-')[2] || '');
  });

  // Mostra todos os clientes que fazem aniversário no mês atual
  const monthBirthdays = state.clients.filter(c => {
    if (!c.birthday) return false;
    if (c.birthday.includes('-')) {
      const parts = c.birthday.split('-');
      const m = parts[0].length === 4 ? parts[1] : parts[1];
      return String(m).padStart(2, '0') === currentMonth;
    }
    if (c.birthday.includes('/')) {
      const parts = c.birthday.split('/');
      const m = parts[2] && parts[2].length === 4 ? parts[1] : parts[0];
      return String(m).padStart(2, '0') === currentMonth;
    }
    return false;
  });

  let bdaysHtml = monthBirthdays.map(c => `
    <div class="data-item-card">
      <div class="item-main-info">
        <h4>${c.name}</h4>
        <p>Data de Nascimento: <strong>${c.birthday}</strong> • WhatsApp: ${c.phone}</p>
      </div>
      <div>
        <a href="https://wa.me/55${c.phone.replace(/\D/g, '')}?text=Parabéns%20pelo%20seu%20aniversário!" target="_blank" class="btn-falcon btn-primary">
          Enviar Parabéns
        </a>
      </div>
    </div>
  `).join('');

  if (monthBirthdays.length === 0) {
    bdaysHtml = `<div class="card-shell" style="text-align:center; color:var(--muted);">Nenhum aniversariante no mês atual.</div>`;
  }

  container.innerHTML = `
    <div class="data-list">${bdaysHtml}</div>
  `;
}

// 8.5 Render Balanço Mensal & Metas
let selectedBalancoMonth = null;

function renderBalanco(container, actions) {
  const now = new Date();
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  if (!selectedBalancoMonth) {
    selectedBalancoMonth = currentYearMonth;
  }

  // Gera lista de opções dos últimos 12 meses
  const monthOptions = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
    monthOptions.push({ ym, label: capitalized });
  }

  // Filtragem dos dados para o mês selecionado
  const monthApps = (state.appointments || []).filter(a => a.date && a.date.startsWith(selectedBalancoMonth) && a.status !== 'cancelado');
  const monthExps = (state.expenses || []).filter(e => e.date && e.date.startsWith(selectedBalancoMonth));
  
  const totalGrossRevenue = monthApps.reduce((acc, a) => acc + (Number(a.price) || 0), 0);
  const totalAppCount = monthApps.length;
  const totalExpenses = monthExps.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

  // Calcula comissão total do mês
  let totalCommissions = 0;
  (state.professionals || []).forEach(prof => {
    const profApps = monthApps.filter(a => a.professionalId === prof.id);
    const profGross = profApps.reduce((acc, a) => acc + (Number(a.price) || 0), 0);
    const rate = (Number(prof.commissionDefault) || 50) / 100;
    totalCommissions += profGross * rate;
  });

  const estimatedNetProfit = totalGrossRevenue - totalExpenses - totalCommissions;

  // Limpa actions superiores para evitar overflow no mobile
  actions.innerHTML = '';

  const monthSelectorCardHtml = `
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; background: #ffffff; padding: 14px 18px; border-radius: 16px; border: 1px solid rgba(226, 232, 240, 0.8); box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(255, 105, 0, 0.1); display: flex; align-items: center; justify-content: center; color: var(--orange, #ff6900);">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
        </div>
        <div>
          <div style="font-weight: 700; color: var(--ink, #0f172a); font-size: 0.95rem;">Mês de Referência</div>
          <div style="font-size: 0.78rem; color: var(--muted, #64748b);">Filtrar faturamento, despesas e comissões</div>
        </div>
      </div>
      <select class="form-control" id="balancoMonthSelect" style="width: auto; min-width: 180px; padding: 7px 14px; font-weight: 600; cursor: pointer; border-radius: 10px;" onchange="changeBalancoMonth(this.value)">
        ${monthOptions.map(m => `<option value="${m.ym}" ${m.ym === selectedBalancoMonth ? 'selected' : ''}>${m.label}</option>`).join('')}
      </select>
    </div>
  `;

  // Cards de Resumo Financeiro
  const overallSummaryHtml = `
    <div class="balanco-summary-cards">
      <div class="balanco-card">
        <div class="balanco-card-title">💰 Faturamento Bruto</div>
        <div class="balanco-card-value">R$ ${totalGrossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div class="balanco-card-sub">${totalAppCount} atendimentos no mês</div>
      </div>
      <div class="balanco-card">
        <div class="balanco-card-title">🤝 Comissões</div>
        <div class="balanco-card-value" style="color: #d97706;">R$ ${totalCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div class="balanco-card-sub">Repasse aos profissionais</div>
      </div>
      <div class="balanco-card">
        <div class="balanco-card-title">💸 Despesas</div>
        <div class="balanco-card-value" style="color: #dc2626;">R$ ${totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div class="balanco-card-sub">${monthExps.length} lançamentos de custo</div>
      </div>
      <div class="balanco-card">
        <div class="balanco-card-title">📈 Lucro Líquido Estimado</div>
        <div class="balanco-card-value" style="color: ${estimatedNetProfit >= 0 ? '#16a34a' : '#dc2626'};">R$ ${estimatedNetProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div class="balanco-card-sub">Faturamento - Comissões - Despesas</div>
      </div>
    </div>
  `;

  // Balanço e Metas por Profissional
  const myProfId = currentUser?.professionalId;

  let profCardsHtml = (state.professionals || []).map(prof => {
    const profApps = monthApps.filter(a => a.professionalId === prof.id);
    const profGross = profApps.reduce((acc, a) => acc + (Number(a.price) || 0), 0);
    const profCount = profApps.length;
    const commRate = (Number(prof.commissionDefault) || 50) / 100;
    const profComm = profGross * commRate;

    const goal = Number(prof.monthlyGoal) || 3000;
    const pct = goal > 0 ? Math.min(100, Math.round((profGross / goal) * 100)) : 0;
    const isMe = myProfId && prof.id === myProfId;

    return `
      <div class="prof-goal-card ${isMe ? 'is-me-card' : ''}" style="${isMe ? 'background: #ffffff !important; border: 2px solid #ff6900 !important; box-shadow: 0 4px 18px rgba(255, 105, 0, 0.14) !important;' : ''}">
        <div class="prof-goal-header">
          <div class="prof-goal-info">
            <img src="${prof.avatar || getButterflyAvatar(prof.name)}" class="prof-goal-avatar" alt="${prof.name}">
            <div style="min-width:0; flex:1; overflow:hidden;">
              <h4 class="prof-goal-title" title="${prof.name}">${prof.name} ${isMe ? '<span style="font-size:0.75rem; background: var(--orange, #ff6900); color:#fff; padding:2px 6px; border-radius:10px; margin-left:4px;">Você</span>' : ''}</h4>
              <span class="prof-goal-role">${prof.role || 'Profissional'} • Comissão (${prof.commissionDefault || 50}%)</span>
            </div>
          </div>
          <div>
            <button class="btn-falcon btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="openEditGoalModal('${prof.id}', '${prof.name}', ${goal})">
              🎯 ${goal > 0 ? 'Alterar Meta' : 'Definir Meta'}
            </button>
          </div>
        </div>

        <div class="prof-goal-stats">
          <div class="prof-stat-item">
            <label>Faturamento Bruto</label>
            <span style="color: #16a34a;">R$ ${profGross.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div class="prof-stat-item">
            <label>Atendimentos</label>
            <span>${profCount}</span>
          </div>
          <div class="prof-stat-item">
            <label>Comissão a Receber</label>
            <span style="color: #d97706;">R$ ${profComm.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div class="prof-stat-item">
            <label>Meta Mensal</label>
            <span>R$ ${goal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        <div class="goal-bar-wrapper">
          <div class="goal-bar-header">
            <span>Progresso da Meta Mensal</span>
            <span style="color: ${pct >= 100 ? '#16a34a' : 'var(--orange, #ff6900)'};">${pct}% Atingido ${pct >= 100 ? '🎉 (Meta Batida!)' : ''}</span>
          </div>
          <div class="goal-bar-track">
            <div class="goal-bar-fill" style="width: ${pct}%; background: ${pct >= 100 ? 'linear-gradient(90deg, #16a34a 0%, #22c55e 100%)' : 'linear-gradient(90deg, #ff6900 0%, #ff8c00 100%)'};"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (!profCardsHtml) {
    profCardsHtml = `<div class="card-shell" style="text-align:center; color:var(--muted);">Nenhum profissional cadastrado.</div>`;
  }

  container.innerHTML = `
    ${monthSelectorCardHtml}
    ${overallSummaryHtml}
    <div style="margin-top: 24px;">
      <h3 style="margin-bottom: 16px; font-size: 1.1rem; font-weight: 700; color: var(--ink);">🎯 Desempenho e Metas Individuais</h3>
      ${profCardsHtml}
    </div>
  `;
}

window.changeBalancoMonth = function(monthVal) {
  selectedBalancoMonth = monthVal;
  const container = document.getElementById('viewContainer');
  const actions = document.getElementById('topBarActions');
  renderBalanco(container, actions);
};

window.openEditGoalModal = function(profId, profName, currentGoal) {
  openModal(
    `🎯 Definir Meta Mensal — ${profName}`,
    `
      <div class="form-group" style="margin-bottom: 14px;">
        <label>Valor da Meta de Faturamento Mensal (R$)</label>
        <input type="number" step="100" class="form-control" id="mProfGoalValue" value="${currentGoal || 3000}" placeholder="Ex: 5000">
        <small style="color: var(--muted); margin-top: 4px; display: block;">Digite o valor total em reais que o profissional deseja/deve faturar no mês.</small>
      </div>
    `,
    async () => {
      const val = Number(document.getElementById('mProfGoalValue').value) || 0;
      try {
        const res = await tenantFetch(`/api/professionals/${profId}/goal`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monthlyGoal: val })
        });
        if (res.ok) {
          await loadInitialData();
          closeModal();
          const container = document.getElementById('viewContainer');
          const actions = document.getElementById('topBarActions');
          renderBalanco(container, actions);
          asyncAlert(`Meta de ${profName} atualizada para R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}!`);
        } else {
          asyncAlert('Erro ao atualizar meta.');
        }
      } catch (e) {
        asyncAlert('Erro ao conectar ao servidor.');
      }
    }
  );
};

// 9. Render Configurações
function renderSettings(container, actions) {
  const notifyNew = state.settings.notifyNewAppointments !== false;
  const notifyRem = state.settings.notifyReminders !== false;
  const notifyBday = state.settings.notifyBirthdays !== false;
  const notifySnd = state.settings.notifySound !== false;

  const currentSalonLogo = state.settings.logo || state.settings.photo || currentTenant?.logo || currentTenant?.photo || '/images/logo.png';

  const salonCardHtml = `
    <div class="card-shell" style="margin-bottom: 20px;">
      <h3 style="margin-bottom: 16px;">Dados do Salão</h3>
      ${!isManager ? `
        <div style="background: #fff3cd; color: #856404; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.9rem; display: flex; align-items: center; gap: 8px;">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          <span>Apenas <strong>gestores</strong> podem alterar os dados cadastrais do salão.</span>
        </div>
      ` : ''}

      <div class="form-group" style="margin-bottom: 20px; border-bottom: 1px solid var(--border-peach); padding-bottom: 18px;">
        <label style="font-weight: 700; color: var(--ink);">📸 Foto / Logo do Salão</label>
        <p style="font-size: 0.82rem; color: var(--muted); margin-bottom: 12px;">Essa foto é exibida no cabeçalho do seu link público de agendamento online para os clientes.</p>
        <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
          <img id="settingSalonLogoPreview" src="${currentSalonLogo}" alt="Foto Salão" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid var(--orange); box-shadow: 0 4px 14px rgba(255,105,0,0.22);">
          <div>
            <label class="btn-falcon btn-secondary" style="cursor: pointer; padding: 6px 14px; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 6px; ${!isManager ? 'opacity:0.5; pointer-events:none;' : ''}">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
              <span>Alterar Foto do Salão</span>
              <input type="file" id="settingSalonLogoInput" accept="image/*" style="display: none;" onchange="handleSalonLogoSelect(event)" ${!isManager ? 'disabled' : ''}>
            </label>
            <input type="hidden" id="settingSalonLogoValue" value="${state.settings.logo || state.settings.photo || ''}">
            <small style="display: block; margin-top: 6px; color: var(--muted); font-size: 0.75rem;">Formato recomendado: JPG, PNG ou WEBP. Compressão automática.</small>
          </div>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 14px;">
        <label>Nome do Estabelecimento</label>
        <input type="text" class="form-control" id="cfgName" value="${state.settings.salonName || ''}" ${!isManager ? 'disabled' : ''}>
      </div>
      <div class="form-group" style="margin-bottom: 14px;">
        <label>Telefone / WhatsApp</label>
        <input type="text" class="form-control" id="cfgPhone" value="${state.settings.phone || ''}" ${!isManager ? 'disabled' : ''}>
      </div>
      <div class="form-group" style="margin-bottom: 14px;">
        <label>Endereço Completo</label>
        <input type="text" class="form-control" id="cfgAddress" value="${state.settings.address || ''}" ${!isManager ? 'disabled' : ''}>
      </div>
      <div class="form-group" style="margin-bottom: 14px;">
        <label>Intervalo entre Agendamentos na Grade</label>
        <select class="form-control" id="cfgInterval" ${!isManager ? 'disabled' : ''}>
          <option value="15" ${state.settings.intervalMinutes === 15 ? 'selected' : ''}>15 em 15 minutos</option>
          <option value="30" ${state.settings.intervalMinutes === 30 ? 'selected' : ''}>30 em 30 minutos</option>
          <option value="45" ${state.settings.intervalMinutes === 45 ? 'selected' : ''}>45 em 45 minutos</option>
          <option value="60" ${state.settings.intervalMinutes === 60 ? 'selected' : ''}>1 em 1 hora</option>
        </select>
      </div>
    </div>
  `;

  const currentViewModeLabel = state.settings.agendaViewMode === 'list' ? 'Lista' : 'Calendário';
  const currentStartHour = Number(state.settings.agendaStartHour) || 8;

  const agendaCardHtml = `
    <div class="card-shell" style="margin-bottom: 20px;">
      <h3 style="margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
        <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
        Visualização da Agenda
      </h3>

      <div class="setting-menu-item" onclick="openAgendaViewModeModal()">
        <div>
          <div style="font-weight: 700; color: var(--ink); font-size: 0.95rem;">Modo de visualização</div>
          <div style="font-size: 0.82rem; color: var(--muted);">${currentViewModeLabel}</div>
        </div>
        <div style="display:flex; align-items:center; gap: 6px; color: var(--muted); font-weight: 600; font-size: 0.9rem;">
          <span>${currentViewModeLabel}</span>
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"></path></svg>
        </div>
      </div>

      <div style="margin-top: 16px;">
        <label style="font-weight: 700; color: var(--ink); font-size: 0.92rem; display: block; margin-bottom: 8px;">Horário de início da agenda</label>
        <div class="start-hour-pills">
          ${[4, 5, 6, 7, 8, 9].map(h => `
            <button type="button" class="start-hour-pill ${h === currentStartHour ? 'selected' : ''}" onclick="setAgendaStartHour(${h})">${h}:00</button>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  const notificationCardHtml = `
    <div class="card-shell" style="margin-bottom: 20px;">
      <h3 style="margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
        <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 01-3.46 0"></path></svg>
        Notificações & Lembretes
      </h3>
      
      <div class="switch-group">
        <div>
          <span class="switch-label-title">Novos Agendamentos</span>
          <span class="switch-label-sub">Receber alertas quando um novo agendamento for realizado.</span>
        </div>
        <label class="custom-switch">
          <input type="checkbox" id="cfgNotifyNewAppointments" ${notifyNew ? 'checked' : ''}>
          <span class="switch-slider"></span>
        </label>
      </div>

      <div class="switch-group">
        <div>
          <span class="switch-label-title">Lembretes 15 min antes</span>
          <span class="switch-label-sub">Alerta automático 15 minutos antes de começar cada atendimento.</span>
        </div>
        <label class="custom-switch">
          <input type="checkbox" id="cfgNotifyReminders" ${notifyRem ? 'checked' : ''}>
          <span class="switch-slider"></span>
        </label>
      </div>

      <div class="switch-group">
        <div>
          <span class="switch-label-title">Aniversariantes do Dia</span>
          <span class="switch-label-sub">Notificar quando um cliente cadastrado fizer aniversário hoje.</span>
        </div>
        <label class="custom-switch">
          <input type="checkbox" id="cfgNotifyBirthdays" ${notifyBday ? 'checked' : ''}>
          <span class="switch-slider"></span>
        </label>
      </div>

      <div class="switch-group">
        <div>
          <span class="switch-label-title">Som de Alerta</span>
          <span class="switch-label-sub">Tocar um sinal sonoro ao receber notificações.</span>
        </div>
        <label class="custom-switch">
          <input type="checkbox" id="cfgNotifySound" ${notifySnd ? 'checked' : ''}>
          <span class="switch-slider"></span>
        </label>
      </div>
    </div>
  `;

  if (!isManager) {
    container.innerHTML = `
      ${notificationCardHtml}
      <div style="margin-top: 20px;">
        <button class="btn-falcon btn-primary" onclick="saveSettings()">Salvar Preferências de Notificação</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    ${salonCardHtml}
    ${agendaCardHtml}
    ${notificationCardHtml}
    <div style="margin-top: 20px;">
      <button class="btn-falcon btn-primary" onclick="saveSettings()">Salvar Configurações</button>
    </div>
  `;
}

window.openAgendaViewModeModal = function() {
  let selectedMode = state.settings.agendaViewMode || 'calendar';
  window._tempViewMode = selectedMode;

  const bodyHtml = `
    <div style="padding: 4px 0;">
      <p style="font-size: 0.88rem; color: var(--muted); margin-bottom: 16px;">
        Escolha como você prefere visualizar os agendamentos na sua tela de agenda.
      </p>

      <div class="view-mode-card-option ${selectedMode === 'calendar' ? 'selected' : ''}" id="modeOptCalendar" onclick="selectViewModeOption('calendar')">
        <div style="display:flex; align-items:center; gap: 14px;">
          <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(255,105,0,0.1); display:flex; align-items:center; justify-content:center; color: var(--orange);">
            <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          </div>
          <div>
            <div style="font-weight: 700; color: var(--ink); font-size: 1rem; margin-bottom: 2px;">Calendário</div>
            <div style="font-size: 0.82rem; color: var(--muted);">Exibe os agendamentos em uma grade de horários dia a dia.</div>
          </div>
        </div>
        <div class="view-mode-radio-circle"></div>
      </div>

      <div class="view-mode-card-option ${selectedMode === 'list' ? 'selected' : ''}" id="modeOptList" onclick="selectViewModeOption('list')">
        <div style="display:flex; align-items:center; gap: 14px;">
          <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(59,130,246,0.1); display:flex; align-items:center; justify-content:center; color: #3b82f6;">
            <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
          </div>
          <div>
            <div style="font-weight: 700; color: var(--ink); font-size: 1rem; margin-bottom: 2px;">Lista</div>
            <div style="font-size: 0.82rem; color: var(--muted);">Exibe os agendamentos em uma lista sequencial por profissional e dia.</div>
          </div>
        </div>
        <div class="view-mode-radio-circle"></div>
      </div>
    </div>
  `;

  openModal('Modo de visualização', bodyHtml, async () => {
    state.settings.agendaViewMode = window._tempViewMode || selectedMode;
    await saveSettings();
    closeModal();
    if (currentView === 'agenda') {
      const container = document.getElementById('viewContainer');
      const actions = document.getElementById('topBarActions');
      renderAgenda(container, actions);
    }
  });
};

window.selectViewModeOption = function(mode) {
  window._tempViewMode = mode;
  const optCal = document.getElementById('modeOptCalendar');
  const optList = document.getElementById('modeOptList');
  if (optCal) optCal.classList.toggle('selected', mode === 'calendar');
  if (optList) optList.classList.toggle('selected', mode === 'list');
};

window.setAgendaStartHour = async function(h) {
  state.settings.agendaStartHour = h;
  document.querySelectorAll('.start-hour-pill').forEach(btn => {
    btn.classList.toggle('selected', btn.innerText.startsWith(`${h}:`));
  });
  await saveSettings();
  if (currentView === 'agenda') {
    updateScheduleView();
  }
};

window.saveSettings = async function() {
  const logoVal = document.getElementById('settingSalonLogoValue')?.value || state.settings.logo || state.settings.photo || '';

  const getVal = (id, fallback) => {
    const el = document.getElementById(id);
    return el ? el.value : (fallback || '');
  };

  const getCheck = (id, fallback) => {
    const el = document.getElementById(id);
    return el ? el.checked : (fallback !== false);
  };

  const updated = {
    ...state.settings,
    salonName: isManager ? getVal('cfgName', state.settings.salonName) : (state.settings.salonName || ''),
    phone: isManager ? getVal('cfgPhone', state.settings.phone) : (state.settings.phone || ''),
    address: isManager ? getVal('cfgAddress', state.settings.address) : (state.settings.address || ''),
    logo: isManager ? logoVal : (state.settings.logo || ''),
    photo: isManager ? logoVal : (state.settings.photo || ''),
    intervalMinutes: isManager ? Number(getVal('cfgInterval', state.settings.intervalMinutes || 30)) : (state.settings.intervalMinutes || 30),
    notifyNewAppointments: getCheck('cfgNotifyNewAppointments', state.settings.notifyNewAppointments),
    notifyReminders: getCheck('cfgNotifyReminders', state.settings.notifyReminders),
    notifyBirthdays: getCheck('cfgNotifyBirthdays', state.settings.notifyBirthdays),
    notifySound: getCheck('cfgNotifySound', state.settings.notifySound)
  };

  const res = await tenantFetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updated)
  });

  if (!res.ok) {
    const err = await res.json();
    asyncAlert(err.error || 'Erro ao salvar configurações.');
    return;
  }

  await loadInitialData();
  if (updated.salonName) {
    const hdrName = document.getElementById('salonHeaderName');
    if (hdrName) hdrName.innerText = updated.salonName;
  }
  if (updated.logo || updated.photo) {
    const sLogoEl = document.getElementById('sidebarSalonLogo');
    if (sLogoEl) sLogoEl.src = updated.logo || updated.photo;
  }
  if (document.getElementById('cfgName')) {
    asyncAlert('Configurações atualizadas com sucesso!');
  }
};


// Modais Genéricos de Cadastro
function openModal(title, bodyHtml, onConfirm) {
  document.getElementById('modalTitle').innerText = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  const confirmBtn = document.getElementById('modalConfirmBtn');

  // Substitui handler
  const newBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
  newBtn.addEventListener('click', onConfirm);

  const modal = document.getElementById('genericModal');
  if (modal) {
    modal.classList.add('open');
    modal.classList.add('active');
  }
  updateBodyScrollLock();
}

function closeModal() {
  const modal = document.getElementById('genericModal');
  if (modal) {
    modal.classList.remove('open');
    modal.classList.remove('active');
  }
  updateBodyScrollLock();
}

window.openNewAppointmentModal = function(defaultTime = "10:00") {
  const profOptions = state.professionals.map(p => `<option value="${p.id}" ${p.id === selectedProfessionalId ? 'selected' : ''}>${p.name} (${p.role})</option>`).join('');
  const servOptions = state.services.map(s => `<option value="${s.id}" data-price="${s.price}" data-duration="${s.durationMinutes}">${s.name} (${s.durationMinutes} min) - R$ ${s.price.toFixed(2)}</option>`).join('');

  const html = `
    <div class="form-group">
      <label>Profissional</label>
      <select class="form-control" id="modalAppProf">${profOptions}</select>
    </div>
    <div class="form-group">
      <label>Nome do Cliente</label>
      <input type="text" class="form-control" id="modalAppName" placeholder="Ex: Lucas Ferreira">
    </div>
    <div class="form-group">
      <label>WhatsApp do Cliente</label>
      <input type="text" class="form-control" id="modalAppPhone" placeholder="(67) 99999-9999">
    </div>
    <div class="form-group">
      <label>Serviço</label>
      <select class="form-control" id="modalAppService" onchange="updateModalEndTime()">${servOptions}</select>
    </div>
    <div class="form-group" style="display:flex; gap:10px;">
      <div style="flex:1;">
        <label>Horário Início</label>
        <input type="time" class="form-control" id="modalAppStart" value="${defaultTime}" onchange="updateModalEndTime()">
      </div>
      <div style="flex:1;">
        <label>Horário Fim (calculado)</label>
        <input type="time" class="form-control" id="modalAppEnd" value="10:30">
      </div>
    </div>
  `;

  openModal('Novo Agendamento', html, async () => {
    const profId = document.getElementById('modalAppProf').value;
    const clientName = document.getElementById('modalAppName').value.trim();
    const clientPhone = document.getElementById('modalAppPhone').value.trim();
    const serviceSelect = document.getElementById('modalAppService');
    const serviceId = serviceSelect.value;
    const selectedOption = serviceSelect.options[serviceSelect.selectedIndex];
    const serviceName = selectedOption.text.split(' (')[0];
    const price = Number(selectedOption.dataset.price) || 50;
    const startTime = document.getElementById('modalAppStart').value;
    const endTime = document.getElementById('modalAppEnd').value;

    if (!clientName) {
      asyncAlert('Por favor informe o nome do cliente');
      return;
    }

    const res = await tenantFetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        professionalId: profId,
        clientName,
        clientPhone,
        serviceId,
        serviceName,
        price,
        date: selectedDate,
        startTime,
        endTime,
        status: 'agendado'
      })
    });

    if (!res.ok) {
      const err = await res.json();
      asyncAlert(err.error || 'Erro ao agendar horário.');
      return;
    }

    closeModal();
    await loadInitialData();
    renderView('agenda');
  });

  setTimeout(updateModalEndTime, 50);
};

window.openBlockTimeModal = function(defaultStart = "12:00") {
  const profOptions = state.professionals.map(p => `<option value="${p.id}" ${p.id === selectedProfessionalId ? 'selected' : ''}>${p.name} (${p.role})</option>`).join('');
  const initialDate = selectedDate || new Date().toISOString().split('T')[0];

  const html = `
    <div style="display: flex; gap: 10px; margin-bottom: 12px;">
      <div class="form-group" style="flex: 1.2;">
        <label>Profissional</label>
        <select class="form-control" id="mBlockProf" onchange="renderBlockModalTimeline()">${profOptions}</select>
      </div>
      <div class="form-group" style="flex: 1;">
        <label>Data do Bloqueio</label>
        <input type="date" class="form-control" id="mBlockDate" value="${initialDate}" onchange="renderBlockModalTimeline()">
      </div>
    </div>

    <div class="form-group" style="margin-bottom: 12px;">
      <label>O que você deseja fazer?</label>
      <select class="form-control" id="mBlockType" onchange="handleBlockTypeChange(this.value)">
        <option value="intervalo">Bloquear Intervalo de Horário (Almoço, Pausa, Compromisso)</option>
        <option value="fechar_cedo">Fechar Mais Cedo (Bloquear até o encerramento do dia - 19:00)</option>
        <option value="dia_todo">Folga / Dia Inteiro Indisponível (08:00 às 19:00)</option>
      </select>
    </div>

    <div style="display:flex; gap:10px; margin-bottom:12px;" id="mBlockTimesWrapper">
      <div class="form-group" style="flex:1;">
        <label id="mBlockStartLabel">Começo do Intervalo (Início)</label>
        <input type="time" class="form-control" id="mBlockStart" value="${defaultStart}" onchange="renderBlockModalTimeline()">
      </div>
      <div class="form-group" style="flex:1;">
        <label id="mBlockEndLabel">Fim do Intervalo (Término)</label>
        <input type="time" class="form-control" id="mBlockEnd" value="13:00" onchange="renderBlockModalTimeline()">
      </div>
    </div>

    <!-- Linha do Tempo Visual dos Horários do Dia -->
    <div class="block-modal-visual-timeline" id="blockModalTimelineBox">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span style="font-size: 0.78rem; font-weight: 600; color: var(--muted); text-transform: uppercase;">Visão Geral da Grade do Dia</span>
        <span style="font-size: 0.72rem; color: var(--muted);" id="blockTimelineHint">Clique no início e depois no fim</span>
      </div>
      <div class="timeline-slots-container" id="blockTimelineSlots"></div>
      <div class="timeline-summary-preview" id="blockTimelineSummary">
        <span>Horário Selecionado: <strong>--:-- até --:--</strong></span>
      </div>
    </div>

    <div class="form-group" style="margin-bottom:12px;">
      <label>Motivo / Observação (Opcional)</label>
      <input type="text" class="form-control" id="mBlockNotes" placeholder="Ex: Almoço, Consulta médica, Saída mais cedo">
    </div>
  `;

  openModal('Bloquear Horário / Fechar Mais Cedo', html, async () => {
    const profId = document.getElementById('mBlockProf').value;
    const targetDate = document.getElementById('mBlockDate').value;
    const blockType = document.getElementById('mBlockType').value;
    let startTime = document.getElementById('mBlockStart').value;
    let endTime = document.getElementById('mBlockEnd').value;
    const notes = document.getElementById('mBlockNotes').value.trim() || (blockType === 'fechar_cedo' ? 'Fechado mais cedo' : (blockType === 'dia_todo' ? 'Folga / Dia Indisponível' : 'Pausa / Indisponível'));

    if (!targetDate) {
      asyncAlert('Por favor informe a data do bloqueio.');
      return;
    }

    if (blockType === 'fechar_cedo') {
      endTime = '19:00';
    } else if (blockType === 'dia_todo') {
      startTime = '08:00';
      endTime = '19:00';
    }

    if (!startTime || !endTime) {
      asyncAlert('Por favor informe os horários de início e término.');
      return;
    }

    if (startTime >= endTime) {
      asyncAlert('O horário de término precisa ser posterior ao horário de início.');
      return;
    }

    const res = await tenantFetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        professionalId: profId,
        clientName: 'INDISPONÍVEL',
        clientPhone: '',
        serviceId: 'indisponivel',
        serviceName: notes,
        price: 0,
        date: targetDate,
        startTime,
        endTime,
        notes,
        status: 'indisponivel'
      })
    });

    if (!res.ok) {
      const err = await res.json();
      asyncAlert(err.error || 'Erro ao bloquear horário.');
      return;
    }

    closeModal();
    // Atualiza a data da agenda para a data bloqueada para o usuário ver de imediato
    selectedDate = targetDate;
    await loadInitialData();
    renderView('agenda');
  });

  setTimeout(() => {
    handleBlockTypeChange(document.getElementById('mBlockType').value);
    renderBlockModalTimeline();
  }, 60);
};

window.handleBlockTypeChange = function(type) {
  const wrapper = document.getElementById('mBlockTimesWrapper');
  const startInput = document.getElementById('mBlockStart');
  const endInput = document.getElementById('mBlockEnd');
  const startLabel = document.getElementById('mBlockStartLabel');
  const endLabel = document.getElementById('mBlockEndLabel');
  if (!wrapper || !startInput || !endInput) return;

  if (type === 'fechar_cedo') {
    wrapper.style.display = 'flex';
    startLabel.innerText = 'Fechar a partir das (Começo):';
    endLabel.innerText = 'Até o fim do expediente:';
    endInput.value = '19:00';
    endInput.disabled = true;
    startInput.disabled = false;
  } else if (type === 'dia_todo') {
    wrapper.style.display = 'none';
  } else {
    wrapper.style.display = 'flex';
    startLabel.innerText = 'Começo do Intervalo (Início):';
    endLabel.innerText = 'Fim do Intervalo (Término):';
    startInput.disabled = false;
    endInput.disabled = false;
  }
  renderBlockModalTimeline();
};

let blockSelectionStep = 'start'; // 'start' ou 'end'

window.renderBlockModalTimeline = function() {
  const profId = document.getElementById('mBlockProf')?.value;
  const targetDate = document.getElementById('mBlockDate')?.value;
  const blockType = document.getElementById('mBlockType')?.value;
  const startInput = document.getElementById('mBlockStart');
  const endInput = document.getElementById('mBlockEnd');
  const slotsContainer = document.getElementById('blockTimelineSlots');
  const summaryEl = document.getElementById('blockTimelineSummary');
  const hintEl = document.getElementById('blockTimelineHint');

  if (!slotsContainer || !summaryEl) return;

  const times = [
    "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
    "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
    "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
    "17:00", "17:30", "18:00", "18:30", "19:00"
  ];

  let currentStart = startInput?.value || "12:00";
  let currentEnd = endInput?.value || "13:00";

  if (blockType === 'fechar_cedo') {
    currentEnd = "19:00";
  } else if (blockType === 'dia_todo') {
    currentStart = "08:00";
    currentEnd = "19:00";
  }

  if (hintEl) {
    if (blockType === 'intervalo') {
      if (blockSelectionStep === 'start') {
        hintEl.innerHTML = `<span style="color:var(--orange); font-weight:600;">① Clique no horário de INÍCIO da pausa</span>`;
      } else {
        hintEl.innerHTML = `<span style="color:#2563eb; font-weight:600;">② Agora clique no horário de TÉRMINO da pausa</span>`;
      }
    } else if (blockType === 'fechar_cedo') {
      hintEl.innerHTML = `<span>Clique para definir a partir de quando fechar</span>`;
    } else {
      hintEl.innerHTML = `<span>Dia todo bloqueado (08:00 às 19:00)</span>`;
    }
  }

  // Obter agendamentos desse profissional na data selecionada
  const dayApps = state.appointments.filter(
    a => a.professionalId === profId && a.date === targetDate && a.status !== 'cancelado'
  );

  let chipsHtml = '';
  times.forEach(t => {
    const isOccupied = dayApps.some(a => t >= a.startTime && t < a.endTime);
    const isStart = (t === currentStart);
    const isEnd = (t === currentEnd);
    const isInRange = (t >= currentStart && t <= currentEnd);

    let classes = ['timeline-slot-chip'];
    let tooltip = `Clique para selecionar`;

    if (isOccupied) {
      classes.push('occupied');
      tooltip = `Horário com atendimento na grade`;
    } else if (isInRange) {
      classes.push('in-block');
      if (isStart) classes.push('block-start');
      if (isEnd) classes.push('block-end');
      if (t > currentStart && t < currentEnd) classes.push('block-middle');
      tooltip = `Pausa / Bloqueio (${currentStart} até ${currentEnd})`;
    }

    chipsHtml += `<div class="${classes.join(' ')}" title="${tooltip}" onclick="quickSelectBlockSlot('${t}')">${t}</div>`;
  });

  slotsContainer.innerHTML = chipsHtml;
  summaryEl.innerHTML = `
    <span>Intervalo Selecionado: <strong style="font-size:0.9rem; color:var(--orange);">${currentStart} até ${currentEnd}</strong> (${targetDate})</span>
    <span style="font-size:0.75rem; color:var(--muted);">${calculateHoursDiff(currentStart, currentEnd)} de pausa</span>
  `;
};

function calculateHoursDiff(start, end) {
  if (!start || !end) return '';
  const [h1, m1] = start.split(':').map(Number);
  const [h2, m2] = end.split(':').map(Number);
  const totalMin = Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h} hora${h > 1 ? 's' : ''}`;
  return `${m} min`;
}

window.quickSelectBlockSlot = function(time) {
  const blockType = document.getElementById('mBlockType')?.value;
  const startInput = document.getElementById('mBlockStart');
  const endInput = document.getElementById('mBlockEnd');
  if (!startInput) return;

  if (blockType === 'fechar_cedo') {
    startInput.value = time;
    if (endInput) endInput.value = '19:00';
    renderBlockModalTimeline();
    return;
  }

  if (blockType === 'intervalo') {
    if (blockSelectionStep === 'start') {
      // 1º Clique: define o Início
      startInput.value = time;
      
      // Se o horário final atual for anterior ou igual ao novo início, ajusta o término para 1h à frente
      if (!endInput.value || endInput.value <= time) {
        const [h, m] = time.split(':').map(Number);
        const nextH = Math.min(19, h + 1);
        endInput.value = `${String(nextH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
      blockSelectionStep = 'end'; // Próximo clique definirá o fim
    } else {
      // 2º Clique: define o Fim
      if (time > startInput.value) {
        endInput.value = time;
        blockSelectionStep = 'start'; // Concluiu o range, reinicia ciclo
      } else if (time < startInput.value) {
        // Se clicou num horário antes do início atual, assume como novo início
        startInput.value = time;
        blockSelectionStep = 'end';
      } else {
        // Clicou no mesmo horário: adiciona 30 min para término
        const [h, m] = time.split(':').map(Number);
        const totalMin = h * 60 + m + 30;
        endInput.value = `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
        blockSelectionStep = 'start';
      }
    }
  }

  renderBlockModalTimeline();
};

window.openBookingRulesModal = function() {
  const currentMaxDays = state.settings.maxBookingDaysAhead || 30;
  const isCustom = ![3, 7, 15, 30].includes(Number(currentMaxDays));
  const allowSameDay = state.settings.allowSameDayBooking !== false;

  const html = `
    <div style="margin-bottom: 16px;">
      <p style="font-size: 0.88rem; color: var(--muted); margin-bottom: 14px;">
        Controle as regras de disponibilidade e até quando os clientes conseguem agendar horários sozinhos no link online.
      </p>

      <div class="form-group" style="margin-bottom: 14px;">
        <label>Janela de Dias Visíveis no Futuro</label>
        <div style="display: flex; gap: 10px; align-items: center;">
          <select class="form-control" id="mCfgMaxDaysPreset" onchange="handleBookingModalPresetChange(this.value)" style="flex: 1.2;">
            <option value="3" ${currentMaxDays === 3 ? 'selected' : ''}>Apenas 3 dias adiante</option>
            <option value="7" ${currentMaxDays === 7 ? 'selected' : ''}>7 dias adiante (1 semana)</option>
            <option value="15" ${currentMaxDays === 15 ? 'selected' : ''}>15 dias adiante (2 semanas)</option>
            <option value="30" ${(!currentMaxDays || currentMaxDays === 30) ? 'selected' : ''}>30 dias adiante (1 mês)</option>
            <option value="custom" ${isCustom ? 'selected' : ''}>Personalizado (digitar dias)</option>
          </select>
          <div id="mCfgMaxDaysCustomWrapper" style="display: ${isCustom ? 'flex' : 'none'}; align-items: center; gap: 6px; flex: 1;">
            <input type="number" min="1" max="365" class="form-control" id="mCfgMaxDaysCustom" value="${currentMaxDays}" placeholder="Qtd de dias">
            <span style="font-size: 0.85rem; color: var(--muted); font-weight: 500;">dias</span>
          </div>
        </div>
        <small style="color:var(--muted); font-size:0.78rem; display:block; margin-top:4px;">
          Evita que clientes façam agendamentos para datas muito distantes.
        </small>
      </div>

      <div class="form-group" style="margin-bottom: 14px;">
        <label>Permitir Agendamento no Mesmo Dia?</label>
        <select class="form-control" id="mCfgAllowSameDay">
          <option value="true" ${allowSameDay ? 'selected' : ''}>Sim — Clientes podem marcar para o mesmo dia (se houver vaga livre)</option>
          <option value="false" ${!allowSameDay ? 'selected' : ''}>Não — Clientes só podem marcar a partir do dia seguinte (Evita surpresas)</option>
        </select>
        <small style="color:var(--muted); font-size:0.78rem; display:block; margin-top:4px;">
          Se desativado, o cliente não consegue marcar horários para a data de hoje, apenas para amanhã em diante.
        </small>
      </div>
    </div>
  `;

  openModal('Regras de Agendamento Online', html, async () => {
    if (!isManager) {
      asyncAlert('Apenas gestores têm permissão para alterar as regras de agendamento.');
      return;
    }

    const preset = document.getElementById('mCfgMaxDaysPreset').value;
    let maxDays = 30;
    if (preset === 'custom') {
      maxDays = Number(document.getElementById('mCfgMaxDaysCustom').value) || 30;
    } else {
      maxDays = Number(preset) || 30;
    }

    const allowSameDayVal = document.getElementById('mCfgAllowSameDay').value === 'true';

    const updated = {
      ...state.settings,
      maxBookingDaysAhead: maxDays,
      allowSameDayBooking: allowSameDayVal
    };

    const res = await tenantFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });

    if (!res.ok) {
      const err = await res.json();
      asyncAlert(err.error || 'Erro ao salvar regras.');
      return;
    }

    state.settings = updated;
    closeModal();
    renderView('agenda');
  });
};

window.handleBookingModalPresetChange = function(val) {
  const customWrapper = document.getElementById('mCfgMaxDaysCustomWrapper');
  if (!customWrapper) return;
  if (val === 'custom') {
    customWrapper.style.display = 'flex';
  } else {
    customWrapper.style.display = 'none';
  }
};

window.updateModalEndTime = function() {
  const serviceSelect = document.getElementById('modalAppService');
  const startInput = document.getElementById('modalAppStart');
  const endInput = document.getElementById('modalAppEnd');
  if (!serviceSelect || !startInput || !endInput) return;

  const duration = Number(serviceSelect.options[serviceSelect.selectedIndex]?.dataset?.duration) || 30;
  const [h, m] = startInput.value.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return;

  const totalMin = h * 60 + m + duration;
  const endH = Math.floor(totalMin / 60);
  const endM = totalMin % 60;
  endInput.value = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
};

window.openNewServiceModal = function() {
  if (!isManager) {
    asyncAlert('Apenas gestores têm permissão para adicionar serviços.');
    return;
  }
  const html = `
    <div class="form-group">
      <label>Nome do Serviço</label>
      <input type="text" class="form-control" id="mServName" placeholder="Ex: Penteado Noiva">
    </div>
    <div class="form-group">
      <label>Categoria</label>
      <input type="text" class="form-control" id="mServCat" placeholder="Ex: Cortes, Tranças, Barba">
    </div>
    <div class="form-group">
      <label>Preço (R$)</label>
      <input type="number" class="form-control" id="mServPrice" placeholder="80.00" step="0.50">
    </div>
    <div class="form-group">
      <label>Duração Estimada (minutos)</label>
      <input type="number" class="form-control" id="mServDuration" value="60">
    </div>
    <div class="form-group">
      <label>Comissão Padrão do Profissional (%)</label>
      <input type="number" class="form-control" id="mServComm" value="50">
    </div>
  `;

  openModal('Cadastrar Novo Serviço', html, async () => {
    const name = document.getElementById('mServName').value;
    const category = document.getElementById('mServCat').value;
    const price = Number(document.getElementById('mServPrice').value);
    const durationMinutes = Number(document.getElementById('mServDuration').value);
    const commissionPercent = Number(document.getElementById('mServComm').value);

    if (!name || !price) {
      asyncAlert('Nome e Preço são obrigatórios!');
      return;
    }

    await tenantFetch('/api/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, price, durationMinutes, commissionPercent })
    });

    closeModal();
    await loadInitialData();
    renderView('servicos');
  });
};

window.openNewClientModal = function() {
  const html = `
    <div class="form-group">
      <label>Nome Completo</label>
      <input type="text" class="form-control" id="mCliName" placeholder="Ex: Mariana Silva">
    </div>
    <div class="form-group">
      <label>WhatsApp / Celular</label>
      <input type="text" class="form-control" id="mCliPhone" placeholder="(67) 99999-9999">
    </div>
    <div class="form-group">
      <label>Data de Nascimento</label>
      <input type="date" class="form-control" id="mCliBday">
    </div>
    <div class="form-group">
      <label>Anotações e Histórico (Química, Alergias, Fórmulas)</label>
      <textarea class="form-control" id="mCliNotes" rows="3" placeholder="Ex: Fórmula 6.0 + 20vol, alérgica a esmalte tal, prefere café sem açúcar..."></textarea>
    </div>
  `;

  openModal('Cadastrar Cliente', html, async () => {
    const name = document.getElementById('mCliName').value;
    const phone = document.getElementById('mCliPhone').value;
    const birthday = document.getElementById('mCliBday').value;
    const notes = document.getElementById('mCliNotes').value;

    if (!name) {
      asyncAlert('O nome do cliente é obrigatório!');
      return;
    }

    await tenantFetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, birthday, notes })
    });

    closeModal();
    await loadInitialData();
    renderView('clientes');
  });
};

window.openNewExpenseModal = function() {
  if (!isManager) {
    asyncAlert('Apenas gestores têm permissão para cadastrar despesas.');
    return;
  }
  const today = new Date().toISOString().split('T')[0];
  const html = `
    <div class="form-group">
      <label>Descrição</label>
      <input type="text" class="form-control" id="mExpDesc" placeholder="Ex: Conta de Luz / Aluguel">
    </div>
    <div class="form-group">
      <label>Categoria</label>
      <input type="text" class="form-control" id="mExpCat" placeholder="Ex: Aluguel, Insumos, Energia">
    </div>
    <div class="form-group">
      <label>Valor Total (R$)</label>
      <input type="number" class="form-control" id="mExpAmount" placeholder="150.00" step="0.50" oninput="updateExpenseInstallmentPreview()">
    </div>
    <div class="form-group">
      <label>Primeiro Vencimento</label>
      <input type="date" class="form-control" id="mExpDueDate" value="${today}">
    </div>
    <div class="form-group">
      <label>Forma de Pagamento</label>
      <select class="form-control" id="mExpType" onchange="toggleExpenseInstallments()">
        <option value="Pix">Pix</option>
        <option value="Boleto">Boleto</option>
        <option value="Cartão">Cartão</option>
        <option value="Dinheiro">Dinheiro</option>
      </select>
    </div>
    <div class="form-group" style="display:flex; align-items:center; gap:8px; margin-top:8px;">
      <input type="checkbox" id="mExpRecurring">
      <label for="mExpRecurring" style="margin:0; font-weight:600; color:var(--ink); font-size:0.88rem; cursor:pointer;">
        Despesa Recorrente (Repetir todo mês automaticamente)
      </label>
    </div>
    <div class="form-group" id="mExpInstallmentsWrapper" style="display:none; background: #fff7ed; padding: 12px; border-radius: 10px; border: 1px solid #ffedd5; margin-top:8px;">
      <label style="color: var(--orange); font-weight: 600;">Parcelamento</label>
      <select class="form-control" id="mExpInstallments" onchange="updateExpenseInstallmentPreview()">
        <option value="1">À vista (1x)</option>
        <option value="2">2x</option>
        <option value="3">3x</option>
        <option value="4">4x</option>
        <option value="5">5x</option>
        <option value="6">6x</option>
        <option value="7">7x</option>
        <option value="8">8x</option>
        <option value="9">9x</option>
        <option value="10">10x</option>
        <option value="11">11x</option>
        <option value="12">12x</option>
        <option value="18">18x</option>
        <option value="24">24x</option>
      </select>
      <div id="mExpInstallmentSummary" style="margin-top: 8px; font-size: 0.82rem; color: #c2410c; font-weight: 500;"></div>
    </div>
  `;

  openModal('Cadastrar Despesa', html, async () => {
    const description = document.getElementById('mExpDesc').value;
    const category = document.getElementById('mExpCat').value;
    const amount = Number(document.getElementById('mExpAmount').value);
    const dueDate = document.getElementById('mExpDueDate').value || today;
    const paymentType = document.getElementById('mExpType').value;
    const isRecurring = document.getElementById('mExpRecurring').checked;
    const installments = (paymentType === 'Cartão' || paymentType === 'Boleto')
      ? (parseInt(document.getElementById('mExpInstallments').value, 10) || 1)
      : 1;

    if (!description || !amount) {
      asyncAlert('Descrição e Valor são obrigatórios!');
      return;
    }

    await tenantFetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, category, amount, dueDate, paymentType, installments, isRecurring, status: 'pendente' })
    });

    closeModal();
    await loadInitialData();
    renderView('despesas');
  });
};

window.toggleExpenseInstallments = function() {
  const type = document.getElementById('mExpType')?.value;
  const wrapper = document.getElementById('mExpInstallmentsWrapper');
  if (!wrapper) return;
  if (type === 'Cartão' || type === 'Boleto') {
    wrapper.style.display = 'block';
    updateExpenseInstallmentPreview();
  } else {
    wrapper.style.display = 'none';
  }
};

window.updateExpenseInstallmentPreview = function() {
  const amount = Number(document.getElementById('mExpAmount')?.value) || 0;
  const select = document.getElementById('mExpInstallments');
  const summary = document.getElementById('mExpInstallmentSummary');
  if (!select || !summary) return;

  const count = parseInt(select.value, 10) || 1;
  if (count <= 1 || amount <= 0) {
    summary.innerHTML = `Lançamento único no valor de <strong>R$ ${amount.toFixed(2)}</strong>`;
    return;
  }

  const valPerInstallment = (amount / count).toFixed(2);
  summary.innerHTML = `Serão gerados <strong>${count} lançamentos mensais</strong> de <strong>R$ ${valPerInstallment}</strong> cada.`;
};

window.openNewProfessionalModal = function() {
  if (!isManager) {
    asyncAlert('Apenas gestores têm permissão para adicionar profissionais.');
    return;
  }

  const currentCount = state.professionals.length;
  if (currentCount >= 10) {
    asyncAlert('Seu salão já atingiu o limite máximo de 10 profissionais cadastrados.');
    return;
  }

  const isExtra = currentCount >= 5;
  const nextCount = currentCount + 1;
  const baseMonthly = Number(currentSubscriptionData?.basePrice || currentSubscriptionData?.monthlyPrice) || 49.90;
  const nextMonthly = baseMonthly + (Math.max(0, nextCount - 5) * 10);

  const priceNoticeHtml = isExtra ? `
    <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 10px 14px; margin-bottom: 14px; color: #c2410c; font-size: 0.84rem; display: flex; align-items: center; gap: 10px;">
      <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
      <div>
        <strong>Aviso de Assinatura:</strong> Este será o <strong>${nextCount}º profissional</strong> do seu salão. A mensalidade do salão passará a ser de <strong>R$ ${nextMonthly.toFixed(2).replace('.', ',')}/mês</strong> (+R$ 10,00/mês).
      </div>
    </div>
  ` : '';

  const html = `
    ${priceNoticeHtml}
    <div class="form-group" style="margin-bottom: 14px;">
      <label>Foto de Perfil do Profissional</label>
      <div style="display: flex; align-items: center; gap: 14px; margin-top: 6px;">
        <img id="mProfAvatarPreview" src="/images/butterflies/butterfly-1.svg" style="width: 58px; height: 58px; border-radius: 50%; object-fit: cover; border: 2px solid var(--orange);">
        <div>
          <label class="btn-falcon btn-secondary" style="cursor: pointer; padding: 5px 12px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px;">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            <span>Escolher Foto</span>
            <input type="file" id="mProfAvatarInput" accept="image/*" style="display: none;" onchange="handleNewProfAvatarSelect(event)">
          </label>
          <input type="hidden" id="mProfAvatarValue" value="/images/butterflies/butterfly-1.svg">
        </div>
      </div>
    </div>
    <div class="form-group">
      <label>Nome Completo</label>
      <input type="text" class="form-control" id="mProfName" maxlength="25" placeholder="Ex: Juliana Castro">
    </div>
    <div class="form-group">
      <label>Especialidade / Cargo</label>
      <input type="text" class="form-control" id="mProfRole" placeholder="Ex: Cabeleireira, Manicure, Barbeiro">
    </div>
    <div class="form-group">
      <label>WhatsApp / Celular</label>
      <input type="text" class="form-control" id="mProfPhone" placeholder="(67) 99999-9999">
    </div>
    <div class="form-group">
      <label>Usuário de Acesso (Login)</label>
      <input type="text" class="form-control" id="mProfUsername" placeholder="Ex: juliana">
    </div>
    <div class="form-group">
      <label>Senha de Acesso ao Sistema</label>
      <input type="password" class="form-control" id="mProfPass" placeholder="Senha do funcionário">
    </div>
    <div class="form-group">
      <label>Email de Contato (Opcional)</label>
      <input type="email" class="form-control" id="mProfEmail" placeholder="juliana@salao.com">
    </div>
    <div class="form-group">
      <label>Nível de Acesso</label>
      <select class="form-control" id="mProfAccess">
        <option value="Profissional de Servicos">Profissional de Serviços (Apenas sua agenda e comissões)</option>
        <option value="Gestor">Gestor Geral (Acesso total)</option>
      </select>
    </div>
    <div class="form-group">
      <label>Comissão Padrão (%)</label>
      <input type="number" class="form-control" id="mProfComm" value="50">
    </div>
    <div class="form-group" style="display:flex; align-items:center; gap:8px; margin-top:8px;">
      <input type="checkbox" id="mProfBooking" checked>
      <label for="mProfBooking" style="margin:0; font-size:0.88rem;">Exibir na página pública de agendamento online</label>
    </div>

    <!-- Seção de Sinal de Adiantamento (InfinitePay / Pix) -->
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; margin-top: 14px;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
        <input type="checkbox" id="mProfRequireDeposit" onchange="document.getElementById('mProfDepositFields').style.display = this.checked ? 'block' : 'none'">
        <label for="mProfRequireDeposit" style="margin:0; font-weight:700; color:var(--ink); font-size:0.9rem; cursor:pointer;">
          Exigir Sinal de Adiantamento para Agendar
        </label>
      </div>

      <div id="mProfDepositFields" style="display: none;">
        <p style="font-size:0.78rem; color:var(--muted); margin-bottom:10px; line-height:1.4;">
          O cliente só garante o horário pagando uma entrada antecipada diretamente para o Pix da profissional (qualquer banco de sua preferência).
        </p>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
          <div class="form-group" style="margin:0;">
            <label style="font-size:0.8rem;">Porcentagem do Sinal (%)</label>
            <input type="number" class="form-control" id="mProfDepositPercent" value="30" min="5" max="100" placeholder="Ex: 30">
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:0.8rem;">Banco / Instituição</label>
            <input type="text" class="form-control" id="mProfPixBank" placeholder="Ex: Nubank, Inter, Itaú, InfinitePay, Caixa...">
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1.5fr; gap:10px; margin-bottom:10px;">
          <div class="form-group" style="margin:0;">
            <label style="font-size:0.8rem;">Tipo de Chave</label>
            <select class="form-control" id="mProfPixType">
              <option value="Chave Pix">Chave Pix</option>
              <option value="Celular / WhatsApp">Celular / WhatsApp</option>
              <option value="CPF">CPF</option>
              <option value="CNPJ">CNPJ</option>
              <option value="Email">Email</option>
              <option value="Aleatória">Aleatória</option>
            </select>
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:0.8rem;">Chave Pix de Recebimento</label>
            <input type="text" class="form-control" id="mProfPixKey" placeholder="Ex: chave pix ou infiniteTag">
          </div>
        </div>

        <div class="form-group" style="margin:0;">
          <label style="font-size:0.8rem;">Nome do Titular da Conta (para conferência)</label>
          <input type="text" class="form-control" id="mProfPixName" placeholder="Ex: Sarah Beatriz da Silva">
        </div>
      </div>
    </div>
  `;

  openModal('Cadastrar Profissional & Criar Login', html, async () => {
    const name = document.getElementById('mProfName').value.trim();
    const role = document.getElementById('mProfRole').value.trim();
    const phone = document.getElementById('mProfPhone').value.trim();
    const username = document.getElementById('mProfUsername').value.trim();
    const email = document.getElementById('mProfEmail').value.trim();
    const password = document.getElementById('mProfPass').value;
    const access = document.getElementById('mProfAccess').value;
    const commissionDefault = Number(document.getElementById('mProfComm').value);
    const showInBooking = document.getElementById('mProfBooking').checked;

    const requireDeposit = document.getElementById('mProfRequireDeposit').checked;
    const depositPercent = Number(document.getElementById('mProfDepositPercent').value) || 30;
    const pixBank = document.getElementById('mProfPixBank').value.trim() || 'InfinitePay';
    const pixKeyType = document.getElementById('mProfPixType').value;
    const pixKey = document.getElementById('mProfPixKey').value.trim();
    const pixName = document.getElementById('mProfPixName').value.trim() || name;

    const avatar = document.getElementById('mProfAvatarValue')?.value || getButterflyAvatar(name);

    await tenantFetch('/api/professionals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        role,
        avatar,
        phone,
        username,
        email,
        password,
        access,
        commissionDefault,
        showInBooking,
        requireDeposit,
        depositPercent,
        pixBank,
        pixKeyType,
        pixKey,
        pixName
      })
    });

    closeModal();
    await loadInitialData();
    renderView('profissionais');
  });
};

window.openNewProductModal = function() {
  if (!isManager) {
    asyncAlert('Apenas gestores têm permissão para adicionar produtos.');
    return;
  }
  const html = `
    <div class="form-group">
      <label>Nome do Produto</label>
      <input type="text" class="form-control" id="mProdName" placeholder="Ex: Shampoo Revitalizante 300ml">
    </div>
    <div class="form-group">
      <label>Categoria</label>
      <input type="text" class="form-control" id="mProdCat" placeholder="Ex: Cabelo, Barba, Cuidados">
    </div>
    <div class="form-group">
      <label>Preço de Venda (R$)</label>
      <input type="number" class="form-control" id="mProdPrice" placeholder="45.00" step="0.50">
    </div>
    <div class="form-group">
      <label>Quantidade em Estoque</label>
      <input type="number" class="form-control" id="mProdStock" value="10">
    </div>
  `;

  openModal('Cadastrar Produto', html, async () => {
    const name = document.getElementById('mProdName').value;
    const category = document.getElementById('mProdCat').value;
    const price = Number(document.getElementById('mProdPrice').value);
    const stock = Number(document.getElementById('mProdStock').value);

    if (!name || !price) {
      asyncAlert('Nome e Preço são obrigatórios!');
      return;
    }

    await tenantFetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, price, stock })
    });

    closeModal();
    await loadInitialData();
    renderView('produtos');
  });
};

// -------------------------------------------------------------
// FUNÇÕES DE EDIÇÃO E EXCLUSÃO (CRUD COMPLETO)
// -------------------------------------------------------------

window.toggleProfBookingVisibility = async function(profId) {
  const prof = state.professionals.find(p => p.id === profId);
  if (!prof) return;
  const updatedStatus = !prof.showInBooking;
  const res = await tenantFetch(`/api/professionals/${profId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...prof, showInBooking: updatedStatus })
  });
  if (res.ok) {
    await loadInitialData();
    renderView('profissionais');
  } else {
    asyncAlert('Erro ao alterar visibilidade do profissional.');
  }
};

window.toggleExpenseStatus = async function(expenseId) {
  const expense = state.expenses.find(e => e.id === expenseId);
  if (!expense) return;
  const newStatus = expense.status === 'pago' ? 'pendente' : 'pago';
  const res = await tenantFetch(`/api/expenses/${expenseId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...expense, status: newStatus })
  });
  if (res.ok) {
    await loadInitialData();
    renderView('despesas');
  } else {
    asyncAlert('Erro ao alterar status da despesa.');
  }
};

window.openWhatsApp = function(phone, name = '') {
  if (!phone) return asyncAlert('Telefone não informado.');
  const clean = phone.replace(/\D/g, '');
  if (!clean) return asyncAlert('Telefone inválido.');
  const text = name ? `Olá ${name}, tudo bem?` : 'Olá, tudo bem?';
  const waUrl = `https://wa.me/55${clean}?text=${encodeURIComponent(text)}`;
  window.open(waUrl, '_blank');
};

// 1. Profissionais: Editar e Excluir
window.openEditProfessionalModal = function(profId) {
  if (!isManager) {
    asyncAlert('Apenas gestores têm permissão para editar profissionais.');
    return;
  }
  const prof = state.professionals.find(p => p.id === profId);
  if (!prof) return asyncAlert('Profissional não encontrado.');

  const html = `
    <div class="form-group" style="margin-bottom: 14px;">
      <label>Foto de Perfil do Profissional</label>
      <div style="display: flex; align-items: center; gap: 14px; margin-top: 6px;">
        <img id="mEditProfAvatarPreview" src="${prof.avatar || getButterflyAvatar(prof.name || 'P')}" style="width: 58px; height: 58px; border-radius: 50%; object-fit: cover; border: 2px solid var(--orange);">
        <div>
          <label class="btn-falcon btn-secondary" style="cursor: pointer; padding: 5px 12px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px;">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            <span>Escolher Foto</span>
            <input type="file" id="mEditProfAvatarInput" accept="image/*" style="display: none;" onchange="handleEditProfAvatarSelect(event)">
          </label>
          <input type="hidden" id="mEditProfAvatarValue" value="${prof.avatar || ''}">
        </div>
      </div>
    </div>
    <div class="form-group">
      <label>Nome Completo</label>
      <input type="text" class="form-control" id="mEditProfName" value="${prof.name || ''}" maxlength="25">
    </div>
    <div class="form-group">
      <label>Especialidade / Cargo</label>
      <input type="text" class="form-control" id="mEditProfRole" value="${prof.role || ''}">
    </div>
    <div class="form-group">
      <label>WhatsApp / Celular</label>
      <input type="text" class="form-control" id="mEditProfPhone" value="${prof.phone || ''}">
    </div>
    <div class="form-group">
      <label>Email de Contato</label>
      <input type="email" class="form-control" id="mEditProfEmail" value="${prof.email || ''}">
    </div>
    <div class="form-group">
      <label>Nova Senha de Acesso (deixe em branco para não alterar)</label>
      <input type="password" class="form-control" id="mEditProfPass" placeholder="Preencha apenas se quiser alterar">
    </div>
    <div class="form-group">
      <label>Nível de Acesso</label>
      <select class="form-control" id="mEditProfAccess">
        <option value="Profissional de Servicos" ${prof.access !== 'Gestor' ? 'selected' : ''}>Profissional de Serviços (Apenas sua agenda e comissões)</option>
        <option value="Gestor" ${prof.access === 'Gestor' ? 'selected' : ''}>Gestor Geral (Acesso total)</option>
      </select>
    </div>
    <div class="form-group">
      <label>Comissão Padrão (%)</label>
      <input type="number" class="form-control" id="mEditProfComm" value="${prof.commissionDefault || 50}">
    </div>
    <div class="form-group" style="display:flex; align-items:center; gap:8px; margin-top:8px;">
      <input type="checkbox" id="mEditProfBooking" ${prof.showInBooking !== false ? 'checked' : ''}>
      <label for="mEditProfBooking" style="margin:0; font-size:0.88rem;">Exibir na página pública de agendamento online</label>
    </div>

    <!-- Seção de Sinal de Adiantamento (InfinitePay / Pix) -->
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; margin-top: 14px;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
        <input type="checkbox" id="mEditProfRequireDeposit" ${prof.requireDeposit ? 'checked' : ''} onchange="document.getElementById('mEditProfDepositFields').style.display = this.checked ? 'block' : 'none'">
        <label for="mEditProfRequireDeposit" style="margin:0; font-weight:700; color:var(--ink); font-size:0.9rem; cursor:pointer;">
          Exigir Sinal de Adiantamento para Agendar
        </label>
      </div>

      <div id="mEditProfDepositFields" style="display: ${prof.requireDeposit ? 'block' : 'none'};">
        <p style="font-size:0.78rem; color:var(--muted); margin-bottom:10px; line-height:1.4;">
          O cliente só garante o horário pagando uma entrada antecipada diretamente para o Pix da profissional (qualquer banco de sua preferência).
        </p>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
          <div class="form-group" style="margin:0;">
            <label style="font-size:0.8rem;">Porcentagem do Sinal (%)</label>
            <input type="number" class="form-control" id="mEditProfDepositPercent" value="${prof.depositPercent || 30}" min="5" max="100" placeholder="Ex: 30">
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:0.8rem;">Banco / Instituição</label>
            <input type="text" class="form-control" id="mEditProfPixBank" value="${prof.pixBank || ''}" placeholder="Ex: Nubank, Inter, Itaú, InfinitePay, Caixa...">
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1.5fr; gap:10px; margin-bottom:10px;">
          <div class="form-group" style="margin:0;">
            <label style="font-size:0.8rem;">Tipo de Chave</label>
            <select class="form-control" id="mEditProfPixType">
              <option value="Chave Pix" ${prof.pixKeyType === 'Chave Pix' ? 'selected' : ''}>Chave Pix</option>
              <option value="Celular / WhatsApp" ${prof.pixKeyType === 'Celular / WhatsApp' ? 'selected' : ''}>Celular / WhatsApp</option>
              <option value="CPF" ${prof.pixKeyType === 'CPF' ? 'selected' : ''}>CPF</option>
              <option value="CNPJ" ${prof.pixKeyType === 'CNPJ' ? 'selected' : ''}>CNPJ</option>
              <option value="Email" ${prof.pixKeyType === 'Email' ? 'selected' : ''}>Email</option>
              <option value="Aleatória" ${prof.pixKeyType === 'Aleatória' ? 'selected' : ''}>Aleatória</option>
            </select>
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:0.8rem;">Chave Pix de Recebimento</label>
            <input type="text" class="form-control" id="mEditProfPixKey" value="${prof.pixKey || ''}" placeholder="Ex: chave pix ou infiniteTag">
          </div>
        </div>

        <div class="form-group" style="margin:0;">
          <label style="font-size:0.8rem;">Nome do Titular da Conta (para conferência)</label>
          <input type="text" class="form-control" id="mEditProfPixName" value="${prof.pixName || prof.name || ''}" placeholder="Ex: Sarah Beatriz da Silva">
        </div>
      </div>
    </div>
  `;

  openModal('Editar Profissional', html, async () => {
    const name = document.getElementById('mEditProfName').value.trim();
    const role = document.getElementById('mEditProfRole').value.trim();
    const phone = document.getElementById('mEditProfPhone').value.trim();
    const email = document.getElementById('mEditProfEmail').value.trim();
    const password = document.getElementById('mEditProfPass').value;
    const access = document.getElementById('mEditProfAccess').value;
    const commissionDefault = Number(document.getElementById('mEditProfComm').value);
    const showInBooking = document.getElementById('mEditProfBooking').checked;

    const requireDeposit = document.getElementById('mEditProfRequireDeposit').checked;
    const depositPercent = Number(document.getElementById('mEditProfDepositPercent').value) || 30;
    const pixBank = document.getElementById('mEditProfPixBank').value.trim() || 'InfinitePay';
    const pixKeyType = document.getElementById('mEditProfPixType').value;
    const pixKey = document.getElementById('mEditProfPixKey').value.trim();
    const pixName = document.getElementById('mEditProfPixName').value.trim() || name;

    if (!name) {
      asyncAlert('O nome do profissional é obrigatório.');
      return;
    }

    const avatar = document.getElementById('mEditProfAvatarValue')?.value || '';

    const payload = {
      name,
      role,
      phone,
      email,
      access,
      commissionDefault,
      showInBooking,
      requireDeposit,
      depositPercent,
      pixBank,
      pixKeyType,
      pixKey,
      pixName,
      avatar
    };
    if (password) payload.password = password;

    const res = await tenantFetch(`/api/professionals/${profId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      asyncAlert(err.error || 'Erro ao atualizar profissional.');
      return;
    }

    closeModal();
    await loadInitialData();
    renderView('profissionais');
  });
};

window.deleteProfessional = async function(profId) {
  if (!isManager) {
    await asyncAlert('Apenas gestores têm permissão para excluir profissionais.', 'Acesso Restrito', 'warning');
    return;
  }
  const prof = state.professionals.find(p => p.id === profId);
  const name = prof ? prof.name : 'este profissional';
  const confirmed = await asyncConfirm(`Deseja realmente excluir ${name}? O acesso e histórico associado serão desvinculados.`, 'Excluir Profissional', { isDanger: true });
  if (!confirmed) return;

  const res = await tenantFetch(`/api/professionals/${profId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    await asyncAlert(err.error || 'Erro ao excluir profissional.', 'Erro', 'error');
    return;
  }

  await loadInitialData();
  renderView('profissionais');
};

// 2. Serviços: Editar e Excluir
window.openEditServiceModal = function(serviceId) {
  if (!isManager) {
    asyncAlert('Apenas gestores têm permissão para editar serviços.');
    return;
  }
  const serv = state.services.find(s => s.id === serviceId);
  if (!serv) return asyncAlert('Serviço não encontrado.');

  const html = `
    <div class="form-group">
      <label>Nome do Serviço</label>
      <input type="text" class="form-control" id="mEditServName" value="${serv.name || ''}">
    </div>
    <div class="form-group">
      <label>Categoria</label>
      <input type="text" class="form-control" id="mEditServCat" value="${serv.category || ''}">
    </div>
    <div class="form-group">
      <label>Preço (R$)</label>
      <input type="number" class="form-control" id="mEditServPrice" value="${serv.price || 0}" step="0.50">
    </div>
    <div class="form-group">
      <label>Duração Estimada (minutos)</label>
      <input type="number" class="form-control" id="mEditServDuration" value="${serv.durationMinutes || 60}">
    </div>
    <div class="form-group">
      <label>Comissão Padrão do Profissional (%)</label>
      <input type="number" class="form-control" id="mEditServComm" value="${serv.commissionPercent || 50}">
    </div>
  `;

  openModal('Editar Serviço', html, async () => {
    const name = document.getElementById('mEditServName').value.trim();
    const category = document.getElementById('mEditServCat').value.trim();
    const price = Number(document.getElementById('mEditServPrice').value);
    const durationMinutes = Number(document.getElementById('mEditServDuration').value);
    const commissionPercent = Number(document.getElementById('mEditServComm').value);

    if (!name || isNaN(price)) {
      asyncAlert('Nome e Preço são obrigatórios.');
      return;
    }

    const res = await tenantFetch(`/api/services/${serviceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, price, durationMinutes, commissionPercent })
    });

    if (!res.ok) {
      const err = await res.json();
      asyncAlert(err.error || 'Erro ao atualizar serviço.');
      return;
    }

    closeModal();
    await loadInitialData();
    renderView('servicos');
  });
};

window.deleteService = async function(serviceId) {
  if (!isManager) {
    await asyncAlert('Apenas gestores têm permissão para excluir serviços.', 'Acesso Restrito', 'warning');
    return;
  }
  const serv = state.services.find(s => s.id === serviceId);
  const name = serv ? serv.name : 'este serviço';
  const confirmed = await asyncConfirm(`Deseja realmente excluir ${name}?`, 'Excluir Serviço', { isDanger: true });
  if (!confirmed) return;

  const res = await tenantFetch(`/api/services/${serviceId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    await asyncAlert(err.error || 'Erro ao excluir serviço.', 'Erro', 'error');
    return;
  }

  await loadInitialData();
  renderView('servicos');
};

// 3. Produtos: Editar e Excluir
window.openEditProductModal = function(productId) {
  if (!isManager) {
    asyncAlert('Apenas gestores têm permissão para editar produtos.', 'Acesso Restrito', 'warning');
    return;
  }
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return asyncAlert('Produto não encontrado.', 'Erro', 'error');

  const html = `
    <div class="form-group">
      <label>Nome do Produto</label>
      <input type="text" class="form-control" id="mEditProdName" value="${prod.name || ''}">
    </div>
    <div class="form-group">
      <label>Categoria</label>
      <input type="text" class="form-control" id="mEditProdCat" value="${prod.category || ''}">
    </div>
    <div class="form-group">
      <label>Marca</label>
      <input type="text" class="form-control" id="mEditProdBrand" value="${prod.brand || ''}">
    </div>
    <div class="form-group">
      <label>Preço de Venda (R$)</label>
      <input type="number" class="form-control" id="mEditProdPrice" value="${prod.price || 0}" step="0.50">
    </div>
    <div class="form-group">
      <label>Quantidade em Estoque</label>
      <input type="number" class="form-control" id="mEditProdStock" value="${prod.stock || 0}">
    </div>
  `;

  openModal('Editar Produto', html, async () => {
    const name = document.getElementById('mEditProdName').value.trim();
    const category = document.getElementById('mEditProdCat').value.trim();
    const brand = document.getElementById('mEditProdBrand').value.trim();
    const price = Number(document.getElementById('mEditProdPrice').value);
    const stock = Number(document.getElementById('mEditProdStock').value);

    if (!name || isNaN(price)) {
      await asyncAlert('Nome e Preço são obrigatórios.', 'Campos Obrigatórios', 'warning');
      return;
    }

    const res = await tenantFetch(`/api/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, brand, price, stock })
    });

    if (!res.ok) {
      const err = await res.json();
      await asyncAlert(err.error || 'Erro ao atualizar produto.', 'Erro', 'error');
      return;
    }

    closeModal();
    await loadInitialData();
    renderView('produtos');
  });
};

window.deleteProduct = async function(productId) {
  if (!isManager) {
    await asyncAlert('Apenas gestores têm permissão para excluir produtos.', 'Acesso Restrito', 'warning');
    return;
  }
  const prod = state.products.find(p => p.id === productId);
  const name = prod ? prod.name : 'este produto';
  const confirmed = await asyncConfirm(`Deseja realmente excluir ${name}?`, 'Excluir Produto', { isDanger: true });
  if (!confirmed) return;

  const res = await tenantFetch(`/api/products/${productId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    await asyncAlert(err.error || 'Erro ao excluir produto.', 'Erro', 'error');
    return;
  }

  await loadInitialData();
  renderView('produtos');
};

// 4. Clientes: Editar e Excluir
window.openEditClientModal = function(clientId) {
  const cli = state.clients.find(c => c.id === clientId);
  if (!cli) return asyncAlert('Cliente não encontrado.', 'Erro', 'error');

  const html = `
    <div class="form-group">
      <label>Nome Completo</label>
      <input type="text" class="form-control" id="mEditCliName" value="${cli.name || ''}">
    </div>
    <div class="form-group">
      <label>WhatsApp / Celular</label>
      <input type="text" class="form-control" id="mEditCliPhone" value="${cli.phone || ''}">
    </div>
    <div class="form-group">
      <label>Data de Nascimento</label>
      <input type="date" class="form-control" id="mEditCliBday" value="${cli.birthday || ''}">
    </div>
    <div class="form-group">
      <label>Anotações e Histórico (Química, Alergias, Fórmulas de Tintura)</label>
      <textarea class="form-control" id="mEditCliNotes" rows="3" placeholder="Fórmulas, alergias, química anterior, preferências...">${cli.notes || ''}</textarea>
    </div>
  `;

  openModal('Editar Cliente', html, async () => {
    const name = document.getElementById('mEditCliName').value.trim();
    const phone = document.getElementById('mEditCliPhone').value.trim();
    const birthday = document.getElementById('mEditCliBday').value;
    const notes = document.getElementById('mEditCliNotes').value.trim();

    if (!name) {
      await asyncAlert('O nome do cliente é obrigatório.', 'Campo Obrigatório', 'warning');
      return;
    }

    const res = await tenantFetch(`/api/clients/${clientId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, birthday, notes })
    });

    if (!res.ok) {
      const err = await res.json();
      await asyncAlert(err.error || 'Erro ao atualizar cliente.', 'Erro', 'error');
      return;
    }

    closeModal();
    await loadInitialData();
    renderView('clientes');
  });
};

window.deleteClient = async function(clientId) {
  const cli = state.clients.find(c => c.id === clientId);
  const name = cli ? cli.name : 'este cliente';
  const confirmed = await asyncConfirm(`Deseja realmente excluir o cadastro de ${name}?`, 'Excluir Cliente', { isDanger: true });
  if (!confirmed) return;

  const res = await tenantFetch(`/api/clients/${clientId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    await asyncAlert(err.error || 'Erro ao excluir cliente.', 'Erro', 'error');
    return;
  }

  await loadInitialData();
  renderView('clientes');
};

// 5. Despesas: Editar e Excluir
window.openEditExpenseModal = function(expenseId) {
  if (!isManager) {
    asyncAlert('Apenas gestores têm permissão para editar despesas.');
    return;
  }
  const exp = state.expenses.find(e => e.id === expenseId);
  if (!exp) return asyncAlert('Despesa não encontrada.');

  const html = `
    <div class="form-group">
      <label>Descrição</label>
      <input type="text" class="form-control" id="mEditExpDesc" value="${exp.description || ''}">
    </div>
    <div class="form-group">
      <label>Categoria</label>
      <input type="text" class="form-control" id="mEditExpCat" value="${exp.category || ''}">
    </div>
    <div class="form-group">
      <label>Valor (R$)</label>
      <input type="number" class="form-control" id="mEditExpAmount" value="${exp.amount || 0}" step="0.50">
    </div>
    <div class="form-group">
      <label>Data de Vencimento</label>
      <input type="date" class="form-control" id="mEditExpDate" value="${exp.dueDate || ''}">
    </div>
    <div class="form-group">
      <label>Forma de Pagamento</label>
      <select class="form-control" id="mEditExpType">
        <option value="Pix" ${exp.paymentType === 'Pix' ? 'selected' : ''}>Pix</option>
        <option value="Boleto" ${exp.paymentType === 'Boleto' ? 'selected' : ''}>Boleto</option>
        <option value="Cartão" ${exp.paymentType === 'Cartão' ? 'selected' : ''}>Cartão</option>
        <option value="Dinheiro" ${exp.paymentType === 'Dinheiro' ? 'selected' : ''}>Dinheiro</option>
      </select>
    </div>
    <div class="form-group">
      <label>Status</label>
      <select class="form-control" id="mEditExpStatus">
        <option value="pendente" ${exp.status === 'pendente' ? 'selected' : ''}>Pendente</option>
        <option value="pago" ${exp.status === 'pago' ? 'selected' : ''}>Pago</option>
      </select>
    </div>
  `;

  openModal('Editar Despesa', html, async () => {
    const description = document.getElementById('mEditExpDesc').value.trim();
    const category = document.getElementById('mEditExpCat').value.trim();
    const amount = Number(document.getElementById('mEditExpAmount').value);
    const dueDate = document.getElementById('mEditExpDate').value;
    const paymentType = document.getElementById('mEditExpType').value;
    const status = document.getElementById('mEditExpStatus').value;

    if (!description || isNaN(amount)) {
      asyncAlert('Descrição e Valor são obrigatórios.');
      return;
    }

    const res = await tenantFetch(`/api/expenses/${expenseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, category, amount, dueDate, paymentType, status })
    });

    if (!res.ok) {
      const err = await res.json();
      asyncAlert(err.error || 'Erro ao atualizar despesa.');
      return;
    }

    closeModal();
    await loadInitialData();
    renderView('despesas');
  });
};

window.deleteExpense = async function(expenseId) {
  if (!isManager) {
    await asyncAlert('Apenas gestores têm permissão para excluir despesas.', 'Acesso Restrito', 'warning');
    return;
  }
  const exp = state.expenses.find(e => e.id === expenseId);
  const desc = exp ? exp.description : 'esta despesa';
  const confirmed = await asyncConfirm(`Deseja realmente excluir "${desc}"?`, 'Excluir Despesa', { isDanger: true });
  if (!confirmed) return;

  const res = await tenantFetch(`/api/expenses/${expenseId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    await asyncAlert(err.error || 'Erro ao excluir despesa.', 'Erro', 'error');
    return;
  }

  await loadInitialData();
  renderView('despesas');
};

// 6. Comissões & Vales: Adicionar, Editar e Excluir
window.openNewCommissionModal = function() {
  if (!isManager) {
    asyncAlert('Apenas gestores têm permissão para lançar comissões ou vales.');
    return;
  }

  const profOptions = (state.professionals || []).map(p => `
    <option value="${p.id}">${p.name} (${p.role || 'Profissional'})</option>
  `).join('');

  const today = new Date().toISOString().split('T')[0];

  const html = `
    <div class="form-group">
      <label>Profissional</label>
      <select class="form-control" id="mCommProf">
        ${profOptions || '<option value="">Nenhum profissional cadastrado</option>'}
      </select>
    </div>
    <div class="form-group">
      <label>Tipo de Lançamento</label>
      <select class="form-control" id="mCommType" onchange="document.getElementById('mCommDesc').placeholder = this.value === 'vale' ? 'Ex: Adiantamento de salário / Vale transporte' : 'Ex: Comissão sobre Mechas / Bônus Meta'">
        <option value="comissao">Comissão (Acréscimo a pagar)</option>
        <option value="vale">Vale / Adiantamento (Desconto ou saque antecipado)</option>
      </select>
    </div>
    <div class="form-group">
      <label>Valor (R$)</label>
      <input type="number" class="form-control" id="mCommAmount" placeholder="Ex: 150.00" step="0.50" min="0">
    </div>
    <div class="form-group">
      <label>Descrição / Referência</label>
      <input type="text" class="form-control" id="mCommDesc" placeholder="Ex: Comissão sobre Mechas / Bônus Meta">
    </div>
    <div class="form-group">
      <label>Data de Registro</label>
      <input type="date" class="form-control" id="mCommDate" value="${today}">
    </div>
    <div class="form-group">
      <label>Status</label>
      <select class="form-control" id="mCommStatus">
        <option value="a_pagar">A Pagar (Pendente de liberação)</option>
        <option value="paga">Já Paga (Quitada)</option>
      </select>
    </div>
  `;

  openModal('Lançar Comissão / Vale', html, async () => {
    const professionalId = document.getElementById('mCommProf').value;
    const type = document.getElementById('mCommType').value;
    const amount = Number(document.getElementById('mCommAmount').value);
    const description = document.getElementById('mCommDesc').value.trim();
    const date = document.getElementById('mCommDate').value;
    const status = document.getElementById('mCommStatus').value;

    if (!professionalId) {
      asyncAlert('Selecione um profissional.');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      asyncAlert('Informe um valor válido maior que zero.');
      return;
    }

    const prof = (state.professionals || []).find(p => p.id === professionalId);

    const res = await tenantFetch('/api/commissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        professionalId,
        professionalName: prof ? prof.name : 'Profissional',
        type,
        amount,
        description: description || (type === 'vale' ? 'Adiantamento / Vale' : 'Comissão Avulsa'),
        date,
        status,
        paymentDate: status === 'paga' ? date : null
      })
    });

    if (!res.ok) {
      const err = await res.json();
      asyncAlert(err.error || 'Erro ao lançar comissão/vale.');
      return;
    }

    closeModal();
    await loadInitialData();
    renderView('comissões');
  });
};

window.openEditCommissionModal = function(commId) {
  if (!isManager) {
    asyncAlert('Apenas gestores têm permissão para editar comissões ou vales.');
    return;
  }

  const comm = (state.commissions || []).find(c => c.id === commId);
  if (!comm) return asyncAlert('Lançamento não encontrado.');

  const profOptions = (state.professionals || []).map(p => `
    <option value="${p.id}" ${p.id === comm.professionalId ? 'selected' : ''}>${p.name} (${p.role || 'Profissional'})</option>
  `).join('');

  const currentType = comm.type || (comm.description && comm.description.toLowerCase().includes('vale') ? 'vale' : 'comissao');
  const amountVal = Math.abs(comm.amount || 0);

  const html = `
    <div class="form-group">
      <label>Profissional</label>
      <select class="form-control" id="mEditCommProf">
        ${profOptions}
      </select>
    </div>
    <div class="form-group">
      <label>Tipo de Lançamento</label>
      <select class="form-control" id="mEditCommType">
        <option value="comissao" ${currentType === 'comissao' ? 'selected' : ''}>Comissão (Acréscimo a pagar)</option>
        <option value="vale" ${currentType === 'vale' ? 'selected' : ''}>Vale / Adiantamento (Desconto ou saque antecipado)</option>
      </select>
    </div>
    <div class="form-group">
      <label>Valor (R$)</label>
      <input type="number" class="form-control" id="mEditCommAmount" value="${amountVal}" step="0.50" min="0">
    </div>
    <div class="form-group">
      <label>Descrição / Referência</label>
      <input type="text" class="form-control" id="mEditCommDesc" value="${comm.description || ''}">
    </div>
    <div class="form-group">
      <label>Data de Registro</label>
      <input type="date" class="form-control" id="mEditCommDate" value="${comm.date || comm.paymentDate || ''}">
    </div>
    <div class="form-group">
      <label>Status</label>
      <select class="form-control" id="mEditCommStatus">
        <option value="a_pagar" ${comm.status === 'a_pagar' ? 'selected' : ''}>A Pagar (Pendente)</option>
        <option value="paga" ${comm.status === 'paga' ? 'selected' : ''}>Paga (Quitada)</option>
      </select>
    </div>
  `;

  openModal('Editar Comissão / Vale', html, async () => {
    const professionalId = document.getElementById('mEditCommProf').value;
    const type = document.getElementById('mEditCommType').value;
    const amount = Number(document.getElementById('mEditCommAmount').value);
    const description = document.getElementById('mEditCommDesc').value.trim();
    const date = document.getElementById('mEditCommDate').value;
    const status = document.getElementById('mEditCommStatus').value;

    if (!professionalId) {
      asyncAlert('Selecione um profissional.');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      asyncAlert('Informe um valor válido.');
      return;
    }

    const prof = (state.professionals || []).find(p => p.id === professionalId);

    const res = await tenantFetch(`/api/commissions/${commId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        professionalId,
        professionalName: prof ? prof.name : comm.professionalName,
        type,
        amount,
        description,
        date,
        status,
        paymentDate: status === 'paga' ? (comm.paymentDate || date || new Date().toISOString().split('T')[0]) : null
      })
    });

    if (!res.ok) {
      const err = await res.json();
      asyncAlert(err.error || 'Erro ao atualizar comissão/vale.');
      return;
    }

    closeModal();
    await loadInitialData();
    renderView('comissões');
  });
};

window.deleteCommission = async function(commId) {
  if (!isManager) {
    await asyncAlert('Apenas gestores têm permissão para excluir comissões ou vales.', 'Acesso Restrito', 'warning');
    return;
  }

  const comm = (state.commissions || []).find(c => c.id === commId);
  const name = comm ? `${comm.professionalName} (R$ ${Math.abs(comm.amount || 0).toFixed(2)})` : 'este lançamento';

  const confirmed = await asyncConfirm(`Deseja realmente excluir ${name}?`, 'Excluir Lançamento', { isDanger: true });
  if (!confirmed) return;

  const res = await tenantFetch(`/api/commissions/${commId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    await asyncAlert(err.error || 'Erro ao excluir lançamento.', 'Erro', 'error');
    return;
  }

  await loadInitialData();
  renderView('comissões');
};

// -------------------------------------------------------------
// SISTEMA DE ASSINATURA, REGUAS DE AVISOS E MERCADO PAGO
// -------------------------------------------------------------

let currentSubscriptionData = null;
let currentPixPaymentId = null;

async function checkSubscriptionStatus() {
  // Superadmin e usuários vitalícios não têm restrição
  try {
    const res = await tenantFetch('/api/subscription/status');
    if (!res.ok) return;
    const data = await res.json();
    currentSubscriptionData = data;

    const bannerContainer = document.getElementById('subscriptionBannerContainer');
    if (!bannerContainer) return;

    // Se for vitalício, esvazia qualquer banner e garante desbloqueio
    if (data.isLifetime) {
      bannerContainer.innerHTML = '';
      const payModal = document.getElementById('subscriptionPayModal');
      if (payModal) payModal.classList.remove('open');
      return;
    }

    // Régua de avisos nos 3 dias, 2 dias ou no dia do vencimento
    if (data.isBlocked) {
      bannerContainer.innerHTML = `
        <div style="background: #fee2e2; color: #b91c1c; padding: 12px 20px; border-bottom: 1px solid #fca5a5; display: flex; align-items: center; justify-content: space-between; font-weight: 500;">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span>${data.message}</span>
          </div>
          <button class="btn-falcon btn-primary" onclick="openSubscriptionPayModal(true)" style="padding: 6px 14px; font-size: 0.85rem;">Pagar Assinatura</button>
        </div>
      `;
      // Bloqueia com overlay obrigatório
      openSubscriptionPayModal(false);
    } else if (data.warningLevel === 'today') {
      bannerContainer.innerHTML = `
        <div style="background: #fef2f2; color: #dc2626; padding: 10px 20px; border-bottom: 1px solid #fecaca; display: flex; align-items: center; justify-content: space-between; font-weight: 500;">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            <span><strong>Aviso Urgente:</strong> Sua mensalidade vence hoje! Renove para não perder o acesso.</span>
          </div>
          <button class="btn-falcon btn-primary" onclick="openSubscriptionPayModal(true)" style="padding: 5px 12px; font-size: 0.82rem;">Renovar Agora (Pix)</button>
        </div>
      `;
    } else if (data.warningLevel === 'two_days') {
      bannerContainer.innerHTML = `
        <div style="background: #fff7ed; color: #c2410c; padding: 10px 20px; border-bottom: 1px solid #fed7aa; display: flex; align-items: center; justify-content: space-between; font-weight: 500;">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span>Sua assinatura BellaSync vence em <strong>2 dias</strong>.</span>
          </div>
          <button class="btn-falcon btn-primary" onclick="openSubscriptionPayModal(true)" style="padding: 5px 12px; font-size: 0.82rem;">Antecipar Pagamento</button>
        </div>
      `;
    } else if (data.warningLevel === 'three_days') {
      bannerContainer.innerHTML = `
        <div style="background: #fefce8; color: #854d0e; padding: 10px 20px; border-bottom: 1px solid #fef08a; display: flex; align-items: center; justify-content: space-between; font-weight: 500;">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span>Lembrete: Sua assinatura BellaSync vence em <strong>3 dias</strong>.</span>
          </div>
          <button class="btn-falcon btn-secondary" onclick="openSubscriptionPayModal(true)" style="padding: 5px 12px; font-size: 0.82rem;">Ver Fatura</button>
        </div>
      `;
    } else {
      bannerContainer.innerHTML = '';
    }
  } catch (err) {
    console.error('Erro ao verificar assinatura:', err);
  }
}

let currentSubMode = 'card';

window.switchSubPaymentTab = function(mode) {
  currentSubMode = mode;
  const tabCard = document.getElementById('subTabCardBtn');
  const tabPix = document.getElementById('subTabPixBtn');
  const cardBox = document.getElementById('subCardBox');
  const pixBox = document.getElementById('subPixBox');

  if (mode === 'card') {
    tabCard.style.background = '#fff';
    tabCard.style.color = '#0f172a';
    tabCard.style.boxShadow = '0 2px 6px rgba(0,0,0,0.06)';
    tabPix.style.background = 'transparent';
    tabPix.style.color = '#64748b';
    tabPix.style.boxShadow = 'none';
    cardBox.style.display = 'block';
    pixBox.style.display = 'none';
  } else {
    tabPix.style.background = '#fff';
    tabPix.style.color = '#0f172a';
    tabPix.style.boxShadow = '0 2px 6px rgba(0,0,0,0.06)';
    tabCard.style.background = 'transparent';
    tabCard.style.color = '#64748b';
    tabCard.style.boxShadow = 'none';
    cardBox.style.display = 'none';
    pixBox.style.display = 'block';

    // Se ainda não gerou Pix nessa sessão, gera agora
    if (!currentPixPaymentId) {
      loadPixPayment();
    }
  }
};

async function loadCardSubscription() {
  const btn = document.getElementById('btnSubscribeCard');
  try {
    const res = await tenantFetch('/api/subscription/create-card-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (res.ok && data.initPoint) {
      btn.href = data.initPoint;
      const amountEl = document.getElementById('subCardAmountDisplay');
      if (amountEl) {
        amountEl.innerHTML = `R$ ${Number(data.amount).toFixed(2)} <span style="font-size:0.85rem; font-weight:normal; color:var(--muted);">/ mês</span>`;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar plano de cartão:', e);
  }
}

async function loadPixPayment() {
  const loadingBox = document.getElementById('subLoadingBox');
  const pixBox = document.getElementById('subPixBox');
  const loadingText = document.getElementById('subLoadingText');
  if (loadingText) loadingText.innerText = 'Gerando Pix com Mercado Pago...';
  loadingBox.style.display = 'block';

  try {
    const res = await tenantFetch('/api/subscription/create-pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: currentUser?.name || 'Gestor do Salão',
        email: currentUser?.email || 'contato@bellasync.online'
      })
    });
    const data = await res.json();
    loadingBox.style.display = 'none';

    if (!res.ok) {
      asyncAlert(data.error || 'Erro ao gerar Pix.');
      return;
    }

    currentPixPaymentId = data.paymentId;
    document.getElementById('subQrCodeImg').src = `data:image/png;base64,${data.qrCodeBase64}`;
    document.getElementById('subPixCopyCode').value = data.qrCode;
    document.getElementById('subPixAmount').innerText = `R$ ${Number(data.amount).toFixed(2)}`;
    if (currentSubMode === 'pix') {
      pixBox.style.display = 'block';
    }
  } catch (err) {
    loadingBox.style.display = 'none';
    asyncAlert('Erro de conexão ao gerar Pix.');
  }
}

window.openSubscriptionPayModal = async function(canClose = true) {
  // Se for vitalício, nunca abre modal de pagamento nem dispara cobrança
  if (currentSubscriptionData && currentSubscriptionData.isLifetime) {
    console.log('[Subscription] Salão com acesso vitalício. Bloqueio de cobrança ativo.');
    return;
  }

  const modal = document.getElementById('subscriptionPayModal');
  const closeBtn = document.getElementById('btnCloseSubModal');
  const closeCardBtn = document.getElementById('btnCloseSubModalCard');
  const closeXBtn = document.getElementById('btnSubModalCloseX');

  if (!modal) return;
  modal.classList.add('open');

  if (closeBtn) closeBtn.style.display = canClose ? 'inline-block' : 'none';
  if (closeCardBtn) closeCardBtn.style.display = canClose ? 'inline-block' : 'none';
  if (closeXBtn) closeXBtn.style.display = canClose ? 'flex' : 'none';

  // Inicia na aba de Cartão (Recorrente)
  switchSubPaymentTab('card');

  // Carrega o link do cartão e pré-carrega o Pix em segundo plano
  loadCardSubscription();
  loadPixPayment();
};

window.closeSubModal = function() {
  const modal = document.getElementById('subscriptionPayModal');
  if (modal) modal.classList.remove('open');
};

window.copyPixCode = function() {
  const input = document.getElementById('subPixCopyCode');
  if (!input) return;
  input.select();
  navigator.clipboard.writeText(input.value);
  asyncAlert('Código Pix Copia e Cola copiado com sucesso!');
};

window.verifySubscriptionPayment = async function() {
  if (!currentPixPaymentId) {
    asyncAlert('Nenhum pagamento Pix ativo para consultar.');
    return;
  }
  const btn = document.getElementById('btnCheckSubPayment');
  btn.innerText = 'Consultando...';
  btn.disabled = true;

  try {
    const res = await tenantFetch(`/api/subscription/check-payment/${currentPixPaymentId}`);
    const data = await res.json();
    btn.disabled = false;
    btn.innerText = 'Já realizei o pagamento';

    if (data.status === 'approved') {
      asyncAlert('Pagamento aprovado com sucesso! Sua assinatura foi renovada.');
      closeSubModal();
      await checkSubscriptionStatus();
      renderView('agenda');
    } else {
      asyncAlert('O pagamento ainda está sendo processado pelo Mercado Pago. Aguarde alguns segundos e tente novamente.');
    }
  } catch (err) {
    btn.disabled = false;
    btn.innerText = 'Já realizei o pagamento';
    asyncAlert('Erro ao consultar status no Mercado Pago.');
  }
};

// -------------------------------------------------------------
// PAINEL DE SUPERADMIN (KARUADMIN)
// -------------------------------------------------------------

async function renderSuperAdmin(container, actions) {
  if (!isSuperAdmin) {
    container.innerHTML = `<div class="card-shell"><h3>Acesso restrito ao Super Administrador da plataforma.</h3></div>`;
    return;
  }

  container.innerHTML = `<div class="card-shell" style="text-align:center;">Carregando dados da plataforma...</div>`;

  try {
    const res = await tenantFetch('/api/superadmin/tenants');
    const data = await res.json();

    const tenants = data.tenants || [];
    const settings = data.platformSettings || { defaultMonthlyPrice: 49.90 };

    let rowsHtml = tenants.map(t => {
      const sub = t.subscription || {};
      const isLife = sub.isLifetime;
      const expFormatted = sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('pt-BR') : '-';
      const statusBadge = isLife
        ? '<span class="btn-falcon btn-success" style="font-size:0.75rem; padding:4px 8px;">Vitalício (Ilimitado)</span>'
        : (sub.status === 'active'
            ? `<span class="btn-falcon btn-primary" style="font-size:0.75rem; padding:4px 8px;">Ativo até ${expFormatted}</span>`
            : `<span class="btn-falcon btn-danger" style="font-size:0.75rem; padding:4px 8px;">Inadimplente / Vencido</span>`);

      return `
        <div class="data-item-card" style="display:flex; justify-content:space-between; align-items:center; gap:16px;">
          <div class="item-main-info">
            <h4 style="font-size:1.05rem;">${t.name} <small style="color:var(--muted); font-size:0.8rem;">(${t.slug})</small></h4>
            <p>WhatsApp: ${t.phone || 'Sem telefone'} • Cadastrado em: ${t.createdAt || '-'}</p>
            <div style="margin-top:6px;">Status: ${statusBadge} • Mensalidade: <strong>R$ ${(Number(sub.monthlyPrice) || settings.defaultMonthlyPrice).toFixed(2)}</strong></div>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px; min-width:200px; text-align:right;">
            <button class="btn-falcon ${isLife ? 'btn-secondary' : 'btn-success'}" onclick="toggleTenantLifetime('${t.id}', ${!isLife})" style="font-size:0.8rem;">
              ${isLife ? 'Remover Vitalício' : 'Tornar Vitalício'}
            </button>
            <div style="display:flex; gap:6px; justify-content:flex-end;">
              <button class="btn-falcon btn-primary" onclick="addDaysToTenant('${t.id}', 30)" style="font-size:0.78rem; padding:4px 8px;" title="Adicionar 30 dias">
                +30 dias
              </button>
              <button class="btn-falcon btn-secondary" onclick="editTenantPrice('${t.id}', ${sub.monthlyPrice || settings.defaultMonthlyPrice})" style="font-size:0.78rem; padding:4px 8px;" title="Alterar valor">
                Alterar R$
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="card-shell" style="margin-bottom:20px;">
        <h3 style="margin-bottom: 8px;">Visão Geral da BellaSync SaaS</h3>
        <p style="color:var(--muted); font-size:0.9rem; margin-bottom:16px;">
          Painel exclusivo do desenvolvedor / dono da plataforma para gerenciar salões e assinaturas.
        </p>
        <div class="metrics-grid">
          <div class="metric-card green">
            <div class="metric-label">Total de Salões</div>
            <div class="metric-value">${tenants.length}</div>
          </div>
          <div class="metric-card orange">
            <div class="metric-label">Valor Padrão da Assinatura</div>
            <div class="metric-value" style="display:flex; align-items:center; gap:8px;">
              R$ ${Number(settings.defaultMonthlyPrice).toFixed(2)}
              <button class="btn-falcon btn-secondary" onclick="updateDefaultPrice(${settings.defaultMonthlyPrice})" style="font-size:0.75rem; padding:2px 8px;">Editar</button>
            </div>
          </div>
          <div class="metric-card red">
            <div class="metric-label">Mercado Pago</div>
            <div class="metric-value" style="font-size:0.95rem; color:#16a34a; font-weight:600;">Conectado</div>
          </div>
        </div>
      </div>

      <h3 style="margin-bottom: 12px;">Salões Cadastrados</h3>
      <div class="data-list">${rowsHtml}</div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="card-shell" style="color:var(--red);">Erro ao carregar dados do Super Administrador.</div>`;
  }
}

window.toggleTenantLifetime = async function(tenantId, isLifetime) {
  const msg = isLifetime
    ? 'Deseja tornar este salão VITALÍCIO perpétuo? Ele nunca será cobrado nem verá avisos de mensalidade.'
    : 'Deseja remover o plano vitalício deste salão? Ele voltará a ser cobrado por mês.';
  const confirmed = await asyncConfirm(msg, 'Plano Vitalício');
  if (!confirmed) return;

  await tenantFetch(`/api/superadmin/tenants/${tenantId}/subscription`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isLifetime })
  });
  renderSuperAdmin(document.getElementById('viewContainer'));
};

window.addDaysToTenant = async function(tenantId, days) {
  const confirmed = await asyncConfirm(`Deseja adicionar +${days} dias na assinatura deste salão?`, 'Adicionar Dias');
  if (!confirmed) return;
  await tenantFetch(`/api/superadmin/tenants/${tenantId}/subscription`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addDays: days, status: 'active' })
  });
  renderSuperAdmin(document.getElementById('viewContainer'));
};

window.editTenantPrice = async function(tenantId, currentPrice) {
  const newPrice = prompt('Informe o novo valor da mensalidade para este salão (R$):', currentPrice);
  if (!newPrice || isNaN(newPrice)) return;
  await tenantFetch(`/api/superadmin/tenants/${tenantId}/subscription`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ monthlyPrice: Number(newPrice) })
  });
  renderSuperAdmin(document.getElementById('viewContainer'));
};

window.updateDefaultPrice = async function(currentPrice) {
  const newPrice = prompt('Informe o valor padrão da assinatura mensal para novos salões (R$):', currentPrice);
  if (!newPrice || isNaN(newPrice)) return;
  await tenantFetch('/api/superadmin/platform-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ defaultMonthlyPrice: Number(newPrice) })
  });
  renderSuperAdmin(document.getElementById('viewContainer'));
};

// -------------------------------------------------------------
// HELPER COMPRESSOR E GERENCIAMENTO DE FOTOS DE PERFIL E SALÃO
// -------------------------------------------------------------
function compressImage(file, maxWidth = 500, maxHeight = 500, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(mimeType, quality));
      };
      img.onerror = (err) => reject(err);
      img.src = e.target.result;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

window.handleSalonLogoSelect = async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const compressed = await compressImage(file, 500, 500, 0.85);
    const preview = document.getElementById('settingSalonLogoPreview');
    const inputVal = document.getElementById('settingSalonLogoValue');
    if (preview) preview.src = compressed;
    if (inputVal) inputVal.value = compressed;
  } catch (err) {
    console.error("Erro ao carregar logo do salão:", err);
    asyncAlert("Erro ao processar imagem da foto do salão.");
  }
};

window.handleNewProfAvatarSelect = async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const compressed = await compressImage(file, 400, 400, 0.85);
    const preview = document.getElementById('mProfAvatarPreview');
    const inputVal = document.getElementById('mProfAvatarValue');
    if (preview) preview.src = compressed;
    if (inputVal) inputVal.value = compressed;
  } catch (err) {
    console.error("Erro ao carregar foto do profissional:", err);
    asyncAlert("Erro ao processar foto do profissional.");
  }
};

window.handleEditProfAvatarSelect = async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const compressed = await compressImage(file, 400, 400, 0.85);
    const preview = document.getElementById('mEditProfAvatarPreview');
    const inputVal = document.getElementById('mEditProfAvatarValue');
    if (preview) preview.src = compressed;
    if (inputVal) inputVal.value = compressed;
  } catch (err) {
    console.error("Erro ao carregar foto do profissional:", err);
    asyncAlert("Erro ao processar foto do profissional.");
  }
};

window.handleProfileAvatarSelect = async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const compressed = await compressImage(file, 400, 400, 0.85);
    const preview = document.getElementById('profileAvatarPreview');
    const inputVal = document.getElementById('profileAvatarValue');
    if (preview) preview.src = compressed;
    if (inputVal) inputVal.value = compressed;
  } catch (err) {
    console.error("Erro ao carregar foto de perfil:", err);
    asyncAlert("Erro ao processar foto de perfil.");
  }
};

window.openProfileModal = function() {
  if (!currentUser) return;
  const modal = document.getElementById('userProfileModal');
  if (!modal) return;
  
  const nameInput = document.getElementById('profileNameInput');
  const passInput = document.getElementById('profilePasswordInput');
  const preview = document.getElementById('profileAvatarPreview');
  const valueInput = document.getElementById('profileAvatarValue');

  if (nameInput) nameInput.value = currentUser.name || '';
  if (passInput) passInput.value = '';

  const profMatch = currentUser.professionalId ? (state.professionals || []).find(p => p.id === currentUser.professionalId) : null;
  const userPhoto = currentUser.avatar || profMatch?.avatar || getButterflyAvatar(currentUser.name || 'P');
  if (preview) preview.src = userPhoto;
  if (valueInput) valueInput.value = userPhoto;

  modal.classList.add('open');
};

window.closeProfileModal = function() {
  const modal = document.getElementById('userProfileModal');
  if (modal) modal.classList.remove('open');
};

window.saveUserProfile = async function() {
  if (!currentUser) return;
  const name = document.getElementById('profileNameInput').value.trim().slice(0, 25);
  const password = document.getElementById('profilePasswordInput').value.trim();
  const avatar = document.getElementById('profileAvatarValue').value;

  if (!name) {
    await asyncAlert("Por favor digite o seu nome.");
    return;
  }

  try {
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': currentTenant ? currentTenant.id : 'tenant_metamorfose',
        'x-user-id': currentUser.id
      },
      body: JSON.stringify({
        userId: currentUser.id,
        name,
        password,
        avatar
      })
    });
    const updatedUser = await res.json();
    if (res.ok) {
      currentUser = updatedUser;
      localStorage.setItem('salon_user', JSON.stringify(updatedUser));

      const nameEl = document.getElementById('userDisplayName');
      if (nameEl) nameEl.innerText = updatedUser.name;

      const userAvatarEl = document.getElementById('sidebarUserAvatar');
      if (userAvatarEl) userAvatarEl.src = updatedUser.avatar;

      closeProfileModal();
      await asyncAlert("Perfil e foto atualizados com sucesso!", "Sucesso", "success");
      await loadInitialData();
    } else {
      await asyncAlert(updatedUser.error || "Erro ao atualizar perfil.");
    }
  } catch (err) {
    console.error(err);
    await asyncAlert("Erro de conexão ao salvar perfil.");
  }
};
