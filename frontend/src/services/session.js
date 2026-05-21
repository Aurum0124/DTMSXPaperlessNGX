// Session management utility for user authentication (Laravel Sanctum)

const SESSION_KEY = 'pgin_session';
const ACTIVITY_KEY = 'pgin_last_activity';
const TOKEN_KEY = 'pgin_auth_token';
const USER_KEY = 'pgin_user';

export const sessionManager = {
  setUserSession(username, token, user) {
    localStorage.setItem(SESSION_KEY, username);
    localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  getAuthToken() {
    return localStorage.getItem(TOKEN_KEY);
  },
  getUser() {
    try {
      const u = localStorage.getItem(USER_KEY);
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },
  getUserSession() {
    return localStorage.getItem(SESSION_KEY);
  },
  clearSession() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  isSessionValid() {
    const user = localStorage.getItem(SESSION_KEY);
    const token = localStorage.getItem(TOKEN_KEY);
    const lastActivity = parseInt(localStorage.getItem(ACTIVITY_KEY), 10);
    if (!user || !token || isNaN(lastActivity)) return false;
    // Session expires after 8 hours of inactivity
    const now = Date.now();
    return now - lastActivity < 8 * 60 * 60 * 1000;
  },
  updateActivity() {
    localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
  },
  isAdmin() {
    const user = this.getUser();
    return user?.role === 'admin';
  },
}; 