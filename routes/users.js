const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const { publicUser, areFriends, newId } = require('../helpers');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'uploads'),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `${newId()}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Current logged-in user's own profile
router.get('/me', authRequired, (req, res) => {
  const user = db.get('users').find({ id: req.userId }).value();
  res.json(publicUser(user));
});

// Update own profile: bio, avatar, privacy default for future posts
router.put('/me', authRequired, upload.single('avatar'), (req, res) => {
  const { bio, privacy } = req.body;
  const updates = {};
  if (typeof bio === 'string') updates.bio = bio;
  if (privacy && ['public', 'friends'].includes(privacy)) updates.privacy = privacy;
  if (req.file) updates.avatar = `/uploads/${req.file.filename}`;

  db.get('users').find({ id: req.userId }).assign(updates).write();
  const user = db.get('users').find({ id: req.userId }).value();
  res.json(publicUser(user));
});

// Search / list users (for finding people to friend)
router.get('/', authRequired, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const users = db.get('users')
    .filter(u => u.id !== req.userId && (!q || u.username.toLowerCase().includes(q)))
    .value()
    .map(publicUser);
  res.json(users);
});

// View another user's profile (respects nothing sensitive - bio/avatar are always public here,
// only POSTS are privacy-gated, matching the "privacy settings" requirement at content level)
router.get('/:id', authRequired, (req, res) => {
  const user = db.get('users').find({ id: req.params.id }).value();
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    ...publicUser(user),
    isFriend: areFriends(req.userId, user.id)
  });
});

module.exports = router;
