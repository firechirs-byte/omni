/* =====================================================================
   Omni — filter-words.js
   The DEFAULT word list for the family word filter (Settings → Safety).

   ⚠️ This file contains rude words and slurs on purpose: the filter needs
   to know what to hide. They are never shown in the app unless a parent
   unlocks the word editor with their PIN, and even then they're masked.

   - Write words in lowercase, letters only.
   - The filter already catches tricks like "fuuuck", "sh!t", "$hit",
     "f u c k" and "f.u.c.k", so you don't need to list those.
   - Words with 4+ letters also catch endings like -s, -ed, -er, -ing, -y.
     Put a ! at the end of a word to match ONLY that exact word
     (e.g. 'cock!' hides "cock" but still allows "cocky" or "cocker spaniel").
   - Parents can add or remove words in the app without editing this file.
   ===================================================================== */
const FILTER_WORDS = [
  // strong swear words
  'fuck', 'fuk', 'fck', 'fucking', 'fuckin', 'fucker', 'motherfucker', 'mofo', 'wtf', 'stfu',
  'shit', 'shite', 'bullshit', 'shithead', 'shitty',
  'cunt', 'twat', 'wank', 'wanker', 'bollocks', 'prick', 'knobhead',
  'bitch', 'bastard', 'asshole', 'arsehole', 'ass', 'arse', 'dick', 'dickhead', 'cock!', 'cocksucker',
  'pussy', 'tits', 'boobs', 'dildo', 'whore', 'slut', 'skank', 'douche', 'douchebag',
  'jackass', 'dumbass', 'piss', 'pissed', 'porn', 'horny', 'sexy', 'nudes',
  // milder words many families still prefer to filter
  'damn', 'goddamn', 'crap', 'bloody', 'bugger',
  // hateful slurs (always hidden)
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded', 'spastic', 'spaz', 'tranny', 'chink', 'paki', 'kike', 'wetback'
];
