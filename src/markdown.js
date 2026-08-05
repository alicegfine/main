// A deliberately tiny subset of Markdown for the spiel page, so that
// Alice can write headings, lists, links and emphasis without the site depending
// on a Markdown library. Everything is HTML-escaped before any formatting is
// applied, so the page cannot inject markup.

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function inline(text) {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

export function renderMarkdown(source) {
  const blocks = String(source ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/);

  const html = [];

  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    if (lines.length === 0) continue;

    const heading = /^(#{1,3})\s+(.*)$/.exec(lines[0]);
    if (heading && lines.length === 1) {
      // The page itself supplies the <h1>, so headings start at <h2>.
      const level = Math.min(Math.max(heading[1].length, 2), 4);
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
      const items = lines
        .map((line) => `<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`)
        .join('');
      html.push(`<ul>${items}</ul>`);
      continue;
    }

    if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
      const items = lines
        .map((line) => `<li>${inline(line.replace(/^\s*\d+[.)]\s+/, ''))}</li>`)
        .join('');
      html.push(`<ol>${items}</ol>`);
      continue;
    }

    html.push(`<p>${lines.map((line) => inline(line)).join('<br />')}</p>`);
  }

  return html.join('\n');
}
