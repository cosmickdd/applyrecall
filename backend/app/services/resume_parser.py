"""Resume text extraction and profile field parsing.

Used by the profile autofill endpoint so students do not have to retype details
that are already written in their resume. Extraction is intentionally rule-based
and deterministic: it only reports values it can actually find in the document,
and never invents content.
"""

from __future__ import annotations

import io
import re
from typing import Any, Dict, List, Optional

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
    "experience": {
        "experience", "work experience", "professional experience", "employment",
        "employment history", "work history", "experience history",
        "professional background", "career history", "relevant experience",
        "internships", "internship experience", "work and internship experience",
    },
    "projects": {
        "projects", "personal projects", "academic projects", "technical projects",
        "selected projects", "key projects", "side projects", "project work",
        "project experience", "projects and achievements",
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


BULLET_RE = re.compile(r"^\s*(?:[\u2022\u25cf\u25aa\u2023\u00b7*\-]|\d+[.)])\s+")
MONTH_PATTERN = (
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|"
    r"sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
)
DATE_TOKEN = rf"(?:{MONTH_PATTERN}\.?[\s,]*)?(?:19|20)\d{{2}}"
DATE_RANGE_RE = re.compile(
    rf"(?P<start>{DATE_TOKEN})\s*(?:-|\u2013|\u2014|to|until|till)\s*"
    rf"(?P<end>{DATE_TOKEN}|present|current|now|ongoing)",
    re.IGNORECASE,
)
SINGLE_DATE_RE = re.compile(rf"\b{DATE_TOKEN}\b", re.IGNORECASE)
MONTH_INDEX = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

POINT_RE = re.compile(
    r"\b(?:engineer|engineering|developer|programmer|intern|internship|analyst|scientist|"
    r"designer|manager|consultant|architect|lead|specialist|associate|coordinator|"
    r"administrator|technician|researcher|assistant|tutor|teacher|founder|co-?founder|"
    r"director|officer|executive|strategist|marketer|recruiter|writer|editor|freelancer|"
    r"volunteer|trainee|apprentice)\b",
    re.IGNORECASE,
)
ORGANISATION_RE = re.compile(
    r"\b(?:inc|ltd|limited|llc|corp(?:oration)?|company|technologies|technology|solutions|"
    r"labs?|systems?|software|services|consulting|group|ventures|studios?|media|bank|"
    r"university|college|institute|foundation|pvt)\b",
    re.IGNORECASE,
)
TECH_LABEL_RE = re.compile(
    r"^(?:tech(?:nologies)?(?:\s+used)?|tech\s+stack|stack|tools|built\s+with|"
    r"languages|frameworks)\s*[:\-\u2013\u2014]\s*(.+)$",
    re.IGNORECASE,
)
HEADER_SPLIT_RE = re.compile(
    r"\s*(?:\||\u2022|\u00b7|\u2014|\u2013|\s-\s|\bat\b|@|,)\s*", re.IGNORECASE
)
PROJECT_SPLIT_RE = re.compile(r"\s*(?:\||\u2022|\u00b7)\s*")
URL_ONLY_RE = re.compile(
    r"^(?:(?:https?://|www\.)\S+|\S+\.(?:com|io|dev|me|net|org|co|app|xyz|github\.io)(?:/\S*)?)$",
    re.IGNORECASE,
)
TECH_TOKEN_RE = re.compile(
    r"\b(?:react|reactjs|next\.?js|node\.?js|nodejs|python|java|javascript|typescript|"
    r"tailwind|sql|postgres(?:ql)?|mysql|mongo(?:db)?|redis|aws|gcp|azure|docker|kubernetes|"
    r"pytorch|tensorflow|sklearn|scikit-learn|pandas|numpy|django|flask|fastapi|spring|"
    r"angular|vue|svelte|firebase|supabase|graphql|rest|html|css|sass|git|linux|kotlin|"
    r"swift|flutter|dart|php|laravel|ruby|rails|golang|rust|scala|c\+\+|c#|\.net|d3\.js|"
    r"express|prisma|jquery|bootstrap|figma|matlab)\b",
    re.IGNORECASE,
)


def _is_prose(line: str) -> bool:
    """A sentence that wrapped onto its own line rather than a new entry header."""
    return line.endswith(".") and len(line.split()) >= 4


def _looks_like_technologies(text: str) -> bool:
    candidate = text.strip()
    if not candidate or URL_RE.search(candidate):
        return False
    if "," in candidate:
        return True
    return bool(TECH_TOKEN_RE.search(candidate))


def _normalise_date(raw: str) -> str:
    value = raw.strip().rstrip(".").strip()
    if not value:
        return ""
    if value.lower() in {"present", "current", "now", "ongoing"}:
        return "present"
    month_match = re.match(
        rf"({MONTH_PATTERN})\.?[\s,]*((?:19|20)\d{{2}})", value, re.IGNORECASE
    )
    if month_match:
        month = MONTH_INDEX.get(month_match.group(1).lower()[:3])
        if month:
            return f"{month_match.group(2)}-{month:02d}"
    year = re.search(r"(?:19|20)\d{2}", value)
    return year.group(0) if year else ""


def _extract_dates(line: str) -> tuple[str, str, str, bool]:
    """Pulls a date range out of a header line, returning the leftover text."""
    start = end = ""
    is_current = False
    cleaned = line

    match = DATE_RANGE_RE.search(cleaned)
    if match:
        start = _normalise_date(match.group("start"))
        end = _normalise_date(match.group("end"))
        is_current = end == "present"
        if is_current:
            end = ""
        cleaned = (cleaned[: match.start()] + " " + cleaned[match.end():]).strip()
    else:
        single = SINGLE_DATE_RE.search(cleaned)
        if single:
            end = _normalise_date(single.group(0))
            cleaned = (cleaned[: single.start()] + " " + cleaned[single.end():]).strip()

    cleaned = _clean_value(re.sub(r"[\s|,\-\u2013\u2014]+$", "", cleaned))
    cleaned = _clean_value(re.sub(r"^[\s|,\-\u2013\u2014]+", "", cleaned))
    return cleaned, start, end, is_current


def _can_be_header(line: str) -> bool:
    if len(line) > 110:
        return False
    if line.endswith(".") and len(line.split()) >= 5:
        return False
    return True


def _split_entries(lines: List[str]) -> List[Dict[str, List[str]]]:
    """Groups section lines into resume entries: header lines plus description lines."""
    entries: List[Dict[str, List[str]]] = []
    current: Optional[Dict[str, List[str]]] = None

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        if BULLET_RE.match(line):
            body = _clean_value(BULLET_RE.sub("", line, count=1))
            if not body:
                continue
            if current is None:
                current = {"headers": [], "bullets": []}
                entries.append(current)
            current["bullets"].append(body)
            continue

        if current is None:
            current = {"headers": [line], "bullets": []}
            entries.append(current)
            continue

        headers = current["headers"]
        if URL_ONLY_RE.match(line) or _is_prose(line):
            current["bullets"].append(line)
            continue

        if current["bullets"] or not headers:
            current = {"headers": [line], "bullets": []}
            entries.append(current)
            continue

        has_date = any(DATE_RANGE_RE.search(h) or SINGLE_DATE_RE.search(h) for h in headers)
        if len(headers) < 2 and _can_be_header(line):
            headers.append(line)
        elif len(headers) == 2 and not has_date and (
            DATE_RANGE_RE.search(line) or SINGLE_DATE_RE.search(line)
        ):
            headers.append(line)
        else:
            current["bullets"].append(line)

    return entries


def _split_header_text(text: str) -> List[str]:
    parts = [_clean_value(part) for part in HEADER_SPLIT_RE.split(text)]
    segments = [
        part
        for part in parts
        if len(part) > 1
        and not re.fullmatch(
            r"(?:inc|ltd|llc|corp|co|pvt|limited|company)\.?", part, re.IGNORECASE
        )
    ]
    return segments


def _entry_details(
    entry: Dict[str, List[str]],
) -> tuple[List[str], str, str, bool, List[str]]:
    headers: List[str] = []
    start = end = ""
    is_current = False

    for raw_header in entry["headers"]:
        cleaned, header_start, header_end, header_current = _extract_dates(raw_header)
        if header_start and not start:
            start = header_start
        if header_end and not end:
            end = header_end
        is_current = is_current or header_current
        if cleaned:
            headers.append(cleaned)

    promoted: List[str] = []
    kept: List[str] = []
    for header in headers:
        if header.endswith(".") and len(header.split()) >= 5:
            promoted.append(header)
        else:
            kept.append(header)

    return kept, start, end, is_current, promoted


def _experience_from_entry(entry: Dict[str, List[str]]) -> Optional[Dict[str, Any]]:
    headers, start, end, is_current, promoted = _entry_details(entry)
    segments: List[str] = []
    for header in headers:
        segments.extend(_split_header_text(header))
    if not segments:
        return None

    position = next((segment for segment in segments if POINT_RE.search(segment)), None)
    company = next(
        (
            segment
            for segment in segments
            if segment != position and ORGANISATION_RE.search(segment)
        ),
        None,
    )
    if company is None:
        company = next((segment for segment in segments if segment != position), None)
    if position is None:
        position = next((segment for segment in segments if segment != company), None)
    if not company or not position:
        return None

    description_lines = [line for line in promoted + entry["bullets"] if line.strip()]
    description = "\n".join(description_lines)[:1500].strip() or None

    return {
        "company": company[:120],
        "position": position[:120],
        "description": description,
        "start_date": start or None,
        "end_date": end or None,
        "is_current": is_current,
    }


def _project_from_entry(entry: Dict[str, List[str]]) -> Optional[Dict[str, Any]]:
    headers, _start, _end, _current, promoted = _entry_details(entry)
    if not headers:
        return None

    name_line = headers[0]
    technology_parts: List[str] = []

    # "Name | React, Node.js" splits the technologies out; "Name - tagline" keeps the tagline.
    parts = [_clean_value(part) for part in PROJECT_SPLIT_RE.split(name_line)]
    parts = [part for part in parts if part]
    if len(parts) == 1:
        dashed = [_clean_value(part) for part in re.split(r"\s*(?:\u2014|\u2013|\s-\s)\s*", parts[0])]
        dashed = [part for part in dashed if part]
        if len(dashed) > 1 and any(_looks_like_technologies(part) for part in dashed[1:]):
            parts = dashed
    name = parts[0] if parts else ""
    for part in parts[1:]:
        if _looks_like_technologies(part):
            technology_parts.append(part)
        elif not URL_RE.search(part):
            name = f"{name} - {part}" if name else part

    if len(name) < 2:
        return None

    technologies = ", ".join(technology_parts)[:200]
    project_url = ""

    description_lines: List[str] = []
    for line in promoted + entry["bullets"]:
        tech_match = TECH_LABEL_RE.match(line)
        if tech_match:
            if not technologies:
                technologies = _clean_value(tech_match.group(1))[:200]
            continue
        url_match = URL_RE.search(line)
        if url_match and not project_url:
            project_url = _normalise_url(url_match.group(0))
        cleaned = _clean_value(URL_RE.sub("", line))
        if cleaned:
            description_lines.append(cleaned)

    if not project_url:
        for header in headers[1:]:
            url_match = URL_RE.search(header)
            if url_match:
                project_url = _normalise_url(url_match.group(0))
                break

    return {
        "name": name[:120],
        "description": "\n".join(description_lines)[:1500].strip() or None,
        "project_url": project_url or None,
        "technologies": technologies or None,
    }


def parse_resume_extras(text: str) -> Dict[str, List[Dict[str, Any]]]:
    """Extracts work experience and project entries written in the resume."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    sections = _split_sections(lines)

    experiences: List[Dict[str, Any]] = []
    seen_experience = set()
    for entry in _split_entries(sections.get("experience", [])):
        item = _experience_from_entry(entry)
        if not item:
            continue
        key = (item["company"].lower(), item["position"].lower())
        if key in seen_experience:
            continue
        seen_experience.add(key)
        experiences.append(item)

    projects: List[Dict[str, Any]] = []
    seen_projects = set()
    for entry in _split_entries(sections.get("projects", [])):
        item = _project_from_entry(entry)
        if not item:
            continue
        key = item["name"].lower()
        if key in seen_projects:
            continue
        seen_projects.add(key)
        projects.append(item)

    return {"experiences": experiences[:10], "projects": projects[:10]}


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
