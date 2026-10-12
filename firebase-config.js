// Replace the placeholder values with your Firebase project's web-app config.
// Firebase Console -> Project settings -> General -> Your apps -> SDK setup.
export const firebaseConfig = {
 apiKey: "AIzaSyCrFb9CwW0KGmg9bQ_06LoOH8p8QF0SUws",
    authDomain: "class-space-c2bd7.firebaseapp.com",
    projectId: "class-space-c2bd7",
    storageBucket: "class-space-c2bd7.firebasestorage.app",
    messagingSenderId: "558525434644",
    appId: "1:558525434644:web:ad060fae58df5be7f9d001"
};
export const isFirebaseConfigured = !Object.values(firebaseConfig).some(
  value => !value || value.startsWith("YOUR_")
);
