@echo off
title ApplyRecall Reminder Worker
cd backend
.\venv\Scripts\python.exe -m app.worker
pause
