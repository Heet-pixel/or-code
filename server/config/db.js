const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set. Copy server/.env.example to server/.env and fill it in.');
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB connection lost - the driver will try to reconnect automatically');
  });
  mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log(`MongoDB connected -> ${mongoose.connection.name}`);
}

module.exports = connectDB;
