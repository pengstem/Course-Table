# Course Table GNOME Extension

A GNOME Shell extension for course schedule display, quick lookup, and reminders.

## Goals
- Show today's classes and next class in the top bar.
- Provide searchable course list from a local JSON schedule.
- Support complex week rules (start/end, odd/even, skip weeks, extra weeks, date overrides).
- Notify once per class occurrence, 30 minutes before start time.
- Provide settings UI for editing courses and period times.

## Status
Initial implementation in progress on branch `feature/course-table-extension`.

## Planned Structure
- `extension/`: GNOME extension source files.
- `scripts/`: helper scripts (build, install, import).
- `tests/`: logic tests for schedule matching and reminders.

