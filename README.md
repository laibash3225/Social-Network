# Nook — Social Network Platform (Task 4)

A full-fledged social networking platform built for Arch Technologies' Web
Development internship, Month 2, Task 4.

## Features

- **User accounts** — register/login with hashed passwords (bcrypt) and JWT sessions
- **Profiles** — bio, profile photo, and a default post-privacy setting
- **Posts** — text and/or image, each post can be Public or Friends-only
- **Comments & likes** — on any post you're allowed to view
- **Friend requests** — send, accept, decline; friends-only content unlocks once accepted
- **Real-time updates (WebSockets)** — new posts, likes, comments, friend requests and
  friend acceptances are pushed live to connected users, no page refresh needed
- **Notifications** — persisted history plus live delivery over the socket
- **Privacy settings** — per-post and a per-profile default (Public / Friends only)
- **Multimedia sharing** — image upload on posts and on the profile avatar

## Tech stack

- **Backend:** Node.js, Express, `ws` (WebSocket server), JWT auth, bcrypt password
  hashing, Multer for image uploads, lowdb (JSON file) for storage
- **Frontend:** Vanilla HTML/CSS/JS single-page app (no build step) that talks to the
  REST API and keeps a live WebSocket connection open for real-time updates

## Project structure

```
social-network/
├── server.js              # Express app + HTTP server + WebSocket wiring
├── ws.js                  # WebSocket connection manager (auth, broadcast helpers)
├── db.js                  # lowdb JSON database setup
├── helpers.js              # shared helpers (ids, privacy checks, notifications)
├── config.js               # JWT secret / port
├── middleware/
│   └── auth.js             # JWT verification middleware
├── routes/
│   ├── auth.js              # register / login
│   ├── users.js             # profile view/update, user search
│   ├── posts.js              # feed, create/like/comment/delete posts
│   ├── friends.js            # friend requests, accept/decline, friend list
│   └── notifications.js       # notification history, mark as read
├── public/
│   ├── index.html            # app shell (auth screen + main app)
│   ├── css/style.css          # styling
│   └── js/app.js              # all frontend logic (API calls + WebSocket handling)
└── uploads/                    # uploaded images (post media, avatars) — created at runtime
```

## Running it

Requires Node.js 18+.

```bash
npm install
npm start
```

Then open **http://localhost:3000** in two different browsers (or one normal + one
incognito window) to register two accounts and see the real-time features in action:
send a friend request from one account and watch the notification arrive instantly
on the other, or like/comment on a post and watch the counts update live without a
refresh.

The server listens on port 3000 by default (override with the `PORT` environment
variable). Data is stored in `db.json`, created automatically on first run.

## How the real-time layer works

Every browser tab opens a WebSocket connection to `/ws?token=<JWT>` right after
login. The server verifies the token and keeps a map of `userId → open sockets`
(`ws.js`). Whenever a route handler causes something another user should know
about immediately — a new post from a friend, a like, a comment, a friend
request, a friend acceptance — it calls `sendToUser(s)` to push a small JSON
event straight down that user's open socket(s). The frontend listens for these
events and patches the DOM in place (updates a like counter, appends a comment,
shows a toast, bumps the notification badge) instead of polling or reloading.

## Notes on scope

This is a working, runnable demo built to demonstrate the required functionality
end-to-end (profiles, posts, comments, likes, friend requests, real-time updates
via WebSockets, notifications, privacy settings, multimedia sharing) rather than
a production deployment. For production use you'd want things like: a real
database instead of a JSON file, refresh tokens, rate limiting, image
resizing/CDN storage, and HTTPS/WSS termination in front of the server.
