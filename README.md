# Course Table GNOME Extension

Course Table is a GNOME Shell 49 extension that shows class schedule status in the top bar, with today cards, next class countdown, search, reminders, and settings-driven schedule editing.

## Features
- Top bar indicator with `Next HH:MM` state.
- Dropdown menu with:
  - next class card
  - today's classes
  - searchable all-course list
  - schedule summary (total courses, conflicts, busiest weekday)
- Complex week rules:
  - start/end week
  - odd/even/all parity
  - skip weeks
  - extra weeks
  - date exceptions (cancel/override)
- Reminder policy:
  - notify once per class occurrence
  - default 30 minutes before class
- Settings UI:
  - week-1 date
  - schedule JSON path
  - period-times editor
  - course/week-rule JSON editor (validate/save)
- Import/export tools:
  - JSON import/export
  - screenshot OCR import pipeline (tesseract)

## Project Layout
- `extension/`: GNOME extension source and GSettings schema.
- `extension/lib/`: schedule engine, storage, reminders, and analysis modules.
- `scripts/`: import/export/OCR ingestion scripts.
- `tests/`: gjs tests for engine and reminder behavior.
- `data/schedule.sample.json`: sample schedule file.

## UUID / Compatibility
- UUID: `course-table@pengstem`
- GNOME Shell: `49`

## Build and Test
```bash
make lint
make test
make build
make pack
```

## Local Install
```bash
make install-local
make enable-local
# Disable if needed:
make disable-local
```

On Wayland, restart GNOME Shell by logging out/in after installation if extension changes are not reflected immediately.

## Schedule Data
Default path is controlled by GSettings key `schedule-file-path`:
- default value: `~/.config/course-table/schedule.json`

Schema summary for each course item:
```json
{
  "id": "course-id",
  "name": "Course Name",
  "location": "A101",
  "teacher": "Teacher",
  "weekday": 1,
  "startPeriod": 1,
  "endPeriod": 2,
  "weeksRule": {
    "startWeek": 1,
    "endWeek": 18,
    "parity": "all",
    "skipWeeks": [],
    "extraWeeks": []
  },
  "exceptions": [
    {"date": "2026-03-10", "action": "cancel", "note": "Holiday"},
    {"date": "2026-04-01", "action": "override", "weekday": 3, "startPeriod": 2, "endPeriod": 3, "note": "Temporary adjustment"}
  ]
}
```

## Import / Export
Import a JSON schedule:
```bash
node scripts/import-schedule.js --input ./data/schedule.sample.json
```

Export current schedule:
```bash
node scripts/export-schedule.js --output ./data/schedule.export.json
```

Import from screenshot via OCR:
```bash
node scripts/import-from-screenshot.js --image /path/to/timetable.png --term "2026 Spring"
```

Notes:
- OCR import is heuristic and expects recognizable weekday/period text.
- Parsed output is normalized and validated before save.

## Git Workflow
Current branch strategy:
- `main` for stable baseline
- `feature/course-table-extension` for incremental atomic commits

## GitHub Repository Creation (when `gh` auth is valid)
```bash
gh auth status -h github.com
gh repo create Course-Table --public --source . --remote origin --push
```

If auth is invalid, run:
```bash
gh auth login -h github.com
```

Then re-run repository creation command.
