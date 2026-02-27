import {run as runReminderTests} from './reminders.test.js';
import {run as runScheduleEngineTests} from './schedule-engine.test.js';

try {
    runScheduleEngineTests();
    runReminderTests();
    print('All tests passed.');
} catch (error) {
    printerr(`Test failed: ${error.message}`);
    throw error;
}
