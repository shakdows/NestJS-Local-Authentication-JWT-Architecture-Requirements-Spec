/** Client metadata stored on a session at login (AUTH_DATABASE §3.3). */
export type ClientContext = {
  ipAddress: string | null;
  userAgent: string | null;
};
