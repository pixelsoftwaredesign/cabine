require('dotenv').config();
const mongoose = require('mongoose');

const connectDB = async () => {
  const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cabine_iot';
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 8000 });
    console.log('MongoDB connecté');
    return true;
  } catch (err) {
    console.error('Erreur MongoDB:', err.message);
    console.log('Nouvelle tentative MongoDB dans 10s...');
    setTimeout(() => connectDB(), 10000);
    return false;
  }
};

module.exports = connectDB;