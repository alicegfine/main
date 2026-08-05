import {
  DAYS,
  DAY_START_MIN,
  DAY_END_MIN,
  MAX_NAME_LENGTH,
  formatRange,
  formatDuration,
  formatTime,
} from './retreat.js';
import { escapeHtml, renderMarkdown } from './markdown.js';
import { ADMIN_USERNAME, signInEnabled } from './auth.js';
import { isSamePerson } from './visitor.js';

const SITE_TITLE = 'Jhana Noting Retreat — August 2026';
const SPIEL_TITLE = 'The spiel';

function layout({ title, activeNav, isAdmin, visitorName, notice, error, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · ${escapeHtml(SITE_TITLE)}</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header class="site-header">
    <a class="wordmark" href="/">${escapeHtml(SITE_TITLE)}</a>
    <nav>
      <a href="/"${activeNav === 'schedule' ? ' aria-current="page"' : ''}>Schedule</a>
      <a href="/the-spiel"${activeNav === 'spiel' ? ' aria-current="page"' : ''}>${escapeHtml(SPIEL_TITLE)}</a>
      ${
        visitorName
          ? `<form method="post" action="/visitor/clear" class="inline-form">
               <span class="whoami">You are <strong>${escapeHtml(visitorName)}</strong></span>
               <button type="submit" class="link-button">not you?</button>
             </form>`
          : ''
      }
      ${
        isAdmin
          ? `<form method="post" action="/signout" class="inline-form">
               <span class="whoami">Editing as ${escapeHtml(ADMIN_USERNAME)}</span>
               <button type="submit" class="link-button">Sign out</button>
             </form>`
          : signInEnabled
            ? '<a href="/signin">Sign in</a>'
            : ''
      }
    </nav>
  </header>

  <main>
    ${error ? `<p class="banner banner-error" role="alert">${escapeHtml(error)}</p>` : ''}
    ${notice ? `<p class="banner banner-notice">${escapeHtml(notice)}</p>` : ''}
    ${body}
  </main>

  <footer class="site-footer">
    <p>Friday 7 – Monday 10 August 2026. All times Eastern.</p>
  </footer>
</body>
</html>`;
}

function namePrompt() {
  return `<section class="name-gate">
    <h2>What's your name?</h2>
    <p>Everyone puts in a name before signing up or adding a session, so the
      schedule shows who is where. It is stored on this device only — no account,
      no password.</p>
    <form method="post" action="/visitor" class="name-gate-form">
      <label class="visually-hidden" for="visitor-name">Your name</label>
      <input
        id="visitor-name"
        name="name"
        type="text"
        placeholder="Your name"
        maxlength="${MAX_NAME_LENGTH}"
        autocomplete="name"
        required
        autofocus
      />
      <button type="submit">Continue</button>
    </form>
  </section>`;
}

function nameList(signups, { visitorName, isAdmin }) {
  const items = signups
    .map((signup) => {
      const mine = isSamePerson(signup.name, visitorName);
      const canRemove = mine || isAdmin;
      return `<li${mine ? ' class="mine"' : ''}>
        <span>${escapeHtml(signup.name)}</span>
        ${
          canRemove
            ? `<form method="post" action="/signups/${signup.id}/delete" class="inline-form">
                 <button type="submit" class="link-button subtle" title="Remove ${escapeHtml(signup.name)}">remove</button>
               </form>`
            : ''
        }
      </li>`;
    })
    .join('');
  return `<ul class="name-list">${items}</ul>`;
}

function signupControls(block, { visitorName }) {
  if (!visitorName) {
    return `<p class="signup-hint">Put in your name at the top of the page to sign up.</p>`;
  }

  const leading = block.leading.some((s) => isSamePerson(s.name, visitorName));
  const attending = block.attending.some((s) => isSamePerson(s.name, visitorName));

  if (leading && attending) {
    return `<p class="signup-hint">You are leading this session and on the attending list.</p>`;
  }

  const buttons = [];
  if (!leading) {
    buttons.push(`<form method="post" action="/signups" class="inline-form">
      <input type="hidden" name="block_id" value="${block.id}" />
      <input type="hidden" name="role" value="leading" />
      <button type="submit" class="secondary">I'll lead this</button>
    </form>`);
  }
  if (!attending) {
    buttons.push(`<form method="post" action="/signups" class="inline-form">
      <input type="hidden" name="block_id" value="${block.id}" />
      <input type="hidden" name="role" value="attending" />
      <button type="submit">I'll attend</button>
    </form>`);
  }

  const status = leading
    ? '<p class="signup-hint">You are leading this session.</p>'
    : attending
      ? '<p class="signup-hint">You are on the attending list.</p>'
      : '';

  return `${status}<div class="signup-actions">${buttons.join('')}</div>`;
}

function blockCard(block, ctx) {
  const leaders =
    block.leading.length > 0
      ? nameList(block.leading, ctx)
      : '<p class="empty-role">No one leading yet</p>';

  const attendees =
    block.attending.length > 0
      ? nameList(block.attending, ctx)
      : '<p class="empty-role">No one signed up yet</p>';

  const canDelete = Boolean(ctx.visitorName) || ctx.isAdmin;

  return `<article class="block">
    <div class="block-head">
      <div>
        <h3>${escapeHtml(formatRange(block.start_min, block.end_min))}</h3>
        <p class="duration">${escapeHtml(formatDuration(block.start_min, block.end_min))}</p>
      </div>
      ${
        canDelete
          ? `<form method="post" action="/blocks/${block.id}/delete" class="inline-form">
               <button type="submit" class="link-button subtle">Delete session</button>
             </form>`
          : ''
      }
    </div>

    <div class="roles">
      <section>
        <h4>Leading</h4>
        ${leaders}
      </section>
      <section>
        <h4>Attending <span class="count">${block.attending.length}</span></h4>
        ${attendees}
      </section>
    </div>

    <div class="signup-bar">${signupControls(block, ctx)}</div>
  </article>`;
}

function addBlockForm(day, { visitorName }) {
  if (!visitorName) return '';
  return `<form method="post" action="/blocks" class="add-block">
    <input type="hidden" name="day" value="${escapeHtml(day.date)}" />
    <div class="field">
      <label for="start-${day.date}">Start</label>
      <input id="start-${day.date}" name="start" type="time" value="08:00" required />
    </div>
    <div class="field">
      <label for="end-${day.date}">End</label>
      <input id="end-${day.date}" name="end" type="time" value="09:00" required />
    </div>
    <button type="submit" class="secondary">Add a session</button>
  </form>`;
}

export function schedulePage({ schedule, isAdmin, visitorName, notice, error }) {
  const ctx = { isAdmin, visitorName };
  const totalBlocks = schedule.reduce((sum, day) => sum + day.blocks.length, 0);

  const intro =
    totalBlocks === 0
      ? `<p class="lede">Nothing is scheduled yet. Anyone can add a session — pick a
           day below, choose a start and end time, and it appears for everyone.</p>`
      : `<p class="lede">Anyone can add a session, sign up to attend one, or offer to
           lead one. You can take your name off again at any time.</p>`;

  const days = schedule
    .map(
      (day) => `<section class="day">
        <h2>${escapeHtml(day.label)}</h2>
        ${
          day.blocks.length > 0
            ? `<div class="blocks">${day.blocks.map((block) => blockCard(block, ctx)).join('')}</div>`
            : '<p class="empty-day">No sessions scheduled.</p>'
        }
        ${addBlockForm(day, ctx)}
      </section>`,
    )
    .join('');

  const body = `<h1>Schedule</h1>
    ${intro}
    ${visitorName ? '' : namePrompt()}
    ${
      visitorName
        ? `<p class="admin-hint">Sessions can be any length between
             ${escapeHtml(formatTime(DAY_START_MIN))} and ${escapeHtml(formatTime(DAY_END_MIN))} ET,
             and cannot overlap another session on the same day.</p>`
        : ''
    }
    ${days}`;

  return layout({
    title: 'Schedule',
    activeNav: 'schedule',
    isAdmin,
    visitorName,
    notice,
    error,
    body,
  });
}

export function spielPage({ page, isAdmin, visitorName, editing, notice, error }) {
  const body = editing
    ? `<h1>${escapeHtml(SPIEL_TITLE)}</h1>
       <form method="post" action="/the-spiel" class="page-editor">
         <label for="page-body">Page text</label>
         <p class="hint">Blank lines separate paragraphs. <code>##</code> starts a heading,
           <code>-</code> starts a list item, <code>**bold**</code> and <code>*italic*</code> work,
           and links look like <code>[text](https://example.com)</code>.</p>
         <textarea id="page-body" name="body" rows="24" required>${escapeHtml(page.body)}</textarea>
         <div class="editor-actions">
           <button type="submit">Save changes</button>
           <a href="/the-spiel" class="link-button">Cancel</a>
         </div>
       </form>`
    : `<div class="page-head">
         <h1>${escapeHtml(SPIEL_TITLE)}</h1>
         ${isAdmin ? '<a class="link-button" href="/the-spiel?edit=1">Edit this page</a>' : ''}
       </div>
       <div class="prose">${renderMarkdown(page.body)}</div>`;

  return layout({
    title: SPIEL_TITLE,
    activeNav: 'spiel',
    isAdmin,
    visitorName,
    notice,
    error,
    body,
  });
}

export function signInPage({ error, visitorName }) {
  const body = signInEnabled
    ? `<h1>Sign in</h1>
       <p class="lede">This is only for ${escapeHtml(ADMIN_USERNAME)}, and only unlocks
         editing the text on the ${escapeHtml(SPIEL_TITLE.toLowerCase())} page. The schedule
         is open to everyone without signing in.</p>
       <form method="post" action="/signin" class="signin-form">
         <div class="field">
           <label for="username">Name</label>
           <input id="username" name="username" type="text" autocomplete="username"
             value="${escapeHtml(ADMIN_USERNAME)}" required />
         </div>
         <div class="field">
           <label for="password">Password</label>
           <input id="password" name="password" type="password"
             autocomplete="current-password" required autofocus />
         </div>
         <button type="submit">Sign in</button>
       </form>`
    : `<h1>Sign in</h1>
       <p class="lede">Sign-in is not configured on this deployment, so the
         ${escapeHtml(SPIEL_TITLE.toLowerCase())} page cannot be edited. Set an
         <code>ADMIN_PASSWORD</code> variable on the server to enable it.</p>`;

  return layout({
    title: 'Sign in',
    activeNav: null,
    isAdmin: false,
    visitorName,
    error,
    body,
  });
}

export function notFoundPage({ visitorName } = {}) {
  const body = `<h1>Not found</h1>
    <p class="lede">That page does not exist. Try the <a href="/">schedule</a>.</p>`;
  return layout({ title: 'Not found', activeNav: null, isAdmin: false, visitorName, body });
}

export { DAYS };
