// FAQ content.
//
// Deliberately plain data so it can be edited without touching a template.
// Answers accept inline HTML for links.
//
// TODO: the answers below marked [FILL IN] are placeholders — I don't know the
// real details and guessing at a door code or an address is worse than a blank.
// If editing this file becomes a bottleneck, the natural next step is to read
// the entries from a Google Doc or a Markdown file so non-engineers can update
// them without a deploy.

export const faqSections = [
  {
    title: 'Getting in',
    items: [
      {
        q: 'Where is the office?',
        a: '[FILL IN — street address, floor, and suite number.]',
      },
      {
        q: 'How do I get in the building?',
        a: '[FILL IN — building hours, whether reception needs to badge you up, and who to contact if you arrive outside those hours.]',
      },
      {
        q: 'Do I need a key card?',
        a: '[FILL IN — how to request one and how long it takes.]',
      },
      {
        q: 'What are the office hours?',
        a: '[FILL IN — and note whether the space is accessible on evenings and weekends.]',
      },
    ],
  },
  {
    title: 'Working there',
    items: [
      {
        q: 'Is there assigned seating?',
        a: 'No — desks are first come, first served. Marking yourself in on the <a href="/">office board</a> helps people plan, but it does not reserve a specific desk.',
      },
      {
        q: 'How do I get on the wifi?',
        a: '[FILL IN — network name, and where to find the password. Do not paste the password here if this site is ever exposed beyond the Workspace domain.]',
      },
      {
        q: 'Is there a printer?',
        a: '[FILL IN — location and setup instructions.]',
      },
      {
        q: 'What about monitors, docks, and adapters?',
        a: '[FILL IN — what is provided at desks and who to ask for anything missing.]',
      },
    ],
  },
  {
    title: 'Conference rooms',
    items: [
      {
        q: 'How do I book a conference room?',
        a: 'Rooms are booked through Google Calendar. Create your meeting, open <strong>Rooms</strong> in the right-hand panel, and pick an available room. [FILL IN — the room names, once they exist as calendar resources.]',
      },
      {
        q: 'The room I booked is occupied. What now?',
        a: '[FILL IN — the escalation norm. Whoever holds the booking on the calendar usually has the room.]',
      },
    ],
  },
  {
    title: 'Visitors and logistics',
    items: [
      {
        q: 'Can I bring a guest?',
        a: '[FILL IN — whether guests need to be registered in advance, and with whom.]',
      },
      {
        q: 'Where does mail and package delivery go?',
        a: '[FILL IN — mailing address if it differs from the street address, and where packages end up.]',
      },
      {
        q: 'Is the office accessible?',
        a: '[FILL IN — step-free entrance, elevator, accessible restrooms, and who to contact about specific accommodations.]',
      },
      {
        q: 'Something is broken or we are out of coffee. Who do I tell?',
        a: '[FILL IN — the Slack channel or person to flag office issues to.]',
      },
    ],
  },
];

/** True when the FAQ still contains unfilled placeholders, so the page can say so. */
export function hasPlaceholders() {
  return faqSections.some((section) => section.items.some((item) => item.a.includes('[FILL IN')));
}
