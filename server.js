const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');

const { PORT } = require('./config');
const ws = require('./ws');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');
const friendRoutes = require('./routes/friends');
const notificationRoutes = require('./routes/notifications');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const server = http.createServer(app);
ws.init(server); // attaches the WebSocket server at /ws for real-time updates

server.listen(PORT, () => {
  console.log(`Social Network Platform running at http://localhost:${PORT}`);
});
