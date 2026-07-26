#!/usr/bin/env bash
# ──────────────────────────────────────────────
# OpenClaw + dependencias — Setup para DistriMM
# Ejecutar: bash scripts/openclaw-setup.sh
# ──────────────────────────────────────────────
set -euo pipefail

echo "=== 1/4  Instalando OpenClaw ==="
if command -v openclaw &>/dev/null; then
  echo "OpenClaw ya instalado: $(openclaw --version 2>/dev/null || echo 'ok')"
else
  npm i -g openclaw
fi

echo "=== 2/4  Onboarding (si es primera vez) ==="
if [ ! -d "$HOME/.openclaw" ]; then
  echo "Ejecuta manualmente: openclaw onboard"
  echo "  -> Configura tu API key (Claude recomendado)"
  echo "  -> Habilita acceso a archivos y shell"
fi

echo "=== 3/4  Instalando Chromium (Playwright) ==="
npx playwright install chromium 2>/dev/null || echo "Playwright chromium ya instalado o no disponible"

echo "=== 4/4  Creando directorio de reportes ==="
mkdir -p "$(dirname "$0")/../audit-reports"

echo ""
echo "=== Setup completo ==="
echo "Siguiente paso:"
echo "  1. Si no has hecho onboard:  openclaw onboard"
echo "  2. Para lanzar la auditoría: bash scripts/openclaw-audit.sh"
