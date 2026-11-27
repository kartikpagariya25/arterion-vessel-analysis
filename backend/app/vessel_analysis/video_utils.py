import os
import tempfile
import cv2

from ..common import InvalidInput, fetch_bytes
from . import model as model_module
from .model import load_model, _preprocess, _run_model, _run_model_probs, _find_lesions, _make_overlay
from .severity import estimate_stenosis_percent, severity_band, display_confidence


def _download_video(file_url: str) -> str:
    data = fetch_bytes(file_url)
    suffix = os.path.splitext(file_url.split("?")[0])[1] or ".mp4"
    fd, path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    return path


def predict_video(file_url: str, frame_stride: int = 5) -> dict:
    video_path = _download_video(file_url)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened() or cap.get(cv2.CAP_PROP_FRAME_COUNT) < 1:
        cap.release()
        os.remove(video_path)
        raise InvalidInput("This endpoint needs a video file (MP4/AVI).")
    load_model()

    if model_module._vessel_session is None:
        cap.release()
        os.remove(video_path)
        return {
            "frames_analyzed": 0,
            "key_frame_index": None,
            "overlay_image_base64": None,
            "lesions": [],
            "summary": "Vessel analysis model weights not found, so training has not been completed.",
        }

    best_result = None
    best_score = -1.0
    frame_idx = 0
    frames_analyzed = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % frame_stride != 0:
                frame_idx += 1
                continue

            frame = cv2.resize(frame, (model_module.IMAGE_SIZE, model_module.IMAGE_SIZE))
            tensor = _preprocess(frame)
            vessel_mask = _run_model(model_module._vessel_session, tensor)
            stenosis_probs = _run_model_probs(model_module._stenosis_session, tensor)
            stenosis_mask = (stenosis_probs > 0.5).astype("uint8")

            lesion_boxes = _find_lesions(stenosis_mask)
            lesions = []
            overlay_lesions = []
            for bbox in lesion_boxes:
                pct = estimate_stenosis_percent(vessel_mask, bbox)
                band = severity_band(pct)
                confidence = display_confidence(band)
                lesions.append({"bbox": list(bbox), "stenosis_percent": round(pct, 1), "severity_band": band, "confidence": confidence})
                overlay_lesions.append((bbox, round(pct, 1), band, confidence))

            frames_analyzed += 1
            score = max((lesion["stenosis_percent"] for lesion in lesions), default=0.0)

            if score > best_score:
                best_score = score
                overlay_bytes = _make_overlay(frame, vessel_mask, overlay_lesions)
                best_result = {
                    "frame_index": frame_idx,
                    "overlay_bytes": overlay_bytes,
                    "original_bytes": model_module._encode_png(frame),
                    "lesions": lesions,
                }

            frame_idx += 1
    finally:
        cap.release()
        os.remove(video_path)

    import base64

    if best_result is None or not best_result["lesions"]:
        summary = "No significant stenosis detected across analyzed frames."
        key_frame = best_result["frame_index"] if best_result else None
        overlay_b64 = base64.b64encode(best_result["overlay_bytes"]).decode("utf-8") if best_result else None
        original_b64 = base64.b64encode(best_result["original_bytes"]).decode("utf-8") if best_result else None
        lesions = []
    else:
        worst = max(best_result["lesions"], key=lambda lesion: lesion["stenosis_percent"])
        summary = f"Worst frame ({best_result['frame_index']}): {len(best_result['lesions'])} lesion(s), most severe ~{worst['stenosis_percent']}% ({worst['severity_band']}, {worst['confidence']}% confidence)."
        key_frame = best_result["frame_index"]
        overlay_b64 = base64.b64encode(best_result["overlay_bytes"]).decode("utf-8")
        original_b64 = base64.b64encode(best_result["original_bytes"]).decode("utf-8")
        lesions = best_result["lesions"]

    return {
        "frames_analyzed": frames_analyzed,
        "key_frame_index": key_frame,
        "original_image_base64": original_b64,
        "overlay_image_base64": overlay_b64,
        "lesions": lesions,
        "summary": summary,
    }