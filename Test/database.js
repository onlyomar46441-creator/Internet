// ===== ADSA GAME — FILE DATABASE CONTROLLER =====
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

// Initial load
let data = {
  users: [],
  orders: [],
  applications: [],
  chats: {}
};

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const content = fs.readFileSync(DB_PATH, 'utf8');
      data = JSON.parse(content);
    } else {
      save();
    }
  } catch (e) {
    console.error('Error loading database, resetting', e);
  }
}

function save() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving database', e);
  }
}

// Initialize on start
load();

module.exports = {
  // --- USERS ---
  getUsers: () => data.users,
  getUserById: (id) => data.users.find(u => u.id === id),
  getUserByUsername: (username) => data.users.find(u => u.username.toLowerCase() === username.toLowerCase()),
  getUserByEmail: (email) => data.users.find(u => u.email.toLowerCase() === email.toLowerCase()),
  addUser: (user) => {
    user.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    user.balance = user.balance || 0;
    user.cashback = user.cashback || 0;
    user.role = user.role || 'client'; // client, booster, admin, pending_booster
    user.created_at = new Date().toISOString();
    data.users.push(user);
    save();
    return user;
  },
  updateUser: (id, updates) => {
    const idx = data.users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    data.users[idx] = { ...data.users[idx], ...updates };
    save();
    return data.users[idx];
  },

  // --- ORDERS ---
  getOrders: () => data.orders,
  getOrderById: (id) => data.orders.find(o => o.id === id),
  addOrder: (order) => {
    order.id = 'adsa-' + Date.now().toString().substr(-6) + Math.floor(Math.random() * 100);
    order.status = order.status || 'pending_payment'; // pending_payment, auction, active, completed, refunded, cancelled
    order.bids = [];
    order.deadline = null;
    order.rating = null;
    order.review = null;
    order.created_at = new Date().toISOString();
    data.orders.push(order);
    save();
    return order;
  },
  updateOrder: (id, updates) => {
    const idx = data.orders.findIndex(o => o.id === id);
    if (idx === -1) return null;
    data.orders[idx] = { ...data.orders[idx], ...updates };
    save();
    return data.orders[idx];
  },

  // --- APPLICATIONS ---
  getApplications: () => data.applications,
  addApplication: (app) => {
    app.id = 'app-' + Date.now().toString(36);
    app.status = 'pending'; // pending, approved, rejected
    app.created_at = new Date().toISOString();
    data.applications.push(app);
    save();
    return app;
  },
  updateApplication: (id, status) => {
    const app = data.applications.find(a => a.id === id);
    if (app) {
      app.status = status;
      save();
    }
    return app;
  },

  // --- CHATS ---
  getChats: () => data.chats,
  getChat: (orderId) => data.chats[orderId] || [],
  addChatMessage: (orderId, sender, message) => {
    if (!data.chats[orderId]) data.chats[orderId] = [];
    data.chats[orderId].push({
      sender,
      message,
      timestamp: new Date().toISOString()
    });
    save();
    return data.chats[orderId];
  },

  // --- SITE CONFIG ---
  getSiteConfig: () => {
    if (!data.siteConfig) {
      data.siteConfig = {
        mainWallet: {
          orange: "01206510088",
          vodafone: "01206510088",
          etisalat: "01206510088",
          instapay: "adsagame@instapay",
          binance: "adsagame_pay_id"
        }
      };
      save();
    }
    return data.siteConfig;
  },
  updateSiteConfig: (updates) => {
    data.siteConfig = { ...data.siteConfig, ...updates };
    save();
    return data.siteConfig;
  }
};
