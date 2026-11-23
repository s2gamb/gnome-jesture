#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UUID="three-finger-down-window-cycle@local"
TARGET_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

echo "Compiling GSettings schema..."
glib-compile-schemas --strict "${SCRIPT_DIR}/schemas"

echo "Installing extension to ${TARGET_DIR}..."
rm -rf "${TARGET_DIR}"
mkdir -p "${TARGET_DIR}/schemas"
cp "${SCRIPT_DIR}/metadata.json" "${TARGET_DIR}/"
cp "${SCRIPT_DIR}/extension.js" "${TARGET_DIR}/"
cp "${SCRIPT_DIR}/switcherOverlay.js" "${TARGET_DIR}/"
cp "${SCRIPT_DIR}/stylesheet.css" "${TARGET_DIR}/"
cp "${SCRIPT_DIR}/prefs.js" "${TARGET_DIR}/"
cp "${SCRIPT_DIR}/schemas/"*.gschema.xml "${TARGET_DIR}/schemas/"
cp "${SCRIPT_DIR}/schemas/gschemas.compiled" "${TARGET_DIR}/schemas/"

echo "Enabling ${UUID} in gsettings..."
if gnome-extensions info "${UUID}" >/dev/null 2>&1; then
    gnome-extensions enable "${UUID}"
else
    # Extension not yet registered in the currently running Wayland session;
    # add it to enabled-extensions so it is enabled automatically on login (or when loaded via Looking Glass).
    python3 - <<PY
import ast, subprocess

uuid = "${UUID}"
current = subprocess.check_output(
    ["gsettings", "get", "org.gnome.shell", "enabled-extensions"],
    text=True
).strip()

if current.startswith("@as "):
    current = current[4:]
exts = list(ast.literal_eval(current))
if uuid not in exts:
    exts.append(uuid)
subprocess.check_call(
    ["gsettings", "set", "org.gnome.shell", "enabled-extensions", str(exts)]
)
print("Updated enabled-extensions:", exts)
PY
fi

echo "Done! Installed to ${TARGET_DIR}."
