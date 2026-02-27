function overlap(a, b) {
    return a.startDateTime.getTime() < b.endDateTime.getTime()
        && b.startDateTime.getTime() < a.endDateTime.getTime();
}

export function findConflicts(occurrences) {
    const conflicts = [];

    for (let i = 0; i < occurrences.length; i++) {
        for (let j = i + 1; j < occurrences.length; j++) {
            if (overlap(occurrences[i], occurrences[j])) {
                conflicts.push({
                    first: occurrences[i],
                    second: occurrences[j],
                });
            }
        }
    }

    return conflicts;
}

export function buildScheduleStats(schedule, todayOccurrences) {
    const courses = Array.isArray(schedule?.courses) ? schedule.courses : [];

    const byWeekday = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0};
    for (const course of courses) {
        if (Number.isInteger(course.weekday) && course.weekday >= 1 && course.weekday <= 7)
            byWeekday[course.weekday] += 1;
    }

    const busiestWeekday = Object.entries(byWeekday)
        .sort((a, b) => b[1] - a[1])[0] ?? ['1', 0];

    return {
        totalCourses: courses.length,
        todayCourses: todayOccurrences.length,
        todayConflicts: findConflicts(todayOccurrences).length,
        busiestWeekday: Number.parseInt(busiestWeekday[0], 10),
        busiestCount: busiestWeekday[1],
    };
}
