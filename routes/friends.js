const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const { newId, publicUser, areFriends, createNotification } = require('../helpers');
const ws = require('../ws');

const router = express.Router();

// Send a friend request
router.post('/request/:userId', authRequired, (req, res) => {
  const targetId = req.params.userId;
  if (targetId === req.userId) {
    return res.status(400).json({ error: "You can't friend yourself" });
  }
  const target = db.get('users').find({ id: targetId }).value();
  if (!target) return res.status(404).json({ error: 'User not found' });

  if (areFriends(req.userId, targetId)) {
    return res.status(409).json({ error: 'Already friends' });
  }
  const existing = db.get('friendRequests')
    .find(r => r.status === 'pending' &&
      ((r.from === req.userId && r.to === targetId) || (r.from === targetId && r.to === req.userId)))
    .value();
  if (existing) {
    return res.status(409).json({ error: 'A pending request already exists' });
  }

  const request = {
    id: newId(),
    from: req.userId,
    to: targetId,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  db.get('friendRequests').push(request).write();

  const sender = db.get('users').find({ id: req.userId }).value();
  const notif = createNotification({
    userId: targetId,
    type: 'friend_request',
    fromUserId: req.userId,
    message: `${sender.username} sent you a friend request`
  });
  ws.sendToUser(targetId, { type: 'notification', notification: notif });
  ws.sendToUser(targetId, { type: 'friend_request', request });

  res.status(201).json(request);
});

// Accept a friend request
router.post('/accept/:requestId', authRequired, (req, res) => {
  const reqRef = db.get('friendRequests').find({ id: req.params.requestId });
  const request = reqRef.value();
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.to !== req.userId) return res.status(403).json({ error: 'Not your request to accept' });
  if (request.status !== 'pending') return res.status(409).json({ error: 'Request already resolved' });

  reqRef.assign({ status: 'accepted' }).write();
  db.get('friendships').push({
    userA: request.from,
    userB: request.to,
    createdAt: new Date().toISOString()
  }).write();

  const accepter = db.get('users').find({ id: req.userId }).value();
  const notif = createNotification({
    userId: request.from,
    type: 'friend_accept',
    fromUserId: req.userId,
    message: `${accepter.username} accepted your friend request`
  });
  ws.sendToUser(request.from, { type: 'notification', notification: notif });
  ws.sendToUser(request.from, { type: 'friend_accepted', userId: req.userId });

  res.json({ accepted: true });
});

// Decline a friend request
router.post('/decline/:requestId', authRequired, (req, res) => {
  const reqRef = db.get('friendRequests').find({ id: req.params.requestId });
  const request = reqRef.value();
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.to !== req.userId) return res.status(403).json({ error: 'Not your request to decline' });
  if (request.status !== 'pending') return res.status(409).json({ error: 'Request already resolved' });

  reqRef.assign({ status: 'declined' }).write();
  res.json({ declined: true });
});

// Incoming pending requests
router.get('/requests', authRequired, (req, res) => {
  const requests = db.get('friendRequests')
    .filter({ to: req.userId, status: 'pending' })
    .value()
    .map(r => ({ ...r, from: publicUser(db.get('users').find({ id: r.from }).value()) }));
  res.json(requests);
});

// List of friends
router.get('/', authRequired, (req, res) => {
  const friendships = db.get('friendships')
    .filter(f => f.userA === req.userId || f.userB === req.userId)
    .value();
  const friends = friendships.map(f => {
    const otherId = f.userA === req.userId ? f.userB : f.userA;
    return publicUser(db.get('users').find({ id: otherId }).value());
  });
  res.json(friends);
});

module.exports = router;
