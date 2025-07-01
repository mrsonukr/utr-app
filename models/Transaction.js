import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  utr: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  claimed: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true,
  collection: 'transactions'
});

// Create compound indexes for efficient queries
transactionSchema.index({ timestamp: -1, claimed: 1 });
transactionSchema.index({ utr: 1 }, { unique: true });

// Add methods
transactionSchema.methods.toJSON = function() {
  const transaction = this.toObject();
  return {
    id: transaction._id,
    amount: transaction.amount,
    utr: transaction.utr,
    timestamp: transaction.timestamp,
    claimed: transaction.claimed,
    createdAt: transaction.createdAt
  };
};

// Static methods
transactionSchema.statics.findRecent = function(limit = 50) {
  return this.find()
    .sort({ timestamp: -1 })
    .limit(limit);
};

transactionSchema.statics.findByUTR = function(utr) {
  return this.findOne({ utr });
};

transactionSchema.statics.claimTransaction = function(utr) {
  return this.findOneAndUpdate(
    { utr, claimed: false },
    { claimed: true },
    { new: true }
  );
};

transactionSchema.statics.getUnclaimedTransactions = function() {
  return this.find({ claimed: false }).sort({ timestamp: -1 });
};

transactionSchema.statics.getTotalAmount = function(startDate, endDate, claimedOnly = false) {
  const query = {};
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }
  if (claimedOnly) {
    query.claimed = true;
  }
  
  return this.aggregate([
    { $match: query },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
  ]);
};

export const Transaction = mongoose.model('Transaction', transactionSchema);