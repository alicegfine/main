// One-shot repair of the calendar mirror for every day the board covers.
// Point a Railway cron job at `npm run resync` (nightly is plenty) so that
// hand-edits to the shared calendar get corrected and any day that failed to
// sync during a Google outage is brought back in line.

import { withDayLock, pool, initSchema } from '../db.js';
import { resyncCoveredDays } from '../calendarSync.js';

async function main() {
  await initSchema();
  const result = await resyncCoveredDays(withDayLock);
  console.log(`[resync] synced ${result.synced} day(s)`);
  if (result.failed.length) {
    console.error(`[resync] failed: ${result.failed.join(', ')}`);
    process.exitCode = 1;
  }
  await pool.end();
}

main().catch((error) => {
  console.error('[resync] fatal', error);
  process.exit(1);
});
