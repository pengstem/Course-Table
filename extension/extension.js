import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {buildScheduleStats} from './analysis.js';
import {DEFAULT_PERIOD_TIMES} from './constants.js';
import {findNextOccurrence, getOccurrencesInRange, summarizeToday} from './scheduleEngine.js';
import {ReminderScheduler} from './reminders.js';
import {loadScheduleFromPath} from './storage.js';

function parsePeriodTimesFromSettings(raw) {
    if (!raw)
        return DEFAULT_PERIOD_TIMES;

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object')
            return DEFAULT_PERIOD_TIMES;

        const result = {};
        for (const [period, window] of Object.entries(parsed)) {
            if (!window || typeof window !== 'object')
                continue;
            if (typeof window.start !== 'string' || typeof window.end !== 'string')
                continue;
            result[period] = {
                start: window.start,
                end: window.end,
            };
        }

        return Object.keys(result).length > 0 ? result : DEFAULT_PERIOD_TIMES;
    } catch (_error) {
        return DEFAULT_PERIOD_TIMES;
    }
}

function formatDuration(minutes) {
    if (minutes < 60)
        return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    return remain > 0 ? `${hours}h ${remain}m` : `${hours}h`;
}

function weekdayLabel(weekday) {
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday - 1] ?? '?';
}

function buildAllCourseRows(schedule, periodTimes) {
    const courses = Array.isArray(schedule?.courses) ? schedule.courses : [];

    const rows = courses.map(course => {
        const startText = periodTimes[String(course.startPeriod)]?.start ?? `P${course.startPeriod}`;
        const endText = periodTimes[String(course.endPeriod)]?.end ?? `P${course.endPeriod}`;

        return {
            name: course.name,
            location: course.location,
            teacher: course.teacher,
            weekday: course.weekday,
            startText,
            endText,
        };
    });

    return rows.sort((a, b) => {
        if (a.weekday !== b.weekday)
            return a.weekday - b.weekday;

        return a.startText.localeCompare(b.startText);
    });
}

/**
 * Determine the status of a course occurrence relative to now.
 * Returns 'active' if currently in session, 'upcoming' if not yet started, 'past' if ended.
 */
function courseStatus(occurrence, now) {
    const nowMs = now.getTime();
    if (nowMs >= occurrence.startDateTime.getTime() && nowMs < occurrence.endDateTime.getTime())
        return 'active';

    if (nowMs < occurrence.startDateTime.getTime())
        return 'upcoming';

    return 'past';
}

const CourseIndicator = GObject.registerClass(
class CourseIndicator extends PanelMenu.Button {
    _init(onRefresh, onOpenPreferences) {
        super._init(0.0, 'Course Table Indicator');

        this._onRefresh = onRefresh;
        this._onOpenPreferences = onOpenPreferences;
        this._searchText = '';
        this._lastState = null;

        // Panel indicator: icon + label
        const panelBox = new St.BoxLayout({
            style_class: 'ct-panel-box',
            y_align: Clutter.ActorAlign.CENTER,
        });

        const panelIcon = new St.Icon({
            icon_name: 'appointment-symbolic',
            style_class: 'system-status-icon',
        });

        this._label = new St.Label({
            text: 'Course',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'ct-panel-label',
        });

        panelBox.add_child(panelIcon);
        panelBox.add_child(this._label);
        this.add_child(panelBox);
    }

    // ── UI Builder Helpers ─────────────────────────────────────────

    _createSectionHeading(text, iconName) {
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });

        const box = new St.BoxLayout({
            style_class: 'ct-section-heading',
            y_align: Clutter.ActorAlign.CENTER,
        });

        if (iconName) {
            box.add_child(new St.Icon({
                icon_name: iconName,
                style_class: 'ct-section-heading-icon',
            }));
        }

        box.add_child(new St.Label({
            text,
            style_class: 'ct-section-heading-label',
            y_align: Clutter.ActorAlign.CENTER,
        }));

        item.add_child(box);
        return item;
    }

    _createNextClassCard(nextOccurrence) {
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });

        const card = new St.BoxLayout({
            style_class: 'ct-next-card',
            vertical: true,
            x_expand: true,
        });

        card.add_child(new St.Label({
            text: nextOccurrence.name,
            style_class: 'ct-next-name',
        }));

        const detail = `${nextOccurrence.startText} - ${nextOccurrence.endText}  ·  ${nextOccurrence.location}`;
        card.add_child(new St.Label({
            text: detail,
            style_class: 'ct-next-detail',
        }));

        const badgeBox = new St.BoxLayout();
        badgeBox.add_child(new St.Label({
            text: `in ${formatDuration(nextOccurrence.minutesUntilStart)}`,
            style_class: 'ct-next-countdown',
        }));
        card.add_child(badgeBox);

        item.add_child(card);
        return item;
    }

    _createCourseRow(occurrence, now) {
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });

        const row = new St.BoxLayout({
            style_class: 'ct-course-row',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });

        // Status dot
        const status = courseStatus(occurrence, now);
        const dotStyleClass = `ct-status-dot ct-status-dot-${status}`;
        row.add_child(new St.Widget({style_class: dotStyleClass}));

        // Time column
        row.add_child(new St.Label({
            text: `${occurrence.startText} - ${occurrence.endText}`,
            style_class: 'ct-time-col',
            y_align: Clutter.ActorAlign.CENTER,
        }));

        // Name column (expands)
        row.add_child(new St.Label({
            text: occurrence.name,
            style_class: 'ct-name-col',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));

        // Location column
        row.add_child(new St.Label({
            text: occurrence.location,
            style_class: 'ct-location-col',
            y_align: Clutter.ActorAlign.CENTER,
        }));

        item.add_child(row);
        return item;
    }

    _createSearchRow(row) {
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });

        const rowBox = new St.BoxLayout({
            style_class: 'ct-course-row',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });

        // Weekday badge
        rowBox.add_child(new St.Label({
            text: weekdayLabel(row.weekday),
            style_class: 'ct-weekday-badge',
            y_align: Clutter.ActorAlign.CENTER,
        }));

        // Time column
        rowBox.add_child(new St.Label({
            text: `${row.startText} - ${row.endText}`,
            style_class: 'ct-time-col',
            y_align: Clutter.ActorAlign.CENTER,
        }));

        // Name column
        rowBox.add_child(new St.Label({
            text: row.name,
            style_class: 'ct-name-col',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));

        // Location column
        rowBox.add_child(new St.Label({
            text: row.location,
            style_class: 'ct-location-col',
            y_align: Clutter.ActorAlign.CENTER,
        }));

        item.add_child(rowBox);
        return item;
    }

    _createSummaryBar(stats) {
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });

        const text = `${stats.totalCourses} courses  ·  ${stats.todayConflicts} conflicts  ·  ${weekdayLabel(stats.busiestWeekday)} (${stats.busiestCount})`;
        item.add_child(new St.Label({
            text,
            style_class: 'ct-summary-bar',
            x_expand: true,
        }));

        return item;
    }

    _createActionButtons() {
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });

        const row = new St.BoxLayout({
            style_class: 'ct-action-row',
            x_expand: true,
        });

        // Refresh button
        const refreshBtn = new St.Button({
            style_class: 'ct-action-btn button',
            can_focus: true,
            x_expand: true,
        });
        const refreshBox = new St.BoxLayout({style_class: 'ct-action-btn', x_align: Clutter.ActorAlign.CENTER});
        refreshBox.add_child(new St.Icon({icon_name: 'view-refresh-symbolic', style_class: 'ct-action-btn-icon'}));
        refreshBox.add_child(new St.Label({text: 'Refresh', style_class: 'ct-action-btn-label', y_align: Clutter.ActorAlign.CENTER}));
        refreshBtn.set_child(refreshBox);
        refreshBtn.connect('clicked', () => {
            this._onRefresh();
        });

        // Settings button
        const settingsBtn = new St.Button({
            style_class: 'ct-action-btn button',
            can_focus: true,
            x_expand: true,
        });
        const settingsBox = new St.BoxLayout({style_class: 'ct-action-btn', x_align: Clutter.ActorAlign.CENTER});
        settingsBox.add_child(new St.Icon({icon_name: 'emblem-system-symbolic', style_class: 'ct-action-btn-icon'}));
        settingsBox.add_child(new St.Label({text: 'Settings', style_class: 'ct-action-btn-label', y_align: Clutter.ActorAlign.CENTER}));
        settingsBtn.set_child(settingsBox);
        settingsBtn.connect('clicked', () => {
            this._onOpenPreferences();
            this.menu.close();
        });

        row.add_child(refreshBtn);
        row.add_child(settingsBtn);
        item.add_child(row);
        return item;
    }

    // ── Filtering ──────────────────────────────────────────────────

    _filteredRows(rows) {
        if (!this._searchText)
            return rows.slice(0, 8);

        const key = this._searchText.toLowerCase();
        return rows.filter(row => {
            return row.name.toLowerCase().includes(key)
                || row.location.toLowerCase().includes(key)
                || row.teacher.toLowerCase().includes(key);
        }).slice(0, 12);
    }

    _addSearchEntry() {
        const inputItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });

        const entry = new St.Entry({
            text: this._searchText,
            hint_text: 'Search course / location / teacher\u2026',
            can_focus: true,
            x_expand: true,
            track_hover: true,
            style_class: 'ct-search-entry',
        });

        entry.get_clutter_text().connect('text-changed', () => {
            this._searchText = entry.get_text().trim();
            if (this._lastState)
                this.render(this._lastState);
        });

        inputItem.add_child(entry);
        this.menu.addMenuItem(inputItem);
    }

    _addSearchRows(rows) {
        const filtered = this._filteredRows(rows);

        if (filtered.length === 0) {
            const emptyItem = new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                can_focus: false,
            });
            emptyItem.add_child(new St.Label({
                text: 'No course matched current keyword.',
                style_class: 'ct-empty-message',
            }));
            this.menu.addMenuItem(emptyItem);
            return;
        }

        filtered.forEach(row => {
            this.menu.addMenuItem(this._createSearchRow(row));
        });
    }

    // ── Main Render ────────────────────────────────────────────────

    render(state) {
        this._lastState = state;
        this.menu.removeAll();

        const {nextOccurrence, todaySummary, allCourses, stats, now} = state;

        // Panel label
        if (nextOccurrence)
            this._label.set_text(`Next ${nextOccurrence.startText}`);
        else
            this._label.set_text('No Class');

        // ── Next Class section ──
        this.menu.addMenuItem(this._createSectionHeading('Next Class', 'alarm-symbolic'));

        if (nextOccurrence) {
            this.menu.addMenuItem(this._createNextClassCard(nextOccurrence));
        } else {
            const emptyItem = new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                can_focus: false,
            });
            emptyItem.add_child(new St.Label({
                text: 'No upcoming class in next 4 weeks.',
                style_class: 'ct-empty-message',
            }));
            this.menu.addMenuItem(emptyItem);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ── Today section ──
        this.menu.addMenuItem(this._createSectionHeading(`Today (${todaySummary.count})`, 'view-list-symbolic'));

        if (todaySummary.courses.length === 0) {
            const emptyItem = new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                can_focus: false,
            });
            emptyItem.add_child(new St.Label({
                text: 'No classes today.',
                style_class: 'ct-empty-message',
            }));
            this.menu.addMenuItem(emptyItem);
        } else {
            todaySummary.courses.forEach(item => {
                this.menu.addMenuItem(this._createCourseRow(item, now));
            });
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ── Summary bar ──
        this.menu.addMenuItem(this._createSummaryBar(stats));

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ── All Courses section ──
        this.menu.addMenuItem(this._createSectionHeading('All Courses', 'system-search-symbolic'));

        this._addSearchEntry();
        this._addSearchRows(allCourses);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ── Action buttons ──
        this.menu.addMenuItem(this._createActionButtons());
    }
});

export default class CourseTableExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._reminderScheduler = new ReminderScheduler((title, body) => Main.notify(title, body));

        this._indicator = new CourseIndicator(
            () => this._refreshView(),
            () => this.openPreferences()
        );

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._settingsSignals = [
            this._settings.connect('changed::schedule-file-path', () => this._refreshView()),
            this._settings.connect('changed::period-times-json', () => this._refreshView()),
            this._settings.connect('changed::week1-start-date', () => this._refreshView()),
        ];

        this._refreshView();
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
            this._refreshView();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (this._timerId) {
            GLib.Source.remove(this._timerId);
            this._timerId = 0;
        }

        if (this._settingsSignals && this._settings) {
            this._settingsSignals.forEach(signalId => this._settings.disconnect(signalId));
            this._settingsSignals = null;
        }

        this._settings = null;
        this._reminderScheduler = null;

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    _refreshView() {
        if (!this._indicator || !this._settings)
            return;

        const scheduleFilePath = this._settings.get_string('schedule-file-path');
        const periodTimes = parsePeriodTimesFromSettings(this._settings.get_string('period-times-json'));
        const week1StartDate = this._settings.get_string('week1-start-date');

        const schedule = loadScheduleFromPath(scheduleFilePath);

        const now = new Date();
        const options = {
            periodTimes,
            week1StartDate,
        };

        const nextOccurrence = findNextOccurrence(schedule, now, options);
        const todaySummary = summarizeToday(schedule, now, options);
        const allCourses = buildAllCourseRows(schedule, periodTimes);
        const rangeOccurrences = getOccurrencesInRange(schedule, now, 3, options);
        const stats = buildScheduleStats(schedule, todaySummary.courses);

        this._reminderScheduler.updateConfig({
            enabled: this._settings.get_boolean('notify-enabled'),
            minutesBefore: this._settings.get_int('notify-minutes-before'),
        });
        this._reminderScheduler.process(now, rangeOccurrences);

        this._indicator.render({
            nextOccurrence,
            todaySummary,
            allCourses,
            stats,
            now,
        });
    }
}
