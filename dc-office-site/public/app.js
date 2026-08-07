// Board interactivity. Optimistic toggle, reconciled against the server's
// response so the roster reflects other people's clicks too.

(function () {
  const board = document.getElementById('board');
  const statusEl = document.getElementById('status');
  if (!board) return;

  function showStatus(message) {
    if (!message) {
      statusEl.hidden = true;
      return;
    }
    statusEl.textContent = message;
    statusEl.hidden = false;
  }

  function renderDay(card, data) {
    const roster = card.querySelector('[data-roster]');
    const count = card.querySelector('[data-count]');
    const toggle = card.querySelector('[data-toggle]');

    roster.replaceChildren(
      ...data.people.map((person) => {
        const li = document.createElement('li');
        li.textContent = person.name;
        li.title = person.email;
        if (person.isMe) li.className = 'me';
        return li;
      })
    );

    count.textContent = `${data.count} ${data.count === 1 ? 'person' : 'people'}`;

    if (toggle) {
      toggle.textContent = data.meIn ? "You're in" : "I'll be in";
      toggle.classList.toggle('in', data.meIn);
      toggle.setAttribute('aria-pressed', String(data.meIn));
    }
  }

  board.addEventListener('click', async (event) => {
    const toggle = event.target.closest('[data-toggle]');
    if (!toggle) return;

    const card = toggle.closest('[data-day]');
    const day = card.dataset.day;
    const going = toggle.getAttribute('aria-pressed') !== 'true';

    toggle.disabled = true;
    showStatus(null);

    try {
      const response = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day, going }),
      });

      if (response.status === 401) {
        // Session expired while the tab sat open.
        window.location.href = '/login';
        return;
      }

      const data = await response.json();
      if (!response.ok) {
        showStatus(data.error || 'Could not save that. Try again.');
        return;
      }

      renderDay(card, data);
      if (data.syncWarning) showStatus(data.syncWarning);
    } catch {
      showStatus('Could not reach the server. Check your connection and try again.');
    } finally {
      toggle.disabled = false;
    }
  });

  // Pick up other people's changes when the tab regains focus, so a board left
  // open overnight isn't showing yesterday's roster.
  let refreshing = false;
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || refreshing) return;
    refreshing = true;
    try {
      const response = await fetch('/api/board');
      if (!response.ok) return;
      const data = await response.json();

      // A date rollover means the whole grid shifted; simplest correct move is
      // a reload rather than surgically rebuilding the shell.
      if (data.today !== board.dataset.today) {
        window.location.reload();
        return;
      }

      for (const week of data.weeks) {
        for (const day of week.days) {
          const card = board.querySelector(`[data-day="${day.key}"]`);
          if (card) renderDay(card, day);
        }
      }
    } catch {
      /* a failed background refresh is not worth surfacing */
    } finally {
      refreshing = false;
    }
  });
})();
