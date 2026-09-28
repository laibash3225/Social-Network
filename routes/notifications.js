const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const { publicUser } = require('../helpers');

const router = express.Router();

router.get('/', authRequired, (req, res) => {
  const notifications = db.get('notifications')
    .filter({ userId: req.userId })
    .orderBy('createdAt', 'desc')
    .value()
    .map(n => ({
      ...n,
      fromUser: publicUser(db.get('users').find({ id: n.fromUserId }).value())
    }));
  res.json(notifications);
});

router.post('/:id/read', authRequired, (req, res) => {
  const notifRef = db.get('notifications').find({ id: req.params.id, userId: req.userId });
  if (!notifRef.value()) return res.status(404).json({ error: 'Notification not found' });
  notifRef.assign({ read: true }).write();
  res.json({ read: true });
});

router.post('/read-all', authRequired, (req, res) => {
  db.get('notifications')
    .filter({ userId: req.userId, read: false })
    .each(n => { n.read = true; })
    .write();
  res.json({ ok: true });
});

module.exports = router;
