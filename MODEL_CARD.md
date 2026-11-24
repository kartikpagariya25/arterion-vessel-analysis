# Model card: Arterion Vessel Analysis

> Research prototype, not a medical device. Do not use for diagnosis or treatment decisions.

## Task
Coronary vessel segmentation, stenosis detection and severity estimation on angiograms.

## Model
two ResNet-34 U-Nets (vessel tree and stenosis); the stenosis network was initialised from the vessel network.

## Input and output
- **Input:** an angiogram image or video.
- **Output:** overlay, lesions with bounding boxes and narrowing %, and clinician and patient reports in English, Hindi and Marathi.

## Training and evaluation data
ARCADE; 300-image held-out test split.

## Results
- Vessel segmentation: Dice 0.774, IoU 0.644, precision 0.832, recall 0.743.
- Stenosis segmentation: Dice 0.594, IoU 0.450, precision 0.618, recall 0.658.
- Severity was checked only on a synthetic constriction (70.0 % predicted, 70 % expected).

Numbers in `training/artifacts/metrics.json` match the published weights.

## Limitations
- Severity has not been validated against clinical quantitative coronary angiography.
- Stenosis Dice 0.594 is just under the 0.60 target.
- Reports are rule-based by default; the optional LLM report needs an API key and sends the findings to that service.

## Intended use
Research, teaching and prototyping. Not for diagnosis, triage or any clinical decision, and not validated for any clinical setting.

## Licence and data terms
Code: MIT. Check the ARCADE dataset terms before reuse.
