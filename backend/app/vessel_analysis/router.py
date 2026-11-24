from fastapi import APIRouter
from pydantic import BaseModel

from .model import predict
from .report_generator import generate_report
from .video_utils import predict_video

router = APIRouter(prefix="/vessel-analysis", tags=["vessel-analysis"])


class PredictRequest(BaseModel):
    file_url: str


class VideoPredictRequest(BaseModel):
    file_url: str
    frame_stride: int = 5


@router.post("/predict")
def predict_vessel(req: PredictRequest):
    return predict(req.file_url)


@router.post("/report")
def predict_with_report(req: PredictRequest):
    analysis = predict(req.file_url)
    return {**analysis, "report": generate_report(analysis)}


@router.post("/predict-video")
def predict_vessel_video(req: VideoPredictRequest):
    analysis = predict_video(req.file_url, frame_stride=req.frame_stride)
    return {**analysis, "report": generate_report(analysis)}
