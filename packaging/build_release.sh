#!/usr/bin/env bash
set -euo pipefail

VERSION="0.6.0"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_RELEASE="${PROJECT_ROOT}/dist-release"

echo "============================================================"
echo "  Building Grocery Optimizer Release v${VERSION}"
echo "============================================================"

# 1. Build frontend
echo "▶ Building frontend static SPA bundle..."
cd "${PROJECT_ROOT}/frontend"
npm run build

# 2. Copy frontend assets to backend for packaging
echo "▶ Copying frontend dist to backend/frontend_dist..."
rm -rf "${PROJECT_ROOT}/backend/frontend_dist"
cp -r "${PROJECT_ROOT}/frontend/dist" "${PROJECT_ROOT}/backend/frontend_dist"

# 3. Build standalone binary with PyInstaller
echo "▶ Compiling standalone Linux executable with PyInstaller..."
cd "${PROJECT_ROOT}/backend"
./.venv/bin/pyinstaller \
  --name grocery-optimizer \
  --onefile \
  --noconfirm \
  --clean \
  --add-data "frontend_dist:frontend_dist" \
  --hidden-import "uvicorn.logging" \
  --hidden-import "uvicorn.loops" \
  --hidden-import "uvicorn.loops.auto" \
  --hidden-import "uvicorn.protocols" \
  --hidden-import "uvicorn.protocols.http" \
  --hidden-import "uvicorn.protocols.http.auto" \
  --hidden-import "uvicorn.lifespans" \
  --hidden-import "uvicorn.lifespans.on" \
  --hidden-import "sqlalchemy.dialects.sqlite" \
  --hidden-import "sqlalchemy.dialects.postgresql" \
  --collect-all "fastapi" \
  --collect-all "pydantic" \
  --collect-all "sqlalchemy" \
  app/desktop.py

BINARY_PATH="${PROJECT_ROOT}/backend/dist/grocery-optimizer"
if [ ! -f "${BINARY_PATH}" ]; then
    echo "ERROR: Standalone binary failed to build!"
    exit 1
fi
echo "✓ Standalone binary created at ${BINARY_PATH} ($(du -h "${BINARY_PATH}" | cut -f1))"

# Prepare release directory
rm -rf "${DIST_RELEASE}"
mkdir -p "${DIST_RELEASE}"

# 4. Create Portable Tarball (for Bazzite and any Linux distribution)
echo "▶ Assembling portable tarball (grocery-optimizer-${VERSION}-linux-x86_64.tar.gz)..."
TARBALL_STAGE="${PROJECT_ROOT}/backend/dist/tarball_stage"
rm -rf "${TARBALL_STAGE}"
mkdir -p "${TARBALL_STAGE}"

cp "${BINARY_PATH}" "${TARBALL_STAGE}/grocery-optimizer"
cp "${PROJECT_ROOT}/packaging/grocery-optimizer.desktop" "${TARBALL_STAGE}/grocery-optimizer.desktop"
cp "${PROJECT_ROOT}/packaging/grocery-optimizer.png" "${TARBALL_STAGE}/grocery-optimizer.png"
cp "${PROJECT_ROOT}/packaging/install.sh" "${TARBALL_STAGE}/install.sh"
cp "${PROJECT_ROOT}/packaging/uninstall.sh" "${TARBALL_STAGE}/uninstall.sh"

cat << 'EOF' > "${TARBALL_STAGE}/README.md"
# Grocery Optimizer — Portable Linux Release

Personal household grocery price hunter for Kroger and Meijer.

## Requirements
- 64-bit Linux (Bazzite, Linux Mint, Ubuntu, Fedora, Debian, Arch, etc.)
- No Python, Node.js, PostgreSQL, or Docker installation required.

## Installation
Run the install script to integrate with your desktop application menu:
```bash
./install.sh
```

## Running Directly
Or execute the standalone binary directly without installing:
```bash
./grocery-optimizer
```

## Data Storage
Your grocery lists, custom products, and recorded store prices are stored in your user directory:
`~/.local/share/grocery-optimizer/grocery_optimizer.db`

Backups can be exported and imported directly through the application's Backup button.
EOF

chmod +x "${TARBALL_STAGE}/grocery-optimizer" "${TARBALL_STAGE}/install.sh" "${TARBALL_STAGE}/uninstall.sh"

cd "${PROJECT_ROOT}/backend/dist"
tar -czf "${DIST_RELEASE}/grocery-optimizer-${VERSION}-linux-x86_64.tar.gz" -C tarball_stage .
echo "✓ Portable tarball created: ${DIST_RELEASE}/grocery-optimizer-${VERSION}-linux-x86_64.tar.gz ($(du -h "${DIST_RELEASE}/grocery-optimizer-${VERSION}-linux-x86_64.tar.gz" | cut -f1))"

# 5. Create Debian Package (.deb) for Linux Mint
echo "▶ Building native Debian package for Linux Mint (grocery-optimizer_${VERSION}_amd64.deb)..."
DEB_STAGE="${PROJECT_ROOT}/backend/dist/deb_stage"
rm -rf "${DEB_STAGE}"
mkdir -p "${DEB_STAGE}/DEBIAN"
mkdir -p "${DEB_STAGE}/usr/bin"
mkdir -p "${DEB_STAGE}/usr/share/applications"
mkdir -p "${DEB_STAGE}/usr/share/icons/hicolor/128x128/apps"

cp "${BINARY_PATH}" "${DEB_STAGE}/usr/bin/grocery-optimizer"
chmod +x "${DEB_STAGE}/usr/bin/grocery-optimizer"
cp "${PROJECT_ROOT}/packaging/grocery-optimizer.desktop" "${DEB_STAGE}/usr/share/applications/grocery-optimizer.desktop"
cp "${PROJECT_ROOT}/packaging/grocery-optimizer.png" "${DEB_STAGE}/usr/share/icons/hicolor/128x128/apps/grocery-optimizer.png"

cat << EOF > "${DEB_STAGE}/DEBIAN/control"
Package: grocery-optimizer
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: amd64
Maintainer: Grocery Optimizer Team <dev@groceryoptimizer.local>
Description: Personal household grocery price hunter for Kroger and Meijer
 Eliminates the repetitive process of searching Kroger and Meijer separately
 to find the best grocery prices and realistic shopping totals. Stores data
 securely and locally using SQLite in standard Linux XDG paths.
EOF

dpkg-deb --build "${DEB_STAGE}" "${DIST_RELEASE}/grocery-optimizer_${VERSION}_amd64.deb"
echo "✓ Debian package created: ${DIST_RELEASE}/grocery-optimizer_${VERSION}_amd64.deb ($(du -h "${DIST_RELEASE}/grocery-optimizer_${VERSION}_amd64.deb" | cut -f1))"

# 6. Generate Checksums
echo "▶ Generating SHA256 checksums..."
cd "${DIST_RELEASE}"
sha256sum grocery-optimizer* > SHA256SUMS
cat SHA256SUMS

echo "============================================================"
echo "  Release Packaging Complete!"
echo "============================================================"
