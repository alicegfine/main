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

const SITE_TITLE = 'August Meditation Retreat';

function layout({ title, activeNav, isAdmin, notice, error, body }) {
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
      <a href="/how-it-works"${activeNav === 'how-it-works' ? ' aria-current="page"' : ''}>How it works</a>
      ${
        isAdmin
          ? `<form method="post" action="/signout" class="inline-form">
               <span class="signed-in">Signed in as ${escapeHtml(ADMIN_USERNAME)}</span>
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

function nameList(signups, isAdmin) {
  if (signups.length === 0) return '';
  const items = signups
    .map(
      (signup) => `<li>
        <span>${escapeHtml(signup.name)}</span>
        <form method="post" action="/signups/${signup.id}/delete" class="inline-form">
          <button type="submit" class="link-button subtle" title="Remove ${escapeHtml(signup.name)}">remove</button>
        </form>
      </li>`,
    )
    .join('');
  return `<ul class="name-list">${items}</ul>`;
}

function signupForm(block) {
  return `<form method="post" action="/signups" class="signup-form">
    <input type="hidden" name="block_id" value="${block.id}" />
    <label class="visually-hidden" for="name-${block.id}">Your name</label>
    <input
      id="name-${block.id}"
      name="name"
      type="text"
      placeholder="Your name"
      maxlength="${MAX_NAME_LENGTH}"
      required
    />
    <label class="visually-hidden" for="role-${block.id}">Joining as</label>
    <select id="role-${block.id}" name="role">
      <option value="attending">Attending</option>
      <option value="leading">Leading</option>
    </select>
    <button type="submit">Sign up</button>
  </form>`;
}

function blockCard(block, isAdmin) {
  const leaders =
    block.leading.length > 0
      ? nameList(block.leading, isAdmin)
      : '<p class="empty-role">No one leading yet</p>';

  const attendees =
    block.attending.length > 0
      ? nameList(block.attending, isAdmin)
      : '<p class="empty-role">No one signed up yet</p>';

  return `<article class="block">
    <div class="block-head">
      <div>
        <h3>${escapeHtml(formatRange(block.start_min, block.end_min))}</h3>
        <p class="duration">${escapeHtml(formatDuration(block.start_min, block.end_min))}</p>
      </div>
      ${
        isAdmin
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

    ${signupForm(block)}
  </article>`;
}

function addBlockForm(day) {
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
    <button type="submit">Add session</button>
  </form>`;
}

export function schedulePage({ schedule, isAdmin, notice, error }) {
  const totalBlocks = schedule.reduce((sum, day) => sum + day.blocks.length, 0);

  const intro =
    totalBlocks === 0
      ? `<p class="lede">The schedule is still empty.${
          isAdmin
            ? ' Add the first session below.'
            : ' Sessions will appear here once they are added.'
        }</p>`
      : `<p class="lede">Add your name to any session, either to attend it or to lead it.
           You can take your name off again at any time.</p>`;

  const days = schedule
    .map(
      (day) => `<section class="day">
        <h2>${escapeHtml(day.label)}</h2>
        ${
          day.blocks.length > 0
            ? `<div class="blocks">${day.blocks.map((block) => blockCard(block, isAdmin)).join('')}</div>`
            : '<p class="empty-day">No sessions scheduled.</p>'
        }
        ${isAdmin ? addBlockForm(day) : ''}
      </section>`,
    )
    .join('');

  const body = `<h1>Schedule</h1>
    ${intro}
    ${
      isAdmin
        ? `<p class="admin-hint">Sessions can run any length between
             ${escapeHtml(formatTime(DAY_START_MIN))} and ${escapeHtml(formatTime(DAY_END_MIN))} ET,
             and cannot overlap another session on the same day.</p>`
        : ''
    }
    ${days}`;

  return layout({ title: 'Schedule', activeNav: 'schedule', isAdmin, notice, error, body });
}

export function howItWorksPage({ page, isAdmin, editing, notice, error }) {
  const body = editing
    ? `<h1>How it works</h1>
       <form method="post" action="/how-it-works" class="page-editor">
         <label for="page-body">Page text</label>
         <p class="hint">Blank lines separate paragraphs. <code>##</code> starts a heading,
           <code>-</code> starts a list item, <code>**bold**</code> and <code>*italic*</code> work,
           and links look like <code>[text](https://example.com)</code>.</p>
         <textarea id="page-body" name="body" rows="24" required>${escapeHtml(page.body)}</textarea>
         <div class="editor-actions">
           <button type="submit">Save changes</button>
           <a href="/how-it-works" class="link-button">Cancel</a>
         </div>
       </form>`
    : `<div class="page-head">
         <h1>How it works</h1>
         ${isAdmin ? '<a class="link-button" href="/how-it-works?edit=1">Edit this page</a>' : ''}
       </div>
       <div class="prose">${renderMarkdown(page.body)}</div>`;

  return layout({
    title: 'How it works',
    activeNav: 'how-it-works',
    isAdmin,
    notice,
    error,
    body,
  });
}

export function signInPage({ error }) {
  const body = signInEnabled
    ? `<h1>Sign in</h1>
       <p class="lede">Signing in shows the controls for editing the schedule and the
         "How it works" page. Everyone else sees the site as it is.</p>
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
       <p class="lede">Sign-in is not configured on this deployment, so the schedule and
         the "How it works" page cannot be edited. Set an <code>ADMIN_PASSWORD</code>
         variable on the server to enable it.</p>`;

  return layout({ title: 'Sign in', activeNav: null, isAdmin: false, error, body });
}

export function notFoundPage() {
  const body = `<h1>Not found</h1>
    <p class="lede">That page does not exist. Try the <a href="/">schedule</a>.</p>`;
  return layout({ title: 'Not found', activeNav: null, isAdmin: false, body });
}

export { DAYS };
