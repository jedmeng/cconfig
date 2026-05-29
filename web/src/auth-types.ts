export type AuthMeResponse =
  | { oidcEnabled: false }
  | {
      oidcEnabled: true;
      username: string;
      email?: string;
      avatarUrl: string;
    };

export function isOidcAuthActive(me: AuthMeResponse): me is Extract<AuthMeResponse, { oidcEnabled: true }> {
  return me.oidcEnabled && Boolean(me.username);
}
