import bcrypt from "bcryptjs";
const pw = process.argv[2];
if (!pw || pw.length < 12) {
  console.error("Usage: npm run hash-password -- <mot-de-passe> (12 caractères min)");
  process.exit(1);
}
// Cost 12: about a quarter of a second per login, four times the work of 10 for a hash that leaked.
console.log(`ADMIN_PASSWORD_HASH='${bcrypt.hashSync(pw, 12)}'`);
