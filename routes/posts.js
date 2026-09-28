const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const { newId, publicUser, canView, getFriendIds, createNotification } = require('../helpers');
const ws = require('../ws');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'uploads'),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `${newId()}${ext}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 }
});

function shapePost(post, viewerId) {
  const author = db.get('users').find({ id: post.userId }).value();
  return {
    id: post.id,
    text: post.text,
    image: post.image,
    privacy: post.privacy,
    createdAt: post.createdAt,
    author: publicUser(author),
    likeCount: post.likes.length,
    likedByMe: post.likes.includes(viewerId),
    comments: post.comments.map(c => ({
      ...c,
      author: publicUser(db.get('users').find({ id: c.userId }).value())
    }))
  };
}

// Create a new post (text + optional image), privacy defaults to the user's profile setting
router.post('/', authRequired, upload.single('image'), (req, res) => {
  const { text, privacy } = req.body;
  if (!text && !req.file) {
    return res.status(400).json({ error: 'Post must include text or an image' });
  }
  const author = db.get('users').find({ id: req.userId }).value();

  const post = {
    id: newId(),
    userId: req.userId,
    text: text || '',
    image: req.file ? `/uploads/${req.file.filename}` : null,
    privacy: privacy && ['public', 'friends'].includes(privacy) ? privacy : author.privacy,
    likes: [],
    comments: [],
    createdAt: new Date().toISOString()
  };
  db.get('posts').push(post).write();

  // Push the new post in real time to the author's friends who are online
  const shaped = shapePost(post, req.userId);
  const friendIds = getFriendIds(req.userId);
  ws.sendToUsers(friendIds, { type: 'new_post', post: shaped });

  res.status(201).json(shaped);
});

// Feed: own posts + friends' posts, respecting each post's privacy setting
router.get('/feed', authRequired, (req, res) => {
  const friendIds = new Set(getFriendIds(req.userId));
  const posts = db.get('posts')
    .filter(p => p.userId === req.userId || friendIds.has(p.userId))
    .filter(p => canView(req.userId, p.userId, p.privacy))
    .orderBy('createdAt', 'desc')
    .value();
  res.json(posts.map(p => shapePost(p, req.userId)));
});

// Posts belonging to a specific user's profile
router.get('/user/:id', authRequired, (req, res) => {
  const posts = db.get('posts')
    .filter(p => p.userId === req.params.id)
    .filter(p => canView(req.userId, p.userId, p.privacy))
    .orderBy('createdAt', 'desc')
    .value();
  res.json(posts.map(p => shapePost(p, req.userId)));
});

// Toggle like on a post, notify the owner in real time
router.post('/:id/like', authRequired, (req, res) => {
  const postRef = db.get('posts').find({ id: req.params.id });
  const post = postRef.value();
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!canView(req.userId, post.userId, post.privacy)) {
    return res.status(403).json({ error: 'Not allowed to view this post' });
  }

  const idx = post.likes.indexOf(req.userId);
  let liked;
  if (idx === -1) {
    post.likes.push(req.userId);
    liked = true;
  } else {
    post.likes.splice(idx, 1);
    liked = false;
  }
  postRef.assign({ likes: post.likes }).write();

  if (liked && post.userId !== req.userId) {
    const liker = db.get('users').find({ id: req.userId }).value();
    const notif = createNotification({
      userId: post.userId,
      type: 'like',
      fromUserId: req.userId,
      postId: post.id,
      message: `${liker.username} liked your post`
    });
    ws.sendToUser(post.userId, { type: 'notification', notification: notif });
  }

  ws.sendToUsers([post.userId, ...post.likes], {
    type: 'post_updated',
    postId: post.id,
    likeCount: post.likes.length
  });

  res.json({ liked, likeCount: post.likes.length });
});

// Add a comment, notify the owner in real time
router.post('/:id/comment', authRequired, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Comment text is required' });
  }
  const postRef = db.get('posts').find({ id: req.params.id });
  const post = postRef.value();
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!canView(req.userId, post.userId, post.privacy)) {
    return res.status(403).json({ error: 'Not allowed to view this post' });
  }

  const comment = { id: newId(), userId: req.userId, text: text.trim(), createdAt: new Date().toISOString() };
  post.comments.push(comment);
  postRef.assign({ comments: post.comments }).write();

  if (post.userId !== req.userId) {
    const commenter = db.get('users').find({ id: req.userId }).value();
    const notif = createNotification({
      userId: post.userId,
      type: 'comment',
      fromUserId: req.userId,
      postId: post.id,
      message: `${commenter.username} commented on your post`
    });
    ws.sendToUser(post.userId, { type: 'notification', notification: notif });
  }

  const shapedComment = { ...comment, author: publicUser(db.get('users').find({ id: req.userId }).value()) };
  ws.sendToUsers([post.userId], { type: 'new_comment', postId: post.id, comment: shapedComment });

  res.status(201).json(shapedComment);
});

// Delete own post
router.delete('/:id', authRequired, (req, res) => {
  const post = db.get('posts').find({ id: req.params.id }).value();
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.userId !== req.userId) return res.status(403).json({ error: 'You can only delete your own posts' });

  db.get('posts').remove({ id: req.params.id }).write();
  res.json({ deleted: true });
});

module.exports = router;
