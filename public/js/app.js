let currentView = 'agenda';
let selectedProfessionalId = 'prof_1';
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

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupMobileToggle();
  await loadInitialData();
  renderView(currentView);

  document.getElementById('fabBtn').addEventListener('click', () => {
    openNewAppointmentModal();
  });

  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
});

async function loadInitialData() {
  try {
    const [settings, profs, servs, clis, apps, prods, exps, comms] = await Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/professionals').then(r => r.json()),
      fetch('/api/services').then(r => r.json()),
      fetch('/api/clients').then(r => r.json()),
      fetch('/api/appointments').then(r => r.json()),
      fetch('/api/products').then(r => r.json()),
      fetch('/api/expenses').then(r => r.json()),
      fetch('/api/commissions').then(r => r.json())
    ]);

    state = {
      settings,
      professionals: profs,
      services: servs,
      clients: clis,
      appointments: apps,
      products: prods,
      expenses: exps,
      commissions: comms
    };

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
      document.getElementById('sidebar').classList.remove('open');
    });
  });
}

function setupMobileToggle() {
  const toggleBtn = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });
}

// Router simples das Views
function renderView(view) {
  const container = document.getElementById('viewContainer');
  const title = document.getElementById('currentViewTitle');
  const actions = document.getElementById('topBarActions');
  actions.innerHTML = '';

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
    case 'configuracoes':
      title.innerText = 'Configurações do Salão';
      renderSettings(container, actions);
      break;
    default:
      container.innerHTML = `<div class="card-shell"><h3>Em desenvolvimento...</h3></div>`;
  }
}

// 1. Render Agenda
let agendaPollingInterval = null;

function renderAgenda(container, actions) {
  actions.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px;">
      <input type="date" value="${selectedDate}" class="form-control" style="width: auto;" id="agendaDateInput">
      <button class="btn-falcon btn-secondary" onclick="refreshAgendaData()" title="Atualizar dados">🔄 Atualizar</button>
    </div>
  `;
  document.getElementById('agendaDateInput').addEventListener('change', (e) => {
    selectedDate = e.target.value;
    renderAgenda(container, actions);
  });

  // Garante auto-refresh a cada 5 segundos na view de agenda para receber agendamentos online em tempo real
  if (!agendaPollingInterval) {
    agendaPollingInterval = setInterval(async () => {
      if (currentView === 'agenda') {
        const apps = await fetch('/api/appointments').then(r => r.json());
        state.appointments = apps;
        const currentProfAppointments = state.appointments.filter(
          a => a.professionalId === selectedProfessionalId && a.date === selectedDate
        );
        updateScheduleSlots(currentProfAppointments);
      }
    }, 4000);
  }

  // Filtro de profissionais
  let profsHtml = state.professionals.map(p => `
    <div class="prof-badge-card ${p.id === selectedProfessionalId ? 'active' : ''}" onclick="selectProfessional('${p.id}')">
      <img src="${p.avatar}" alt="${p.name}">
      <span>${p.name.split(' ')[0]}</span>
    </div>
  `).join('');

  // Grade de Horários (08:00 até 19:00 com intervalo de 30m)
  const times = [
    "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
    "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
    "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
    "17:00", "17:30", "18:00", "18:30", "19:00"
  ];

  const currentProfAppointments = state.appointments.filter(
    a => a.professionalId === selectedProfessionalId && a.date === selectedDate
  );

  let scheduleRowsHtml = times.map(time => {
    return `
      <div class="schedule-row" data-time="${time}">
        <div class="schedule-time-col">${time}</div>
        <div class="schedule-slot-col" id="slot-col-${time.replace(':', '')}">
          ${getSlotContentForTime(time, currentProfAppointments)}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="profs-horizontal-bar">${profsHtml}</div>
    <div class="schedule-table">
      ${scheduleRowsHtml}
    </div>
  `;
}

function getSlotContentForTime(time, appointments) {
  // Procura agendamento que engloba este horário
  const match = appointments.find(a => a.startTime <= time && time < a.endTime);

  if (!match) {
    return `<div class="slot-block empty" onclick="openNewAppointmentModal('${time}')">+ Disponível</div>`;
  }

  if (match.status === 'indisponivel') {
    return `
      <div class="slot-block indisponivel">
        <strong>${match.startTime} às ${match.endTime} - Indisponível</strong>
        <small>${match.notes || ''}</small>
      </div>
    `;
  }

  return `
    <div class="slot-block agendado">
      <div>
        <strong>${match.clientName}</strong> — <span>${match.serviceName}</span>
        <div style="font-size: 0.75rem; color: var(--muted);">${match.clientPhone} (${match.startTime} às ${match.endTime})</div>
      </div>
      <div style="text-align: right;">
        <span class="item-badge-price">R$ ${match.price.toFixed(2)}</span>
      </div>
    </div>
  `;
}

function updateScheduleSlots(appointments) {
  const times = [
    "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
    "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
    "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
    "17:00", "17:30", "18:00", "18:30", "19:00"
  ];
  times.forEach(time => {
    const col = document.getElementById(`slot-col-${time.replace(':', '')}`);
    if (col) {
      col.innerHTML = getSlotContentForTime(time, appointments);
    }
  });
}

window.refreshAgendaData = async function() {
  await loadInitialData();
  renderView('agenda');
};

window.selectProfessional = function(profId) {
  selectedProfessionalId = profId;
  renderView('agenda');
};

// 2. Render Comissões & Vales
function renderCommissions(container, actions) {
  const toPay = state.commissions.filter(c => c.status === 'a_pagar');
  const paid = state.commissions.filter(c => c.status === 'paga');

  container.innerHTML = `
    <div class="tabs-header">
      <button class="tab-btn active" id="tabToPay" onclick="switchCommissionTab('toPay')">Comissões a pagar (${toPay.length})</button>
      <button class="tab-btn" id="tabPaid" onclick="switchCommissionTab('paid')">Comissões pagas (${paid.length})</button>
    </div>
    <div id="commissionsList" class="data-list">
      ${renderCommissionsList(toPay, true)}
    </div>
  `;
}

function renderCommissionsList(list, canPay) {
  if (list.length === 0) {
    return `<div class="card-shell" style="text-align:center; color:var(--muted);">Nenhum registro encontrado.</div>`;
  }
  return list.map(c => `
    <div class="data-item-card">
      <div class="item-main-info">
        <h4>${c.professionalName}</h4>
        <p>${c.paymentDate ? 'Pago em ' + c.paymentDate : 'Aguardando liberação de repasse'}</p>
      </div>
      <div style="display:flex; align-items:center; gap:16px;">
        <span class="item-badge-price">R$ ${c.amount.toFixed(2)}</span>
        ${canPay ? `<button class="btn-falcon btn-success" onclick="payCommission('${c.id}')">Pagar</button>` : ''}
      </div>
    </div>
  `).join('');
}

window.switchCommissionTab = function(type) {
  const toPay = state.commissions.filter(c => c.status === 'a_pagar');
  const paid = state.commissions.filter(c => c.status === 'paga');
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
  if (!confirm('Deseja confirmar o pagamento desta comissão?')) return;
  await fetch(`/api/commissions/pay/${id}`, { method: 'POST' });
  await loadInitialData();
  renderView('comissões');
};

// 3. Render Profissionais
function renderProfessionals(container, actions) {
  actions.innerHTML = `
    <button class="btn-falcon btn-primary" onclick="openNewProfessionalModal()">+ Adicionar Profissional</button>
  `;

  const profsHtml = state.professionals.map(p => `
    <div class="data-item-card">
      <div style="display: flex; align-items: center; gap: 14px;">
        <img src="${p.avatar}" alt="${p.name}" style="width: 48px; height: 48px; border-radius: 50%;">
        <div class="item-main-info">
          <h4>${p.name}</h4>
          <p>${p.role} • ${p.phone} • Acesso: <strong>${p.access}</strong></p>
        </div>
      </div>
      <div>
        <span class="btn-falcon ${p.showInBooking ? 'btn-success' : 'btn-secondary'}">
          ${p.showInBooking ? 'Visível no Link' : 'Oculto'}
        </span>
      </div>
    </div>
  `).join('');

  container.innerHTML = `<div class="data-list">${profsHtml}</div>`;
}

// 4. Render Clientes
function renderClients(container, actions) {
  actions.innerHTML = `
    <button class="btn-falcon btn-primary" onclick="openNewClientModal()">+ Adicionar Cliente</button>
  `;

  const clientsHtml = state.clients.map(c => `
    <div class="data-item-card">
      <div class="item-main-info">
        <h4>${c.name}</h4>
        <p>WhatsApp: ${c.phone} ${c.birthday ? '• Aniversário: ' + c.birthday : ''}</p>
      </div>
      <div>
        <a href="https://wa.me/55${c.phone.replace(/\D/g, '')}" target="_blank" class="btn-falcon btn-secondary">
          WhatsApp
        </a>
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="card-shell" style="padding:12px 18px; margin-bottom:16px;">
      <strong>${state.clients.length}</strong> clientes cadastrados
    </div>
    <div class="data-list">${clientsHtml}</div>
  `;
}

// 5. Render Serviços
function renderServices(container, actions) {
  actions.innerHTML = `
    <button class="btn-falcon btn-primary" onclick="openNewServiceModal()">+ Adicionar Serviço</button>
  `;

  const servsHtml = state.services.map(s => `
    <div class="data-item-card">
      <div class="item-main-info">
        <h4>${s.name}</h4>
        <p>Categoria: <strong>${s.category}</strong> • Duração: ${s.durationMinutes} min • Comissão: ${s.commissionPercent}%</p>
      </div>
      <div>
        <span class="item-badge-price">R$ ${s.price.toFixed(2)}</span>
      </div>
    </div>
  `).join('');

  container.innerHTML = `<div class="data-list">${servsHtml}</div>`;
}

// 6. Render Produtos
function renderProducts(container, actions) {
  actions.innerHTML = `
    <button class="btn-falcon btn-primary" onclick="openNewProductModal()">+ Adicionar Produto</button>
  `;

  const prodsHtml = state.products.map(p => `
    <div class="data-item-card">
      <div class="item-main-info">
        <h4>${p.name}</h4>
        <p>${p.category} • Marca: ${p.brand || 'Geral'} • Estoque: <strong>${p.stock} un.</strong></p>
      </div>
      <div>
        <span class="item-badge-price">R$ ${p.price.toFixed(2)}</span>
      </div>
    </div>
  `).join('');

  container.innerHTML = `<div class="data-list">${prodsHtml}</div>`;
}

// 7. Render Despesas
function renderExpenses(container, actions) {
  actions.innerHTML = `
    <button class="btn-falcon btn-primary" onclick="openNewExpenseModal()">+ Adicionar Despesa</button>
  `;

  const total = state.expenses.reduce((acc, e) => acc + e.amount, 0);
  const paid = state.expenses.filter(e => e.status === 'pago').reduce((acc, e) => acc + e.amount, 0);
  const pending = state.expenses.filter(e => e.status === 'pendente').reduce((acc, e) => acc + e.amount, 0);

  const expsHtml = state.expenses.map(e => `
    <div class="data-item-card">
      <div class="item-main-info">
        <h4>${e.description}</h4>
        <p>${e.category} • Vencimento: ${e.dueDate} • Pagamento: ${e.paymentType}</p>
      </div>
      <div style="text-align: right;">
        <span class="item-badge-price" style="color: ${e.status === 'pago' ? 'var(--green)' : 'var(--red)'};">
          R$ ${e.amount.toFixed(2)}
        </span>
        <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: bold; color: ${e.status === 'pago' ? 'var(--green)' : 'var(--orange)'};">
          ${e.status}
        </div>
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
  const currentMonth = "09"; // Setembro como referência
  const birthdays = state.clients.filter(c => c.birthday && c.birthday.split('-')[1] === currentMonth);

  let bdaysHtml = birthdays.map(c => `
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

  if (birthdays.length === 0) {
    bdaysHtml = `<div class="card-shell" style="text-align:center; color:var(--muted);">Nenhum aniversariante no mês atual.</div>`;
  }

  container.innerHTML = `
    <div class="card-shell">
      <h3>🎉 Aniversariantes de Setembro</h3>
      <p style="color:var(--muted); font-size:0.9rem; margin-top:4px;">
        Aproveite para enviar um cupom especial ou mensagem de carinho pelo WhatsApp!
      </p>
    </div>
    <div class="data-list">${bdaysHtml}</div>
  `;
}

// 9. Render Configurações
function renderSettings(container, actions) {
  container.innerHTML = `
    <div class="card-shell">
      <h3 style="margin-bottom: 16px;">Dados do Salão</h3>
      <div class="form-group" style="margin-bottom: 14px;">
        <label>Nome do Estabelecimento</label>
        <input type="text" class="form-control" id="cfgName" value="${state.settings.salonName || ''}">
      </div>
      <div class="form-group" style="margin-bottom: 14px;">
        <label>Telefone / WhatsApp</label>
        <input type="text" class="form-control" id="cfgPhone" value="${state.settings.phone || ''}">
      </div>
      <div class="form-group" style="margin-bottom: 14px;">
        <label>Endereço Completo</label>
        <input type="text" class="form-control" id="cfgAddress" value="${state.settings.address || ''}">
      </div>
      <div class="form-group" style="margin-bottom: 14px;">
        <label>Intervalo entre Agendamentos na Grade</label>
        <select class="form-control" id="cfgInterval">
          <option value="15" ${state.settings.intervalMinutes === 15 ? 'selected' : ''}>15 em 15 minutos</option>
          <option value="30" ${state.settings.intervalMinutes === 30 ? 'selected' : ''}>30 em 30 minutos</option>
          <option value="45" ${state.settings.intervalMinutes === 45 ? 'selected' : ''}>45 em 45 minutos</option>
          <option value="60" ${state.settings.intervalMinutes === 60 ? 'selected' : ''}>1 em 1 hora</option>
        </select>
      </div>
      <button class="btn-falcon btn-primary" onclick="saveSettings()">Salvar Configurações</button>
    </div>
  `;
}

window.saveSettings = async function() {
  const updated = {
    salonName: document.getElementById('cfgName').value,
    phone: document.getElementById('cfgPhone').value,
    address: document.getElementById('cfgAddress').value,
    intervalMinutes: Number(document.getElementById('cfgInterval').value)
  };
  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updated)
  });
  await loadInitialData();
  document.getElementById('salonHeaderName').innerText = updated.salonName;
  alert('Configurações atualizadas com sucesso!');
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

  document.getElementById('genericModal').classList.add('open');
}

function closeModal() {
  document.getElementById('genericModal').classList.remove('open');
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
      alert('Por favor informe o nome do cliente');
      return;
    }

    const res = await fetch('/api/appointments', {
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
      alert(err.error || 'Erro ao agendar horário.');
      return;
    }

    closeModal();
    await loadInitialData();
    renderView('agenda');
  });

  setTimeout(updateModalEndTime, 50);
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
      alert('Nome e Preço são obrigatórios!');
      return;
    }

    await fetch('/api/services', {
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
  `;

  openModal('Cadastrar Cliente', html, async () => {
    const name = document.getElementById('mCliName').value;
    const phone = document.getElementById('mCliPhone').value;
    const birthday = document.getElementById('mCliBday').value;

    if (!name) {
      alert('O nome do cliente é obrigatório!');
      return;
    }

    await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, birthday })
    });

    closeModal();
    await loadInitialData();
    renderView('clientes');
  });
};

window.openNewExpenseModal = function() {
  const html = `
    <div class="form-group">
      <label>Descrição</label>
      <input type="text" class="form-control" id="mExpDesc" placeholder="Ex: Conta de Luz / Produtos">
    </div>
    <div class="form-group">
      <label>Categoria</label>
      <input type="text" class="form-control" id="mExpCat" placeholder="Ex: Aluguel, Insumos, Energia">
    </div>
    <div class="form-group">
      <label>Valor (R$)</label>
      <input type="number" class="form-control" id="mExpAmount" placeholder="150.00" step="0.50">
    </div>
    <div class="form-group">
      <label>Forma de Pagamento</label>
      <select class="form-control" id="mExpType">
        <option value="Pix">Pix</option>
        <option value="Boleto">Boleto</option>
        <option value="Cartão">Cartão</option>
        <option value="Dinheiro">Dinheiro</option>
      </select>
    </div>
  `;

  openModal('Cadastrar Despesa', html, async () => {
    const description = document.getElementById('mExpDesc').value;
    const category = document.getElementById('mExpCat').value;
    const amount = Number(document.getElementById('mExpAmount').value);
    const paymentType = document.getElementById('mExpType').value;

    if (!description || !amount) {
      alert('Descrição e Valor são obrigatórios!');
      return;
    }

    await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, category, amount, paymentType, status: 'pendente' })
    });

    closeModal();
    await loadInitialData();
    renderView('despesas');
  });
};
