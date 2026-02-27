EXT_UUID := course-table@pengstem
EXT_DIR := extension
BUILD_ROOT := build
BUILD_DIR := $(BUILD_ROOT)/$(EXT_UUID)
DIST_DIR := dist
ZIP_PATH := $(DIST_DIR)/$(EXT_UUID).zip
LOCAL_EXT_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(EXT_UUID)

.PHONY: clean build pack install-local enable-local disable-local test lint

clean:
	rm -rf $(BUILD_ROOT) $(DIST_DIR)

build: clean
	mkdir -p $(BUILD_DIR)
	cp -r $(EXT_DIR)/* $(BUILD_DIR)/
	glib-compile-schemas $(BUILD_DIR)/schemas

pack: build
	mkdir -p $(DIST_DIR)
	cd $(BUILD_DIR) && zip -rq ../../$(ZIP_PATH) .
	@echo "Created package: $(ZIP_PATH)"

install-local: build
	rm -rf $(LOCAL_EXT_DIR)
	mkdir -p $(HOME)/.local/share/gnome-shell/extensions
	cp -r $(BUILD_DIR) $(LOCAL_EXT_DIR)
	@echo "Installed to: $(LOCAL_EXT_DIR)"

enable-local:
	gnome-extensions enable $(EXT_UUID)

disable-local:
	gnome-extensions disable $(EXT_UUID)

test:
	gjs -m tests/run-tests.js

lint:
	node --check scripts/schedule-utils.js
	node --check scripts/import-schedule.js
	node --check scripts/export-schedule.js
	node --check scripts/import-from-screenshot.js
	gjs -m extension/lib/constants.js
	gjs -m extension/lib/scheduleSchema.js
	gjs -m extension/lib/scheduleEngine.js
	gjs -m extension/lib/analysis.js
	gjs -m extension/lib/reminders.js
