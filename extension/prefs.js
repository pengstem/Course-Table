import Adw from "gi://Adw";
import Gtk from "gi://Gtk";

import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import { DEFAULT_PERIOD_TIMES } from "./constants.js";
import {
  normalizeSchedule,
  validateSchedule,
} from "./scheduleSchema.js";
import {
  loadScheduleFromPath,
  resolveSchedulePath,
  saveScheduleToPath,
} from "./storage.js";

function parsePeriodTimes(raw) {
  if (!raw) return DEFAULT_PERIOD_TIMES;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_PERIOD_TIMES;

    const result = {};
    for (const [period, window] of Object.entries(parsed)) {
      if (!window || typeof window !== "object") continue;
      if (typeof window.start !== "string" || typeof window.end !== "string")
        continue;
      result[period] = { start: window.start, end: window.end };
    }

    return Object.keys(result).length > 0 ? result : DEFAULT_PERIOD_TIMES;
  } catch (_error) {
    return DEFAULT_PERIOD_TIMES;
  }
}

function getBufferText(buffer) {
  const start = buffer.get_start_iter();
  const end = buffer.get_end_iter();
  return buffer.get_text(start, end, false);
}

function buildSampleCourse() {
  return {
    id: `course-${Date.now()}`,
    name: "New Course",
    location: "",
    teacher: "",
    weekday: 1,
    startPeriod: 1,
    endPeriod: 2,
    weeksRule: {
      startWeek: 1,
      endWeek: 18,
      parity: "all",
      skipWeeks: [],
      extraWeeks: [],
    },
    exceptions: [],
  };
}

function countScheduleStats(schedulePath) {
  const schedule = loadScheduleFromPath(schedulePath);
  const courses = Array.isArray(schedule?.courses) ? schedule.courses : [];

  const uniqueNames = new Set(courses.map((c) => c.name));
  const weekdayCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  for (const c of courses) {
    if (c.weekday >= 1 && c.weekday <= 7) weekdayCounts[c.weekday] += 1;
  }

  const busiestEntry = Object.entries(weekdayCounts).sort(
    (a, b) => b[1] - a[1],
  )[0];
  const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return {
    totalEntries: courses.length,
    uniqueCourses: uniqueNames.size,
    busiestDay: WEEKDAY_NAMES[Number(busiestEntry[0]) - 1],
    busiestCount: busiestEntry[1],
    termName: schedule?.meta?.termName || "",
    updatedAt: schedule?.meta?.updatedAt || "",
  };
}

export default class CourseTablePreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    window.set_default_size(900, 760);

    const settings = this.getSettings();
    if (!settings.get_string("period-times-json"))
      settings.set_string(
        "period-times-json",
        JSON.stringify(DEFAULT_PERIOD_TIMES),
      );

    this._addGeneralPage(window, settings);
    this._addSchedulePage(window, settings);
    this._addAboutPage(window);
  }

  // ── Page 1: General ────────────────────────────────────────────

  _addGeneralPage(window, settings) {
    const page = new Adw.PreferencesPage({
      title: "General",
      icon_name: "preferences-system-symbolic",
    });

    // --- Display group ---
    const displayGroup = new Adw.PreferencesGroup({
      title: "Display",
      description: "Panel indicator and menu display settings.",
    });

    const showModeRow = new Adw.ComboRow({
      title: "Panel Display Mode",
      subtitle: "What to show in the top bar indicator.",
      model: Gtk.StringList.new([
        "Today Card",
        "Next Class Only",
        "Minimal",
      ]),
    });
    const modeMap = ["today-card", "next-only", "minimal"];
    const currentMode = settings.get_string("show-mode");
    const modeIdx = modeMap.indexOf(currentMode);
    showModeRow.set_selected(modeIdx >= 0 ? modeIdx : 0);
    showModeRow.connect("notify::selected", (row) => {
      settings.set_string("show-mode", modeMap[row.get_selected()] ?? "today-card");
    });

    const refreshRow = new Adw.ActionRow({
      title: "Refresh Interval",
      subtitle: "How often to update the panel (seconds).",
    });
    const refreshSpin = Gtk.SpinButton.new_with_range(10, 300, 5);
    refreshSpin.set_value(settings.get_int("refresh-interval"));
    refreshSpin.connect("value-changed", (spin) =>
      settings.set_int("refresh-interval", spin.get_value_as_int()),
    );
    refreshRow.add_suffix(refreshSpin);
    refreshRow.activatable_widget = refreshSpin;

    displayGroup.add(showModeRow);
    displayGroup.add(refreshRow);

    // --- Notifications group ---
    const notifyGroup = new Adw.PreferencesGroup({
      title: "Notifications",
      description: "Pre-class reminder settings.",
    });

    const notifyRow = new Adw.SwitchRow({
      title: "Enable Notifications",
      subtitle: "Show a reminder before each class starts.",
      active: settings.get_boolean("notify-enabled"),
    });
    notifyRow.connect("notify::active", (row) =>
      settings.set_boolean("notify-enabled", row.get_active()),
    );

    const remindRow = new Adw.ActionRow({
      title: "Minutes Before Class",
      subtitle: "How early to send the reminder.",
    });
    const remindSpin = Gtk.SpinButton.new_with_range(1, 180, 1);
    remindSpin.set_value(settings.get_int("notify-minutes-before"));
    remindSpin.connect("value-changed", (spin) =>
      settings.set_int("notify-minutes-before", spin.get_value_as_int()),
    );
    remindRow.add_suffix(remindSpin);
    remindRow.activatable_widget = remindSpin;

    notifyGroup.add(notifyRow);
    notifyGroup.add(remindRow);

    // --- Data paths group ---
    const pathsGroup = new Adw.PreferencesGroup({
      title: "Data",
      description: "Schedule file location and semester configuration.",
    });

    const fileRow = new Adw.EntryRow({
      title: "Schedule JSON Path",
      text: settings.get_string("schedule-file-path"),
    });
    fileRow.connect("changed", (row) =>
      settings.set_string("schedule-file-path", row.get_text()),
    );

    const week1Row = new Adw.EntryRow({
      title: "Week 1 Start Date (YYYY-MM-DD)",
      text: settings.get_string("week1-start-date"),
    });
    week1Row.connect("changed", (row) =>
      settings.set_string("week1-start-date", row.get_text()),
    );

    const resolvedRow = new Adw.ActionRow({
      title: "Resolved Path",
      subtitle: resolveSchedulePath(settings.get_string("schedule-file-path")),
    });
    resolvedRow.add_suffix(
      new Gtk.Image({ icon_name: "folder-symbolic", margin_end: 4 }),
    );

    pathsGroup.add(fileRow);
    pathsGroup.add(week1Row);
    pathsGroup.add(resolvedRow);

    page.add(displayGroup);
    page.add(notifyGroup);
    page.add(pathsGroup);
    window.add(page);
  }

  // ── Page 2: Schedule ───────────────────────────────────────────

  _addSchedulePage(window, settings) {
    const page = new Adw.PreferencesPage({
      title: "Schedule",
      icon_name: "x-office-calendar-symbolic",
    });

    // --- Overview group ---
    const schedulePath = settings.get_string("schedule-file-path");
    const stats = countScheduleStats(schedulePath);

    const overviewGroup = new Adw.PreferencesGroup({
      title: "Overview",
      description: stats.termName
        ? `Term: ${stats.termName}`
        : "Schedule statistics at a glance.",
    });

    const totalRow = new Adw.ActionRow({
      title: "Total Entries",
      subtitle: `${stats.totalEntries} entries (${stats.uniqueCourses} unique courses)`,
    });
    totalRow.add_suffix(
      new Gtk.Image({ icon_name: "view-list-symbolic", margin_end: 4 }),
    );

    const busiestRow = new Adw.ActionRow({
      title: "Busiest Day",
      subtitle:
        stats.busiestCount > 0
          ? `${stats.busiestDay} with ${stats.busiestCount} classes`
          : "No courses loaded",
    });
    busiestRow.add_suffix(
      new Gtk.Image({ icon_name: "starred-symbolic", margin_end: 4 }),
    );

    const updatedRow = new Adw.ActionRow({
      title: "Last Updated",
      subtitle: stats.updatedAt || "Never",
    });
    updatedRow.add_suffix(
      new Gtk.Image({
        icon_name: "document-open-recent-symbolic",
        margin_end: 4,
      }),
    );

    overviewGroup.add(totalRow);
    overviewGroup.add(busiestRow);
    overviewGroup.add(updatedRow);

    // --- Editors group ---
    const editorGroup = new Adw.PreferencesGroup({
      title: "Editors",
      description: "Edit period times and course data.",
    });

    const periodEditorRow = new Adw.ActionRow({
      title: "Period Times",
      subtitle: "Configure start and end times for each period.",
    });
    const periodBtn = new Gtk.Button({
      label: "Edit",
      valign: Gtk.Align.CENTER,
      css_classes: ["suggested-action"],
    });
    periodBtn.connect("clicked", () =>
      this._openPeriodEditor(window, settings),
    );
    periodEditorRow.add_suffix(periodBtn);
    periodEditorRow.activatable_widget = periodBtn;

    const courseEditorRow = new Adw.ActionRow({
      title: "Courses & Week Rules",
      subtitle:
        "Edit course JSON with skip/extra weeks and date overrides.",
    });
    const courseBtn = new Gtk.Button({
      label: "Edit",
      valign: Gtk.Align.CENTER,
      css_classes: ["suggested-action"],
    });
    courseBtn.connect("clicked", () =>
      this._openScheduleEditor(window, settings),
    );
    courseEditorRow.add_suffix(courseBtn);
    courseEditorRow.activatable_widget = courseBtn;

    editorGroup.add(periodEditorRow);
    editorGroup.add(courseEditorRow);

    page.add(overviewGroup);
    page.add(editorGroup);
    window.add(page);
  }

  // ── Page 3: About ──────────────────────────────────────────────

  _addAboutPage(window) {
    const page = new Adw.PreferencesPage({
      title: "About",
      icon_name: "help-about-symbolic",
    });

    const aboutGroup = new Adw.PreferencesGroup({
      title: "Course Table",
      description: "Top bar course schedule, reminders, and quick search.",
    });

    const versionRow = new Adw.ActionRow({
      title: "Version",
      subtitle: "2",
    });
    versionRow.add_suffix(
      new Gtk.Image({ icon_name: "emblem-default-symbolic", margin_end: 4 }),
    );

    const authorRow = new Adw.ActionRow({
      title: "Author",
      subtitle: "pengstem",
    });
    authorRow.add_suffix(
      new Gtk.Image({ icon_name: "avatar-default-symbolic", margin_end: 4 }),
    );

    const repoRow = new Adw.ActionRow({
      title: "Repository",
      subtitle: "https://github.com/pengstem/Course-Table",
    });
    repoRow.add_suffix(
      new Gtk.Image({
        icon_name: "web-browser-symbolic",
        margin_end: 4,
      }),
    );

    const gnomeRow = new Adw.ActionRow({
      title: "GNOME Shell",
      subtitle: "49+",
    });
    gnomeRow.add_suffix(
      new Gtk.Image({
        icon_name: "application-x-addon-symbolic",
        margin_end: 4,
      }),
    );

    aboutGroup.add(versionRow);
    aboutGroup.add(authorRow);
    aboutGroup.add(repoRow);
    aboutGroup.add(gnomeRow);

    // --- Tips group ---
    const tipsGroup = new Adw.PreferencesGroup({
      title: "Tips",
      description: "Useful information for managing your schedule.",
    });

    const tipWeekdays = new Adw.ActionRow({
      title: "Multi-day Courses",
      subtitle:
        'Use "weekdays": [1, 3] in JSON to schedule a course on multiple days.',
    });
    tipWeekdays.add_suffix(
      new Gtk.Image({
        icon_name: "dialog-information-symbolic",
        margin_end: 4,
      }),
    );

    const tipImport = new Adw.ActionRow({
      title: "Import from Screenshot",
      subtitle:
        "Use scripts/import-from-screenshot.js with --image flag to OCR import.",
    });
    tipImport.add_suffix(
      new Gtk.Image({
        icon_name: "dialog-information-symbolic",
        margin_end: 4,
      }),
    );

    tipsGroup.add(tipWeekdays);
    tipsGroup.add(tipImport);

    page.add(aboutGroup);
    page.add(tipsGroup);
    window.add(page);
  }

  // ── Period Editor Dialog ───────────────────────────────────────

  _openPeriodEditor(parentWindow, settings) {
    const current = parsePeriodTimes(
      settings.get_string("period-times-json"),
    );

    const dialog = new Adw.PreferencesWindow({
      title: "Period Times",
      transient_for: parentWindow,
      modal: true,
      default_width: 500,
      default_height: 700,
    });

    const page = new Adw.PreferencesPage({
      title: "Period Times",
      icon_name: "appointment-symbolic",
    });

    // Morning group
    const morningGroup = new Adw.PreferencesGroup({
      title: "Morning",
      description: "Periods 1 \u2013 5",
    });

    // Afternoon group
    const afternoonGroup = new Adw.PreferencesGroup({
      title: "Afternoon",
      description: "Periods 6 \u2013 10",
    });

    // Evening group
    const eveningGroup = new Adw.PreferencesGroup({
      title: "Evening",
      description: "Periods 11 \u2013 13",
    });

    const rows = [];

    for (let period = 1; period <= 13; period++) {
      const row = new Adw.ActionRow({
        title: `Period ${period}`,
      });

      const startEntry = new Gtk.Entry({
        text: current[String(period)]?.start ?? "",
        placeholder_text: "HH:MM",
        width_chars: 6,
        valign: Gtk.Align.CENTER,
      });

      const dashLabel = new Gtk.Label({
        label: "\u2013",
        valign: Gtk.Align.CENTER,
        margin_start: 4,
        margin_end: 4,
      });

      const endEntry = new Gtk.Entry({
        text: current[String(period)]?.end ?? "",
        placeholder_text: "HH:MM",
        width_chars: 6,
        valign: Gtk.Align.CENTER,
      });

      row.add_suffix(startEntry);
      row.add_suffix(dashLabel);
      row.add_suffix(endEntry);

      rows.push({ period: String(period), start: startEntry, end: endEntry });

      if (period <= 5) morningGroup.add(row);
      else if (period <= 10) afternoonGroup.add(row);
      else eveningGroup.add(row);
    }

    // Actions group
    const actionsGroup = new Adw.PreferencesGroup();

    const statusRow = new Adw.ActionRow({
      title: "Status",
      subtitle: "Ready",
    });

    const saveBtn = new Gtk.Button({
      label: "Save",
      valign: Gtk.Align.CENTER,
      css_classes: ["suggested-action"],
    });
    saveBtn.connect("clicked", () => {
      const next = {};
      for (const entry of rows) {
        const startVal = entry.start.get_text().trim();
        const endVal = entry.end.get_text().trim();
        if (!startVal || !endVal) continue;
        next[entry.period] = { start: startVal, end: endVal };
      }
      if (Object.keys(next).length === 0) {
        statusRow.set_subtitle("No valid period rows to save.");
        return;
      }
      settings.set_string("period-times-json", JSON.stringify(next));
      statusRow.set_subtitle("Saved period times.");
    });

    const resetBtn = new Gtk.Button({
      label: "Reset to Defaults",
      valign: Gtk.Align.CENTER,
      css_classes: ["destructive-action"],
    });
    resetBtn.connect("clicked", () => {
      for (const entry of rows) {
        const def = DEFAULT_PERIOD_TIMES[entry.period];
        if (def) {
          entry.start.set_text(def.start);
          entry.end.set_text(def.end);
        } else {
          entry.start.set_text("");
          entry.end.set_text("");
        }
      }
      statusRow.set_subtitle("Reset to defaults (not yet saved).");
    });

    statusRow.add_suffix(resetBtn);
    statusRow.add_suffix(saveBtn);
    actionsGroup.add(statusRow);

    page.add(morningGroup);
    page.add(afternoonGroup);
    page.add(eveningGroup);
    page.add(actionsGroup);
    dialog.add(page);
    dialog.present();
  }

  // ── Schedule Editor Dialog ─────────────────────────────────────

  _openScheduleEditor(parentWindow, settings) {
    const schedulePath = settings.get_string("schedule-file-path");
    const existing = loadScheduleFromPath(schedulePath);

    const dialog = new Gtk.Window({
      title: "Courses and Week Rules Editor",
      transient_for: parentWindow,
      modal: true,
      default_width: 980,
      default_height: 760,
    });

    const headerBar = new Gtk.HeaderBar();
    dialog.set_titlebar(headerBar);

    const root = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 8,
      margin_top: 12,
      margin_bottom: 12,
      margin_start: 12,
      margin_end: 12,
    });

    const hint = new Gtk.Label({
      xalign: 0,
      wrap: true,
      label:
        'Edit JSON directly. Use "weekdays": [1, 3] for multi-day courses. weeksRule supports startWeek/endWeek/parity/skipWeeks/extraWeeks.',
      css_classes: ["dim-label"],
    });
    root.append(hint);

    const scroller = new Gtk.ScrolledWindow({
      vexpand: true,
      hexpand: true,
      min_content_height: 450,
    });

    const textView = new Gtk.TextView({
      monospace: true,
      vexpand: true,
      hexpand: true,
      top_margin: 8,
      bottom_margin: 8,
      left_margin: 8,
      right_margin: 8,
    });
    const buffer = textView.get_buffer();
    buffer.set_text(JSON.stringify(existing, null, 2), -1);

    scroller.set_child(textView);
    root.append(scroller);

    const status = new Gtk.Label({
      xalign: 0,
      wrap: true,
      css_classes: ["dim-label"],
      label: `Path: ${resolveSchedulePath(schedulePath)}`,
    });
    root.append(status);

    const actions = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 8,
      halign: Gtk.Align.END,
    });

    const reload = new Gtk.Button({ label: "Reload" });
    const addTemplate = new Gtk.Button({ label: "Add Course Template" });
    const validate = new Gtk.Button({ label: "Validate" });
    const save = new Gtk.Button({
      label: "Save",
      css_classes: ["suggested-action"],
    });
    const close = new Gtk.Button({
      label: "Close",
      css_classes: ["destructive-action"],
    });

    reload.connect("clicked", () => {
      const fresh = loadScheduleFromPath(schedulePath);
      buffer.set_text(JSON.stringify(fresh, null, 2), -1);
      status.set_label("Reloaded from file.");
    });

    addTemplate.connect("clicked", () => {
      try {
        const current = normalizeSchedule(
          JSON.parse(getBufferText(buffer)),
        );
        current.courses.push(buildSampleCourse());
        buffer.set_text(JSON.stringify(current, null, 2), -1);
        status.set_label("Added course template.");
      } catch (_error) {
        status.set_label("Cannot add template: current JSON is invalid.");
      }
    });

    validate.connect("clicked", () => {
      try {
        const normalized = normalizeSchedule(
          JSON.parse(getBufferText(buffer)),
        );
        const errors = validateSchedule(normalized);
        if (errors.length === 0) status.set_label("Validation passed.");
        else
          status.set_label(
            `Validation failed: ${errors.slice(0, 4).join(" | ")}`,
          );
      } catch (error) {
        status.set_label(`JSON parse failed: ${error.message}`);
      }
    });

    save.connect("clicked", () => {
      try {
        const normalized = normalizeSchedule(
          JSON.parse(getBufferText(buffer)),
        );
        const errors = validateSchedule(normalized);
        if (errors.length > 0) {
          status.set_label(
            `Save blocked by validation: ${errors.slice(0, 4).join(" | ")}`,
          );
          return;
        }
        const path = saveScheduleToPath(schedulePath, normalized);
        status.set_label(`Saved to ${path}`);
      } catch (error) {
        status.set_label(`Save failed: ${error.message}`);
      }
    });

    close.connect("clicked", () => dialog.close());

    actions.append(reload);
    actions.append(addTemplate);
    actions.append(validate);
    actions.append(save);
    actions.append(close);

    root.append(actions);
    dialog.set_child(root);
    dialog.present();
  }
}
