import {
  DAYS,
  MAX_NAME_LENGTH,
  formatRange,
  formatDuration,
  toTimeValue,
} from './retreat.js';
import { escapeHtml, renderMarkdown } from './markdown.js';
import { ADMIN_USERNAME, signInEnabled } from './auth.js';
import { isSamePerson } from './visitor.js';
import { stylesHref } from './assets.js';

const SITE_TITLE = 'Jhana Noting Retreat — August 2026';
const SPIEL_TITLE = 'The spiel';

function layout({ title, activeNav, isAdmin, visitorName, notice, error, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · ${escapeHtml(SITE_TITLE)}</title>
  <link rel="stylesheet" href="${stylesHref}" />
</head>
<body>
  <header class="site-header">
    <a class="wordmark" href="/">${escapeHtml(SITE_TITLE)}</a>
    <nav>
      <a href="/"${activeNav === 'schedule' ? ' aria-current="page"' : ''}>Schedule</a>
      <a href="/the-spiel"${activeNav === 'spiel' ? ' aria-current="page"' : ''}>${escapeHtml(SPIEL_TITLE)}</a>
      ${
        visitorName
          ? `<form method="post" action="/signout" class="inline-form">
               <span class="whoami">Signed in as <strong>${escapeHtml(visitorName)}</strong></span>
               <button type="submit" class="link-button">Sign out</button>
             </form>`
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
    <p>Put in a name before signing up or adding a session, so the schedule shows
      who is where. It is stored on this device only — no account, no password.</p>
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

// A session has at most one leader, and nobody holds both roles: so the "lead"
// button disappears once anyone is leading, and the "attend" button disappears
// for whoever is leading.
function signupControls(block, { visitorName }) {
  if (!visitorName) {
    return `<p class="signup-hint">Put in your name at the top of the page to sign up.</p>`;
  }

  const leader = block.leading[0];
  const youLead = Boolean(leader) && isSamePerson(leader.name, visitorName);
  const youAttend = block.attending.some((s) => isSamePerson(s.name, visitorName));

  const buttons = [];
  if (!leader) {
    buttons.push(`<form method="post" action="/signups" class="inline-form">
      <input type="hidden" name="block_id" value="${block.id}" />
      <input type="hidden" name="role" value="leading" />
      <button type="submit">I'll lead this</button>
    </form>`);
  }
  if (!youLead && !youAttend) {
    buttons.push(`<form method="post" action="/signups" class="inline-form">
      <input type="hidden" name="block_id" value="${block.id}" />
      <input type="hidden" name="role" value="attending" />
      <button type="submit">I'll attend</button>
    </form>`);
  }

  const status = youLead
    ? '<p class="signup-hint">You are leading this session.</p>'
    : youAttend
      ? '<p class="signup-hint">You are on the attending list.</p>'
      : '';

  if (!status && buttons.length === 0) return '';
  return `${status}${buttons.length ? `<div class="signup-actions">${buttons.join('')}</div>` : ''}`;
}

// Only the person leading a session gets to move it, so this stays hidden for
// everyone else rather than failing on submit.
function editTimesForm(block, { visitorName, isAdmin }) {
  const leader = block.leading[0];
  const youLead = Boolean(leader) && isSamePerson(leader.name, visitorName);
  if (!youLead && !isAdmin) return '';

  return `<details class="edit-times">
    <summary>Change times</summary>
    <form method="post" action="/blocks/${block.id}" class="add-block">
      <div class="field">
        <label for="edit-start-${block.id}">Start</label>
        <input id="edit-start-${block.id}" name="start" type="time"
          value="${toTimeValue(block.start_min)}" required />
      </div>
      <div class="field">
        <label for="edit-end-${block.id}">End</label>
        <input id="edit-end-${block.id}" name="end" type="time"
          value="${toTimeValue(block.end_min)}" required />
      </div>
      <button type="submit">Save times</button>
    </form>
  </details>`;
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
  const controls = signupControls(block, ctx);
  const timeEditor = editTimesForm(block, ctx);

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

    ${controls || timeEditor ? `<div class="signup-bar">${controls}${timeEditor}</div>` : ''}
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
    <button type="submit">Add a session</button>
  </form>`;
}

function dayCount(day) {
  const n = day.blocks.length;
  if (n === 0) return 'nothing scheduled';
  return n === 1 ? '1 session' : `${n} sessions`;
}

export function schedulePage({ schedule, isAdmin, visitorName, notice, error }) {
  const ctx = { isAdmin, visitorName };

  const days = schedule
    .map(
      (day) => `<details class="day" open>
        <summary>
          <h2>${escapeHtml(day.label)}</h2>
          <span class="day-count">${escapeHtml(dayCount(day))}</span>
        </summary>
        <div class="day-body">
          ${
            day.blocks.length > 0
              ? `<div class="blocks">${day.blocks.map((block) => blockCard(block, ctx)).join('')}</div>`
              : '<p class="empty-day">No sessions scheduled.</p>'
          }
          ${addBlockForm(day, ctx)}
        </div>
      </details>`,
    )
    .join('');

  const body = `<h1>Schedule</h1>
    <p class="timezone-note">All times Eastern</p>
    ${visitorName ? '' : namePrompt()}
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
  let body;

  if (editing) {
    body = `<h1>${escapeHtml(SPIEL_TITLE)}</h1>
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
      </form>`;
  } else {
    // The edit control lives here rather than in the nav, because this page is
    // the only thing Alice's password unlocks.
    const editControl = isAdmin
      ? `<div class="page-actions">
           <a class="link-button" href="/the-spiel?edit=1">Edit this page</a>
           <form method="post" action="/admin/lock" class="inline-form">
             <button type="submit" class="link-button subtle">lock editing</button>
           </form>
         </div>`
      : signInEnabled
        ? `<a class="link-button" href="/signin">Edit this page</a>`
        : '';

    body = `<div class="page-head">
        <h1>${escapeHtml(SPIEL_TITLE)}</h1>
        ${editControl}
      </div>
      <div class="prose">${renderMarkdown(page.body)}</div>`;
  }

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
    ? `<h1>Edit the spiel</h1>
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
         <button type="submit">Unlock editing</button>
       </form>`
    : `<h1>Edit the spiel</h1>
       <p class="lede">No password is configured on this deployment, so the
         ${escapeHtml(SPIEL_TITLE.toLowerCase())} cannot be edited. Set an
         <code>ADMIN_PASSWORD</code> variable on the server to enable it.</p>`;

  return layout({
    title: 'Edit the spiel',
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
