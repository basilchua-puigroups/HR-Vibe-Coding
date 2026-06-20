// Column mapping: Google Sheet column letter → production computed key
// Only list columns the app should fill. Skip formula columns entirely.
const COLUMN_MAP: Array<{ col: string; key: string }> = [
  { col: 'B', key: 'ffb_rec_t' },
  { col: 'C', key: 'ffb_rec_m' },
  { col: 'D', key: 'ffb_rec_y' },
  { col: 'H', key: 'ffb_proc_t' },
  { col: 'I', key: 'ffb_proc_m' },
  { col: 'J', key: 'ffb_proc_y' },
  { col: 'K', key: 'ffb_bal_o' },
  { col: 'L', key: 'ffb_bal_c' },
  { col: 'M', key: 'ffb_ramp' },
  { col: 'N', key: 'ramp_mtd' },
  { col: 'O', key: 'ramp_ytd' },
  { col: 'P', key: 'recv_cages_filled' },
  { col: 'Q', key: 'cages_avg' },
  { col: 'R', key: 'proc_start' },
  { col: 'S', key: 'proc_stop' },
  { col: 'T', key: 'press1' },
  { col: 'U', key: 'press2' },
  { col: 'V', key: 'press3' },
  { col: 'W', key: 'press4' },
  { col: 'X', key: 'press5' },
  { col: 'Y', key: 'press6' },
  { col: 'Z',  key: 'press7' },
  { col: 'AA', key: 'press_hr_t' },
  { col: 'AB', key: 'press_hr_m' },
  { col: 'AC', key: 'press_throughput' },
  { col: 'AD', key: 'press_eff' },
  { col: 'AE', key: 'turb_t' },
  { col: 'AF', key: 'turb_m' },
  { col: 'AG', key: 'turb_throughput' },
  { col: 'AH', key: 'rainfall' },
];

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64url(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function bufferToBase64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function pemToBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return buf;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.token;

  const clientEmail = import.meta.env.VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL as string;
  const rawKey = (import.meta.env.VITE_GOOGLE_PRIVATE_KEY as string).replace(/\\n/g, '\n');

  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss:   clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  }));

  const signingInput = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBuffer(rawKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${bufferToBase64url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const json = await res.json();
  if (!res.ok) throw new Error(`Google auth failed: ${json.error_description ?? json.error}`);

  cachedToken = { token: json.access_token, expiresAt: now + (json.expires_in ?? 3600) };
  return json.access_token;
}

function tabName(date: string): string {
  const [year, month] = date.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export async function pushProductionToSheet(
  date: string,
  computed: Record<string, string>,
): Promise<void> {
  const sheetId = import.meta.env.VITE_GOOGLE_SHEET_ID as string;
  if (!sheetId || sheetId === 'PASTE_YOUR_SHEET_ID_HERE') return;

  const day = parseInt(date.split('-')[2], 10);
  const row = 5 + day;
  const tab = tabName(date);

  const data = COLUMN_MAP
    .filter(({ key }) => (computed[key] ?? '') !== '')
    .map(({ col, key }) => ({
      range: `'${tab}'!${col}${row}`,
      values: [[computed[key]]],
    }));

  if (!data.length) return;

  const token = await getAccessToken();

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Sheets write failed: ${err}`);
  }
}
