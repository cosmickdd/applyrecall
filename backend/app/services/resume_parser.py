"""Resume text extraction and profile field parsing.

Used by the profile autofill endpoint so students do not have to retype details
that are already written in their resume. Extraction is intentionally rule-based
and deterministic: it only reports values it can actually find in the document,
and never invents content.
"""

from __future__ import annotations

import io
import re
from typing import Dict, List, Optional

MAX_RESUME_BYTES = 5 * 1024 * 1024  # 5 MB

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
URL_RE = re.compile(r"(?:https?://|www\.)[^\s,;)\]\"']+", re.IGNORECASE)
LINKEDIN_RE = re.compile(r"(?:https?://)?(?:[a-z]{2,3}\.)?linkedin\.com/[^\s,;)\]\"']+", re.IGNORECASE)
GITHUB_RE = re.compile(r"(?:https?://)?(?:[a-z]{2,3}\.)?github\.com/[^\s,;)\]\"']+", re.IGNORECASE)
PHONE_CANDIDATE_RE = re.compile(r"(?:\+?\d[\d\s().\-]{7,}\d)")
YEAR_RE = re.compile(r"\b(19[89]\d|20[0-4]\d)\b")

DEGREE_RE = re.compile(
    r"\b(bachelor(?:'s)?|master(?:'s)?|doctorate|ph\.?d|b\.?tech|m\.?tech|b\.?sc|m\.?sc|"
    r"bca|mca|mba|b\.?com|m\.?com|diploma|associate(?:'s)?)\b",
    re.IGNORECASE,
)
DEGREE_UPPER_ABBR_RE = re.compile(r"\b(?:B\.?E|M\.?E|B\.?A|M\.?A)\b")
INSTITUTION_RE = re.compile(
    r"(university|college|institute|school|academy|polytechnic)", re.IGNORECASE
)
KNOWN_MAJORS_RE = re.compile(
    r"(computer science|information technology|software engineering|data science|"
    r"artificial intelligence|machine learning|electronics(?:\s*(?:and|&)\s*communication)?|"
    r"electrical engineering|mechanical engineering|civil engineering|chemical engineering|"
    r"business administration|information systems|mathematics|statistics|physics|"
    r"economics|accounting|finance|marketing|biotechnology|biomedical engineering)",
    re.IGNORECASE,
)
ROLE_WORDS = {
    "engineer", "developer", "intern", "student", "designer", "analyst", "scientist",
    "manager", "consultant", "resume", "curriculum", "vitae", "cv", "profile",
}

SECTION_ALIASES = {
    "summary": {
        "summary", "professional summary", "profile", "objective",
        "career objective", "about", "about me", "overview",
    },
    "education": {
        "education", "academics", "academic background", "academic qualifications",
        "education and training", "qualifications", "educational background",
    },
}

JOB_BOARD_DOMAINS = (
    "greenhouse.io", "lever.co", "workday", "indeed.", "glassdoor", "monster.",
    "naukri.", "linkedin.com", "github.com", "mailto:", "twitter.com", "x.com",
)

FIELD_ORDER = (
    "first_name", "last_name", "email", "phone", "city", "country", "college",
    "degree", "branch", "graduation_year", "linkedin_url", "github_url",
    "portfolio_url", "summary",
)


def _extract_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - dependency is declared
        raise ValueError("PDF support is not installed on the server.") from exc

    try:
        reader = PdfReader(io.BytesIO(data))
        pages = [(page.extract_text() or "") for page in reader.pages]
    except Exception as exc:
        raise ValueError("That PDF could not be opened. Try re-saving it as a new PDF.") from exc
    return "\n".join(pages)


def _extract_docx(data: bytes) -> str:
    try:
        from docx import Document
    except ImportError as exc:  # pragma: no cover - dependency is declared
        raise ValueError("DOCX support is not installed on the server.") from exc

    try:
        document = Document(io.BytesIO(data))
    except Exception as exc:
        raise ValueError("That DOCX file could not be opened.") from exc

    parts: List[str] = [p.text for p in document.paragraphs]
    for table in document.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if cells:
                parts.append(" | ".join(cells))
    return "\n".join(parts)


def extract_resume_text(filename: str, data: bytes) -> str:
    """Turns an uploaded resume into plain text, or raises ValueError."""
    if not data:
        raise ValueError("The uploaded file is empty.")
    if len(data) > MAX_RESUME_BYTES:
        raise ValueError("Resume is larger than 5 MB. Please upload a smaller file.")

    name = (filename or "").lower()
    if name.endswith(".pdf"):
        text = _extract_pdf(data)
    elif name.endswith(".docx"):
        text = _extract_docx(data)
    elif name.endswith((".txt", ".md")):
        text = data.decode("utf-8", errors="ignore")
    elif data[:4] == b"%PDF":
        text = _extract_pdf(data)
    elif data[:2] == b"PK":
        text = _extract_docx(data)
    else:
        raise ValueError("Unsupported file type. Please upload a PDF, DOCX, or TXT resume.")

    # Normalise whitespace while keeping line structure for section detection.
    lines = [re.sub(r"[ \t\u00a0]+", " ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def _section_for(line: str) -> Optional[str]:
    cleaned = line.strip().strip(":").lower()
    if not cleaned or len(cleaned) > 60:
        return None
    for section, aliases in SECTION_ALIASES.items():
        if cleaned in aliases:
            return section
    return None


def _split_sections(lines: List[str]) -> Dict[str, List[str]]:
    sections: Dict[str, List[str]] = {}
    current: Optional[str] = None
    for line in lines:
        found = _section_for(line)
        if found:
            current = found
            sections.setdefault(current, [])
            continue
        # A very short ALL-CAPS line usually starts an unrelated section.
        if current and len(line) < 45 and line.isupper() and not any(ch.isdigit() for ch in line):
            current = None
            continue
        if current:
            sections[current].append(line)
    return sections


def _clean_value(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" \t,;|-").strip()


def _detect_name(lines: List[str]) -> tuple[Optional[str], Optional[str]]:
    for line in lines[:15]:
        match = re.match(r"^(?:name|full name)\s*[:\-]\s*(.+)$", line, re.IGNORECASE)
        if match:
            full = _clean_value(match.group(1))
            parts = full.split()
            if len(parts) >= 2:
                return parts[0], " ".join(parts[1:])

    for line in lines[:15]:
        candidate = line.strip()
        if not candidate or len(candidate) > 60:
            continue
        if any(ch.isdigit() for ch in candidate) or "@" in candidate:
            continue
        lowered = candidate.lower()
        if "http" in lowered or "www." in lowered:
            continue
        if any(word in lowered for word in ROLE_WORDS):
            continue
        words = candidate.split()
        if not 2 <= len(words) <= 4:
            continue
        if not all(re.fullmatch(r"[A-Za-z][A-Za-z.'\-]*", word) for word in words):
            continue
        if sum(1 for word in words if word[0].isupper()) < 2:
            continue
        normalised = [
            word[:1].upper() + word[1:].lower() if word.isupper() else word.capitalize()
            for word in words
        ]
        return normalised[0], " ".join(normalised[1:])
    return None, None


def _detect_phone(text: str) -> Optional[str]:
    best: Optional[str] = None
    for line in text.splitlines():
        line_lower = line.lower()
        boosted = any(
            key in line_lower
            for key in ("phone", "mobile", "tel", "cell", "contact", "+")
        )
        for match in PHONE_CANDIDATE_RE.finditer(line):
            raw = match.group(0).strip()
            digits = re.sub(r"\D", "", raw)
            if not 10 <= len(digits) <= 15:
                continue
            if boosted:
                return raw
            if best is None:
                best = raw
    return best


def _normalise_url(url: str) -> str:
    trimmed = url.strip().rstrip(".,;")
    if not trimmed.lower().startswith(("http://", "https://")):
        trimmed = "https://" + trimmed.lstrip("/")
    return trimmed


def _detect_links(text: str) -> Dict[str, str]:
    found: Dict[str, str] = {}

    linkedin = LINKEDIN_RE.search(text)
    if linkedin:
        found["linkedin_url"] = _normalise_url(linkedin.group(0))

    github = GITHUB_RE.search(text)
    if github:
        found["github_url"] = _normalise_url(github.group(0))

    portfolio_candidates: List[str] = []
    for raw in URL_RE.findall(text):
        lowered = raw.lower()
        if any(domain in lowered for domain in JOB_BOARD_DOMAINS):
            continue
        if lowered.endswith((".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp")):
            continue
        portfolio_candidates.append(raw)

    preferred = [c for c in portfolio_candidates if "portfolio" in c.lower()]
    if preferred:
        found["portfolio_url"] = _normalise_url(preferred[0])
    elif portfolio_candidates:
        found["portfolio_url"] = _normalise_url(portfolio_candidates[0])

    return found


def _detect_location(lines: List[str]) -> Dict[str, str]:
    for line in lines:
        match = re.match(r"^(?:location|address|based in|city)\s*[:\-]\s*(.+)$", line, re.IGNORECASE)
        if not match:
            continue
        parts = [_clean_value(p) for p in match.group(1).split(",")]
        parts = [p for p in parts if p]
        if not parts:
            continue
        result = {"city": parts[0]}
        if len(parts) > 1 and not re.fullmatch(r"[A-Z]{2}", parts[1]):
            result["country"] = parts[1]
        return result

    for line in lines[:15]:
        for segment in re.split(r"\s*[|•·]\s*", line):
            if not segment or INSTITUTION_RE.search(segment) or "@" in segment:
                continue
            if any(ch.isdigit() for ch in segment):
                continue
            match = re.fullmatch(r"([A-Za-z][A-Za-z .'\-]{1,30}),\s*([A-Za-z][A-Za-z .'\-]{1,30})", segment)
            if not match:
                continue
            city, second = _clean_value(match.group(1)), _clean_value(match.group(2))
            if any(word in city.lower() for word in ROLE_WORDS):
                continue
            result = {"city": city}
            if not re.fullmatch(r"[A-Z]{2}", second):
                result["country"] = second
            return result
    return {}


def _detect_education(lines: List[str], sections: Dict[str, List[str]]) -> Dict[str, str]:
    edu_lines = sections.get("education") or []
    search_lines = edu_lines or lines
    found: Dict[str, str] = {}

    institution_line = next((line for line in search_lines if INSTITUTION_RE.search(line)), None)
    if not institution_line:
        institution_line = next((line for line in lines if INSTITUTION_RE.search(line)), None)
    if institution_line:
        # Keep just the school name: drop date ranges and trailing notes.
        cleaned = re.split(r"\s+[—–|]\s+|\s+-\s+", institution_line)[0]
        cleaned = re.sub(r"\b(19|20)\d{2}\s*[-–]\s*((19|20)\d{2})?", "", cleaned)
        cleaned = _clean_value(re.sub(r"^[\d\s\-–|,]+|\(.*\)$", "", cleaned))
        found["college"] = cleaned[:120]

    degree_line = next((line for line in search_lines if DEGREE_RE.search(line)), None)
    if not degree_line:
        degree_line = next(
            (line for line in search_lines if DEGREE_UPPER_ABBR_RE.search(line)), None
        )
    if degree_line:
        segment = degree_line
        for separator in ("|", "–", " - "):
            if separator in segment:
                parts = [p.strip() for p in segment.split(separator)]
                chosen = next((p for p in parts if DEGREE_RE.search(p)), parts[0])
                segment = chosen
                break
        found["degree"] = _clean_value(segment)[:120]

    in_match = re.search(r"\bin\b\s+([A-Za-z&,\s.'()\-]{2,70})", degree_line or "", re.IGNORECASE)
    major_match = KNOWN_MAJORS_RE.search(degree_line or "")
    if in_match:
        branch = _clean_value(re.sub(r"\b(19|20)\d{2}\b.*$", "", in_match.group(1)))
        branch = _clean_value(branch.split(",")[0])
        if branch:
            found["branch"] = branch[:80]
    elif major_match:
        found["branch"] = major_match.group(0).strip()

    year_pool = edu_lines or [line for line in lines if INSTITUTION_RE.search(line) or DEGREE_RE.search(line)]
    years = [int(y) for line in year_pool for y in YEAR_RE.findall(line)]
    if years:
        found["graduation_year"] = str(max(years))
    else:
        all_years = [int(y) for y in YEAR_RE.findall("\n".join(lines))]
        recent = [y for y in all_years if 2015 <= y <= 2035]
        if recent:
            found["graduation_year"] = str(max(recent))

    return found


def _detect_summary(sections: Dict[str, List[str]]) -> Optional[str]:
    summary_lines = sections.get("summary")
    if not summary_lines:
        return None
    text = " ".join(summary_lines)
    text = re.sub(r"^[•\-\*\s]+", "", text)
    text = _clean_value(text)
    if len(text) < 25:
        return None
    if len(text) > 600:
        cut = text[:600]
        text = cut[: cut.rfind(" ")] if " " in cut else cut
        text += "…"
    return text


def parse_resume(text: str) -> Dict[str, str]:
    """Extracts profile fields from resume text. Only returns detected values."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    sections = _split_sections(lines)

    fields: Dict[str, str] = {}

    first_name, last_name = _detect_name(lines)
    if first_name:
        fields["first_name"] = first_name
    if last_name:
        fields["last_name"] = last_name

    email = EMAIL_RE.search(text)
    if email:
        fields["email"] = email.group(0)

    phone = _detect_phone(text)
    if phone:
        fields["phone"] = phone

    fields.update(_detect_location(lines))
    fields.update(_detect_education(lines, sections))
    fields.update(_detect_links(text))

    summary = _detect_summary(sections)
    if summary:
        fields["summary"] = summary

    return {key: value for key, value in fields.items() if value and key in FIELD_ORDER}
