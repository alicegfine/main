// The stylesheet is served with a hash of its contents in the URL, so that a
// deploy that changes the CSS is picked up immediately instead of a browser
// showing new HTML with an hour-old cached stylesheet.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function fingerprint(file) {
  try {
    const contents = fs.readFileSync(path.join(here, '..', 'public', file));
    return crypto.createHash('sha256').update(contents).digest('hex').slice(0, 10);
  } catch {
    return 'dev';
  }
}

export const stylesHref = `/styles.css?v=${fingerprint('styles.css')}`;
