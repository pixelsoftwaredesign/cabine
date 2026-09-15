require('dotenv').config();
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cabine_iot');
    console.log('MongoDB connecté');
  } catch (err) {
    console.error('Erreur MongoDB:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;