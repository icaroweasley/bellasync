import fs from 'fs';
const db = JSON.parse(fs.readFileSync('./server/db/database.json', 'utf8'));
console.log(JSON.stringify({
  tenants: db.tenants.map(t => ({ id: t.id, name: t.name, slug: t.slug, sub: t.subscription })),
  users: db.users.map(u => ({ id: u.id, username: u.username, email: u.email, role: u.role, tenantId: u.tenantId }))
}, null, 2));
