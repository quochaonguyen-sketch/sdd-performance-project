// Operational SQL runner; credentials come only from the caller's environment.
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const file = process.argv[2];
const test = process.argv.includes('--test');
const sql = fs.readFileSync(file, 'utf8');
const quote = '$audit_script_body_94ea$';
if (sql.includes(quote)) throw new Error('SQL delimiter collision');
const statement = `DO $audit_apply$ BEGIN EXECUTE ${quote}${sql}${quote}; END $audit_apply$;`;
(async () => {
  if (test) {
    const rollback = new Error('verified-rollback');
    try {
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe(statement);
        throw rollback;
      }, { timeout: 60000 });
    } catch (error) { if (error !== rollback) throw error; }
    console.log('SQL assertions passed; test transaction rolled back.');
  } else {
    await db.$executeRawUnsafe(statement);
    console.log('SQL applied.');
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
