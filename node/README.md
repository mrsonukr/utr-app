# Gmail Transaction Monitor - Express.js with MongoDB

A Node.js Express application that monitors Gmail for HDFC Bank transaction emails and stores them in MongoDB with real-time notifications via a web interface.

## Features

- 🔐 OAuth2 authentication with Gmail
- 📧 Real-time monitoring of HDFC Bank transaction emails
- 💰 Automatic extraction of transaction amount and UTR
- 🗄️ **MongoDB integration for persistent storage**
- 🌐 Web-based dashboard for monitoring and control
- 📊 RESTful API endpoints
- 🔄 Auto-refresh functionality
- 📱 Responsive design
- 📈 Transaction statistics and analytics

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **MongoDB Setup:**
   - The app is configured to use: `mongodb+srv://mssonukr:iammrsonukr@mmrestro.mr1jp.mongodb.net/blumshop`
   - Transactions will be stored in the `transactions` collection
   - Database connection is automatically handled

3. **Gmail API Setup:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable Gmail API
   - Create OAuth2 credentials
   - Download the credentials and save as `credentials.json`

4. **Configure OAuth2:**
   - In Google Cloud Console, add `http://localhost:3000/api/auth/callback` to authorized redirect URIs

5. **Environment Variables:**
   - Copy `.env.example` to `.env`
   - The MongoDB URI is already configured

6. **Start the application:**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

7. **Access the application:**
   - Open http://localhost:3000 in your browser
   - Click "Authenticate Gmail" to authorize the app
   - Start monitoring to begin watching for transactions

## Database Schema

### Transaction Model
```javascript
{
  amount: Number,           // Transaction amount
  utr: String,             // Unique Transaction Reference (indexed)
  timestamp: Date,         // Transaction timestamp
  emailId: String,         // Gmail message ID
  source: String,          // 'HDFC_BANK' or 'OTHER'
  status: String,          // 'PROCESSED', 'PENDING', 'FAILED'
  metadata: {
    emailSubject: String,  // Email subject
    emailDate: Date,       // Email date
    rawContent: String     // First 1000 chars of email content
  },
  createdAt: Date,         // Record creation time
  updatedAt: Date          // Record update time
}
```

## API Endpoints

### Authentication
- `GET /api/auth-url` - Get OAuth2 authentication URL
- `GET /api/auth/callback` - Handle OAuth2 callback

### Monitoring
- `POST /api/monitor/start` - Start monitoring Gmail
- `POST /api/monitor/stop` - Stop monitoring
- `GET /api/monitor/status` - Get monitoring status

### Transactions
- `GET /api/transactions` - Get all transactions (with limit parameter)
- `GET /api/transactions/latest` - Get latest transaction
- `GET /api/transactions/stats` - Get transaction statistics
- `DELETE /api/transactions` - Clear all transactions

### System
- `GET /api/health` - Health check and database status

## File Structure

```
├── server.js                    # Main Express server
├── config/
│   └── database.js             # MongoDB connection configuration
├── models/
│   └── Transaction.js          # MongoDB transaction model
├── services/
│   └── gmailMonitor.js         # Gmail monitoring service
├── public/
│   └── index.html              # Web dashboard
├── credentials.json            # Gmail API credentials
├── token.json                  # OAuth2 tokens (auto-generated)
├── .env                        # Environment variables
└── package.json                # Dependencies and scripts
```

## MongoDB Features

### Automatic Features
- **Duplicate Prevention**: UTR-based uniqueness prevents duplicate transactions
- **Indexing**: Optimized queries with compound indexes
- **Data Validation**: Schema validation for data integrity
- **Timestamps**: Automatic createdAt/updatedAt tracking

### Query Methods
- `Transaction.findRecent(limit)` - Get recent transactions
- `Transaction.findByUTR(utr)` - Find transaction by UTR
- `Transaction.getTotalAmount(startDate, endDate)` - Get statistics

## How It Works

1. **Authentication**: Uses OAuth2 to authenticate with Gmail API
2. **Monitoring**: Polls Gmail every 30 seconds for new emails from HDFC Bank
3. **Extraction**: Uses regex to extract transaction amount and UTR from email content
4. **Storage**: Saves transactions to MongoDB with full metadata
5. **Deduplication**: Prevents duplicate transactions using UTR uniqueness
6. **API**: Provides RESTful endpoints for frontend interaction
7. **Dashboard**: Real-time web interface for monitoring and control

## Security Notes

- Tokens are stored locally in `token.json`
- Only requires read-only Gmail access
- MongoDB credentials are in environment variables
- No sensitive data is transmitted to external servers
- All processing happens locally

## Database Management

### View Transactions in MongoDB
```javascript
// Connect to your MongoDB and run:
db.transactions.find().sort({timestamp: -1}).limit(10)
```

### Get Transaction Statistics
```javascript
// Total amount and count
db.transactions.aggregate([
  { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
])
```

## Customization

To monitor different banks or email patterns:

1. Update the Gmail search query in `gmailMonitor.js`:
   ```javascript
   const query = 'from:alerts@hdfcbank.net "successfully credited to your account"';
   ```

2. Modify the regex pattern in `extractTransactionInfo()`:
   ```javascript
   const regex = /Rs\.(\d+\.\d{2}) is successfully credited.*?reference number is (\d+)/s;
   ```

3. Update the Transaction model schema if needed

## Troubleshooting

- **Authentication issues**: Ensure redirect URI is correctly configured in Google Cloud Console
- **Database connection**: Check MongoDB URI and network connectivity
- **No transactions found**: Check if the email pattern matches your bank's format
- **Duplicate key errors**: Normal behavior - prevents duplicate transactions
- **Polling not working**: Verify Gmail API quotas and permissions

## License

MIT License - feel free to modify and use as needed.