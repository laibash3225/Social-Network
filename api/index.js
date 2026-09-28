const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('../routes/auth');
const userRoutes = require('../routes/users');
const postRoutes = require('../routes/posts');
const friendRoutes = require('../routes/friends');
const notificationRoutes = require('../routes/notifications');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use(express.static(path.join(process.cwd(), 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

module.exports = app;