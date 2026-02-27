import {assert, assertEqual} from './helpers.js';
import {
    findNextOccurrence,
    getCoursesForDate,
    getWeekNumberForDate,
    parseIsoDate,
    toIsoDate,
} from '../extension/lib/scheduleEngine.js';

const PERIODS = {
    '1': {start: '08:00', end: '08:45'},
    '2': {start: '08:50', end: '09:35'},
    '3': {start: '09:50', end: '10:35'},
    '4': {start: '10:40', end: '11:25'},
};

function buildSchedule() {
    return {
        schemaVersion: 1,
        meta: {},
        courses: [
            {
                id: 'c1',
                name: 'Math',
                location: '',
                teacher: '',
                weekday: 1,
                startPeriod: 1,
                endPeriod: 2,
                weeksRule: {
                    startWeek: 1,
                    endWeek: 16,
                    parity: 'all',
                    skipWeeks: [3],
                    extraWeeks: [],
                },
                exceptions: [
                    {date: '2026-03-02', action: 'cancel', note: ''},
                ],
            },
            {
                id: 'c2',
                name: 'Physics',
                location: '',
                teacher: '',
                weekday: 3,
                startPeriod: 3,
                endPeriod: 4,
                weeksRule: {
                    startWeek: 1,
                    endWeek: 16,
                    parity: 'odd',
                    skipWeeks: [],
                    extraWeeks: [2],
                },
                exceptions: [
                    {date: '2026-03-03', action: 'override', weekday: 2, startPeriod: 2, endPeriod: 3, note: ''},
                ],
            },
        ],
    };
}

function testWeekNumber() {
    const week1 = '2026-02-23';
    assertEqual(getWeekNumberForDate(parseIsoDate('2026-02-23'), week1), 1, 'week1 start must be week 1');
    assertEqual(getWeekNumberForDate(parseIsoDate('2026-03-02'), week1), 2, 'next Monday must be week 2');
}

function testCourseMatchWithException() {
    const schedule = buildSchedule();
    const options = {periodTimes: PERIODS, week1StartDate: '2026-02-23'};

    const mondayWeek2 = parseIsoDate('2026-03-02');
    const mondayClasses = getCoursesForDate(schedule, mondayWeek2, options);
    assertEqual(mondayClasses.length, 0, 'cancel exception should remove class');

    const tuesdayOverride = parseIsoDate('2026-03-03');
    const tuesdayClasses = getCoursesForDate(schedule, tuesdayOverride, options);
    assertEqual(tuesdayClasses.length, 1, 'override exception should create one class');
    assertEqual(tuesdayClasses[0].startPeriod, 2, 'override start period should apply');
}

function testNextOccurrence() {
    const schedule = buildSchedule();
    const options = {periodTimes: PERIODS, week1StartDate: '2026-02-23'};

    const now = new Date(2026, 1, 23, 7, 30, 0, 0);
    const next = findNextOccurrence(schedule, now, options);

    assert(next !== null, 'next occurrence should exist');
    assertEqual(next.name, 'Math', 'first class should be Math');
    assertEqual(toIsoDate(next.startDateTime), '2026-02-23', 'next class date should match');
}

export function run() {
    testWeekNumber();
    testCourseMatchWithException();
    testNextOccurrence();
}
