from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

# Profile Schemas
class ProfileBase(BaseModel):
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    college: Optional[str] = None
    degree: Optional[str] = None
    branch: Optional[str] = None
    graduation_year: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    github_url: Optional[str] = None
    summary: Optional[str] = None
    timezone: Optional[str] = "UTC"

class ProfileUpdate(ProfileBase):
    pass

class ProfileResponse(ProfileBase):
    id: str
    user_id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class ExperienceCreate(BaseModel):
    company: str
    position: str
    description: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_current: Optional[bool] = False

class ExperienceResponse(ExperienceCreate):
    id: str
    user_id: str
    created_at: Optional[str] = None

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    project_url: Optional[str] = None
    technologies: Optional[str] = None

class ProjectResponse(ProjectCreate):
    id: str
    user_id: str
    created_at: Optional[str] = None

# Answer Schemas
class AnswerCreate(BaseModel):
    question: str
    answer: str
    scope: str = Field(..., pattern="^(general|company|application)$")
    company: Optional[str] = None
    role: Optional[str] = None
    tags: Optional[str] = None

class AnswerUpdate(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    scope: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None
    tags: Optional[str] = None

class AnswerResponse(BaseModel):
    id: str
    user_id: str
    question: str
    answer: str
    scope: str
    company: Optional[str] = None
    role: Optional[str] = None
    tags: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    last_used_at: Optional[str] = None

class AnswerMatchRequest(BaseModel):
    question: str
    company: Optional[str] = None
    role: Optional[str] = None

class AnswerMatchResponse(BaseModel):
    matched: bool
    answer: Optional[AnswerResponse] = None
    confidence: float = 0.0
    match_type: str = "none" # "exact", "keyword", "fuzzy", "none"
    explanation: Optional[str] = None

# Application Schemas
class ApplicationCreate(BaseModel):
    company: str
    position: str
    job_url: Optional[str] = None
    source: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    status: Optional[str] = "Saved"
    applied_at: Optional[str] = None
    hr_email: Optional[str] = None
    notes: Optional[str] = None

class ApplicationUpdate(BaseModel):
    company: Optional[str] = None
    position: Optional[str] = None
    job_url: Optional[str] = None
    source: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    status: Optional[str] = None
    applied_at: Optional[str] = None
    hr_email: Optional[str] = None
    notes: Optional[str] = None

class ApplicationResponse(BaseModel):
    id: str
    user_id: str
    company: str
    position: str
    job_url: Optional[str] = None
    source: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    status: str
    applied_at: Optional[str] = None
    hr_email: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class ConfirmAppliedRequest(BaseModel):
    applied_at: Optional[str] = None
    create_reminder: bool = True
    reminder_days: int = 7

class ApplicationEventCreate(BaseModel):
    event_type: str
    previous_value: Optional[str] = None
    new_value: Optional[str] = None
    description: Optional[str] = None

class ApplicationEventResponse(BaseModel):
    id: str
    user_id: str
    application_id: str
    event_type: str
    previous_value: Optional[str] = None
    new_value: Optional[str] = None
    description: Optional[str] = None
    created_at: str

# Reminder Schemas
class ReminderCreate(BaseModel):
    application_id: str
    reminder_at: str
    type: Optional[str] = "follow_up"

class ReminderUpdate(BaseModel):
    reminder_at: Optional[str] = None
    status: Optional[str] = None

class ReminderResponse(BaseModel):
    id: str
    user_id: str
    application_id: str
    reminder_at: str
    type: str
    status: str
    sent_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None

# Follow-up Email Schemas
class FollowUpDraftRequest(BaseModel):
    recipient_name: Optional[str] = "Hiring Team"
    hr_email: Optional[str] = None
    notes: Optional[str] = None

class FollowUpDraftResponse(BaseModel):
    subject: str
    body: str
    recipient_email: Optional[str] = None
    mailto_url: str
    gmail_url: str

# Pairing Schemas
class GeneratePairingCodeRequest(BaseModel):
    device_type: str = Field(..., pattern="^(extension|telegram)$")

class GeneratePairingCodeResponse(BaseModel):
    code: str
    device_type: str
    expires_at: str

class VerifyPairingCodeRequest(BaseModel):
    code: str
    device_type: str = Field(..., pattern="^(extension|telegram)$")
    chat_id: Optional[str] = None

class VerifyPairingCodeResponse(BaseModel):
    success: bool
    user_id: str
    token: str
    message: str
    profile: Optional[Dict[str, Any]] = None

# Dashboard Schemas
class DashboardSummaryResponse(BaseModel):
    total_applications: int
    awaiting_response: int
    interviews: int
    follow_ups_due: int
    pipeline: Dict[str, int]
    telegram_connected: bool
    extension_connected: bool
