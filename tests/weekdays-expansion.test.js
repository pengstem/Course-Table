import {assert, assertEqual} from './helpers.js';
import {normalizeSchedule, validateSchedule} from '../extension/lib/scheduleSchema.js';
import {getCoursesForDate, parseIsoDate} from '../extension/lib/scheduleEngine.js';

const PERIODS = {
    '1': {start: '08:00', end: '08:45'},
    '2': {start: '08:50', end: '09:35'},
    '3': {start: '09:50', end: '10:35'},
};

function testWeekdaysArrayExpansion() {
    const raw = {
        courses: [
            {
                id: 'math',
                name: 'Advanced Mathematics',
                location: 'A101',
                teacher: 'Dr. Smith',
                weekdays: [1, 3],
                startPeriod: 1,
                endPeriod: 2,
                weeksRule: {startWeek: 1, endWeek: 16, parity: 'all'},
            },
        ],
    };

    const schedule = normalizeSchedule(raw);
    assertEqual(schedule.courses.length, 2, 'weekdays [1,3] should expand to 2 courses');
    assertEqual(schedule.courses[0].weekday, 1, 'first expanded course should be weekday 1');
    assertEqual(schedule.courses[1].weekday, 3, 'second expanded course should be weekday 3');
    assertEqual(schedule.courses[0].name, 'Advanced Mathematics', 'name should be preserved');
    assertEqual(schedule.courses[1].name, 'Advanced Mathematics', 'name should be preserved on second');
    assertEqual(schedule.courses[0].id, 'math-d1', 'id should be suffixed with weekday');
    assertEqual(schedule.courses[1].id, 'math-d3', 'id should be suffixed with weekday');
}

function testWeekdaysArrayDeduplication() {
    const raw = {
        courses: [
            {
                name: 'English',
                weekdays: [2, 2, 4],
                startPeriod: 1,
                endPeriod: 1,
                weeksRule: {startWeek: 1, endWeek: 16, parity: 'all'},
            },
        ],
    };

    const schedule = normalizeSchedule(raw);
    assertEqual(schedule.courses.length, 2, 'duplicate weekday 2 should be deduplicated');
}

function testSingleWeekdayBackwardCompat() {
    const raw = {
        courses: [
            {
                id: 'phys',
                name: 'Physics',
                weekday: 5,
                startPeriod: 3,
                endPeriod: 3,
                weeksRule: {startWeek: 1, endWeek: 16, parity: 'all'},
            },
        ],
    };

    const schedule = normalizeSchedule(raw);
    assertEqual(schedule.courses.length, 1, 'single weekday should produce 1 course');
    assertEqual(schedule.courses[0].weekday, 5, 'weekday should be preserved');
    assertEqual(schedule.courses[0].id, 'phys', 'id should not be modified for single weekday');
}

function testWeekdaysArrayOccurrences() {
    const raw = {
        courses: [
            {
                id: 'math',
                name: 'Advanced Mathematics',
                location: 'A101',
                teacher: 'Dr. Smith',
                weekdays: [1, 3],
                startPeriod: 1,
                endPeriod: 2,
                weeksRule: {startWeek: 1, endWeek: 16, parity: 'all'},
            },
        ],
    };

    const schedule = normalizeSchedule(raw);
    const options = {periodTimes: PERIODS, week1StartDate: '2026-02-23'};

    // Monday = weekday 1
    const mondayClasses = getCoursesForDate(schedule, parseIsoDate('2026-02-23'), options);
    assertEqual(mondayClasses.length, 1, 'should have 1 class on Monday');
    assertEqual(mondayClasses[0].name, 'Advanced Mathematics', 'Monday class name');

    // Wednesday = weekday 3
    const wedClasses = getCoursesForDate(schedule, parseIsoDate('2026-02-25'), options);
    assertEqual(wedClasses.length, 1, 'should have 1 class on Wednesday');
    assertEqual(wedClasses[0].name, 'Advanced Mathematics', 'Wednesday class name');

    // Tuesday = weekday 2 — no class
    const tueClasses = getCoursesForDate(schedule, parseIsoDate('2026-02-24'), options);
    assertEqual(tueClasses.length, 0, 'should have 0 classes on Tuesday');
}

function testExpandedCoursesValidate() {
    const raw = {
        courses: [
            {
                name: 'Math',
                weekdays: [1, 3, 5],
                startPeriod: 1,
                endPeriod: 2,
                weeksRule: {startWeek: 1, endWeek: 16, parity: 'all'},
            },
        ],
    };

    const schedule = normalizeSchedule(raw);
    const errors = validateSchedule(schedule);
    assertEqual(errors.length, 0, 'expanded courses should pass validation');
    assertEqual(schedule.courses.length, 3, 'weekdays [1,3,5] should expand to 3 courses');
}

export function run() {
    testWeekdaysArrayExpansion();
    testWeekdaysArrayDeduplication();
    testSingleWeekdayBackwardCompat();
    testWeekdaysArrayOccurrences();
    testExpandedCoursesValidate();
}
