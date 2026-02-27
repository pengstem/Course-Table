export class ReminderScheduler {
    constructor(notifyFn) {
        this._notifyFn = notifyFn;
        this._notifiedKeys = new Map();
        this._enabled = true;
        this._minutesBefore = 30;
    }

    updateConfig({enabled, minutesBefore}) {
        this._enabled = Boolean(enabled);
        const normalizedMinutes = Number.isInteger(minutesBefore) ? minutesBefore : 30;
        this._minutesBefore = Math.max(1, normalizedMinutes);
    }

    _keyForOccurrence(item) {
        return `${item.courseId}|${item.date}|${item.startPeriod}|${item.endPeriod}`;
    }

    _cleanupHistory(nowMs) {
        const expireBefore = nowMs - 2 * 24 * 60 * 60 * 1000;
        for (const [key, ts] of this._notifiedKeys.entries()) {
            if (ts < expireBefore)
                this._notifiedKeys.delete(key);
        }
    }

    process(now, occurrences) {
        if (!this._enabled)
            return;

        const nowMs = now.getTime();
        const leadMs = this._minutesBefore * 60 * 1000;

        this._cleanupHistory(nowMs);

        for (const item of occurrences) {
            const key = this._keyForOccurrence(item);
            if (this._notifiedKeys.has(key))
                continue;

            const classStart = item.startDateTime.getTime();
            const notifyAt = classStart - leadMs;

            if (nowMs >= notifyAt && nowMs < classStart) {
                this._notifyFn(
                    `Upcoming class: ${item.name}`,
                    `${item.startText}-${item.endText} starts in ${this._minutesBefore} minutes.`
                );
                this._notifiedKeys.set(key, nowMs);
            }
        }
    }
}
