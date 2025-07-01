import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GmailMonitor } from './services/gmailMonitor.js';
import { database } from './config/database.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database connection
let gmailMonitor;

async function initializeApp() {
  try {
    // Connect to MongoDB
    await database.connect();
    
    // Initialize Gmail Monitor
    gmailMonitor = new GmailMonitor();
    
    console.log('✅ Application initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize application:', error);
    process.exit(1);
  }
}

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const dbStatus = database.getConnectionStatus();
  res.json({
    status: 'ok',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// Get authentication URL
app.get('/api/auth-url', async (req, res) => {
  try {
    const authUrl = await gmailMonitor.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Handle OAuth callback
app.get('/api/auth/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }
    
    await gmailMonitor.handleAuthCallback(code);
    res.json({ message: 'Authentication successful! You can now start monitoring.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start monitoring
app.post('/api/monitor/start', async (req, res) => {
  try {
    const result = await gmailMonitor.startMonitoring();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop monitoring
app.post('/api/monitor/stop', (req, res) => {
  try {
    const result = gmailMonitor.stopMonitoring();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get monitoring status
app.get('/api/monitor/status', async (req, res) => {
  try {
    const status = await gmailMonitor.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const transactions = await gmailMonitor.getTransactions(limit);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get unclaimed transactions
app.get('/api/transactions/unclaimed', async (req, res) => {
  try {
    const transactions = await gmailMonitor.getUnclaimedTransactions();
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Claim transaction by UTR
app.post('/api/transactions/claim', async (req, res) => {
  try {
    const { utr } = req.body;
    
    if (!utr) {
      return res.status(400).json({ error: 'UTR is required' });
    }
    
    const transaction = await gmailMonitor.claimTransaction(utr);
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found or already claimed' });
    }
    
    res.json({ 
      message: 'Transaction claimed successfully!',
      transaction: transaction.toJSON()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get latest transaction
app.get('/api/transactions/latest', async (req, res) => {
  try {
    const latest = await gmailMonitor.getLatestTransaction();
    res.json(latest);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get transaction statistics
app.get('/api/transactions/stats', async (req, res) => {
  try {
    const { startDate, endDate, claimedOnly } = req.query;
    const stats = await gmailMonitor.getTransactionStats(startDate, endDate, claimedOnly === 'true');
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear transactions
app.delete('/api/transactions', async (req, res) => {
  try {
    const result = await gmailMonitor.clearTransactions();
    res.json({ 
      message: `${result.deletedCount} transactions cleared successfully`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  
  if (gmailMonitor) {
    gmailMonitor.stopMonitoring();
  }
  
  await database.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  
  if (gmailMonitor) {
    gmailMonitor.stopMonitoring();
  }
  
  await database.disconnect();
  process.exit(0);
});

// Initialize and start server
initializeApp().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📧 Gmail Transaction Monitor API ready!`);
    console.log(`🗄️ Connected to MongoDB: ${process.env.MONGODB_URI?.split('@')[1]?.split('/')[0] || 'Unknown'}`);
    console.log('\n📋 Available API Endpoints:');
    console.log('  GET  /api/health - Health check');
    console.log('  GET  /api/auth-url - Get Gmail auth URL');
    console.log('  GET  /api/auth/callback - OAuth callback');
    console.log('  POST /api/monitor/start - Start monitoring');
    console.log('  POST /api/monitor/stop - Stop monitoring');
    console.log('  GET  /api/monitor/status - Get status');
    console.log('  GET  /api/transactions - Get all transactions');
    console.log('  GET  /api/transactions/unclaimed - Get unclaimed transactions');
    console.log('  POST /api/transactions/claim - Claim transaction by UTR');
    console.log('  GET  /api/transactions/latest - Get latest transaction');
    console.log('  GET  /api/transactions/stats - Get transaction stats');
    console.log('  DELETE /api/transactions - Clear all transactions');
  });
});