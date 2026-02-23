export const AUTH_CONSTANTS = {
  // Maximum number of concurrent sessions allowed per user
  MAX_CONCURRENT_SESSIONS: 10,

  // Token storage keys
  ACCESS_TOKEN_KEY: 'accessToken',
  REFRESH_TOKEN_KEY: 'refreshToken',

  // Token expiration times in milliseconds
  ACCESS_TOKEN_EXPIRATION: 60 * 60 * 1000, // 1 hour
  REFRESH_TOKEN_EXPIRATION: 7 * 24 * 60 * 60 * 1000, // 7 days
};
