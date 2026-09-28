const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { newId, publicUser } = require('../helpers');
const { JWT_SECRET } = require('../config');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.get('users')
    .find(u => u.email === email || u.username === username)
    .value();
  if (existing) {
    return res.status(409).json({ error: 'Username or email already in use' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: newId(),
    username,
    email,
    passwordHash,
    bio: '',
    avatar: null,
    privacy: 'public', // default post visibility: 'public' | 'friends'
    createdAt: new Date().toISOString()
  };
  db.get('users').push(user).write();

  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ token, user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = db.get('users').find(u => u.email === email).value();
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: publicUser(user) });
});

module.exports = router;
