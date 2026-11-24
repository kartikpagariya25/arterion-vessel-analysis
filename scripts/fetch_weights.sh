#!/usr/bin/env bash
# Downloads trained ONNX weights from the latest GitHub Release into backend/app/vessel_analysis/weights/
set -euo pipefail
REPO="kartikpagariya25/arterion-vessel-analysis"
DEST="$(dirname "$0")/../backend/app/vessel_analysis/weights"
mkdir -p "$DEST"
for f in vessel_model.onnx stenosis_model.onnx; do
  echo "Downloading $f ..."
  curl -fL --retry 3 -o "$DEST/$f" "https://github.com/$REPO/releases/latest/download/$f"
done
echo "Done."
