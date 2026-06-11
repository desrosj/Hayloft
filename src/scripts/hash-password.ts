import bcrypt from "bcryptjs";

const password = process.argv[2];

if (!password) {
  console.error("Usage: npm run hash-password -- 'your-password-here'");
  process.exit(1);
}

if (password.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log("\nAdd this to your .env file:\n");
console.log(`APP_PASSWORD_HASH='${hash}'`);
console.log("\nAlso generate a session secret:\n");
console.log(`SESSION_SECRET='${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}'`);
console.log();
