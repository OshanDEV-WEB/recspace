# Deployment checklist

- [ ] Create Firebase project and enable Email/Password sign-in.
- [ ] Create Firestore database and publish `firestore.rules`.
- [ ] Fill `firebase-config.js` with your project's web app config.
- [ ] Preview locally with `python -m http.server 8000`.
- [ ] Create your account, then assign `role: "admin"` to your UID in Firestore.
- [ ] Deploy static files to Firebase Hosting, GitHub Pages or Cloudflare Pages.
- [ ] Add the deployed domain to Firebase Authentication authorized domains.
- [ ] Test a student account, an admin account, subject CRUD, YouTube playback and PDF links.
- [ ] Confirm student accounts cannot write subjects/lessons/notes in Firestore rules.
