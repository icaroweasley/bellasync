import fs from 'fs';
const dbPath = './server/db/database.json';
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

db.platformSettings = {
  defaultMonthlyPrice: 49.90,
  mpPublicKey: 'APP_USR-baa7343d-cf55-4497-ae41-95676142017c',
  mpAccessToken: 'APP_USR-2421970436910549-091716-359d84090e765c0d470918c51284631a-68786026',
  mpClientId: '2421970436910549',
  mpClientSecret: '73B6mgQsOUGy6IA3m1LieHFkWFCp10UP'
};

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log('Platform settings updated successfully with new MP credentials!');
