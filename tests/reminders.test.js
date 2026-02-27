import {assertEqual} from './helpers.js';
import {ReminderScheduler} from '../extension/lib/reminders.js';

export function run() {
    const notifications = [];
    const scheduler = new ReminderScheduler((title, body) => notifications.push({title, body}));

    scheduler.updateConfig({enabled: true, minutesBefore: 30});

    const start = new Date(2026, 1, 24, 8, 0, 0, 0);
    const occurrence = {
        courseId: 'c1',
        date: '2026-02-24',
        startPeriod: 1,
        endPeriod: 2,
        name: 'Math',
        startText: '08:00',
        endText: '09:35',
        startDateTime: start,
    };

    scheduler.process(new Date(2026, 1, 24, 7, 29, 0, 0), [occurrence]);
    assertEqual(notifications.length, 0, 'no notification before window');

    scheduler.process(new Date(2026, 1, 24, 7, 30, 0, 0), [occurrence]);
    assertEqual(notifications.length, 1, 'must notify when entering window');

    scheduler.process(new Date(2026, 1, 24, 7, 35, 0, 0), [occurrence]);
    assertEqual(notifications.length, 1, 'must not notify twice for same occurrence');
}
