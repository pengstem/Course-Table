import {run as runReminderTests} from './reminders.test.js';
import {run as runScheduleEngineTests} from './schedule-engine.test.js';
import {run as runStorageTests} from './storage.test.js';

try {
    runScheduleEngineTests();
    runReminderTests();
    runStorageTests();
    print('All tests passed.');
} catch (error) {
    printerr(`Test failed: ${error.message}`);
    throw error;
}
