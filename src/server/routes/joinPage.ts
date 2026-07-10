import { JOIN_PAGE_LOGO_DATA_URI } from '#/server/routes/joinPageLogo.js';

/**
 * Display fields parsed from a Team Hub join link query string.
 */
export interface JoinPageQuery {
  /**
   * Invited user display name.
   */
  name: string;

  /**
   * Invited user role.
   */
  role: 'admin' | 'user';

  /**
   * ISO-8601 invitation expiry timestamp.
   */
  expiresAt: string;

  /**
   * Optional friendly hub label.
   */
  hubName: string | null;

  /**
   * Optional human-readable access summary.
   */
  accessSummary: string | null;

  /**
   * Team Hub base URL from the invite link.
   */
  baseUrl: string | null;
}

const HARBORCLIENT_DOWNLOAD_URL = 'https://harborclient.com/download';

/**
 * Escapes untrusted text for safe inclusion in HTML output.
 *
 * @param value - Raw string from a query parameter.
 * @returns HTML-escaped string.
 */
export function escapeJoinPageHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Parses and validates join-page query parameters from an incoming request.
 *
 * @param query - Raw Fastify query object.
 * @returns Parsed display fields, or null when required fields are missing.
 */
export function parseJoinPageQuery(query: Record<string, unknown>): JoinPageQuery | null {
  const name = typeof query.name === 'string' ? query.name.trim() : '';
  const role = typeof query.role === 'string' ? query.role.trim() : '';
  const expiresAt = typeof query.exp === 'string' ? query.exp.trim() : '';

  if (!name || (role !== 'admin' && role !== 'user') || !expiresAt) {
    return null;
  }

  const hubName = typeof query.hub === 'string' ? query.hub.trim() : '';
  const accessSummary = typeof query.access === 'string' ? query.access.trim() : '';
  const baseUrl = typeof query.url === 'string' ? query.url.trim().replace(/\/+$/, '') : '';

  return {
    name,
    role,
    expiresAt,
    hubName: hubName || null,
    accessSummary: accessSummary || null,
    baseUrl: baseUrl || null
  };
}

/**
 * Returns true when an invitation expiry timestamp is in the past.
 *
 * @param expiresAt - ISO-8601 expiry timestamp from the invite link.
 * @param now - Reference time, typically the current instant.
 */
export function isJoinInvitationExpired(expiresAt: string, now: Date = new Date()): boolean {
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) {
    return true;
  }

  return parsed <= now.getTime();
}

/**
 * Formats an ISO expiry timestamp for human-readable display.
 *
 * @param expiresAt - ISO-8601 expiry timestamp from the invite link.
 */
function formatExpiry(expiresAt: string): string {
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) {
    return expiresAt;
  }

  return new Date(parsed).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

/**
 * Builds the public HTML join landing page from validated query parameters.
 *
 * @param query - Parsed join-page query fields.
 * @returns Complete HTML document as a string.
 */
export function renderJoinPageHtml(query: JoinPageQuery): string {
  const expired = isJoinInvitationExpired(query.expiresAt);
  const safeName = escapeJoinPageHtml(query.name);
  const safeRole = escapeJoinPageHtml(query.role);
  const safeHub = escapeJoinPageHtml(query.hubName ?? 'Team Hub');
  const safeAccess = query.accessSummary ? escapeJoinPageHtml(query.accessSummary) : '';
  const safeExpiry = escapeJoinPageHtml(formatExpiry(query.expiresAt));
  const safeBaseUrl = query.baseUrl ? escapeJoinPageHtml(query.baseUrl) : '';

  const statusMessage = expired
    ? 'This invitation has expired. Ask your administrator to send a new invite link.'
    : 'Click the button below to open HarborClient and finish joining this Team Hub.';

  const accessRow = safeAccess
    ? `<p class="detail"><span class="label">Access</span><span>${safeAccess}</span></p>`
    : '';

  const hubRow = safeBaseUrl
    ? `<p class="detail"><span class="label">Server</span><span>${safeBaseUrl}</span></p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="no-referrer" />
  <meta name="color-scheme" content="light dark" />
  <title>Join ${safeHub}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f4f7fb;
      --card: #ffffff;
      --text: #0f172a;
      --muted: #475569;
      --border: #dbe4f0;
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --danger: #b91c1c;
      --shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0b1220;
        --card: #111827;
        --text: #e5eefc;
        --muted: #94a3b8;
        --border: #243044;
        --accent: #60a5fa;
        --accent-hover: #93c5fd;
        --danger: #fca5a5;
        --shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: radial-gradient(circle at top, rgba(37, 99, 235, 0.08), transparent 40%), var(--bg);
      color: var(--text);
      display: grid;
      place-items: center;
      padding: 24px;
    }
    main {
      width: min(100%, 560px);
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: var(--shadow);
      padding: 32px;
    }
    .logo {
      width: 220px;
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0 auto 24px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 1.75rem;
      text-align: center;
    }
    .subtitle {
      margin: 0 0 24px;
      text-align: center;
      color: var(--muted);
      line-height: 1.5;
    }
    .card {
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 24px;
      background: rgba(148, 163, 184, 0.06);
    }
    .detail {
      display: grid;
      grid-template-columns: 110px 1fr;
      gap: 8px 16px;
      margin: 0 0 12px;
      line-height: 1.5;
    }
    .detail:last-child { margin-bottom: 0; }
    .label {
      color: var(--muted);
      font-size: 0.92rem;
    }
    .expired {
      color: var(--danger);
      font-weight: 600;
    }
    .actions {
      display: grid;
      gap: 12px;
    }
    button, .button {
      appearance: none;
      border: none;
      border-radius: 12px;
      padding: 14px 18px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
    }
    .primary {
      background: var(--accent);
      color: #ffffff;
    }
    .primary:hover { background: var(--accent-hover); }
    .primary:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .secondary {
      background: transparent;
      color: var(--text);
      border: 1px solid var(--border);
    }
    .footnote {
      margin-top: 20px;
      color: var(--muted);
      font-size: 0.92rem;
      line-height: 1.5;
    }
    .error {
      color: var(--danger);
      min-height: 1.25rem;
      margin: 0 0 12px;
      font-size: 0.95rem;
    }
    noscript {
      display: block;
      margin-top: 16px;
      color: var(--danger);
    }
  </style>
</head>
<body>
  <main>
    <img class="logo" src="${JOIN_PAGE_LOGO_DATA_URI}" alt="HarborClient Team Hub" />
    <h1>Join ${safeHub}</h1>
    <p class="subtitle">${escapeJoinPageHtml(statusMessage)}</p>
    <section class="card" aria-label="Invitation details">
      <p class="detail"><span class="label">Invited as</span><span>${safeName}</span></p>
      <p class="detail"><span class="label">Role</span><span>${safeRole}</span></p>
      <p class="detail"><span class="label">Expires</span><span class="${expired ? 'expired' : ''}">${safeExpiry}</span></p>
      ${hubRow}
      ${accessRow}
    </section>
    <div class="actions">
      <p id="join-error" class="error" role="alert"></p>
      <button id="join-button" class="primary" type="button"${expired ? ' disabled' : ''}>Open in HarborClient</button>
      <button id="copy-button" class="secondary" type="button"${expired ? ' disabled' : ''}>Copy app link</button>
      <a class="button secondary" href="${HARBORCLIENT_DOWNLOAD_URL}">Download HarborClient</a>
    </div>
    <p class="footnote">
      If HarborClient is already installed, click the button above. You can also open HarborClient and choose
      <strong>File → Accept Team Hub Invite</strong>, then paste the full invite link you received.
    </p>
    <noscript>
      JavaScript is required to launch HarborClient from this page. Open HarborClient manually and use
      <strong>Team → Accept Team Hub Invite</strong>.
    </noscript>
  </main>
  <script>
    (function () {
      const expired = ${expired ? 'true' : 'false'};
      const joinButton = document.getElementById('join-button');
      const copyButton = document.getElementById('copy-button');
      const errorEl = document.getElementById('join-error');

      function buildDeepLink() {
        const fragment = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash);
        const code = fragment.get('code');
        if (!code || !code.startsWith('hbi_')) {
          return null;
        }

        const params = new URLSearchParams(window.location.search);
        params.set('code', code);
        return 'harborclient://team-hub/join?' + params.toString();
      }

      function showError(message) {
        if (errorEl) {
          errorEl.textContent = message;
        }
      }

      function launchApp() {
        const deepLink = buildDeepLink();
        if (!deepLink) {
          showError('This invite link is missing a valid invitation code.');
          return;
        }

        window.location.href = deepLink;
      }

      if (joinButton) {
        joinButton.addEventListener('click', launchApp);
      }

      if (copyButton) {
        copyButton.addEventListener('click', async function () {
          const deepLink = buildDeepLink();
          if (!deepLink) {
            showError('This invite link is missing a valid invitation code.');
            return;
          }

          try {
            await navigator.clipboard.writeText(deepLink);
            showError('');
            copyButton.textContent = 'Copied app link';
          } catch {
            showError('Could not copy the app link. Click Open in HarborClient instead.');
          }
        });
      }

      if (!expired && !buildDeepLink()) {
        showError('This invite link is missing a valid invitation code.');
        if (joinButton) joinButton.disabled = true;
        if (copyButton) copyButton.disabled = true;
      }
    })();
  </script>
</body>
</html>`;
}

/**
 * Builds a minimal invalid-invite HTML page when required query fields are missing.
 *
 * @returns HTML document explaining that the invite link is incomplete.
 */
export function renderInvalidJoinPageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="no-referrer" />
  <title>Invalid Team Hub invite</title>
  <style>
    body {
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #f4f7fb;
      color: #0f172a;
    }
    main {
      max-width: 520px;
      background: #ffffff;
      border: 1px solid #dbe4f0;
      border-radius: 16px;
      padding: 28px;
    }
  </style>
</head>
<body>
  <main>
    <h1>Invalid invite link</h1>
    <p>This Team Hub invite link is incomplete or malformed. Ask your administrator to send a fresh invite link.</p>
    <p><a href="${HARBORCLIENT_DOWNLOAD_URL}">Download HarborClient</a></p>
  </main>
</body>
</html>`;
}
