from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class DocumentResponse(BaseModel):
    id: str
    filename: str
    tag: Optional[str]
    page_count: Optional[int]
    chunk_count: Optional[int]
    status: str
    error_message: Optional[str]
    uploaded_by: str
    uploaded_at: datetime

    class Config:
        from_attributes = True
