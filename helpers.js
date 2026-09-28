const crypto = require('crypto');
const db = require('./db');

function newId() {
  return crypto.randomBytes(9).toString('hex');
}

// Strip sensitive fields before sending a user object to the client
function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function areFriends(userA, userB) {
  return !!db.get('friendships')
    .find(f =>
      (f.userA === userA && f.userB === userB) ||
      (f.userA === userB && f.userB === userA)
    )
    .value();
}

function getFriendIds(userId) {
  return db.get('friendships')
    .filter(f => f.userA === userId || f.userB === userId)
    .map(f => (f.userA === userId ? f.userB : f.userA))
    .value();
}

// Can `viewerId` see a piece of content owned by `ownerId` with the given privacy setting?
function canView(viewerId, ownerId, privacy) {
  if (viewerId === ownerId) return true;
  if (privacy === 'public') return true;
  if (privacy === 'friends') return areFriends(viewerId, ownerId);
  return false;
}

function createNotification({ userId, type, fromUserId, postId, message }) {
  const notification = {
    id: newId(),
    userId,
    type,
    fromUserId,
    postId: postId || null,
    message,
    read: false,
    createdAt: new Date().toISOString()
  };
  db.get('notifications').push(notification).write();
  return notification;
}

module.exports = { newId, publicUser, areFriends, getFriendIds, canView, createNotification };
