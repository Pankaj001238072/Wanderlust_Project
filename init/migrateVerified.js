require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user.js');

mongoose.connect(process.env.ATLASDB_URL).then(async () => {
  // Mark all unverified existing users as verified
  const result = await User.updateMany(
    { isVerified: { $ne: true } },
    { $set: { isVerified: true } }
  );
  console.log('✅ Updated', result.modifiedCount, 'users to isVerified: true');

  const users = await User.find({}, 'username email isVerified').lean();
  console.log('\nAll users:');
  users.forEach(u => console.log(' -', u.username, '|', u.email, '| verified:', u.isVerified));

  await mongoose.disconnect();
  console.log('\nDone.');
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
