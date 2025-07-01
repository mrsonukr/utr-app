import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as cheerio from 'cheerio';
import { Transaction } from '../models/Transaction.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class GmailMonitor {
  constructor() {
    this.oauth2Client = null;
    this.gmail = null;
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.seenMessageIds = new Set();
    this.pollInterval = 30000; // 30 seconds
    
    this.credentialsPath = path.join(__dirname, '..', 'credentials.json');
    this.tokenPath = path.join(__dirname, '..', 'token.json');
    
    this.scopes = ['https://www.googleapis.com/auth/gmail.readonly'];
  }

  async loadCredentials() {
    try {
      const credentialsData = await fs.readFile(this.credentialsPath, 'utf8');
      return JSON.parse(credentialsData);
    } catch (error) {
      throw new Error('Could not load credentials.json file');
    }
  }

  async getAuthUrl() {
    const credentials = await this.loadCredentials();
    const { client_secret, client_id, redirect_uris } = credentials.web;
    
    this.oauth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      'http://localhost:3000/api/auth/callback'
    );

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
    });

    return authUrl;
  }

  async handleAuthCallback(code) {
    if (!this.oauth2Client) {
      throw new Error('OAuth client not initialized');
    }

    const { tokens } = await this.oauth2Client.getAccessToken(code);
    this.oauth2Client.setCredentials(tokens);

    // Save tokens to file
    await fs.writeFile(this.tokenPath, JSON.stringify(tokens, null, 2));
    
    // Initialize Gmail API
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  async loadSavedTokens() {
    try {
      const tokenData = await fs.readFile(this.tokenPath, 'utf8');
      const tokens = JSON.parse(tokenData);
      
      const credentials = await this.loadCredentials();
      const { client_secret, client_id } = credentials.web;
      
      this.oauth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        'http://localhost:3000/api/auth/callback'
      );
      
      this.oauth2Client.setCredentials(tokens);
      this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
      
      return true;
    } catch (error) {
      return false;
    }
  }

  extractTransactionInfo(text) {
    try {
      const regex = /Rs\.(\d+\.\d{2}) is successfully credited.*?reference number is (\d+)/s;
      const match = text.match(regex);
      
      if (match) {
        return {
          amount: parseFloat(match[1]),
          utr: match[2],
          timestamp: new Date(),
          claimed: false
        };
      }
    } catch (error) {
      console.error('Parsing error:', error);
    }
    return null;
  }

  getEmailBody(payload) {
    let body = '';
    
    if (payload.parts) {
      for (const part of payload.parts) {
        const mimeType = part.mimeType;
        const data = part.body?.data;
        
        if (!data) continue;
        
        const decodedBytes = Buffer.from(data, 'base64url');
        const content = decodedBytes.toString('utf8');
        
        if (mimeType === 'text/plain') {
          return content.trim();
        } else if (mimeType === 'text/html') {
          const $ = cheerio.load(content);
          return $.text().trim();
        }
      }
    } else {
      const data = payload.body?.data;
      if (data) {
        const decodedBytes = Buffer.from(data, 'base64url');
        const content = decodedBytes.toString('utf8');
        
        if (payload.mimeType === 'text/plain') {
          return content.trim();
        } else if (payload.mimeType === 'text/html') {
          const $ = cheerio.load(content);
          return $.text().trim();
        }
      }
    }
    
    return body;
  }

  async checkForNewTransactions() {
    try {
      const query = 'from:alerts@hdfcbank.net "successfully credited to your account"';
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 10
      });

      const messages = response.data.messages || [];
      let newFound = false;

      for (const message of messages) {
        const msgId = message.id;
        
        if (this.seenMessageIds.has(msgId)) {
          continue;
        }

        const msgData = await this.gmail.users.messages.get({
          userId: 'me',
          id: msgId,
          format: 'full'
        });

        const payload = msgData.data.payload;
        const bodyText = this.getEmailBody(payload);

        const transactionData = this.extractTransactionInfo(bodyText);

        if (transactionData) {
          try {
            // Check if transaction already exists
            const existingTransaction = await Transaction.findByUTR(transactionData.utr);
            
            if (!existingTransaction) {
              const transaction = new Transaction(transactionData);
              await transaction.save();
              
              console.log('\n🆕 New Transaction saved to MongoDB:');
              console.log(JSON.stringify(transaction.toJSON(), null, 2));
              newFound = true;
            } else {
              console.log(`⚠️ Transaction with UTR ${transactionData.utr} already exists`);
            }
          } catch (error) {
            if (error.code === 11000) {
              console.log(`⚠️ Duplicate transaction UTR: ${transactionData.utr}`);
            } else {
              console.error('❌ Error saving transaction:', error.message);
            }
          }
        }

        this.seenMessageIds.add(msgId);
      }

      if (!newFound) {
        process.stdout.write('.');
      }

    } catch (error) {
      console.error('Error checking for transactions:', error.message);
    }
  }

  async startMonitoring() {
    if (this.isMonitoring) {
      return { message: 'Monitoring is already active', status: 'running' };
    }

    // Try to load saved tokens first
    const hasTokens = await this.loadSavedTokens();
    
    if (!hasTokens || !this.gmail) {
      throw new Error('Authentication required. Please authenticate first.');
    }

    this.isMonitoring = true;
    
    console.log(`✅ Starting monitoring every ${this.pollInterval / 1000} seconds...`);
    
    // Start polling
    this.monitoringInterval = setInterval(() => {
      this.checkForNewTransactions();
    }, this.pollInterval);

    // Check immediately
    this.checkForNewTransactions();

    return { 
      message: 'Monitoring started successfully', 
      status: 'running',
      interval: this.pollInterval / 1000
    };
  }

  stopMonitoring() {
    if (!this.isMonitoring) {
      return { message: 'Monitoring is not active', status: 'stopped' };
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('\n👋 Monitoring stopped.');
    
    return { message: 'Monitoring stopped successfully', status: 'stopped' };
  }

  async getStatus() {
    try {
      const transactionCount = await Transaction.countDocuments();
      const unclaimedCount = await Transaction.countDocuments({ claimed: false });
      return {
        isMonitoring: this.isMonitoring,
        transactionCount,
        unclaimedCount,
        seenMessagesCount: this.seenMessageIds.size,
        pollInterval: this.pollInterval / 1000,
        isAuthenticated: !!this.gmail
      };
    } catch (error) {
      return {
        isMonitoring: this.isMonitoring,
        transactionCount: 0,
        unclaimedCount: 0,
        seenMessagesCount: this.seenMessageIds.size,
        pollInterval: this.pollInterval / 1000,
        isAuthenticated: !!this.gmail
      };
    }
  }

  async getTransactions(limit = 50) {
    try {
      const transactions = await Transaction.findRecent(limit);
      return {
        transactions: transactions.map(t => t.toJSON()),
        count: transactions.length
      };
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return { transactions: [], count: 0 };
    }
  }

  async getUnclaimedTransactions() {
    try {
      const transactions = await Transaction.getUnclaimedTransactions();
      return {
        transactions: transactions.map(t => t.toJSON()),
        count: transactions.length
      };
    } catch (error) {
      console.error('Error fetching unclaimed transactions:', error);
      return { transactions: [], count: 0 };
    }
  }

  async claimTransaction(utr) {
    try {
      const transaction = await Transaction.claimTransaction(utr);
      return transaction;
    } catch (error) {
      console.error('Error claiming transaction:', error);
      throw error;
    }
  }

  async getLatestTransaction() {
    try {
      const transaction = await Transaction.findOne().sort({ timestamp: -1 });
      return transaction ? transaction.toJSON() : null;
    } catch (error) {
      console.error('Error fetching latest transaction:', error);
      return null;
    }
  }

  async clearTransactions() {
    try {
      const result = await Transaction.deleteMany({});
      this.seenMessageIds.clear();
      return { deletedCount: result.deletedCount };
    } catch (error) {
      console.error('Error clearing transactions:', error);
      throw error;
    }
  }

  async getTransactionStats(startDate, endDate, claimedOnly = false) {
    try {
      const stats = await Transaction.getTotalAmount(startDate, endDate, claimedOnly);
      return stats.length > 0 ? stats[0] : { total: 0, count: 0 };
    } catch (error) {
      console.error('Error getting transaction stats:', error);
      return { total: 0, count: 0 };
    }
  }
}