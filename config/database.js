import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

class Database {
  constructor() {
    this.connection = null;
  }

  async connect() {
    try {
      if (this.connection) {
        return this.connection;
      }

      const mongoUri = process.env.MONGODB_URI;
      
      if (!mongoUri) {
        throw new Error('MONGODB_URI environment variable is not set');
      }

      console.log('🔄 Connecting to MongoDB...');
      
      // Updated connection options - removed deprecated bufferMaxEntries
      this.connection = await mongoose.connect(mongoUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferCommands: false
      });

      console.log('✅ Connected to MongoDB successfully');
      console.log(`🗄️ Database: ${mongoose.connection.db.databaseName}`);
      
      // Handle connection events
      mongoose.connection.on('error', (error) => {
        console.error('❌ MongoDB connection error:', error);
      });

      mongoose.connection.on('disconnected', () => {
        console.log('⚠️ MongoDB disconnected');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('🔄 MongoDB reconnected');
      });

      return this.connection;
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error.message);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.connection) {
        await mongoose.disconnect();
        this.connection = null;
        console.log('👋 Disconnected from MongoDB');
      }
    } catch (error) {
      console.error('❌ Error disconnecting from MongoDB:', error);
    }
  }

  isConnected() {
    return mongoose.connection.readyState === 1;
  }

  getConnectionStatus() {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    return {
      state: states[mongoose.connection.readyState] || 'unknown',
      database: mongoose.connection.db?.databaseName || 'unknown',
      host: mongoose.connection.host || 'unknown'
    };
  }
}

export const database = new Database();