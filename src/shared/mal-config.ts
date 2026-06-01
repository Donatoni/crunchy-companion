/**
 * MyAnimeList API client baked into the extension.
 *
 * Register ONE app at https://myanimelist.net/apiconfig:
 *   - App Type:          Other   (public client — no client secret)
 *   - App Redirect URL:  https://jcfmdllkakmjkihgphmmimhiehcbbfei.chromiumapp.org/
 *
 * Then paste the generated Client ID below. Every user just clicks
 * "Connect MyAnimeList" and logs into their own account — no per-user setup.
 *
 * A client ID is not a secret in OAuth public-client (PKCE) flows, so it's safe
 * to ship in the bundle.
 */
export const MAL_CLIENT_ID = '9bb4b1bb5cdb9697b154bc9739f9e607';
