from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel

from ..accounts.deps import optional_user
from ..accounts.history import record_analysis
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
def predict_vessel(req: PredictRequest, response: Response, user=Depends(optional_user)):
    result = predict(req.file_url)
    record_analysis(user, "vessel-analysis", req.file_url, result, response)
    return result


@router.post("/report")
def predict_with_report(req: PredictRequest, response: Response, user=Depends(optional_user)):
    analysis = predict(req.file_url)
    result = {**analysis, "report": generate_report(analysis)}
    record_analysis(user, "vessel-analysis", req.file_url, result, response)
    return result


@router.post("/predict-video")
def predict_vessel_video(req: VideoPredictRequest, response: Response, user=Depends(optional_user)):
    analysis = predict_video(req.file_url, frame_stride=req.frame_stride)
    result = {**analysis, "report": generate_report(analysis)}
    record_analysis(user, "vessel-analysis-video", req.file_url, result, response)
    return result
