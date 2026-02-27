import GLib from 'gi://GLib';

import {assertEqual} from './helpers.js';
import {loadScheduleFromPath, saveScheduleToPath} from '../extension/lib/storage.js';

export function run() {
    const tempDir = GLib.build_filenamev([GLib.get_tmp_dir(), 'course-table-tests']);
    GLib.mkdir_with_parents(tempDir, 0o755);
    const filePath = GLib.build_filenamev([tempDir, 'schedule.json']);

    saveScheduleToPath(filePath, {
        meta: {},
        courses: [
            {
                id: 'x',
                name: 'Storage Test',
                weekday: 1,
                startPeriod: 1,
                endPeriod: 2,
                weeksRule: {
                    startWeek: 1,
                    endWeek: 2,
                    parity: 'all',
                    skipWeeks: [],
                    extraWeeks: [],
                },
                exceptions: [],
            },
        ],
    });

    const loaded = loadScheduleFromPath(filePath);
    assertEqual(loaded.courses.length, 1, 'storage roundtrip should preserve course count');
    assertEqual(loaded.courses[0].name, 'Storage Test', 'storage roundtrip should preserve course fields');
}
