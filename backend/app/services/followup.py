import urllib.parse
from typing import Dict, Any, Optional

def generate_followup_draft(
    company: str,
    position: str,
    student_name: str,
    applied_date_str: Optional[str] = None,
    hr_email: Optional[str] = None,
    recipient_name: Optional[str] = "Hiring Team",
    extra_notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generates a professional follow-up email draft and prefilled composer links.
    Never invents HR email addresses. Never sends automatically.
    """
    clean_company = company.strip()
    clean_position = position.strip()
    clean_student = student_name.strip() or "Applicant"
    recipient = (recipient_name or "Hiring Team").strip()
    
    subject = f"Follow-up on {clean_position} Application - {clean_student}"
    
    body_paragraphs = [
        f"Dear {recipient},",
        "",
        "I hope you are doing well.",
        "",
        f"I recently applied for the {clean_position} position at {clean_company} and wanted to follow up regarding the status of my application.",
        "",
        "I remain very enthusiastic about the opportunity and would appreciate any updates you might be able to share regarding the next steps in the hiring process."
    ]
    
    if extra_notes and extra_notes.strip():
        body_paragraphs.append("")
        body_paragraphs.append(extra_notes.strip())
        
    body_paragraphs.extend([
        "",
        "Thank you very much for your time and consideration.",
        "",
        "Best regards,",
        clean_student
    ])
    
    body = "\n".join(body_paragraphs)
    
    # Generate mailto link
    email_target = hr_email.strip() if hr_email and hr_email.strip() else ""
    query_params = {
        "subject": subject,
        "body": body
    }
    mailto_url = f"mailto:{email_target}?" + urllib.parse.urlencode(query_params)
    
    # Generate Gmail web compose link
    gmail_params = {
        "view": "cm",
        "fs": "1",
        "to": email_target,
        "su": subject,
        "body": body
    }
    gmail_url = "https://mail.google.com/mail/?" + urllib.parse.urlencode(gmail_params)
    
    return {
        "subject": subject,
        "body": body,
        "recipient_email": email_target if email_target else None,
        "mailto_url": mailto_url,
        "gmail_url": gmail_url
    }
