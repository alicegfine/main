// Environment configuration, validated once at boot so a misconfigured
// deploy fails loudly on Railway instead of erroring on the first request.

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

// The service account key is pasted into Railway as one JSON blob. Railway
// preserves real newlines, but some shells and copy/paste paths turn them into
// literal "\n" inside the private key, which breaks the JWT signer.
function parseServiceAccount(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the entire downloaded key file as a single value.'
    );
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.');
  }
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  return parsed;
}

export const config = {
  port: Number(optional('PORT', 3000)),
  baseUrl: required('BASE_URL').replace(/\/+$/, ''),
  sessionSecret: required('SESSION_SECRET'),

  // Only addresses on this Workspace domain may sign in. Enforced against the
  // verified `hd` claim on the Google ID token, not on the email string.
  allowedDomain: required('ALLOWED_DOMAIN').toLowerCase(),

  databaseUrl: required('DATABASE_URL'),

  google: {
    clientId: required('GOOGLE_OAUTH_CLIENT_ID'),
    clientSecret: required('GOOGLE_OAUTH_CLIENT_SECRET'),
    serviceAccount: parseServiceAccount(required('GOOGLE_SERVICE_ACCOUNT_JSON')),
  },

  // The shared "DC Office" calendar the board mirrors into. Created by hand in
  // Google Calendar, shared with the service account as "Make changes to
  // events", and shared with the domain as "See all event details".
  officeCalendarId: required('OFFICE_CALENDAR_ID'),

  timezone: optional('OFFICE_TIMEZONE', 'America/New_York'),
  officeName: optional('OFFICE_NAME', 'DC Office'),

  // Weeks shown on the board, starting with the current week.
  weeksShown: Number(optional('WEEKS_SHOWN', 2)),

  isProduction: process.env.NODE_ENV === 'production',
};

export const SESSION_COOKIE = 'dcoffice_session';
export const OAUTH_STATE_COOKIE = 'dcoffice_oauth_state';
