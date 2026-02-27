import {DEFAULT_PERIOD_TIMES} from './constants.js';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function pad2(value) {
    return `${value}`.padStart(2, '0');
}

export function toIsoDate(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseIsoDate(isoDate) {
    if (!isoDate || typeof isoDate !== 'string')
        return null;

    const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match)
        return null;

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);

    const date = new Date(year, month - 1, day, 0, 0, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
        return null;

    return date;
}

function normalizeDate(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function weekdayFromDate(date) {
    const jsDay = date.getDay();
    return jsDay === 0 ? 7 : jsDay;
}

function parseHHMM(value) {
    const match = typeof value === 'string' ? value.match(/^(\d{1,2}):(\d{2})$/) : null;
    if (!match)
        return null;

    const hour = Number.parseInt(match[1], 10);
    const minute = Number.parseInt(match[2], 10);

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59)
        return null;

    return {hour, minute};
}

function addTimeToDate(date, hhmm) {
    const parsed = parseHHMM(hhmm);
    if (!parsed)
        return null;

    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        parsed.hour,
        parsed.minute,
        0,
        0
    );
}

export function getWeekNumberForDate(date, week1StartDateIso) {
    const target = normalizeDate(date);
    const week1Start = parseIsoDate(week1StartDateIso);

    if (!week1Start)
        return 1;

    const diffDays = Math.floor((target.getTime() - week1Start.getTime()) / MILLISECONDS_PER_DAY);
    return Math.floor(diffDays / 7) + 1;
}

function matchesParity(week, parity) {
    if (parity === 'odd')
        return week % 2 === 1;

    if (parity === 'even')
        return week % 2 === 0;

    return true;
}

function courseExceptionForDate(course, date) {
    if (!Array.isArray(course.exceptions))
        return null;

    const isoDate = toIsoDate(date);
    return course.exceptions.find(item => item.date === isoDate) ?? null;
}

function shouldIncludeByWeeksRule(course, weekNumber) {
    const weeksRule = course.weeksRule ?? {};
    const startWeek = Number.isInteger(weeksRule.startWeek) ? weeksRule.startWeek : 1;
    const endWeek = Number.isInteger(weeksRule.endWeek) ? weeksRule.endWeek : startWeek;
    const parity = typeof weeksRule.parity === 'string' ? weeksRule.parity : 'all';

    const skipWeeks = Array.isArray(weeksRule.skipWeeks) ? weeksRule.skipWeeks : [];
    const extraWeeks = Array.isArray(weeksRule.extraWeeks) ? weeksRule.extraWeeks : [];

    if (skipWeeks.includes(weekNumber))
        return false;

    if (extraWeeks.includes(weekNumber))
        return true;

    if (weekNumber < startWeek || weekNumber > endWeek)
        return false;

    return matchesParity(weekNumber, parity);
}

function resolvePeriodTimes(periodTimes) {
    if (!periodTimes || typeof periodTimes !== 'object')
        return DEFAULT_PERIOD_TIMES;

    return periodTimes;
}

function getPeriodWindow(periodTimes, startPeriod, endPeriod) {
    const start = periodTimes[String(startPeriod)]?.start;
    const end = periodTimes[String(endPeriod)]?.end;

    if (!start || !end)
        return null;

    return {start, end};
}

function buildOccurrence(course, date, periodTimes, periodOverride = null) {
    const startPeriod = periodOverride?.startPeriod ?? course.startPeriod;
    const endPeriod = periodOverride?.endPeriod ?? course.endPeriod;
    const window = getPeriodWindow(periodTimes, startPeriod, endPeriod);

    if (!window)
        return null;

    const startDateTime = addTimeToDate(date, window.start);
    const endDateTime = addTimeToDate(date, window.end);

    if (!startDateTime || !endDateTime)
        return null;

    return {
        courseId: course.id,
        name: course.name,
        location: course.location,
        teacher: course.teacher,
        date: toIsoDate(date),
        weekday: weekdayFromDate(date),
        startPeriod,
        endPeriod,
        startText: window.start,
        endText: window.end,
        startDateTime,
        endDateTime,
    };
}

export function isCourseActiveOnDate(course, date, week1StartDateIso) {
    const exception = courseExceptionForDate(course, date);
    if (exception?.action === 'cancel')
        return false;

    if (exception?.action === 'override')
        return true;

    if (course.weekday !== weekdayFromDate(date))
        return false;

    const weekNumber = getWeekNumberForDate(date, week1StartDateIso);
    return shouldIncludeByWeeksRule(course, weekNumber);
}

export function getCoursesForDate(schedule, date, options = {}) {
    const periodTimes = resolvePeriodTimes(options.periodTimes);
    const week1StartDate = options.week1StartDate ?? '';
    const courses = Array.isArray(schedule?.courses) ? schedule.courses : [];

    const occurrences = [];

    for (const course of courses) {
        const exception = courseExceptionForDate(course, date);

        if (exception?.action === 'cancel')
            continue;

        if (exception?.action === 'override') {
            const override = {
                startPeriod: exception.startPeriod,
                endPeriod: exception.endPeriod,
            };
            const occurrence = buildOccurrence(course, date, periodTimes, override);
            if (occurrence)
                occurrences.push(occurrence);
            continue;
        }

        if (!isCourseActiveOnDate(course, date, week1StartDate))
            continue;

        const occurrence = buildOccurrence(course, date, periodTimes);
        if (occurrence)
            occurrences.push(occurrence);
    }

    return occurrences.sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());
}

export function findNextOccurrence(schedule, now, options = {}) {
    const baseDate = normalizeDate(now);
    const maxDays = Number.isInteger(options.maxDays) ? options.maxDays : 28;

    for (let offset = 0; offset <= maxDays; offset++) {
        const day = new Date(baseDate.getTime() + offset * MILLISECONDS_PER_DAY);
        const courses = getCoursesForDate(schedule, day, options);

        for (const item of courses) {
            if (item.startDateTime.getTime() > now.getTime()) {
                return {
                    ...item,
                    minutesUntilStart: Math.max(0, Math.floor((item.startDateTime.getTime() - now.getTime()) / 60000)),
                };
            }
        }
    }

    return null;
}

export function summarizeToday(schedule, now, options = {}) {
    const today = normalizeDate(now);
    const courses = getCoursesForDate(schedule, today, options);

    return {
        date: toIsoDate(today),
        count: courses.length,
        courses,
    };
}
