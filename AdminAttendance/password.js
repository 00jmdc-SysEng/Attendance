// Password Hash Generator for Admin Accounts
// Run this to create a secure password hash for new admin users

const bcrypt = require('bcryptjs');

// Change this to your desired password
const PASSWORD = 'admin123';

// Generate hash
const hash = bcrypt.hashSync(PASSWORD, 10);

console.log('='.repeat(60));
console.log('PASSWORD HASH GENERATOR');
console.log('='.repeat(60));
console.log('');
console.log('Password:', PASSWORD);
console.log('');
console.log('Hash (copy this):');
console.log(hash);
console.log('');
console.log('SQL to create admin user:');
console.log('');
console.log(`INSERT INTO users (full_name, email, password_hash, is_admin) VALUES`);
console.log(`('HR Admin', 'admin@company.com', '${hash}', 1);`);
console.log('');
console.log('='.repeat(60));
console.log('⚠️  IMPORTANT: Keep this hash secure!');
console.log('='.repeat(60));