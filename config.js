/* =====================================================================
   Omni — config.js   ("keys" for going online)
   While FIREBASE_CONFIG is empty ({}), Omni is local-only: saved on this
   device, nothing sent anywhere. When it's filled in, Omni connects to
   that Firebase project (see README → "Going online with Firebase").

   Safe to put here (they are designed to be public in a web page):
      FIREBASE_CONFIG   – the "firebaseConfig" of your Firebase web app
                          (Firebase console → Project settings → Your apps).
                          The apiKey in it is NOT a secret: it only says which
                          project to talk to. firebase/firestore.rules is what
                          actually protects the data.
      GIF_API_KEY       – a Giphy or Tenor key (free).
      AI_ENDPOINT       – the web address of YOUR server function, NOT an AI key.
   NEVER put here: an OpenAI / AI API key, a Firebase "service account"
      JSON file, or any password. Anything in this file can be read by anyone
      who opens the app. The AI key lives on the server only.
   ===================================================================== */
// The app's name. Change it here to rename the app everywhere on screen
// (also change "name" and "short_name" in manifest.webmanifest for the installed app).
const APP_NAME = 'Omni';

const OMNI_CONFIG = {
  // Omni's Firebase project "omni-chat-kb26" (public web settings, not secrets)
  FIREBASE_CONFIG: {
    apiKey: 'AIzaSyBuHlseBCEQBlX_rVrXPQTYhxLhBOIcdBA',
    authDomain: 'omni-chat-kb26.firebaseapp.com',
    projectId: 'omni-chat-kb26',
    storageBucket: 'omni-chat-kb26.firebasestorage.app',
    messagingSenderId: '1069780378512',
    appId: '1:1069780378512:web:634fda6f56dfdca6d50915'
  },

  GIF_PROVIDER: 'giphy',   // 'giphy' or 'tenor'
  GIF_API_KEY: 'ImCOqz6XBkHy5uwGZE2pGJLub2bDZxJn',         // GIPHY: developers.giphy.com → Create an App → API key (Tenor: Google Cloud)

  AI_ENDPOINT: ''          // e.g. 'https://ask-omni-xxxx.a.run.app' (your own server function)
};
