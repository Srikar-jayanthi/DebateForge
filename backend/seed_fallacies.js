const mongoose = require('mongoose');
const { User } = require('./models');
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

async function seedFallacies() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const userId = '6a0018dcc486266c190fe7a6'; // Srikar
  const fallacies = {
    'ad_hominem': 3,
    'strawman': 2,
    'appeal_to_emotion': 4,
    'slippery_slope': 1,
    'false_dilemma': 2
  };

  const user = await User.findById(userId);
  if (!user) {
    console.log('User not found');
    process.exit(1);
  }

  for (const [type, count] of Object.entries(fallacies)) {
    user.fallacyProfile.set(type, count);
  }

  user.markModified('fallacyProfile');
  await user.save();
  console.log('Fallacy profile seeded successfully for Srikar');
  process.exit(0);
}

seedFallacies().catch(err => {
  console.error(err);
  process.exit(1);
});
