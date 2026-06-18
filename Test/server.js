// ===== ADSA GAME — FULLSTACK WEB SERVER =====
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database');

// Load environment variables manually from .env if it exists
const fs = require('fs');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      if (key && !key.startsWith('#')) {
        process.env[key] = val;
      }
    }
  });
}

// Load brawlers API list for offline chatbot
let brawlersList = [];
try {
  const brawlersData = fs.readFileSync(path.join(__dirname, 'brawlers_api.json'), 'utf8');
  brawlersList = JSON.parse(brawlersData).list || [];
  console.log(`Loaded ${brawlersList.length} brawlers for offline AI database.`);
} catch (err) {
  console.error("Failed to load brawlers_api.json:", err);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static website files
app.use(express.static(__dirname));

// Custom logs for visits (Simple local analytics log)
let totalVisits = 0;
const pageViews = {};

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    totalVisits++;
    const p = req.path === '/' ? '/index.html' : req.path;
    pageViews[p] = (pageViews[p] || 0) + 1;
  }
  next();
});

// ============================
// AUTHENTICATION API
// ============================
app.post('/api/auth/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Please fill in all required fields' });
  }

  if (db.getUserByUsername(username)) {
    return res.status(400).json({ error: 'Username is already registered' });
  }
  if (db.getUserByEmail(email)) {
    return res.status(400).json({ error: 'Email is already registered' });
  }

  const user = db.addUser({
    username,
    email,
    password, // In a real app, hash this password
    balance: 0,
    cashback: 0,
    rating: 5.0,
    completed_tasks: 0,
    role: 'client'
  });

  res.json({ message: 'Registered successfully!', user: { id: user.id, username: user.username, email: user.email, role: user.role, balance: user.balance, cashback: user.cashback } });
});

app.post('/api/auth/login', (req, res) => {
  const { loginInput, password } = req.body; // username or email
  if (!loginInput || !password) {
    return res.status(400).json({ error: 'Please enter username and password' });
  }

  const user = db.getUserByUsername(loginInput) || db.getUserByEmail(loginInput);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Incorrect username or password' });
  }

  res.json({
    message: 'Logged in successfully!',
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      balance: user.balance,
      cashback: user.cashback,
      avatar: user.avatar || ''
    }
  });
});

app.get('/api/auth/user/:id', (req, res) => {
  const user = db.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    balance: user.balance,
    cashback: user.cashback,
    rating: user.rating,
    completed_tasks: user.completed_tasks,
    avatar: user.avatar || ''
  });
});

app.post('/api/auth/update-profile', (req, res) => {
  const { userId, email, password, avatar } = req.body;
  if (!userId) return res.status(400).json({ error: 'User ID is required' });

  const user = db.getUserById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const updates = {};
  if (email) updates.email = email;
  if (password) updates.password = password;
  if (avatar !== undefined) updates.avatar = avatar;

  const updatedUser = db.updateUser(userId, updates);
  res.json({
    message: 'Profile updated successfully!',
    user: {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      role: updatedUser.role,
      balance: updatedUser.balance,
      cashback: updatedUser.cashback,
      avatar: updatedUser.avatar || ''
    }
  });
});

// ============================
// BOOSTER RECRUITMENT API
// ============================
app.post('/api/booster/apply', (req, res) => {
  const { userId, name, email, rank, trophies, details } = req.body;
  if (!userId || !name || !email || !rank || !trophies) {
    return res.status(400).json({ error: 'Please fill in all technical fields' });
  }

  const app = db.addApplication({
    userId,
    name,
    email,
    rank,
    trophies,
    details: details || '',
    status: 'pending'
  });

  // Change user status to pending_booster
  db.updateUser(userId, { role: 'pending_booster' });

  res.json({ message: 'Application submitted successfully! Tech support will review it soon.', application: app });
});

// ============================
// WALLET & DEPOSIT API
// ============================
app.post('/api/wallet/deposit', (req, res) => {
  const { userId, method, amount, txHash } = req.body;
  if (!userId || !amount) return res.status(400).json({ error: 'Transaction details incomplete' });

  const amt = parseFloat(amount);
  const user = db.getUserById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (method === 'paypal') {
    // PayPal: Simulate instant checkout confirmation
    const newBal = (user.balance || 0) + amt;
    db.updateUser(userId, { balance: newBal });
    return res.json({ message: `Successfully deposited $${amt.toFixed(2)} into your wallet!`, balance: newBal });
  } else if (method === 'binance') {
    if (!txHash) return res.status(400).json({ error: 'Please enter transaction hash (Tx Hash)' });
    // Binance Pay: Create a pending deposit order for admin review
    const order = db.addOrder({
      clientId: userId,
      clientUsername: user.username,
      serviceType: 'deposit',
      price: amt,
      status: 'pending_deposit', // Requires admin approval
      txHash,
      details: { method: 'binance' }
    });
    return res.json({ message: 'Deposit request registered successfully. We will review and approve it shortly!', order });
  } else if (method === 'orange' || method === 'vodafone' || method === 'etisalat' || method === 'instapay') {
    const { senderInfo } = req.body;
    if (!txHash) return res.status(400).json({ error: 'Please enter transaction number or transfer code' });
    if (!senderInfo) {
      const isLocalPhone = (method === 'orange' || method === 'vodafone' || method === 'etisalat');
      return res.status(400).json({ error: isLocalPhone ? 'Please enter the phone number you transferred from' : 'Please enter sender name or InstaPay address' });
    }
    const order = db.addOrder({
      clientId: userId,
      clientUsername: user.username,
      serviceType: 'deposit',
      price: amt,
      status: 'pending_deposit',
      txHash,
      details: { method, senderInfo }
    });
    let methodNameAr = 'Orange Cash';
    if (method === 'vodafone') methodNameAr = 'Vodafone Cash';
    if (method === 'etisalat') methodNameAr = 'Etisalat Cash';
    if (method === 'instapay') methodNameAr = 'InstaPay';
    return res.json({ message: `Deposit request via ${methodNameAr} registered successfully. We will review and approve it shortly!`, order });
  }

  res.status(400).json({ error: 'Unsupported payment method' });
});

// ============================
// ORDERS & AUCTIONS API
// ============================
app.post('/api/orders/create', (req, res) => {
  const { clientId, serviceType, price, tip, details, payMethod } = req.body;
  if (!clientId || !serviceType || !price) {
    return res.status(400).json({ error: 'Order details incomplete' });
  }

  const user = db.getUserById(clientId);
  if (!user) return res.status(404).json({ error: 'Client not found' });

  const cost = parseFloat(price);
  const tipAmt = parseFloat(tip || 0);
  const totalCost = cost + tipAmt;

  if (payMethod === 'pending') {
    // Submit order request without payment (Status: pending_payment)
    const order = db.addOrder({
      clientId,
      clientUsername: user.username,
      serviceType,
      price: cost,
      tip: tipAmt,
      cashbackEarned: 0,
      details,
      status: 'pending_payment', // Client needs to pay later
      boosterId: null,
      boosterUsername: null
    });

    return res.json({
      message: 'Your request was submitted successfully! You can coordinate with support in chat and pay later to activate the order.',
      order
    });
  }

  if (payMethod === 'wallet') {
    if (user.balance < totalCost) {
      return res.status(400).json({ error: 'Insufficient wallet balance. Please top up your wallet.' });
    }

    // Deduct balance, add cashback
    const cashbackEarned = cost * 0.02; // 2% Cashback of base price
    const newBal = user.balance - totalCost;
    const newCash = (user.cashback || 0) + cashbackEarned;

    db.updateUser(clientId, {
      balance: newBal,
      cashback: newCash
    });

    const order = db.addOrder({
      clientId,
      clientUsername: user.username,
      serviceType,
      price: cost,
      tip: tipAmt,
      cashbackEarned,
      details,
      status: 'auction', // Place in auction for boosters to bid
      boosterId: null,
      boosterUsername: null
    });

    res.json({
      message: 'Purchase successful and balance deducted! The order is now in the booster auction.',
      order,
      balance: newBal,
      cashback: newCash
    });
  } else {
    // Paid via external method (Paypal/Binance) during checkout
    const cashbackEarned = cost * 0.02;
    const userUpdates = { cashback: (user.cashback || 0) + cashbackEarned };
    db.updateUser(clientId, userUpdates);

    const order = db.addOrder({
      clientId,
      clientUsername: user.username,
      serviceType,
      price: cost,
      tip: tipAmt,
      cashbackEarned,
      details,
      status: 'auction',
      boosterId: null,
      boosterUsername: null
    });

    res.json({
      message: 'External payment confirmed successfully! The order is placed in the booster auction.',
      order
    });
  }
});

// Pay for an existing pending order (Pay for pending order)
app.post('/api/orders/pay', (req, res) => {
  const { orderId, payMethod, txHash, senderInfo } = req.body;
  if (!orderId || !payMethod) return res.status(400).json({ error: 'Data incomplete' });

  const order = db.getOrderById(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'pending_payment') return res.status(400).json({ error: 'Order is not payable currently' });

  const user = db.getUserById(order.clientId);
  if (!user) return res.status(404).json({ error: 'Client not found' });

  const total = order.price + (order.tip || 0);

  if (payMethod === 'wallet') {
    if (user.balance < total) {
      return res.status(400).json({ error: 'Insufficient wallet balance. Please top up your wallet.' });
    }

    const cashbackEarned = order.price * 0.02;
    const newBal = user.balance - total;
    const newCash = (user.cashback || 0) + cashbackEarned;

    db.updateUser(order.clientId, {
      balance: newBal,
      cashback: newCash
    });

    db.updateOrder(orderId, {
      status: 'auction',
      cashbackEarned,
      details: { ...order.details, payMethod }
    });

    res.json({
      message: 'Purchase successful and balance deducted! The order is now in the booster auction.',
      balance: newBal,
      cashback: newCash
    });
  } else {
    // External payment method
    const cashbackEarned = order.price * 0.02;
    const userUpdates = { cashback: (user.cashback || 0) + cashbackEarned };
    db.updateUser(order.clientId, userUpdates);

    db.updateOrder(orderId, {
      status: payMethod === 'paypal' ? 'auction' : 'pending_deposit',
      cashbackEarned,
      txHash,
      details: { ...order.details, payMethod, txHash, senderInfo }
    });

    res.json({
      message: payMethod === 'paypal' ? 'Payment confirmed successfully! The order is placed in the booster auction.' : 'Payment registered successfully, pending admin review and order activation!'
    });
  }
});

// Booster Bidding (Booster Auction)
app.post('/api/orders/bid', (req, res) => {
  const { orderId, boosterId, bidPrice } = req.body;
  if (!orderId || !boosterId || !bidPrice) {
    return res.status(400).json({ error: 'Bid details incomplete' });
  }

  const order = db.getOrderById(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'auction') return res.status(400).json({ error: 'This order is no longer available for bidding' });

  const booster = db.getUserById(boosterId);
  if (!booster || booster.role !== 'booster') {
    return res.status(403).json({ error: 'Unauthorized player for placing bids' });
  }

  const price = parseFloat(bidPrice);

  // Add bid
  order.bids = order.bids || [];
  
  // Remove existing bid by same booster if exists
  const existingIdx = order.bids.findIndex(b => b.boosterId === boosterId);
  if (existingIdx > -1) {
    order.bids.splice(existingIdx, 1);
  }

  order.bids.push({
    boosterId,
    boosterUsername: booster.username,
    rating: booster.rating || 5.0,
    completed: booster.completed_tasks || 0,
    price,
    timestamp: new Date().toISOString()
  });

  // Sort bids by price ascending (lowest price first)
  order.bids.sort((a, b) => a.price - b.price);

  db.updateOrder(orderId, { bids: order.bids });
  res.json({ message: 'Your bid was submitted successfully!', bids: order.bids });
});

// Accept Bidding (Accept bid and assign order)
app.post('/api/orders/accept-bid', (req, res) => {
  const { orderId, boosterId, acceptedPrice } = req.body;
  if (!orderId || !boosterId) return res.status(400).json({ error: 'Assignment details incomplete' });

  const order = db.getOrderById(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const booster = db.getUserById(boosterId);
  if (!booster) return res.status(404).json({ error: 'Booster not found' });

  db.updateOrder(orderId, {
    boosterId,
    boosterUsername: booster.username,
    acceptedPrice: parseFloat(acceptedPrice),
    status: 'active'
  });

  // Send system message in chat
  db.addChatMessage(orderId, 'SYSTEM', `Hello! This order has been assigned to pro player ${booster.username}. Please coordinate and start work.`);

  res.json({ message: `Bid accepted and order assigned to ${booster.username}!`, order });
});

// Set deadline by booster
app.post('/api/orders/set-deadline', (req, res) => {
  const { orderId, boosterId, days } = req.body;
  if (!orderId || !boosterId || !days) return res.status(400).json({ error: 'Data incomplete' });

  const order = db.getOrderById(orderId);
  if (!order || order.boosterId !== boosterId) return res.status(400).json({ error: 'Unauthorized request' });

  const durationMs = parseInt(days) * 24 * 60 * 60 * 1000;
  const deadline = new Date(Date.now() + durationMs).toISOString();

  db.updateOrder(orderId, { deadline });

  db.addChatMessage(orderId, 'SYSTEM', `The booster set the deadline: ${days} days. Work ends at: ${new Date(deadline).toLocaleString()}`);

  res.json({ message: 'Deadline set successfully!', deadline });
});

// Mark order as completed by booster
app.post('/api/orders/complete', (req, res) => {
  const { orderId, boosterId } = req.body;
  const order = db.getOrderById(orderId);
  if (!order || order.boosterId !== boosterId) return res.status(400).json({ error: 'Unauthorized request' });

  db.updateOrder(orderId, { status: 'completed' });

  // Credit payout money to booster wallet
  const payout = order.acceptedPrice || (order.price * 0.7); // default 70% payout if no bid
  const booster = db.getUserById(boosterId);
  const newBal = (booster.balance || 0) + payout;
  const newTasks = (booster.completed_tasks || 0) + 1;
  db.updateUser(boosterId, { balance: newBal, completed_tasks: newTasks });

  db.addChatMessage(orderId, 'SYSTEM', `Congratulations! The booster completed the task successfully. Thank you!`);

  res.json({ message: 'Task completed and earnings deposited to your wallet!', order });
});

// Cancel & refund if expired (Called by Client)
app.post('/api/orders/refund', (req, res) => {
  const { orderId, clientId } = req.body;
  const order = db.getOrderById(orderId);
  if (!order || order.clientId !== clientId) return res.status(404).json({ error: 'Order not found' });

  if (order.status !== 'active') return res.status(400).json({ error: 'This order is not active currently for cancellation' });
  if (!order.deadline) return res.status(400).json({ error: 'The booster has not set a deadline for work yet' });

  const expired = new Date() > new Date(order.deadline);
  if (!expired) return res.status(400).json({ error: 'The specified deadline has not expired yet' });

  // Escrow Refund: Return client money to their wallet
  const client = db.getUserById(clientId);
  const refundAmt = order.price + (order.tip || 0);
  const newBal = (client.balance || 0) + refundAmt;
  db.updateUser(clientId, { balance: newBal });

  db.updateOrder(orderId, { status: 'refunded' });

  db.addChatMessage(orderId, 'SYSTEM', `This order has been cancelled successfully and the amount of ($${refundAmt.toFixed(2)}) refunded to the client's wallet for exceeding the delivery deadline.`);

  res.json({ message: 'Order cancelled and balance refunded to your wallet successfully!', balance: newBal });
});

// Rate booster
app.post('/api/orders/rate', (req, res) => {
  const { orderId, clientId, rating, review } = req.body;
  const order = db.getOrderById(orderId);
  if (!order || order.clientId !== clientId) return res.status(404).json({ error: 'Order not found' });

  db.updateOrder(orderId, {
    rating: parseFloat(rating),
    review: review || ''
  });

  // Recalculate booster rating
  if (order.boosterId) {
    const booster = db.getUserById(order.boosterId);
    const boosterOrders = db.getOrders().filter(o => o.boosterId === order.boosterId && o.rating !== null);
    if (boosterOrders.length > 0) {
      const sum = boosterOrders.reduce((s, o) => s + o.rating, 0);
      const avg = sum / boosterOrders.length;
      db.updateUser(order.boosterId, { rating: parseFloat(avg.toFixed(1)) });
    }
  }

  res.json({ message: 'Your rating and review were submitted successfully. Thank you!' });
});

// ============================
// CHAT API
// ============================
app.get('/api/chat/:orderId', (req, res) => {
  res.json(db.getChat(req.params.orderId));
});

app.post('/api/chat/send', (req, res) => {
  const { orderId, sender, message } = req.body;
  if (!orderId || !sender || !message) return res.status(400).json({ error: 'Data incomplete' });
  const chat = db.addChatMessage(orderId, sender, message);
  res.json(chat);
});

// Get all support chat sessions (chats starting with support-)
app.get('/api/admin/support-sessions', (req, res) => {
  const allChats = db.getChats ? db.getChats() : {};
  const sessions = [];
  
  Object.keys(allChats).forEach(key => {
    if (key.startsWith('support-')) {
      const messages = allChats[key];
      const lastMsg = messages[messages.length - 1];
      sessions.push({
        id: key,
        lastMessage: lastMsg ? lastMsg.message : '',
        lastSender: lastMsg ? lastMsg.sender : '',
        timestamp: lastMsg ? lastMsg.timestamp : '',
        messagesCount: messages.length
      });
    }
  });
  
  sessions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(sessions);
});

// ============================
// ADMIN API
// ============================
app.get('/api/admin/stats', (req, res) => {
  // Simple analytics stats
  const orders = db.getOrders();
  const sales = orders.filter(o => o.status !== 'pending_deposit' && o.status !== 'refunded' && o.serviceType !== 'deposit').reduce((s, o) => s + o.price, 0);

  // Total In (Clients): all amounts paid for tasks (base price + tip) for active and completed orders
  const totalIn = orders
    .filter(o => o.status !== 'pending_deposit' && o.status !== 'refunded' && o.status !== 'cancelled' && o.serviceType !== 'deposit')
    .reduce((s, o) => s + (o.price + (o.tip || 0)), 0);

  // Total Out (Boosters): booster earnings for completed orders
  const totalOut = orders
    .filter(o => o.status === 'completed' && o.serviceType !== 'deposit')
    .reduce((s, o) => {
      const payout = o.acceptedPrice !== undefined && o.acceptedPrice !== null ? o.acceptedPrice : (o.price * 0.7);
      return s + payout;
    }, 0);

  // Net Profit
  const netProfit = totalIn - totalOut;

  res.json({
    totalVisits,
    pageViews,
    sales,
    totalIn,
    totalOut,
    netProfit,
    usersCount: db.getUsers().length,
    boostersCount: db.getUsers().filter(u => u.role === 'booster').length,
    users: db.getUsers(),
    applications: db.getApplications(),
    orders: orders
  });
});

app.post('/api/admin/approve-application', (req, res) => {
  const { appId, approve } = req.body; // approve: true or false
  const app = db.getApplications().find(a => a.id === appId);
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const status = approve ? 'approved' : 'rejected';
  db.updateApplication(appId, status);

  if (approve) {
    db.updateUser(app.userId, { role: 'booster' });
  } else {
    db.updateUser(app.userId, { role: 'client' });
  }

  res.json({ message: `Booster application status updated to: ${status}`, app });
});

app.post('/api/admin/adjust-balance', (req, res) => {
  const { userId, amount } = req.body;
  const user = db.getUserById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const adj = parseFloat(amount);
  const newBal = (user.balance || 0) + adj;
  db.updateUser(userId, { balance: newBal });

  res.json({ message: 'Wallet balance adjusted successfully!', balance: newBal });
});

app.post('/api/admin/approve-deposit', (req, res) => {
  const { orderId, approve } = req.body;
  const order = db.getOrderById(orderId);
  if (!order || order.status !== 'pending_deposit') {
    return res.status(400).json({ error: 'Invalid deposit request' });
  }

  if (approve) {
    db.updateOrder(orderId, { status: 'completed' });
    const user = db.getUserById(order.clientId);
    const newBal = (user.balance || 0) + order.price;
    db.updateUser(order.clientId, { balance: newBal });
    res.json({ message: 'Deposit approved and wallet topped up for client!', balance: newBal });
  } else {
    db.updateOrder(orderId, { status: 'cancelled' });
    res.json({ message: 'Deposit request rejected and cancelled.' });
  }
});

// ============================
// WALLET LINKING API
// ============================

// Supported wallet types
const SUPPORTED_WALLETS = ['binance', 'orange', 'instapay', 'vodafone', 'etisalat'];

// Link a wallet to user account
app.post('/api/wallet/link', (req, res) => {
  const { userId, walletType, walletNumber, walletName } = req.body;

  if (!userId || !walletType || !walletNumber) {
    return res.status(400).json({ error: 'Please fill all wallet details' });
  }

  if (!SUPPORTED_WALLETS.includes(walletType)) {
    return res.status(400).json({ error: 'Unsupported wallet type' });
  }

  const user = db.getUserById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Get existing linked wallets or init empty array
  const existingWallets = user.linkedWallets || [];

  // Check if same wallet type+number already linked
  const alreadyLinked = existingWallets.find(
    w => w.walletType === walletType && w.walletNumber === walletNumber
  );
  if (alreadyLinked) {
    return res.status(400).json({ error: 'This wallet is already linked to your account' });
  }

  // Max 5 wallets
  if (existingWallets.length >= 5) {
    return res.status(400).json({ error: 'You can link a maximum of 5 wallets. Please delete one first.' });
  }

  const newWallet = {
    id: 'wlt-' + Date.now().toString(36),
    walletType,
    walletNumber: walletNumber.trim(),
    walletName: (walletName || '').trim(),
    linkedAt: new Date().toISOString()
  };

  const updatedWallets = [...existingWallets, newWallet];
  db.updateUser(userId, { linkedWallets: updatedWallets });

  res.json({
    message: `Wallet ${walletType} linked successfully!`,
    wallet: newWallet,
    linkedWallets: updatedWallets
  });
});

// Unlink a wallet
app.post('/api/wallet/unlink', (req, res) => {
  const { userId, walletId } = req.body;

  if (!userId || !walletId) {
    return res.status(400).json({ error: 'Incomplete details' });
  }

  const user = db.getUserById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const existingWallets = user.linkedWallets || [];
  const filtered = existingWallets.filter(w => w.id !== walletId);

  if (filtered.length === existingWallets.length) {
    return res.status(404).json({ error: 'Wallet not found' });
  }

  db.updateUser(userId, { linkedWallets: filtered });

  res.json({ message: 'Wallet unlinked successfully.', linkedWallets: filtered });
});

// Get linked wallets for a user
app.get('/api/wallet/linked/:userId', (req, res) => {
  const user = db.getUserById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({ linkedWallets: user.linkedWallets || [] });
});

// Secure siteConfig endpoint
app.get('/api/site/config', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized access' });

  const user = db.getUserById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json(db.getSiteConfig());
});

// ===// ============================
// EGYPTIAN BRAWL STARS AI CHAT API
// ============================

const brawlerAliases = {
  'شلي': 'Shelly', 'shelly': 'Shelly',
  'كولت': 'Colt', 'colt': 'Colt',
  'سبايك': 'Spike', 'spike': 'Spike',
  'ليون': 'Leon', 'leon': 'Leon',
  'كرو': 'Crow', 'crow': 'Crow',
  'مورتيس': 'Mortis', 'mortis': 'Mortis',
  'إدجار': 'Edgar', 'ادجار': 'Edgar', 'edgar': 'Edgar',
  'بايبير': 'Piper', 'بايبر': 'Piper', 'piper': 'Piper',
  'كوليت': 'Colette', 'colette': 'Colette',
  'فرانك': 'Frank', 'frank': 'Frank',
  'ميلودي': 'Melodie', 'melodie': 'Melodie',
  'ال بريمو': 'El Primo', 'بريمو': 'El Primo', 'el primo': 'El Primo',
  'بول': 'Bull', 'bull': 'Bull',
  'ريكو': 'Rico', 'rico': 'Rico',
  'جين': 'Gene', 'gene': 'Gene',
  'إيمز': 'Emz', 'ايمز': 'Emz', 'emz': 'Emz',
  'بو': 'Bo', 'bo': 'Bo',
  'بروك': 'Brock', 'brock': 'Brock',
  'بام': 'Pam', 'pam': 'Pam',
  'بوكو': 'Poco', 'poco': 'Poco',
  'تشاك': 'Chuck', 'chuck': 'Chuck',
  'كورديلوس': 'Cordelius', 'cordelius': 'Cordelius',
  'ميج': 'Meg', 'meg': 'Meg',
  'بستر': 'Buster', 'باستر': 'Buster', 'buster': 'Buster',
  'بيل': 'Belle', 'belle': 'Belle',
  'جاكي': 'Jacky', 'jacky': 'Jacky',
  'تارا': 'Tara', 'tara': 'Tara',
  'غروم': 'Grom', 'grom': 'Grom',
  'ساندي': 'Sandy', 'sandy': 'Sandy',
  'داينا': 'Dynamike', 'دايناميك': 'Dynamike', 'dynamike': 'Dynamike',
  'ماكس': 'Max', 'max': 'Max',
  'سيرج': 'Surge', 'surge': 'Surge',
  'فانغ': 'Fang', 'fang': 'Fang',
  'باز': 'Buzz', 'buzz': 'Buzz'
};

app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'فين السؤال يا غالي؟ اكتب حاجة وهرد عليك فوراً!' });
  }

  const msg = message.toLowerCase().trim();

  // Search local brawlers database for a match to prevent hallucinations
  let matchedBrawler = null;
  let matchedBrawlerName = null;

  // Split message into words to prevent substring matching bugs (like 'boost' matching 'Bo')
  const words = msg.split(/[^a-zA-Z0-9]/);

  for (const [arName, enName] of Object.entries(brawlerAliases)) {
    if (msg.includes(arName) || words.includes(enName.toLowerCase())) {
      matchedBrawlerName = enName;
      matchedBrawler = brawlersList.find(b => b.name.toLowerCase() === enName.toLowerCase());
      if (matchedBrawler) break;
    }
  }

  // If no alias match, check direct English names strictly as whole words
  if (!matchedBrawler) {
    matchedBrawler = brawlersList.find(b => words.includes(b.name.toLowerCase()));
    if (matchedBrawler) {
      matchedBrawlerName = matchedBrawler.name;
    }
  }

  const brawlSystemPrompt = `انت بوت ذكاء اصطناعي اسمه Brawl Bot لموقع Adsa Game المتخصص في خدمات رفع حسابات براول ستارز (Brawl Stars). 
تكلم باللهجة المصرية العامية.
تعليمات هامة جداً:
1. إجابتك يجب أن تكون قصيرة جداً وموجزة وبدون رغي أو كلام مكرر أو مقدمات وسلامات. أدخل في الموضوع فوراً!
2. لا تكتب أكثر من سطرين أو ثلاثة بحد أقصى للرد.
3. تجنب خلط أي لغات أخرى غير العربية والإنجليزية.
4. استخدم مصطلحات اللعبة الصحيحة: "أبطال/شخصيات/براولرز" (وليس كروت أو بطاقات)، "أدوات/جادجيتس"، "قدرات النجمة/ستار باور".
5. معلومات هامة عن خدمات الموقع:
   - طرق التواصل: سيرفر الديسكورد (discord.gg/adsagame) أو واتساب المبيعات (+201206510088).
   - طرق الدفع: فودافون كاش (Vodafone Cash)، أورانج كاش، إنستاباي (InstaPay)، PayPal، و Binance Pay.
   - أسعار رفع الكؤوس: تبدأ من 3$ وتقدر تحسب السعر بالظبط باستخدام الحاسبة الذكية في صفحة الخدمات.
   - أمان الحساب: آمن تماماً وبنستخدم VPN مخصص لدولتك لحماية حسابك من الحظر.
6. سعر الدولار مقابل الجنيه المصري حالياً هو 48 جنيه مصري تقريباً. إذا طلب اليوزر تحويل أي مبلغ من دولار لمصري، احسبه بناءً على هذا السعر (مثلاً: 30 دولار تساوي حوالي 1440 جنيه مصري).
7. إذا سئلت عن مضاد (Counter) لبطل، اذكر أفضل 3 مضادات مباشرة جداً في نقطتين أو ثلاثة وانتهى الرد.`;

  let contextPrompt = '';
  if (matchedBrawler) {
    const spList = matchedBrawler.starPowers && matchedBrawler.starPowers.length > 0 
      ? matchedBrawler.starPowers.map(sp => `• ${sp.name}: ${sp.description}`).join('\n') 
      : 'لا يوجد';
    const gdList = matchedBrawler.gadgets && matchedBrawler.gadgets.length > 0 
      ? matchedBrawler.gadgets.map(gd => `• ${gd.name}: ${gd.description}`).join('\n') 
      : 'لا يوجد';

    contextPrompt = `\n\n[معلومات رسمية مؤكدة من قاعدة بيانات اللعبة عن البطل ${matchedBrawlerName}]:
- الاسم: ${matchedBrawlerName}
- الفئة: ${matchedBrawler.class ? matchedBrawler.class.name : 'Unknown'}
- قدرات النجمة (Star Powers):
${spList}
- الأدوات (Gadgets):
${gdList}

*تعليمات هامة للإجابة عن ${matchedBrawlerName}:*
- أفضل مضادات (Counters) له:
  * إذا كان Assassin (مغتال) مثل Mortis أو Edgar، فإن مضاداته القوية هي الدبابات وقصيري المدى: Shelly (مع السوبر)، Bull، Jacky، El Primo.
  * إذا كان Marksman (قناص) مثل Colt أو Piper، فإن مضاداته هم المغتالون السريعون: Mortis، Leon، Edgar.
  * إذا كان Tank (دبابة) مثل Frank أو El Primo، فإن مضاداته هم قناصة المدى البعيد أو الدمج المئوي: Colette، Piper، Spike.
  * إذا كان Artillery (طواف) مثل Dynamike، فإن مضاداته هم المغتالون الذين يقفزون خلف الجدران: Edgar، Mortis، Buzz.`;
  }

  // 1) Try Groq API (free, fast, Arabic-capable)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey && groqKey.length > 10) {
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + groqKey
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: brawlSystemPrompt + contextPrompt },
            { role: 'user', content: message }
          ],
          max_tokens: 300,
          temperature: 0.15
        })
      });
      const groqData = await groqRes.json();
      if (groqRes.ok && groqData.choices && groqData.choices[0] && groqData.choices[0].message) {
        return res.json({ reply: groqData.choices[0].message.content.trim() });
      } else {
        console.error('Groq API Error:', JSON.stringify(groqData));
      }
    } catch (err) {
      console.error('Groq connection error:', err.message);
    }
  }

  // 2) Try Gemini API
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey !== 'YOUR_GEMINI_API_KEY_HERE' && geminiKey.length > 10) {
    try {
      const geminiRes = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: message }] }],
            systemInstruction: { parts: [{ text: brawlSystemPrompt + contextPrompt }] },
            generationConfig: { maxOutputTokens: 300, temperature: 0.15 }
          })
        }
      );
      const geminiData = await geminiRes.json();
      if (geminiRes.ok && geminiData.candidates && geminiData.candidates[0] && geminiData.candidates[0].content && geminiData.candidates[0].content.parts[0].text) {
        return res.json({ reply: geminiData.candidates[0].content.parts[0].text.trim() });
      } else {
        console.error('Gemini API Error:', JSON.stringify(geminiData));
      }
    } catch (err) {
      console.error('Gemini connection error:', err.message);
    }
  }

  // --- Offline Mode Fallback Generator (5000+ combinations) ---
  matchedBrawlerName = null;
  let brawlerKey = null;
  
  // Check if any brawler is mentioned
  for (const [arName, enName] of Object.entries(brawlerAliases)) {
    if (msg.includes(arName) || msg.includes(enName.toLowerCase())) {
      matchedBrawlerName = enName;
      brawlerKey = arName;
      break;
    }
  }

  // Welcome greetings in Egyptian Arabic slang
  const greetings = [
    "يا زميلي يا غالي روق كدة واسمعني! ",
    "بص يا وحش الكون، هقولك الخلاصة: ",
    "يا عمنا من عيوني، ركز معايا: ",
    "أحلى مسا عليك يا بطل براول ستارز! ",
    "سؤالك في الجون يا صاحبي! بص كدة: "
  ];
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];

  if (matchedBrawlerName) {
    // Find the brawler in the loaded list
    const brawler = brawlersList.find(b => b.name.toLowerCase() === matchedBrawlerName.toLowerCase());
    
    // Determine query type
    let queryType = 'general';
    if (msg.includes('كاونتر') || msg.includes('ضد') || msg.includes('يكاونتر') || msg.includes('counter') || msg.includes('مضاد') || msg.includes('مضادات') || msg.includes('أهزم') || msg.includes('اهزم')) {
      queryType = 'counters';
    } else if (msg.includes('بيلد') || msg.includes('عتاد') || msg.includes('سوبر') || msg.includes('سبيشيال') || msg.includes('جادجيت') || msg.includes('ستار باور') || msg.includes('gadget') || msg.includes('star power') || msg.includes('build') || msg.includes('ستارباور') || msg.includes('جادجت')) {
      queryType = 'build';
    } else if (msg.includes('طور') || msg.includes('ماب') || msg.includes('خريطة') || msg.includes('مابار') || msg.includes('مابات') || msg.includes('mode') || msg.includes('map') || msg.includes('أفضل') || msg.includes('افضل')) {
      queryType = 'modes';
    }

    if (brawler) {
      const className = brawler.class ? brawler.class.name : 'Unknown';
      const rarity = brawler.rarity ? brawler.rarity.name : 'Unknown';
      const spText = brawler.starPowers && brawler.starPowers.length > 0 ? brawler.starPowers.map(sp => `• ${sp.name}`).join('\n') : 'مش متوفر حالياً';
      const gdText = brawler.gadgets && brawler.gadgets.length > 0 ? brawler.gadgets.map(gd => `• ${gd.name}`).join('\n') : 'مش متوفر حالياً';

      if (queryType === 'counters') {
        let countersReply = "";
        if (className === 'Assassin' || className === 'Assassins' || matchedBrawlerName === 'Mortis' || matchedBrawlerName === 'Edgar' || matchedBrawlerName === 'Leon' || matchedBrawlerName === 'Crow') {
          countersReply = `البطل ${brawler.name} ده مغتال سريع وغدار وبيموت في الغدر من الحشيش. عشان تكاونتره وتعلمه الأدب، العب بدبابة دمها كتير ودمجها مدمر من قريب زي شلي (Shelly) بالتميت جاهز، أو بول (Bull)، أو جاكي (Jacky) بضربتها الدائرية اللي بتفرمه بدون تنشين! 🛡️❌`;
        } else if (className === 'Marksman' || className === 'Sniper' || matchedBrawlerName === 'Piper' || matchedBrawlerName === 'Colt' || matchedBrawlerName === 'Belle') {
          countersReply = `البطل ${brawler.name} قناص مداه طويل ودمجه فتاك من بعيد. عشان تكاونتره وتخلص منه، العب بمغتال سريع بيقرب في ثانية زي مورتيس (Mortis) أو ليون (Leon) المخفي أو إدجار (Edgar). فكك من الجري في خط مستقيم قدامه عشان هيفرمك! 💨🎯`;
        } else if (className === 'Tank' || className === 'Tanks' || matchedBrawlerName === 'Frank' || matchedBrawlerName === 'El Primo' || matchedBrawlerName === 'Bull') {
          countersReply = `البطل ${brawler.name} دبابة صحته حديد وبيمتص دمج كتير بس مداه قصير. كاونتره الصح هو قناص بيضربه من بعيد وميخليهوش يقرب، زي بايبير (Piper)، أو كوليت (Colette) بالدمج المئوي المدمر، أو العب بكولت (Colt) لو تنشينك سريع! 🏦💣`;
        } else if (className === 'Artillery' || className === 'Thrower' || matchedBrawlerName === 'Dynamike' || matchedBrawlerName === 'Barley') {
          countersReply = `البطل ${brawler.name} بطل طوّاف بيضرب من ورا الحيطان وبيرخم في الممرات الضيقة. عشان تكاونتره، العب بمغتال بينط فوق الحيطان زي إدجار (Edgar) أو باز (Buzz)، أو مورتيس (Mortis) بداشات سريعة توصله في ثانية وتفرمه! 🧱💥`;
        } else {
          countersReply = `البطل ${brawler.name} بطل متوازن من فئة ${className}. كقاعدة عامة لتكاونتره: لو معاه مدى طويل، قرب منه بمغتال؛ ولو معاه مدى قصير وصحة عالية، اضرب فيه من بعيد بقناص. 📊⚔️`;
        }
        return res.json({ reply: `${greeting}${countersReply}` });
      }

      if (queryType === 'build') {
        return res.json({ reply: `${greeting}البيلد المثالي والـ Build الأسطوري للبطل ${brawler.name} (${rarity} / ${className}) عشان تكتسح بيه اللوبي هو:

**الـ Star Powers الممتازة:**
${spText}

**الـ Gadgets المفضلة:**
${gdText}

*نصيحة البرو:* وصل البطل ده لليفل 11 وافتح له دروع إضافية أو سرعة في الحشيش عشان تعمل بيه أحلى شغل في الجيم! ⚡💜` });
      }

      if (queryType === 'modes') {
        let modesReply = "";
        if (className === 'Assassin' || className === 'Assassins') {
          modesReply = `بص يا عمنا، ${brawler.name} بطل مغتال فتاك. أفضل أطواره هي المواجهة (Showdown) سولو أو ديو عشان يلعب في الحشيش ويصطاد العيال الضعيفة، وبيشتغل كويس كمان في جمع الجواهر (Gem Grab) كمغتال جانبي عشان يغدر باللي شايل الجواهر في الآخر! 🌵⚔️`;
        } else if (className === 'Marksman' || className === 'Sniper') {
          modesReply = `البطل ${brawler.name} قناص مداه طويل. أفضل أطواره هي جمع الجواهر (Gem Grab) كحامل للجواهر من ورا، وطور الخزنة (Heist) لو خريطته مفتوحة عشان يعمل دمج عالي على الخزنة من بعيد، وطور الضربات القاضية (Knockout) في الخرائط المفتوحة! 🎯🛡️`;
        } else if (className === 'Tank' || className === 'Tanks') {
          modesReply = `بص يا صاحبي، ${brawler.name} دبابة صحته في السماء. أفضل طور ليه بدون منافس هو البراول بول (Brawl Ball) عشان يقدر يمشي بالكورة ويستحمل دمج ويسجل أهداف، وطور المنطقة الساخنة (Hot Zone) عشان يسيطر على الدائرة ويمنع العيال تدخل! ⚽🔥`;
        } else if (className === 'Artillery' || className === 'Thrower') {
          modesReply = `البطل ${brawler.name} رمّاي ممتاز. بيبدع في طور الخزنة (Heist) في الخرائط اللي فيها حواجز كتير عشان يضرب الخزنة بأمان، وطور المنطقة الساخنة (Hot Zone) للرخامة والسيطرة على المكان! 🧱🏦`;
        } else {
          modesReply = `البطل ${brawler.name} متوازن وبيشتغل كويس في معظم الأطوار الجماعية زي جمع الجواهر (Gem Grab) والبراول بول (Brawl Ball). ركز تختار ماب فيه حشيش وحيطان تناسب مدى ضربته! 🎮📊`;
        }
        return res.json({ reply: `${greeting}${modesReply}` });
      }

      // general brawler info
      return res.json({ reply: `${greeting}البطل **${brawler.name}** ده بطل مميز من فئة **${className}** وندرته **${rarity}**!
نبذة عنه: ${brawler.description || 'بطل مميز جداً في براول ستارز.'}

**الـ Star Powers المتوفرة:**
${spText}

**الـ Gadgets المتوفرة:**
${gdText}

لو عايز البواسترز بتوعنا يرفعوا لك البطل ده للرانك 30 (Rank 30) أو يجيبوا لك برستيج أسطوري بيه، اطلب الخدمة دي فوراً من لوحة الخدمات وهنروق عليك! 🚀🏆` });
    }
  }

  // Check for general categories
  if (msg.includes('أمان') || msg.includes('حظر') || msg.includes('باند') || msg.includes('ban') || msg.includes('vpn') || msg.includes('آمن')) {
    return res.json({ reply: `${greeting}أمان حسابك في رقبتنا يا بطل! احنا بنستخدم سيرفرات VPN مدفوعة وبندخل بنفس الـ IP بتاع جهازك بالظبط. يعني لو أنت من القاهرة، السوبر سيل هتشوف الدخول من القاهرة وبنفس نظام تليفونك. مفيش أي ريسك للباند، روق ع الآخر! 🔒🛡️` });
  }
  
  if (msg.includes('سعر') || msg.includes('أسعار') || msg.includes('ارخص') || msg.includes('خصم') || msg.includes('فلوس') || msg.includes('price') || msg.includes('تكلفة') || msg.includes('تكلف')) {
    return res.json({ reply: `${greeting}أسعارنا متظبطة ومنافسة جداً! عندنا خصومات تصل لـ 50% حالياً، ورفع الكؤوس بيبدأ من 3 دولار بس للـ 1000 كأس! وكمان بيجيلك 5% كاش باك (Cashback) في محفظتك تستخدمه خصم لطلباتك الجاية. ادخل حاسبة الأسعار في الخدمات وهتشوف التوفير! 💰📉` });
  }

  if (msg.includes('رانك') || msg.includes('rank') || msg.includes('ماستر') || msg.includes('masters') || msg.includes('ليجندري')) {
    return res.json({ reply: `${greeting}رفع الرانك عندنا بيقوم بيه لاعيبة ماسترز (Masters) محترفين. بنضمن لك نوصلك للماسترز بأسرع وقت ومعانا خيارات للسرعة الفائقة والقصوى. أهم حاجة ترفع أبطالك المفضلين لليفل 9 أو 11 وافتح الـ Hypercharge عشان نسهل اللعب وننجز في ثواني! 📊👑` });
  }

  if (msg.includes('كأس') || msg.includes('كؤوس') || msg.includes('كاس') || msg.includes('trophy') || msg.includes('ترافي')) {
    return res.json({ reply: `${greeting}رفع الكؤوس شغال من 0 لغاية 200,000 كأس! بنلعب بذكاء وبنحافظ على سلسلة الانتصارات (Win Streak) عشان نضاعف الكؤوس ونخلص طلبك بنصف الوقت. متقلقش حسابك في أيد أمنة. 🏆🚀` });
  }

  if (msg.includes('دفع') || msg.includes('طرق') || msg.includes('شحن') || msg.includes('محفظة') || msg.includes('paypal') || msg.includes('فودافون') || msg.includes('انستا') || msg.includes('instapay')) {
    return res.json({ reply: `${greeting}بنوفر لك كل طرق الدفع المريحة ليك:
• فودافون كاش / أورانج كاش / اتصالات كاش 🇪🇬
• تطبيق انستا باي (InstaPay) ⚡
• بايننس باي (Binance Pay) للعملات الرقمية 🪙
• باي بال (PayPal) للدفع الدولي 💳
تقدر تدفع مباشرة من لوحة التحكم أو تنسق مع الدعم.` });
  }

  if (msg.includes('تواصل') || msg.includes('دعم') || msg.includes('discord') || msg.includes('واتس') || msg.includes('whatsapp') || msg.includes('تويتر') || msg.includes('انستجرام')) {
    return res.json({ reply: `${greeting}فريق الدعم الفني بتاعنا شغال 24 ساعة في الخدمة! تقدر تتواصل معانا مباشرة عبر الضغط على أيقونة الديسكورد أو الواتساب في أسفل الصفحة، أو تفتح تذكرة دعم مباشرة من صفحة "تواصل معنا" وهنرد عليك في ثانية. 📞💬` });
  }

  if (msg.includes('قوانين') || msg.includes('قواعد') || msg.includes('شروط') || msg.includes('rules')) {
    return res.json({ reply: `${greeting}قوانين العمل عندنا صارمة لضمان حقك وحق البوستر: يلتزم اللاعب بإنهاء العمل في الوقت المحدد، ويمنع استخدام أي برامج غش أو استهلاك موارد حسابك (جواهر/ذهب) بدون إذنك. لو حصل تأخير، بيتم استرجاع فلوسك للمحفظة فوراً! 📜🔒` });
  }

  // Fallback default replies (Egyptian Slang)
  const defaultReplies = [
    "حبيبي يا زميلي! اسألني عن أي حاجة في براول ستارز (مضادات الأبطال، أفضل الأطوار، تكتيكات، أسعار الرفع) وهقولك الخلاصة بلهجة مصرية تروق عليك! 🇪🇬🎮",
    "أحلى مسا عليك يا غالي! البواسترز بتوعنا جاهزين يفرموا اللعبة ويرفعوا حسابك كؤوس ورانك بأمان تام. قولي عايز تكاونتر مين أو بتلعب طور إيه؟ 🏆🔥",
    "بص يا وحش الكون، احنا ملوك الرفع في الوطن العربي. اسألني عن البراولر اللي بتحبه أو إزاي بنضمن أمان الحساب وهبسطهالك خالص! 😎👾",
    "يا صاحبي ركز في براول ستارز! اسألني عن تكتيكات اللعب، أو مين بيكاونتر إدجار ومورتيس، أو إزاي ترفع رانك حسابك بأمان!"
  ];
  const reply = defaultReplies[Math.floor(Math.random() * defaultReplies.length)];
  res.json({ reply });
});

// Start Server
app.listen(PORT, () => {
  console.log("Adsa Game Server is running on http://localhost:" + PORT);
});
