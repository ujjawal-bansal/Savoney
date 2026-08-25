import mongoose from 'mongoose';

let dbState = {
  connected: false,
  usingMemory: false,
};

export const getDbState = () => dbState;

export const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is required. Set it in your environment or .env file.');
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    dbState = { connected: true, usingMemory: false };
    return true;
  } catch (error) {
    dbState = { connected: false, usingMemory: false };
    throw error;
  }
};

export const isUsingMemoryStore = () => dbState.usingMemory;
