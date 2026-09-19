#!/usr/bin/env bash
# ==============================================================================
# Script de Preparação da VPS (Ubuntu / Debian) para o CRM Salon Soft
# ==============================================================================

set -e

echo ">>> Atualizando pacotes do sistema..."
sudo apt-get update && sudo apt-get upgrade -y

echo ">>> Instalando dependências essenciais (Git, curl, nginx)..."
sudo apt-get install -y git curl nginx ufw

echo ">>> Instalando Node.js LTS (v22)..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

echo ">>> Instalando PM2 globalmente..."
sudo npm install -g pm2

echo ">>> Configurando Firewall (UFW)..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

echo ">>> Configurando diretório da aplicação..."
sudo mkdir -p /var/www/salon-crm
sudo chown -R $USER:$USER /var/www/salon-crm

echo "=== VPS Pronta para receber a aplicação! ==="
