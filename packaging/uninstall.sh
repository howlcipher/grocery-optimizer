#!/usr/bin/env bash
set -euo pipefail

echo "Uninstalling Grocery Optimizer..."

rm -f "${HOME}/.local/bin/grocery-optimizer"
rm -f "${HOME}/.local/share/applications/grocery-optimizer.desktop"
rm -f "${HOME}/.local/share/icons/hicolor/128x128/apps/grocery-optimizer.png"

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "${HOME}/.local/share/applications" || true
fi

echo "Grocery Optimizer uninstalled successfully."
echo "Note: Your household database at ~/.local/share/grocery-optimizer/ has been preserved."
