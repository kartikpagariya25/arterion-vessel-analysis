"""The one number worth trending for each task in this service."""
from typing import Callable, Dict, Optional, Tuple


def _number(value) -> Optional[float]:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _peak_stenosis(result: dict) -> Optional[float]:
    values = [_number(l.get("stenosis_percent")) for l in result.get("lesions") or [] if isinstance(l, dict)]
    values = [v for v in values if v is not None]
    return max(values) if values else None


METRICS: Dict[str, Tuple[str, str, Callable[[dict], Optional[float]]]] = {
    "vessel-analysis": ("Peak stenosis", "%", _peak_stenosis),
    "vessel-analysis-video": ("Peak stenosis (video)", "%", _peak_stenosis),
}
