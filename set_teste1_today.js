import fs from 'fs';
const dbPath = './server/db/database.json';
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const t = db.tenants.find(x => x.name === 'teste1' || x.id === 'tenant_1789677571830');
if (t) {
  // Configurar para vencer hoje (daqui a algumas horas no mesmo dia)
  const todayEndOfDay = new Date();
  todayEndOfDay.setHours(23, 59, 59, 999);
  t.subscription = {
    status: 'active',
    isLifetime: false,
    monthlyPrice: 49.90,
    expiresAt: todayEndOfDay.toISOString(),
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log('Sucesso! teste1 configurado para vencer hoje:', t.subscription);
} else {
  console.log('Salão teste1 não encontrado.');
}
