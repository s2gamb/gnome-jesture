import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {WindowPreviewOverlay} from './switcherOverlay.js';

const GESTURE_FINGER_COUNT = 3;
const DRAG_THRESHOLD_DISTANCE = 16;

const TouchpadState = {
    NONE: 0,
    PENDING: 1,
    HANDLING: 2,
    IGNORED: 3,
};

export default class ThreeFingerDownWindowCycleExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._overlay = new WindowPreviewOverlay();
        this._resetState();

        global.stage.connectObject(
            'captured-event::touchpad',
            this._onTouchpadEvent.bind(this),
            this
        );
    }

    disable() {
        global.stage.disconnectObject(this);
        this._resetState();
        this._overlay?.destroy();
        this._overlay = null;
        this._settings = null;
    }

    _resetState() {
        this._overlay?.hide();
        this._state = TouchpadState.NONE;
        this._cumulativeX = 0;
        this._cumulativeY = 0;
        this._scrollAccumulator = 0;
        this._switchedCount = 0;
        this._activeCycleWindow = null;
        this._usingOverlay = false;
        this._sessionWindows = [];
        this._selectedIndex = -1;
    }

    _onTouchpadEvent(_actor, event) {
        if (event.type() !== Clutter.EventType.TOUCHPAD_SWIPE)
            return Clutter.EVENT_PROPAGATE;

        const phase = event.get_gesture_phase();
        if (phase === Clutter.TouchpadGesturePhase.BEGIN)
            this._resetState();

        if (event.get_touchpad_gesture_finger_count() !== GESTURE_FINGER_COUNT)
            return Clutter.EVENT_PROPAGATE;

        if (this._state === TouchpadState.IGNORED) {
            if (phase === Clutter.TouchpadGesturePhase.END ||
                phase === Clutter.TouchpadGesturePhase.CANCEL)
                this._resetState();

            return Clutter.EVENT_PROPAGATE;
        }

        const [dx, dy] = event.get_gesture_motion_delta_unaccelerated();

        if (this._state === TouchpadState.NONE) {
            if (phase === Clutter.TouchpadGesturePhase.END ||
                phase === Clutter.TouchpadGesturePhase.CANCEL)
                return Clutter.EVENT_PROPAGATE;

            if (dx === 0 && dy === 0)
                return Clutter.EVENT_PROPAGATE;

            this._cumulativeX = 0;
            this._cumulativeY = 0;
            this._scrollAccumulator = 0;
            this._switchedCount = 0;
            this._activeCycleWindow = null;
            this._usingOverlay = false;
            this._sessionWindows = [];
            this._selectedIndex = -1;
            this._state = TouchpadState.PENDING;
        }

        if (this._state === TouchpadState.PENDING) {
            if (phase === Clutter.TouchpadGesturePhase.END ||
                phase === Clutter.TouchpadGesturePhase.CANCEL) {
                this._resetState();
                return Clutter.EVENT_PROPAGATE;
            }

            this._cumulativeX += dx;
            this._cumulativeY += dy;

            const cdx = this._cumulativeX;
            const cdy = this._cumulativeY;
            const distance = Math.hypot(cdx, cdy);

            if (distance < DRAG_THRESHOLD_DISTANCE)
                return Clutter.EVENT_PROPAGATE;

            const isNormalDesktop =
                Main.actionMode === Shell.ActionMode.NORMAL &&
                !Main.overview.visible &&
                !Main.overview.visibleTarget;

            const isVerticalDown =
                Math.abs(cdy) > Math.abs(cdx) && cdy > 0;

            this._cumulativeX = 0;
            this._cumulativeY = 0;

            if (isNormalDesktop && isVerticalDown) {
                this._state = TouchpadState.HANDLING;
                this._scrollAccumulator = cdy;
                this._beginSwitchSession();
            } else {
                this._state = TouchpadState.IGNORED;
                return Clutter.EVENT_PROPAGATE;
            }
        } else if (this._state === TouchpadState.HANDLING &&
                   phase === Clutter.TouchpadGesturePhase.UPDATE) {
            this._scrollAccumulator += dy;
        }

        if (this._state !== TouchpadState.HANDLING)
            return Clutter.EVENT_PROPAGATE;

        const stepDistance = Math.max(10, this._settings.get_int('step-distance'));

        while (this._scrollAccumulator >= stepDistance) {
            this._stepSelection(1);
            this._scrollAccumulator -= stepDistance;
            this._switchedCount++;
        }

        while (this._scrollAccumulator <= -stepDistance) {
            this._stepSelection(-1);
            this._scrollAccumulator += stepDistance;
            this._switchedCount++;
        }

        if (phase === Clutter.TouchpadGesturePhase.END) {
            if (this._switchedCount === 0 &&
                this._scrollAccumulator > 0 &&
                this._settings.get_boolean('trigger-on-short-swipe'))
                this._stepSelection(1);

            this._finishSwitchSession();
            this._resetState();
        } else if (phase === Clutter.TouchpadGesturePhase.CANCEL) {
            this._resetState();
        }

        return Clutter.EVENT_STOP;
    }

    _beginSwitchSession() {
        this._usingOverlay = this._settings.get_boolean('show-preview-overlay');
        if (!this._usingOverlay)
            return;

        this._sessionWindows = this._getWorkspaceVisibleWindows();
        if (this._sessionWindows.length === 0)
            return;

        let focused = global.display.focus_window;
        if (focused?.is_attached_dialog())
            focused = focused.get_transient_for();

        const currentIndex = focused ? this._sessionWindows.indexOf(focused) : -1;
        this._selectedIndex = currentIndex !== -1 ? currentIndex : 0;

        this._overlay?.show(this._sessionWindows, this._selectedIndex);
    }

    _stepSelection(direction) {
        if (this._usingOverlay) {
            const count = this._sessionWindows.length;
            if (count === 0)
                return;

            this._selectedIndex = (this._selectedIndex + direction + count) % count;
            this._overlay?.select(this._selectedIndex);
        } else {
            this._cycleWindows(direction);
        }
    }

    _finishSwitchSession() {
        if (!this._usingOverlay)
            return;

        const targetWindow =
            this._selectedIndex >= 0 && this._selectedIndex < this._sessionWindows.length
                ? this._sessionWindows[this._selectedIndex]
                : null;

        this._overlay?.hide();

        if (targetWindow)
            Main.activateWindow(targetWindow);
    }

    _getWorkspaceVisibleWindows() {
        const workspace = global.workspace_manager.get_active_workspace();
        if (!workspace)
            return [];

        const rawWindows = global.display.get_tab_list(
            Meta.TabList.NORMAL_ALL,
            workspace
        );

        const windows = rawWindows
            .map(w => (w.is_attached_dialog() ? w.get_transient_for() : w))
            .filter((w, i, arr) =>
                w !== null &&
                !w.skip_taskbar &&
                arr.indexOf(w) === i
            );

        windows.sort((a, b) => a.get_stable_sequence() - b.get_stable_sequence());
        return windows;
    }

    _cycleWindows(direction = 1) {
        const windows = this._getWorkspaceVisibleWindows();
        if (windows.length === 0)
            return;

        if (windows.length === 1) {
            if (!windows[0].has_focus())
                Main.activateWindow(windows[0]);
            this._activeCycleWindow = windows[0];
            return;
        }

        let currentWindow = null;
        if (this._activeCycleWindow && windows.includes(this._activeCycleWindow)) {
            currentWindow = this._activeCycleWindow;
        } else {
            let focused = global.display.focus_window;
            if (focused?.is_attached_dialog())
                focused = focused.get_transient_for();
            currentWindow = focused;
        }

        const currentIndex = currentWindow ? windows.indexOf(currentWindow) : -1;
        const nextIndex = currentIndex !== -1
            ? (currentIndex + direction + windows.length) % windows.length
            : 0;

        const nextWindow = windows[nextIndex];
        this._activeCycleWindow = nextWindow;
        Main.activateWindow(nextWindow);
    }
}
