#!/usr/bin/env bash
set -euo pipefail

echo "============================================================"
echo "  Installing Grocery Optimizer (Personal Linux Release)"
echo "============================================================"

INSTALL_BIN="${HOME}/.local/bin"
INSTALL_APPS="${HOME}/.local/share/applications"
INSTALL_ICONS="${HOME}/.local/share/icons/hicolor/128x128/apps"

mkdir -p "${INSTALL_BIN}"
mkdir -p "${INSTALL_APPS}"
mkdir -p "${INSTALL_ICONS}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Copy binary
echo "▶ Installing application binary to ${INSTALL_BIN}/grocery-optimizer..."
cp "${SCRIPT_DIR}/grocery-optimizer" "${INSTALL_BIN}/grocery-optimizer"
chmod +x "${INSTALL_BIN}/grocery-optimizer"

# Copy desktop launcher
echo "▶ Installing desktop launcher to ${INSTALL_APPS}/grocery-optimizer.desktop..."
cp "${SCRIPT_DIR}/grocery-optimizer.desktop" "${INSTALL_APPS}/grocery-optimizer.desktop"

# Copy icon
echo "▶ Installing icon to ${INSTALL_ICONS}/grocery-optimizer.png..."
cp "${SCRIPT_DIR}/grocery-optimizer.png" "${INSTALL_ICONS}/grocery-optimizer.png"

# Update desktop database if available
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "${INSTALL_APPS}" || true
fi

echo "============================================================"
echo "  Installation Complete!"
echo "============================================================"
echo "  Launch Grocery Optimizer from your Application Menu"
echo "  or run in terminal: ~/.local/bin/grocery-optimizer"
echo "============================================================"
