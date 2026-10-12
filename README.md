# ClassSpace LMS

A responsive, iOS-inspired Liquid Glass learning hub built with HTML, CSS and JavaScript. It supports separate student/admin access, subject management, YouTube class recordings, PDF resource links, and per-student watch-time/progress records.

## What's included

- `index.html` — authentication screen, student dashboard, recordings, subjects, notes, progress, admin studio and video player
- `styles.css` — responsive dark glass UI, gradient artwork, cards, mobile layout and reduced-motion support
- `app.js` — Firebase authentication, Firestore CRUD, YouTube player and progress tracking
- `firebase-config.js` — Firebase web app configuration placeholders
- `firestore.rules` — starter Firestore Security Rules
- `firebase.json` — Firebase Hosting config
- `.nojekyll` — makes static hosting deployment easier
- `DEPLOYMENT.md` — short deployment checklist

## 1. Preview locally (no Firebase required)

For the demo UI, you can use a static local server. ES modules are normally blocked from `file://`, so do not open `index.html` by double-clicking.

Python (if installed):
```bash
python -m http.server 8000
```
Then visit `http://localhost:8000`.

Choose **Explore as student** or **Preview admin**. Demo content and demo watch progress are stored only in that browser. This mode is only for preview; it is not secure authentication and must not be used for real student data.

## 2. Configure secure Firebase authentication and database

1. Create a project at https://console.firebase.google.com/ (the free Spark plan is sufficient for an initial small class, subject to quotas).
2. In **Build → Authentication → Get started**, enable **Email/Password**.
3. In **Project settings → General → Your apps**, create a Web app and copy its Firebase config.
4. Replace the `YOUR_...` placeholders in `firebase-config.js` with the exact config from Firebase.
5. In **Build → Firestore Database**, create a database. Choose a location close to your students if available.
6. Open Firestore **Rules**, paste the contents of `firestore.rules`, and publish the rules.
7. In Authentication → Settings → Authorized domains, ensure your deployed hostname is allowed.
8. Deploy the site using Firebase Hosting or Cloudflare Pages / GitHub Pages. Firebase Hosting is convenient because it is in the same Firebase project.

Firebase web config is not a server secret; the security boundary is Authentication plus Firestore Rules. Never put service-account JSON or private server keys in this frontend.

## 3. Create the first administrator

The app intentionally never allows a visitor to self-assign the admin role.

1. Start the site with Firebase configured.
2. Create your personal account through **Create account**.
3. In Firebase Console → Authentication, open that user and copy their UID.
4. In Firestore, create a document in the `users` collection whose document ID is exactly that UID.
5. Add fields:
   - `uid` (string): same UID
   - `email` (string): your account email
   - `displayName` (string): your name
   - `role` (string): `admin`
   - `createdAt` (number): current Unix time in milliseconds
6. Sign out and sign in again. The Admin studio navigation should appear.

Do not make the role field editable by students. The included rules prevent a user from changing their own role. Admins can manage content, but this starter does not include a UI to promote other admins.

## 4. Add content

- **Subjects:** Admin studio → Subjects → Add subject.
- **Recordings:** Admin studio → Recordings → Add recording. Paste a YouTube watch URL, e.g. `https://www.youtube.com/watch?v=VIDEO_ID`. Public and unlisted videos can generally be embedded if embedding is allowed by the owner. Private videos won't play for students.
- **PDF notes:** Admin studio → PDF notes → Add PDF note. Paste a publicly reachable HTTPS URL to the PDF. This starter stores a link only; it does not upload PDFs or enforce private PDF access.

Use videos and PDFs you own or have permission to distribute. YouTube ads, embed restrictions and owner settings are controlled by YouTube and the video owner.

## 5. Watch time — important limitations

The player uses YouTube IFrame API playback-state events and periodically records seconds while the video is playing. Records are saved per signed-in user's `users/{uid}/progress/{lessonId}` document. The progress display is a helpful estimate, not proctored attendance: browser tabs can be suspended, a learner can manipulate their own client, and YouTube playback outside this site is not tracked. For stronger attendance guarantees, use a server-validated video platform and server-side event validation.

## 6. Free hosting choices

### Firebase Hosting (easy path)
Install Node.js, then:
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Choose the existing Firebase project and use this folder as the public directory.
firebase deploy
```
If the CLI setup asks about a single-page app, choose **No** (this is a static multi-file site). `firebase.json` is included as a starting config.

### GitHub Pages / Cloudflare Pages
Upload these frontend files to a repository and publish the root folder. Add your deployed domain to Firebase Authentication's authorized domains. Keep the Firestore rules published from `firestore.rules`. GitHub Pages is static hosting only; Firebase remains the backend.

## 7. Free-tier / production notes

- Firebase Spark quotas and availability can change; check current Firebase pricing and quotas before launch.
- Firestore reads/writes are billable if you exceed the free quota or use a paid plan.
- PDFs are linked from external storage in this version. Use a suitable storage provider if you need uploads. Firebase Storage has its own plan, billing and security considerations; do not assume unlimited free file storage.
- The starter uses Firebase JS SDK 10.12.2 via Google's CDN. Keep dependencies updated when maintaining the project.
- Configure Firebase App Check, backups, monitoring and privacy/consent notices before collecting data from a real class.
- For private class materials, do not use public PDF links; use authenticated file storage with matching access rules.
- This starter is a useful baseline, not a compliance-certified or tamper-proof attendance system.

## Troubleshooting

- **Firebase won't start:** confirm all config values are filled and the Firebase project ID matches.
- **Permission denied:** verify Firestore rules are published and your own user document has `role: "admin"` if using Admin studio.
- **Login fails:** confirm Email/Password is enabled in Firebase Authentication.
- **Video won't play:** check that the URL is a valid YouTube URL and that the owner allows embedding. Some videos block embedded playback.
- **Demo content missing:** use the demo buttons while Firebase config placeholders remain unchanged.
