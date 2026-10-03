/* =====================================================================
   Omni — config.js   ("keys" for going online)
   While SUPABASE_URL / SUPABASE_ANON_KEY are empty, Omni is local-only:
   saved on this device, nothing sent anywhere. When they're filled in,
   Omni connects to that Supabase project (see README → "Going online
   with Supabase"). Paste values in between the quotes.

   Safe to put here (they are designed to be public in a web page):
      SUPABASE_URL, SUPABASE_ANON_KEY  – your Supabase project's address
                                         and "anon / publishable" key.
                                         Row Level Security (schema.sql)
                                         is what actually protects the data.
      GIF_API_KEY                      – a Giphy or Tenor key (free).
      AI_ENDPOINT                      – the web address of YOUR server
                                         function (e.g. a Supabase Edge
                                         Function), NOT an AI key.
   NEVER put here: an OpenAI / AI API key, the Supabase "service_role"
      or "sb_secret_…" key, or any password. Anything in this file can be read by anyone
      who opens the app. The AI key lives on the server only.
   ===================================================================== */
// The app's name. Change it here to rename the app everywhere on screen
// (also change "name" and "short_name" in manifest.webmanifest for the installed app).
const APP_NAME = 'Omni';

const OMNI_CONFIG = {
  SUPABASE_URL: 'https://fvtecqhhigadclxcamyt.supabase.co',        // e.g. 'https://abcdefgh.supabase.co'
  SUPABASE_ANON_KEY: 'sb_publishable_FJNVZegXu_R9P2R_POq33g_h-uYViux',   // the "publishable" key (sb_publishable_…) or legacy "anon public" key

  GIF_PROVIDER: 'giphy',   // 'giphy' or 'tenor'
  GIF_API_KEY: 'ImCOqz6XBkHy5uwGZE2pGJLub2bDZxJn',         // GIPHY: developers.giphy.com → Create an App → API key (Tenor: Google Cloud)

  AI_ENDPOINT: ''          // e.g. 'https://abcdefgh.supabase.co/functions/v1/ask-omni'
};
