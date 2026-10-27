// Where the game server lives. On the static site (which never sleeps) the page talks to the
// web service; anywhere else (local dev, or the web service serving the page) it uses its own origin.
const STATIC_HOST = 'circle-party.onrender.com';
const SERVER = 'https://circle-party-server.onrender.com';

export const SERVER_URL = location.hostname === STATIC_HOST ? SERVER : '';
