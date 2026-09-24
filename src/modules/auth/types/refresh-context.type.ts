/** `request.user` after JwtRefreshGuard. The raw token is kept in memory only. */
export type RefreshContext = {
  userId: string;
  sessionId: string;
  refreshToken: string;
};
