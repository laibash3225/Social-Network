const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config');

// Map of userId -> Set of open sockets (a user may have multiple tabs/devices)
const connections = new Map();

function init(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (socket, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    let userId;
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      userId = payload.id;
    } catch (err) {
      socket.close(4001, 'Unauthorized');
      return;
    }

    if (!connections.has(userId)) connections.set(userId, new Set());
    connections.get(userId).add(socket);

    socket.send(JSON.stringify({ type: 'connected', message: 'Realtime connection established' }));

    socket.on('close', () => {
      const set = connections.get(userId);
      if (set) {
        set.delete(socket);
        if (set.size === 0) connections.delete(userId);
      }
    });
  });

  return wss;
}

// Send a JSON event to every open socket belonging to a given user
function sendToUser(userId, event) {
  const set = connections.get(userId);
  if (!set) return;
  const payload = JSON.stringify(event);
  for (const socket of set) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
    }
  }
}

// Send a JSON event to a list of user ids
function sendToUsers(userIds, event) {
  for (const id of userIds) sendToUser(id, event);
}

function isOnline(userId) {
  return connections.has(userId) && connections.get(userId).size > 0;
}

module.exports = { init, sendToUser, sendToUsers, isOnline };
