# Metamorfose Hair — CRM de Salão de Beleza

Sistema completo de gestão interna e agendamento online inspirado no Salon Soft e projetado com estética contemporânea baseada em design tokens refinados (Falcon AI aesthetic).

---

## 🚀 Como Executar Localmente

```bash
# Entrar no diretório
cd "e:\jogo antigravity\salon-crm"

# Instalar dependências (caso necessário)
npm install

# Iniciar o servidor
npm run server
```

- **Painel Geral (Admin / Recepção):** [http://localhost:3000](http://localhost:3000)
- **Agendamento Online Público (Link dos Clientes):** [http://localhost:3000/agendar](http://localhost:3000/agendar)

---

## 🔒 Deploy na VPS com sua chave SSH

Sua chave SSH está localizada em:
`E:\documentos\ssh-key-2026-05-24.key`

### 1. Conectar na VPS via PowerShell:
```powershell
ssh -i "E:\documentos\ssh-key-2026-05-24.key" root@SEU_IP_VPS
```

### 2. Configurar a VPS pela primeira vez:
Copie o script `deploy/setup-vps.sh` ou execute na VPS:
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx
sudo npm install -g pm2
```

### 3. Clonar e Iniciar a Aplicação com PM2:
```bash
cd /var/www
git clone https://github.com/SEU_USUARIO/salon-crm.git
cd salon-crm
npm install --production
pm2 start server/index.js --name salon-crm
pm2 save
pm2 startup
```

### 4. Configurar Nginx:
```bash
sudo cp deploy/nginx-salon.conf /etc/nginx/sites-available/salon-crm
sudo ln -s /etc/nginx/sites-available/salon-crm /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

---

## 📂 Controle no GitHub

```bash
cd "e:\jogo antigravity\salon-crm"
git init
git add .
git commit -m "feat: initial commit salon-crm with falcon ai tokens and full modules"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/salon-crm.git
git push -u origin main
```
