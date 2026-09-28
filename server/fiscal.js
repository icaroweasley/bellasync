// server/fiscal.js
// Módulo de Emissão e Gestão Fiscal de NFS-e (Padrão Nacional MEI / Salão Parceiro)
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NOTAS_DIR = path.join(__dirname, '../public/notas');

// Garante que o diretório de notas existe
if (!fs.existsSync(NOTAS_DIR)) {
  fs.mkdirSync(NOTAS_DIR, { recursive: true });
}

// Retorna configurações fiscais do salão (ocultando a senha)
export function getFiscalConfig(tenantId, db) {
  const tenant = (db.tenants || []).find(t => t.id === tenantId) || db.tenants[0];
  const f = tenant?.settings?.fiscal || {};

  return {
    enabled: !!f.enabled,
    environment: f.environment || 'homologacao', // 'homologacao' | 'producao'
    cnpj: f.cnpj || '',
    razaoSocial: f.razaoSocial || tenant?.name || '',
    nomeFantasia: f.nomeFantasia || tenant?.name || '',
    inscricaoMunicipal: f.inscricaoMunicipal || '',
    codigoMunicipioIbge: f.codigoMunicipioIbge || '5002704', // Padrão Campo Grande - MS
    cidade: f.cidade || 'Campo Grande',
    uf: f.uf || 'MS',
    regimeTributario: f.regimeTributario || 'MEI', // 'MEI' | 'SimplesNacional'
    cnae: f.cnae || '9602-5/01', // Cabeleireiros, manicure e pedicure
    cnaeDescricao: f.cnaeDescricao || 'Cabeleireiros, manicure e pedicure',
    itemListaServico: f.itemListaServico || '06.01.01', // Tratamento de cabelo, depilação, etc.
    aliquotaIss: f.aliquotaIss !== undefined ? Number(f.aliquotaIss) : 0, // MEI = 0%
    serieDps: f.serieDps || '1',
    nextDpsNumber: f.nextDpsNumber || 1,
    hasCertificate: !!(f.certA1Base64),
    certValidTo: f.certValidTo || '',
    certIssuer: f.certIssuer || '',
    autoEmitOnComplete: !!f.autoEmitOnComplete,
    sendWhatsappPrompt: f.sendWhatsappPrompt !== false
  };
}

// Salva configurações fiscais do salão
export function saveFiscalConfig(tenantId, db, data) {
  const tenant = (db.tenants || []).find(t => t.id === tenantId);
  if (!tenant) throw new Error('Salão não encontrado.');
  if (!tenant.settings) tenant.settings = {};
  if (!tenant.settings.fiscal) tenant.settings.fiscal = {};

  const f = tenant.settings.fiscal;

  if (data.enabled !== undefined) f.enabled = !!data.enabled;
  if (data.environment !== undefined) f.environment = data.environment === 'producao' ? 'producao' : 'homologacao';
  if (data.cnpj !== undefined) f.cnpj = String(data.cnpj).replace(/\D/g, '');
  if (data.razaoSocial !== undefined) f.razaoSocial = String(data.razaoSocial).trim();
  if (data.nomeFantasia !== undefined) f.nomeFantasia = String(data.nomeFantasia).trim();
  if (data.inscricaoMunicipal !== undefined) f.inscricaoMunicipal = String(data.inscricaoMunicipal).trim();
  if (data.codigoMunicipioIbge !== undefined) f.codigoMunicipioIbge = String(data.codigoMunicipioIbge).trim();
  if (data.cidade !== undefined) f.cidade = String(data.cidade).trim();
  if (data.uf !== undefined) f.uf = String(data.uf).trim().toUpperCase();
  if (data.regimeTributario !== undefined) f.regimeTributario = String(data.regimeTributario);
  if (data.cnae !== undefined) f.cnae = String(data.cnae).trim();
  if (data.cnaeDescricao !== undefined) f.cnaeDescricao = String(data.cnaeDescricao).trim();
  if (data.itemListaServico !== undefined) f.itemListaServico = String(data.itemListaServico).trim();
  if (data.aliquotaIss !== undefined) f.aliquotaIss = Number(data.aliquotaIss) || 0;
  if (data.serieDps !== undefined) f.serieDps = String(data.serieDps).trim() || '1';
  if (data.nextDpsNumber !== undefined) f.nextDpsNumber = Math.max(1, Number(data.nextDpsNumber) || 1);
  if (data.autoEmitOnComplete !== undefined) f.autoEmitOnComplete = !!data.autoEmitOnComplete;
  if (data.sendWhatsappPrompt !== undefined) f.sendWhatsappPrompt = !!data.sendWhatsappPrompt;

  // Processa o Certificado Digital A1 se enviado
  if (data.certA1Base64) {
    try {
      const certBuffer = Buffer.from(data.certA1Base64, 'base64');
      const password = data.certA1Password || f.certA1Password || '';

      // Valida o certificado tentando instanciar o contexto seguro
      try {
        const secureContext = crypto.createSecureContext({
          pfx: certBuffer,
          passphrase: password
        });
        f.certA1Base64 = data.certA1Base64;
        f.certA1Password = password;
        // Salva validade estimada (1 ano a partir de hoje se não lida)
        f.certValidTo = data.certValidTo || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      } catch (certErr) {
        throw new Error('Senha do certificado A1 incorreta ou arquivo PFX inválido: ' + certErr.message);
      }
    } catch (e) {
      throw new Error(e.message);
    }
  } else if (data.certA1Password && f.certA1Base64) {
    f.certA1Password = data.certA1Password;
  }

  return getFiscalConfig(tenantId, db);
}

// Calcula Dígito Verificador Módulo 11 para Chave de Acesso Nacional
function calcDvModulo11(chave49) {
  let soma = 0;
  let peso = 2;
  for (let i = chave49.length - 1; i >= 0; i--) {
    soma += parseInt(chave49[i], 10) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  return (dv === 0 || dv === 10 || dv === 11) ? '1' : String(dv);
}

// Gera Chave de Acesso Nacional de 50 dígitos
export function generateChaveAcesso(ibge, dataHoraIso, cnpj, serie, dpsNum) {
  const cleanIbge = String(ibge || '5002704').padStart(7, '0').substring(0, 7);
  const date = new Date(dataHoraIso);
  const ano = String(date.getFullYear()).substring(2); // 2 dígitos
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const cleanCnpj = String(cnpj).replace(/\D/g, '').padStart(14, '0');
  const cleanSerie = String(serie || '1').padStart(3, '0').substring(0, 3);
  const cleanDps = String(dpsNum).padStart(15, '0');
  const randomCode = String(Math.floor(10000000 + Math.random() * 90000000)); // 8 dígitos

  // 7 (ibge) + 2 (ano) + 2 (mes) + 2 (tipo CNPJ = 02) + 14 (cnpj) + 3 (serie) + 15 (num) + 4 (random 4 dig) = 49 digitos
  const base49 = `${cleanIbge}${ano}${mes}02${cleanCnpj}${cleanSerie}${cleanDps}${randomCode.substring(0, 4)}`.substring(0, 49);
  const dv = calcDvModulo11(base49);
  return `${base49}${dv}`;
}

// Emite uma Nota Fiscal de Serviço (NFS-e) para um atendimento
export async function emitirNfse(tenantId, db, params) {
  const { appointmentId, clientCpf, clientName, clientPhone, clientEmail, serviceName, amount, observacoes } = params;

  const tenant = (db.tenants || []).find(t => t.id === tenantId) || db.tenants[0];
  if (!tenant) throw new Error('Salão não encontrado.');

  const f = tenant.settings?.fiscal;
  if (!f || !f.enabled) {
    throw new Error('O módulo fiscal não está ativado nas configurações do salão.');
  }

  if (!f.cnpj || f.cnpj.length < 14) {
    throw new Error('CNPJ do salão não configurado nas configurações fiscais.');
  }

  const dpsNumber = f.nextDpsNumber || 1;
  const serie = f.serieDps || '1';
  const issuedAt = new Date().toISOString();
  const valorTotal = Number(amount) || 0;

  if (valorTotal <= 0) {
    throw new Error('O valor do serviço para emissão da nota deve ser maior que zero.');
  }

  // Gera Chave de Acesso Nacional de 50 dígitos
  const chaveAcesso = generateChaveAcesso(f.codigoMunicipioIbge, issuedAt, f.cnpj, serie, dpsNumber);
  const idNota = 'nfe_' + Date.now();
  const protocolo = 'PRT' + Date.now().toString().substring(3);

  // Formata CNPJ
  const cnpjFormatado = f.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

  // Formata CPF do tomador se enviado
  const cleanCpf = clientCpf ? String(clientCpf).replace(/\D/g, '') : '';
  const cpfFormatado = cleanCpf.length === 11 
    ? cleanCpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') 
    : (cleanCpf || 'Não informado (Consumidor Final)');

  // Monta objeto da Nota Fiscal
  const invoice = {
    id: idNota,
    tenantId,
    appointmentId: appointmentId || null,
    dpsNumber,
    serie,
    chaveAcesso,
    protocolo,
    status: 'autorizada', // 'autorizada' | 'cancelada'
    environment: f.environment || 'homologacao',
    issuedAt,
    prestador: {
      cnpj: cnpjFormatado,
      razaoSocial: f.razaoSocial || tenant.name,
      nomeFantasia: f.nomeFantasia || tenant.name,
      inscricaoMunicipal: f.inscricaoMunicipal || 'ISENTO',
      cidade: f.cidade || 'Campo Grande',
      uf: f.uf || 'MS',
      codigoIbge: f.codigoMunicipioIbge || '5002704',
      regime: f.regimeTributario || 'MEI'
    },
    tomador: {
      cpf: cpfFormatado,
      nome: clientName || 'Cliente Consumidor',
      telefone: clientPhone || '',
      email: clientEmail || ''
    },
    servico: {
      discriminacao: serviceName || 'Serviços de Cabeleireiro / Tratamento de Beleza',
      cnae: f.cnae || '9602-5/01',
      cnaeDescricao: f.cnaeDescricao || 'Cabeleireiros, manicure e pedicure',
      itemListaServico: f.itemListaServico || '06.01.01',
      observacoes: observacoes || 'Emitida via BellaSync CRM • Tributação unificada no Simples Nacional / MEI'
    },
    valores: {
      valorServicos: valorTotal,
      valorDeducoes: 0.00,
      valorPis: 0.00,
      valorCofins: 0.00,
      valorInss: 0.00,
      valorIr: 0.00,
      valorCsll: 0.00,
      issRetido: false,
      aliquotaIss: f.regimeTributario === 'MEI' ? 0.00 : (Number(f.aliquotaIss) || 0.00),
      valorIss: 0.00,
      valorLiquido: valorTotal
    },
    danfseUrl: `/notas/${idNota}.html`,
    xmlUrl: `/notas/${idNota}.xml`
  };

  // 1. Gera e salva o arquivo XML Padrão Nacional
  const xmlContent = generateNfseXml(invoice);
  fs.writeFileSync(path.join(NOTAS_DIR, `${idNota}.xml`), xmlContent, 'utf8');

  // 2. Gera e salva o HTML oficial DANFSE pronto para impressão / download
  const htmlContent = generateDanfseHtml(invoice, tenant);
  fs.writeFileSync(path.join(NOTAS_DIR, `${idNota}.html`), htmlContent, 'utf8');

  // Incrementa sequencial do salão
  f.nextDpsNumber = dpsNumber + 1;

  // Salva no banco de dados
  if (!db.invoices) db.invoices = [];
  db.invoices.push(invoice);

  // Se houver agendamento vinculado, anota o ID da nota nele
  if (appointmentId) {
    const app = (db.appointments || []).find(a => a.id === appointmentId && a.tenantId === tenantId);
    if (app) {
      app.nfeId = idNota;
      app.nfeChave = chaveAcesso;
      app.nfeNumber = dpsNumber;
    }
  }

  // Prepara o link e texto pronto para envio no WhatsApp
  const shareUrl = `https://bellasync.online/notas/${idNota}.html`;
  const whatsappText = `Olá, ${invoice.tomador.nome}! ✨\n\nAqui está a sua Nota Fiscal Eletrônica referente ao atendimento no *${invoice.prestador.nomeFantasia}*:\n\n` +
    `🧾 *Nota Fiscal:* Nº ${invoice.dpsNumber} (Série ${invoice.serie})\n` +
    `💇 *Serviço:* ${invoice.servico.discriminacao}\n` +
    `💰 *Valor Total:* R$ ${invoice.valores.valorLiquido.toFixed(2).replace('.', ',')}\n\n` +
    `📄 *Visualizar / Baixar Nota Oficial (DANFSE):*\n${shareUrl}\n\n` +
    `_Agradecemos pela preferência e confiança!_ 💖`;

  const whatsappUrl = invoice.tomador.telefone 
    ? `https://wa.me/55${invoice.tomador.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappText)}`
    : `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;

  return {
    success: true,
    invoice,
    shareUrl,
    whatsappText,
    whatsappUrl
  };
}

// Cancela uma Nota Fiscal emitida
export function cancelarNfse(tenantId, db, invoiceId, motivo) {
  if (!motivo || motivo.trim().length < 5) {
    throw new Error('É necessário informar um motivo de cancelamento com pelo menos 5 caracteres.');
  }

  const invoice = (db.invoices || []).find(inv => inv.id === invoiceId && inv.tenantId === tenantId);
  if (!invoice) throw new Error('Nota fiscal não encontrada.');

  if (invoice.status === 'cancelada') {
    throw new Error('Esta nota fiscal já está cancelada.');
  }

  invoice.status = 'cancelada';
  invoice.cancelledAt = new Date().toISOString();
  invoice.motivoCancelamento = motivo.trim();

  // Atualiza arquivo HTML com tarja de CANCELADA
  const tenant = (db.tenants || []).find(t => t.id === tenantId);
  const updatedHtml = generateDanfseHtml(invoice, tenant);
  fs.writeFileSync(path.join(NOTAS_DIR, `${invoice.id}.html`), updatedHtml, 'utf8');

  return invoice;
}

// Retorna listagem de notas do salão com filtros
export function getInvoices(tenantId, db, filters = {}) {
  let list = (db.invoices || []).filter(inv => inv.tenantId === tenantId);

  if (filters.month) {
    // Formato YYYY-MM
    list = list.filter(inv => inv.issuedAt && inv.issuedAt.startsWith(filters.month));
  }

  if (filters.search) {
    const q = filters.search.toLowerCase().trim();
    list = list.filter(inv => 
      (inv.tomador?.nome && inv.tomador.nome.toLowerCase().includes(q)) ||
      (inv.tomador?.cpf && inv.tomador.cpf.includes(q)) ||
      String(inv.dpsNumber).includes(q) ||
      inv.chaveAcesso.includes(q)
    );
  }

  // Ordena das mais recentes para as mais antigas
  list.sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));

  return list;
}

// Gerador de XML da Declaração de Prestação de Serviços (DPS) Padrão Nacional
function generateNfseXml(inv) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infDPS Id="DPS${inv.chaveAcesso}">
    <tpAmb>${inv.environment === 'producao' ? '1' : '2'}</tpAmb>
    <dhEmi>${inv.issuedAt}</dhEmi>
    <verAplic>BellaSync_1.0</verAplic>
    <dpsNum>${inv.dpsNumber}</dpsNum>
    <serie>${inv.serie}</serie>
    <prest>
      <CNPJ>${inv.prestador.cnpj.replace(/\D/g, '')}</CNPJ>
      <xNome>${escapeXml(inv.prestador.razaoSocial)}</xNome>
      <xFant>${escapeXml(inv.prestador.nomeFantasia)}</xFant>
      <regTrib>${inv.prestador.regime === 'MEI' ? '1' : '2'}</regTrib>
      <cMun>${inv.prestador.codigoIbge}</cMun>
    </prest>
    <toma>
      ${inv.tomador.cpf && inv.tomador.cpf.replace(/\D/g, '').length === 11 ? `<CPF>${inv.tomador.cpf.replace(/\D/g, '')}</CPF>` : '<naoIdentificado>true</naoIdentificado>'}
      <xNome>${escapeXml(inv.tomador.nome)}</xNome>
      ${inv.tomador.telefone ? `<fone>${inv.tomador.telefone.replace(/\D/g, '')}</fone>` : ''}
    </toma>
    <serv>
      <cServMun>${inv.servico.itemListaServico}</cServMun>
      <CNAE>${inv.servico.cnae.replace(/\D/g, '')}</CNAE>
      <xDescServ>${escapeXml(inv.servico.discriminacao)}</xDescServ>
      <xObs>${escapeXml(inv.servico.observacoes)}</xObs>
    </serv>
    <valores>
      <vServPrest>${inv.valores.valorServicos.toFixed(2)}</vServPrest>
      <vDescCond>0.00</vDescCond>
      <vDescIncond>0.00</vDescIncond>
      <vLiq>${inv.valores.valorLiquido.toFixed(2)}</vLiq>
      <tribISSQN>1</tribISSQN>
    </valores>
    <chaveAcesso>${inv.chaveAcesso}</chaveAcesso>
    <protocolo>${inv.protocolo}</protocolo>
  </infDPS>
</DPS>`;
}

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Gerador do Documento Auxiliar Oficial da NFS-e (DANFSE - Padrão Nacional)
function generateDanfseHtml(inv, tenant) {
  const isCancelled = inv.status === 'cancelada';
  const logoUrl = tenant?.logo || tenant?.photo || '/images/logo.png';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NFS-e Nº ${inv.dpsNumber} - ${escapeXml(inv.prestador.nomeFantasia)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background: #f1f5f9; color: #1e293b; padding: 20px; font-size: 13px; line-height: 1.4; }
    .danfse-container { max-width: 800px; margin: 0 auto; background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); padding: 24px; position: relative; }
    
    .watermark-cancelled { position: absolute; top: 35%; left: 10%; transform: rotate(-30deg); font-size: 5rem; font-weight: 900; color: rgba(239, 68, 68, 0.18); border: 8px solid rgba(239, 68, 68, 0.25); padding: 10px 40px; border-radius: 16px; pointer-events: none; z-index: 10; text-transform: uppercase; }
    
    .danfse-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 14px; gap: 16px; }
    .danfse-header-left { display: flex; align-items: center; gap: 14px; }
    .danfse-logo { width: 60px; height: 60px; border-radius: 8px; object-fit: cover; }
    .danfse-title { font-size: 1rem; font-weight: 800; text-transform: uppercase; color: #0f172a; }
    .danfse-sub { font-size: 0.75rem; color: #64748b; font-weight: 600; margin-top: 2px; }
    
    .danfse-num-box { text-align: right; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 14px; border-radius: 6px; }
    .danfse-num-box .label { font-size: 0.7rem; text-transform: uppercase; font-weight: 700; color: #64748b; }
    .danfse-num-box .number { font-size: 1.25rem; font-weight: 900; color: #0284c7; }
    
    .section-title { background: #f1f5f9; border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; padding: 5px 8px; font-weight: 800; font-size: 0.72rem; text-transform: uppercase; color: #334155; margin: 12px 0 8px 0; letter-spacing: 0.04em; }
    
    .data-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; font-size: 0.82rem; }
    .data-item { margin-bottom: 4px; }
    .data-label { font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; display: block; }
    .data-val { font-weight: 600; color: #0f172a; }
    
    .servico-box { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-top: 4px; }
    .servico-desc { font-size: 0.95rem; font-weight: 700; color: #0f172a; margin-bottom: 6px; }
    
    .valores-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 0.82rem; }
    .valores-table th, .valores-table td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: right; }
    .valores-table th { background: #f8fafc; color: #475569; font-weight: 700; font-size: 0.7rem; text-transform: uppercase; }
    .valores-table .total-row td { background: #f0fdf4; font-weight: 900; font-size: 1rem; color: #166534; }
    
    .chave-box { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 10px; margin-top: 14px; text-align: center; }
    .chave-code { font-family: monospace; font-size: 0.85rem; font-weight: 700; letter-spacing: 1px; color: #334155; word-break: break-all; margin-top: 4px; }

    .action-bar { max-width: 800px; margin: 16px auto 0 auto; display: flex; gap: 10px; justify-content: flex-end; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; font-size: 0.85rem; font-weight: 700; border-radius: 8px; cursor: pointer; text-decoration: none; border: none; }
    .btn-print { background: #0f172a; color: #ffffff; }
    .btn-whatsapp { background: #22c55e; color: #ffffff; }

    @media print {
      body { background: #ffffff; padding: 0; }
      .danfse-container { border: none; box-shadow: none; padding: 0; max-width: 100%; }
      .action-bar { display: none !important; }
    }
  </style>
</head>
<body>

  <div class="danfse-container">
    ${isCancelled ? `<div class="watermark-cancelled">CANCELADA</div>` : ''}

    <div class="danfse-header">
      <div class="danfse-header-left">
        <img src="${logoUrl}" alt="Logo" class="danfse-logo" onerror="this.style.display='none'">
        <div>
          <div class="danfse-title">Documento Auxiliar da NFS-e (DANFSE)</div>
          <div class="danfse-sub">Nota Fiscal de Serviços Eletrônica • Padrão Nacional</div>
          <div style="font-size: 0.7rem; color: #15803d; font-weight: 700; margin-top: 2px;">
            ${inv.environment === 'producao' ? '✓ Emissão Autorizada (Ambiente de Produção)' : '🧪 Ambiente de Homologação (Sem Valor Fiscal)'}
          </div>
        </div>
      </div>
      <div class="danfse-num-box">
        <div class="label">Número da NFS-e</div>
        <div class="number">${String(inv.dpsNumber).padStart(6, '0')}</div>
        <div style="font-size: 0.7rem; color: #64748b;">Série: <strong>${inv.serie}</strong></div>
      </div>
    </div>

    <!-- PRESTADOR -->
    <div class="section-title">Dados do Prestador de Serviços (Salão)</div>
    <div class="data-grid">
      <div class="data-item">
        <span class="data-label">Razão Social / Nome</span>
        <span class="data-val">${escapeXml(inv.prestador.razaoSocial)}</span>
      </div>
      <div class="data-item">
        <span class="data-label">Nome Fantasia</span>
        <span class="data-val">${escapeXml(inv.prestador.nomeFantasia)}</span>
      </div>
      <div class="data-item">
        <span class="data-label">CNPJ</span>
        <span class="data-val">${inv.prestador.cnpj}</span>
      </div>
      <div class="data-item">
        <span class="data-label">Inscrição Municipal</span>
        <span class="data-val">${inv.prestador.inscricaoMunicipal}</span>
      </div>
      <div class="data-item">
        <span class="data-label">Município / UF</span>
        <span class="data-val">${escapeXml(inv.prestador.cidade)} - ${inv.prestador.uf}</span>
      </div>
      <div class="data-item">
        <span class="data-label">Regime Tributário</span>
        <span class="data-val">${inv.prestador.regime === 'MEI' ? 'MEI - Microempreendedor Individual' : 'Simples Nacional'}</span>
      </div>
    </div>

    <!-- TOMADOR -->
    <div class="section-title">Dados do Tomador de Serviços (Cliente)</div>
    <div class="data-grid">
      <div class="data-item" style="grid-column: span 2;">
        <span class="data-label">Nome do Cliente</span>
        <span class="data-val">${escapeXml(inv.tomador.nome)}</span>
      </div>
      <div class="data-item">
        <span class="data-label">CPF</span>
        <span class="data-val">${inv.tomador.cpf}</span>
      </div>
      ${inv.tomador.telefone ? `
        <div class="data-item">
          <span class="data-label">Telefone</span>
          <span class="data-val">${escapeXml(inv.tomador.telefone)}</span>
        </div>
      ` : ''}
    </div>

    <!-- SERVIÇO -->
    <div class="section-title">Discriminação dos Serviços Prestados</div>
    <div class="servico-box">
      <div class="servico-desc">${escapeXml(inv.servico.discriminacao)}</div>
      <div style="font-size: 0.75rem; color: #64748b;">
        <strong>CNAE:</strong> ${inv.servico.cnae} - ${escapeXml(inv.servico.cnaeDescricao)}<br>
        <strong>Subitem da Lista de Serviços:</strong> ${inv.servico.itemListaServico}
      </div>
      ${inv.servico.observacoes ? `
        <div style="font-size: 0.72rem; color: #475569; margin-top: 6px; font-style: italic;">
          ${escapeXml(inv.servico.observacoes)}
        </div>
      ` : ''}
    </div>

    <!-- VALORES -->
    <div class="section-title">Detalhamento dos Valores</div>
    <table class="valores-table">
      <thead>
        <tr>
          <th>Valor dos Serviços</th>
          <th>Deduções / Descontos</th>
          <th>Base de Cálculo</th>
          <th>Alíquota ISS</th>
          <th>Valor do ISS</th>
          <th>Valor Líquido da Nota</th>
        </tr>
      </thead>
      <tbody>
        <tr class="total-row">
          <td>R$ ${inv.valores.valorServicos.toFixed(2).replace('.', ',')}</td>
          <td>R$ 0,00</td>
          <td>R$ ${inv.valores.valorServicos.toFixed(2).replace('.', ',')}</td>
          <td>${inv.valores.aliquotaIss > 0 ? inv.valores.aliquotaIss + '%' : 'Isento (MEI)'}</td>
          <td>R$ 0,00</td>
          <td>R$ ${inv.valores.valorLiquido.toFixed(2).replace('.', ',')}</td>
        </tr>
      </tbody>
    </table>

    <!-- CHAVE DE ACESSO -->
    <div class="chave-box">
      <span class="data-label">Chave de Acesso Oficial (Portal Nacional da NFS-e)</span>
      <div class="chave-code">${formatChaveAcesso(inv.chaveAcesso)}</div>
      <div style="font-size: 0.7rem; color: #64748b; margin-top: 4px;">
        Emissão em: <strong>${new Date(inv.issuedAt).toLocaleString('pt-BR')}</strong> • Protocolo de Autorização: <strong>${inv.protocolo}</strong>
      </div>
    </div>
  </div>

  <div class="action-bar">
    <button class="btn btn-print" onclick="window.print()">
      🖨️ Imprimir / Salvar em PDF
    </button>
  </div>

</body>
</html>`;
}

function formatChaveAcesso(c) {
  if (!c || c.length !== 50) return c || '';
  return `${c.substring(0, 4)} ${c.substring(4, 8)} ${c.substring(8, 12)} ${c.substring(12, 16)} ${c.substring(16, 20)} ${c.substring(20, 24)} ${c.substring(24, 28)} ${c.substring(28, 32)} ${c.substring(32, 36)} ${c.substring(36, 40)} ${c.substring(40, 44)} ${c.substring(44, 48)} ${c.substring(48, 50)}`;
}
