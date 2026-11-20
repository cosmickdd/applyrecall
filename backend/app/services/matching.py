import re
from difflib import SequenceMatcher
from typing import List, Dict, Any, Optional, Tuple

STOPWORDS = {
    "a", "an", "the", "and", "or", "in", "on", "at", "to", "for", "with",
    "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do",
    "does", "did", "can", "could", "would", "should", "our", "us",
    "we", "i", "my", "me", "this", "that", "these", "those", "which",
    "please", "give", "share", "details", "any", "if", "applicable"
}

# Standard semantic intent clusters for job applications
INTENT_CLUSTERS = {
    "intro": {"yourself", "background", "intro", "introduction", "about", "bio", "overview", "story", "who"},
    "strengths": {"strength", "strengths", "strongest", "greatest", "superpower", "good"},
    "weaknesses": {"weakness", "weaknesses", "improve", "improvement", "challenge", "struggle"},
    "why_hire": {"hire", "fit", "suitable", "candidate", "qualify", "qualified", "bring"},
    "why_company": {"why", "interest", "interested", "join", "attracted", "excite", "excited"},
    "projects": {"project", "built", "created", "portfolio", "technical"}
}

def normalize_text(text: str) -> str:
    """Normalizes text by lowercasing, removing punctuation, and stripping extra whitespace."""
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    tokens = [t.strip() for t in text.split() if t.strip()]
    return " ".join(tokens)

def extract_keywords(text: str) -> set[str]:
    """Extracts non-stopword tokens for keyword matching."""
    normalized = normalize_text(text)
    tokens = normalized.split()
    return {w for w in tokens if w not in STOPWORDS and len(w) > 1}

def compute_similarity(str1: str, str2: str) -> float:
    """Computes string sequence ratio between two strings."""
    return SequenceMatcher(None, str1, str2).ratio()

def detect_intents(keywords: set[str]) -> set[str]:
    """Detects matching intent categories from keywords."""
    matched = set()
    for intent_name, cluster in INTENT_CLUSTERS.items():
        if keywords.intersection(cluster):
            matched.add(intent_name)
    return matched

def match_question(
    incoming_question: str,
    answers_pool: List[Dict[str, Any]],
    target_company: Optional[str] = None,
    target_role: Optional[str] = None
) -> Tuple[Optional[Dict[str, Any]], float, str, str]:
    """
    Matches incoming question against the user's approved answers.
    Adheres strictly to scoping rules:
    - If answer.scope == 'company', it ONLY matches if target_company matches answer.company.
    - If answer.scope == 'application', it only matches if target_role / application context matches.
    - General answers are universal.
    
    Returns: (matched_answer, confidence, match_type, explanation)
    """
    norm_incoming = normalize_text(incoming_question)
    incoming_keywords = extract_keywords(incoming_question)
    incoming_intents = detect_intents(incoming_keywords)
    
    if not norm_incoming or not answers_pool:
        return None, 0.0, "none", "No valid input or answer library empty"

    best_match = None
    highest_score = 0.0
    best_match_type = "none"
    explanation = ""

    # Sort candidates: company-specific first if target_company matches, then general
    filtered_pool = []
    for ans in answers_pool:
        ans_scope = ans.get("scope", "general")
        ans_company = ans.get("company")
        
        # Scoping rule: Never use another company's specific answer
        if ans_scope == "company":
            if not target_company or not ans_company:
                continue
            if target_company.strip().lower() != ans_company.strip().lower():
                continue
        elif ans_scope == "application":
            if not target_role:
                continue
            if ans.get("role") and target_role.strip().lower() not in ans.get("role", "").strip().lower():
                continue
                
        filtered_pool.append(ans)

    for ans in filtered_pool:
        saved_q = ans.get("question", "")
        norm_saved = normalize_text(saved_q)
        saved_keywords = extract_keywords(saved_q)
        saved_intents = detect_intents(saved_keywords)
        
        # 1. Exact match check (after normalization)
        if norm_incoming == norm_saved:
            return ans, 1.0, "exact", "Exact question match found in your library"

        # 2. Keyword overlap score
        intersection = incoming_keywords.intersection(saved_keywords)
        union = incoming_keywords.union(saved_keywords)
        if incoming_keywords and saved_keywords and union:
            keyword_score = len(intersection) / len(union)
        else:
            keyword_score = 0.0

        # Multi-word overlap boost (specific key terms like "early", "stage", "startup")
        overlap_count = len(intersection)
        multi_word_boost = 0.30 if overlap_count >= 2 else (0.15 if overlap_count == 1 else 0.0)

        # 3. Intent cluster overlap boost
        shared_intents = incoming_intents.intersection(saved_intents)
        intent_boost = 0.20 if shared_intents else 0.0

        # 4. Fuzzy sequence matcher
        fuzzy_score = compute_similarity(norm_incoming, norm_saved)

        # Combined weighted confidence score
        confidence = (keyword_score * 0.40) + multi_word_boost + (fuzzy_score * 0.20) + intent_boost

        # Boost score slightly if it's a verified company-specific answer match
        if ans.get("scope") == "company" and target_company:
            confidence = min(1.0, confidence + 0.15)

        if confidence > highest_score:
            highest_score = confidence
            best_match = ans
            if keyword_score >= 0.6:
                best_match_type = "keyword"
                explanation = f"Matched {len(incoming_keywords.intersection(saved_keywords))} key concepts"
            elif shared_intents:
                best_match_type = "intent"
                explanation = f"Matches question category: {', '.join(shared_intents)}"
            elif fuzzy_score >= 0.6:
                best_match_type = "fuzzy"
                explanation = f"High phrase similarity ({int(fuzzy_score * 100)}%)"
            else:
                best_match_type = "partial"
                explanation = "Partial topic similarity"

    # Require minimum confidence threshold of 0.35
    if highest_score >= 0.35 and best_match:
        return best_match, round(min(1.0, highest_score), 2), best_match_type, explanation
    
    return None, 0.0, "none", "No matching question found in your answer library"
