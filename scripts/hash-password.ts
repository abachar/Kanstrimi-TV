import bcrypt from "bcryptjs";
const pw = process.argv[2];
if (!pw || pw.length < 6) { console.error("Usage: npm run hash-password -- <mot-de-passe> (6 caractères min)"); process.exit(1); }
console.log(`ADMIN_PASSWORD_HASH='${bcrypt.hashSync(pw, 10)}'`);
