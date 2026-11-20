"""
ApplyRecall Release Packaging Script

Generates a clean source-only release ZIP archive excluding:
- .env and .env.local secrets
- SQLite databases (*.db, *.sqlite)
- node_modules / venv / virtual environments
- .next build artifacts
- Python and pytest caches (__pycache__, .pytest_cache)
- Git repository history (.git)
"""

import os
import sys
import zipfile
from pathlib import Path

EXCLUDED_DIRS = {
    ".git",
    "node_modules",
    "venv",
    ".venv",
    "env",
    ".next",
    "__pycache__",
    ".pytest_cache",
    ".idea",
    ".vscode"
}

EXCLUDED_EXTENSIONS = {
    ".db",
    ".sqlite",
    ".sqlite3",
    ".pyc",
    ".pyo"
}

EXCLUDED_FILES = {
    ".env",
    ".env.local",
    ".DS_Store",
    "Thumbs.db",
    "applyrecall.db"
}

def should_exclude(rel_path: Path) -> bool:
    # Check parts for excluded directories
    for part in rel_path.parts:
        if part in EXCLUDED_DIRS:
            return True
    # Check filename
    if rel_path.name in EXCLUDED_FILES:
        return True
    if rel_path.name.startswith(".env.") and not rel_path.name.endswith(".example"):
        return True
    # Check extension
    if rel_path.suffix in EXCLUDED_EXTENSIONS:
        return True
    return False

def package_release(root_dir: Path, output_zip: Path):
    print(f"Creating clean release package from {root_dir.resolve()}...")
    print(f"Target archive: {output_zip.resolve()}")

    file_count = 0
    total_size = 0

    with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(root_dir):
            rel_root = Path(root).relative_to(root_dir)
            
            # Prune directories in place so os.walk does not traverse them
            dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
            
            for file in files:
                file_path = Path(root) / file
                rel_file_path = file_path.relative_to(root_dir)

                if should_exclude(rel_file_path):
                    continue

                # Don't include the output zip itself if placed inside root
                if file_path.resolve() == output_zip.resolve():
                    continue

                zf.write(file_path, arcname=str(rel_file_path).replace("\\", "/"))
                file_count += 1
                total_size += file_path.stat().st_size

    print(f"\nSUCCESS: Packaged {file_count} files ({total_size / (1024*1024):.2f} MB uncompressed).")
    print(f"Archive created at: {output_zip.resolve()} ({output_zip.stat().st_size / (1024*1024):.2f} MB compressed)")

if __name__ == "__main__":
    workspace_root = Path(__file__).resolve().parent.parent
    release_zip = workspace_root / "applyrecall-source-v1.2.0.zip"
    package_release(workspace_root, release_zip)
