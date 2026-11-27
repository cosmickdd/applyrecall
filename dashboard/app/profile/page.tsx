'use client';

import { useEffect, useState } from 'react';
import TopBar from '@/components/TopBar';
import { 
  User, 
  GraduationCap, 
  Briefcase, 
  FolderGit2, 
  Link as LinkIcon, 
  ShieldCheck, 
  Download, 
  Check, 
  Plus, 
  Trash2,
  AlertCircle,
  FileText,
  Upload
} from 'lucide-react';
import { api } from '@/lib/api';

const RESUME_FIELD_LABELS: Record<string, string> = {
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone: 'Phone',
  city: 'City',
  country: 'Country',
  college: 'College',
  degree: 'Degree',
  branch: 'Major / Branch',
  graduation_year: 'Graduation year',
  linkedin_url: 'LinkedIn',
  github_url: 'GitHub',
  portfolio_url: 'Portfolio',
  summary: 'Summary',
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [experiences, setExperiences] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Resume autofill (prefills the form from an uploaded resume)
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [autofilling, setAutofilling] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [resumeMessage, setResumeMessage] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);

  // Forms for adding exp / project
  const [showAddExp, setShowAddExp] = useState(false);
  const [newExp, setNewExp] = useState({ company: '', position: '', description: '', start_date: '', end_date: '' });
  const [showAddProj, setShowAddProj] = useState(false);
  const [newProj, setNewProj] = useState({ name: '', description: '', project_url: '', technologies: '' });

  const loadProfile = async () => {
    try {
      setLoading(true);
      const res = await api.getProfile();
      setProfile(res.profile);
      setExperiences(res.experiences || []);
      setProjects(res.projects || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleProfileChange = (field: string, val: string) => {
    setProfile((prev: any) => ({ ...prev, [field]: val }));
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      await api.updateProfile(profile);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleResumeAutofill = async () => {
    if (!resumeFile || autofilling) return;
    try {
      setAutofilling(true);
      setResumeError(null);
      setResumeMessage(null);

      const formData = new FormData();
      formData.append('file', resumeFile);
      const res = await api.autofillResume(formData);
      const fields: Record<string, string> = res?.fields || {};
      const resumeExperiences: any[] = Array.isArray(res?.experiences) ? res.experiences : [];
      const resumeProjects: any[] = Array.isArray(res?.projects) ? res.projects : [];

      const next: any = { ...(profile || {}) };
      const filled: string[] = [];
      Object.entries(fields).forEach(([key, value]) => {
        if (!value) return;
        const hasValue = String(next[key] ?? '').trim().length > 0;
        if (overwriteExisting || !hasValue) {
          next[key] = value;
          filled.push(RESUME_FIELD_LABELS[key] || key);
        }
      });
      setProfile(next);

      // Work experience and projects live in their own tables, so save them as entries.
      const existingRoles = new Set(
        experiences.map(e => `${(e.company || '').toLowerCase().trim()}|${(e.position || '').toLowerCase().trim()}`)
      );
      const addedRoles: any[] = [];
      for (const exp of resumeExperiences) {
        const company = String(exp?.company || '').trim();
        const position = String(exp?.position || '').trim();
        if (!company || !position) continue;
        const key = `${company.toLowerCase()}|${position.toLowerCase()}`;
        if (existingRoles.has(key)) continue;
        try {
          const created = await api.addExperience({
            company,
            position,
            description: exp?.description || null,
            start_date: exp?.start_date || null,
            end_date: exp?.end_date || null,
            is_current: !!exp?.is_current,
          });
          existingRoles.add(key);
          addedRoles.push(created);
        } catch (err) {
          console.error(err);
        }
      }
      if (addedRoles.length > 0) setExperiences(prev => [...addedRoles, ...prev]);

      const existingProjects = new Set(
        projects.map(p => (p.name || '').toLowerCase().trim())
      );
      const addedProjects: any[] = [];
      for (const proj of resumeProjects) {
        const name = String(proj?.name || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (existingProjects.has(key)) continue;
        try {
          const created = await api.addProject({
            name,
            description: proj?.description || null,
            project_url: proj?.project_url || null,
            technologies: proj?.technologies || null,
          });
          existingProjects.add(key);
          addedProjects.push(created);
        } catch (err) {
          console.error(err);
        }
      }
      if (addedProjects.length > 0) setProjects(prev => [...addedProjects, ...prev]);

      const addedParts: string[] = [];
      if (addedRoles.length > 0) {
        addedParts.push(`${addedRoles.length} work experience ${addedRoles.length === 1 ? 'entry' : 'entries'}`);
      }
      if (addedProjects.length > 0) {
        addedParts.push(`${addedProjects.length} ${addedProjects.length === 1 ? 'project' : 'projects'}`);
      }

      if (filled.length === 0 && addedParts.length === 0) {
        setResumeMessage('We read your resume, but every detail we found is already filled in. Tick "Overwrite existing values" to replace them.');
      } else {
        const parts: string[] = [];
        if (addedParts.length > 0) parts.push(`added ${addedParts.join(' and ')}`);
        if (filled.length > 0) parts.push(`filled ${filled.length} field${filled.length === 1 ? '' : 's'} (${filled.join(', ')})`);
        setResumeMessage(`From your resume we ${parts.join(' and ')}. Review everything, then press Save Changes.`);
      }
    } catch (e: any) {
      setResumeError(e?.message || 'Could not read that resume. Please try another file.');
    } finally {
      setAutofilling(false);
    }
  };

  const handleAddExperience = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExp.company || !newExp.position) return;
    try {
      const added = await api.addExperience(newExp);
      setExperiences(prev => [added, ...prev]);
      setShowAddExp(false);
      setNewExp({ company: '', position: '', description: '', start_date: '', end_date: '' });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteExperience = async (id: string) => {
    try {
      await api.deleteExperience(id);
      setExperiences(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProj.name) return;
    try {
      const added = await api.addProject(newProj);
      setProjects(prev => [added, ...prev]);
      setShowAddProj(false);
      setNewProj({ name: '', description: '', project_url: '', technologies: '' });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await api.deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleExport = async () => {
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `applyrecall-export-${new Date().toISOString().substring(0, 10)}.json`;
      a.click();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <>
        <TopBar title="My Profile" />
        <div className="p-12 text-center text-sm text-ink-muted">Loading profile memory...</div>
      </>
    );
  }

  return (
    <>
      <TopBar title="My Profile" />

      <main className="flex-1 p-8 max-w-[1304px] w-full mx-auto space-y-8">
        {/* Title & Save Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-primary">Your Profile</h1>
            <p className="text-sm text-ink-secondary mt-1">
              Information ApplyRecall can use when helping you apply.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white border border-edge-default rounded-btn text-ink-secondary hover:text-ink-primary hover:bg-brand-subtle"
            >
              <Download className="w-4 h-4 text-ink-muted" />
              <span>Export JSON</span>
            </button>
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-brand-blue text-white rounded-btn text-xs font-semibold hover:bg-brand-deep transition-colors shadow-subtle disabled:opacity-50"
            >
              {saveSuccess ? <Check className="w-4 h-4" /> : null}
              <span>{saving ? 'Saving...' : saveSuccess ? 'Saved ✓' : 'Save Changes'}</span>
            </button>
          </div>
        </div>

        {/* Privacy Callout */}
        <div className="bg-brand-surface border border-edge-default p-4 rounded-card flex items-start gap-3 shadow-subtle">
          <ShieldCheck className="w-5 h-5 text-brand-blue mt-0.5 shrink-0" />
          <div>
            <span className="text-xs font-semibold text-ink-primary block">Student Privacy Notice</span>
            <p className="text-xs text-ink-secondary mt-0.5">
              Your information is used only to complete applications you initiate. You control what ApplyRecall remembers.
            </p>
          </div>
        </div>

        {/* Resume Autofill */}
        <section className="bg-brand-surface p-6 rounded-card border border-edge-default shadow-subtle space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-edge-default">
            <FileText className="w-4 h-4 text-brand-blue" />
            <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">Autofill from Resume</h2>
          </div>

          <p className="text-xs text-ink-secondary leading-relaxed">
            Upload your resume (PDF, DOCX, or TXT) and we will copy the details applications keep asking for —
            name, contact info, links, education, summary, work experience, and projects — into your profile.
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="flex-1 flex items-center gap-2 px-3 py-2 text-xs border border-dashed border-edge-strong rounded-btn bg-brand-soft cursor-pointer hover:border-brand-blue">
              <Upload className="w-4 h-4 text-ink-muted shrink-0" />
              <span className={`truncate ${resumeFile ? 'text-ink-primary font-medium' : 'text-ink-muted'}`}>
                {resumeFile ? resumeFile.name : 'Choose a PDF, DOCX, or TXT resume'}
              </span>
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md"
                className="hidden"
                onChange={(e) => {
                  setResumeFile(e.target.files?.[0] || null);
                  setResumeMessage(null);
                  setResumeError(null);
                }}
              />
            </label>
            <button
              onClick={handleResumeAutofill}
              disabled={!resumeFile || autofilling}
              className="flex items-center justify-center gap-2 px-5 py-2 bg-brand-blue text-white rounded-btn text-xs font-semibold hover:bg-brand-deep transition-colors shadow-subtle disabled:opacity-50"
            >
              {autofilling ? 'Reading resume...' : 'Autofill Profile'}
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            <input
              type="checkbox"
              checked={overwriteExisting}
              onChange={(e) => setOverwriteExisting(e.target.checked)}
              className="accent-brand-blue"
            />
            <span>Overwrite existing values (leave off to only fill empty fields)</span>
          </label>

          {resumeError && (
            <div className="p-2.5 rounded-btn bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{resumeError}</span>
            </div>
          )}

          {resumeMessage && (
            <div className="p-2.5 rounded-btn bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-start gap-1.5">
              <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{resumeMessage}</span>
            </div>
          )}
        </section>

        {/* Section 1: Basic Personal Details */}
        <section className="bg-brand-surface p-6 rounded-card border border-edge-default shadow-subtle space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-edge-default">
            <User className="w-4 h-4 text-brand-blue" />
            <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">Personal Details</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">First Name</label>
              <input
                type="text"
                value={profile?.first_name || ''}
                onChange={(e) => handleProfileChange('first_name', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">Last Name</label>
              <input
                type="text"
                value={profile?.last_name || ''}
                onChange={(e) => handleProfileChange('last_name', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">Email</label>
              <input
                type="email"
                value={profile?.email || ''}
                onChange={(e) => handleProfileChange('email', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">Phone</label>
              <input
                type="tel"
                value={profile?.phone || ''}
                onChange={(e) => handleProfileChange('phone', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">City</label>
              <input
                type="text"
                value={profile?.city || ''}
                onChange={(e) => handleProfileChange('city', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">Country</label>
              <input
                type="text"
                value={profile?.country || ''}
                onChange={(e) => handleProfileChange('country', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>
          </div>
        </section>

        {/* Section 2: Education */}
        <section className="bg-brand-surface p-6 rounded-card border border-edge-default shadow-subtle space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-edge-default">
            <GraduationCap className="w-4 h-4 text-brand-blue" />
            <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">Education</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">College / University</label>
              <input
                type="text"
                value={profile?.college || ''}
                onChange={(e) => handleProfileChange('college', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">Degree</label>
              <input
                type="text"
                value={profile?.degree || ''}
                onChange={(e) => handleProfileChange('degree', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">Major / Branch</label>
              <input
                type="text"
                value={profile?.branch || ''}
                onChange={(e) => handleProfileChange('branch', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">Graduation Year</label>
              <input
                type="text"
                value={profile?.graduation_year || ''}
                onChange={(e) => handleProfileChange('graduation_year', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>
          </div>
        </section>

        {/* Section 3: Professional Links */}
        <section className="bg-brand-surface p-6 rounded-card border border-edge-default shadow-subtle space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-edge-default">
            <LinkIcon className="w-4 h-4 text-brand-blue" />
            <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">Professional Links</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">LinkedIn URL</label>
              <input
                type="url"
                value={profile?.linkedin_url || ''}
                onChange={(e) => handleProfileChange('linkedin_url', e.target.value)}
                placeholder="https://linkedin.com/in/..."
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">GitHub URL</label>
              <input
                type="url"
                value={profile?.github_url || ''}
                onChange={(e) => handleProfileChange('github_url', e.target.value)}
                placeholder="https://github.com/..."
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">Portfolio URL</label>
              <input
                type="url"
                value={profile?.portfolio_url || ''}
                onChange={(e) => handleProfileChange('portfolio_url', e.target.value)}
                placeholder="https://yourportfolio.dev"
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>
          </div>
        </section>

        {/* Section 4: General Introduction / Summary */}
        <section className="bg-brand-surface p-6 rounded-card border border-edge-default shadow-subtle space-y-4">
          <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide pb-3 border-b border-edge-default">
            General Introduction &amp; Summary
          </h2>
          <div>
            <textarea
              rows={4}
              value={profile?.summary || ''}
              onChange={(e) => handleProfileChange('summary', e.target.value)}
              placeholder="A brief overview of your background, technical interests, and career goals..."
              className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue resize-none leading-relaxed"
            />
          </div>
        </section>

        {/* Section 5: Experience */}
        <section className="bg-brand-surface p-6 rounded-card border border-edge-default shadow-subtle space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-edge-default">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-brand-blue" />
              <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">Work Experience</h2>
            </div>
            <button
              onClick={() => setShowAddExp(!showAddExp)}
              className="flex items-center gap-1.5 text-xs font-semibold text-brand-blue hover:text-brand-deep"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Role</span>
            </button>
          </div>

          {showAddExp && (
            <form onSubmit={handleAddExperience} className="p-4 bg-brand-soft rounded-btn border border-edge-default space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Company Name"
                  required
                  value={newExp.company}
                  onChange={(e) => setNewExp({ ...newExp, company: e.target.value })}
                  className="px-3 py-2 text-xs bg-brand-surface border border-edge-default rounded-btn text-ink-primary focus:outline-none focus:border-brand-blue"
                />
                <input
                  type="text"
                  placeholder="Role / Title"
                  required
                  value={newExp.position}
                  onChange={(e) => setNewExp({ ...newExp, position: e.target.value })}
                  className="px-3 py-2 text-xs bg-brand-surface border border-edge-default rounded-btn text-ink-primary focus:outline-none focus:border-brand-blue"
                />
              </div>
              <textarea
                placeholder="Key accomplishments, tools used, and responsibilities..."
                rows={2}
                value={newExp.description}
                onChange={(e) => setNewExp({ ...newExp, description: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-brand-surface border border-edge-default rounded-btn text-ink-primary focus:outline-none focus:border-brand-blue"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddExp(false)} className="px-3 py-1.5 text-xs text-ink-secondary hover:text-ink-primary">Cancel</button>
                <button type="submit" className="px-3 py-1.5 text-xs font-semibold bg-brand-blue hover:bg-brand-deep text-white rounded-btn transition-colors">Save Role</button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {experiences.map((exp) => (
              <div key={exp.id} className="p-3 bg-brand-soft rounded-btn border border-edge-default flex justify-between items-start">
                <div>
                  <span className="font-semibold text-xs text-ink-primary">{exp.company}</span>
                  <span className="text-xs text-ink-secondary ml-2">— {exp.position}</span>
                  {exp.description && <p className="text-xs text-ink-muted mt-1 whitespace-pre-line">{exp.description}</p>}
                </div>
                <button onClick={() => handleDeleteExperience(exp.id)} className="text-ink-muted hover:text-status-error p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Section 6: Projects */}
        <section className="bg-brand-surface p-6 rounded-card border border-edge-default shadow-subtle space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-edge-default">
            <div className="flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-brand-blue" />
              <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">Projects</h2>
            </div>
            <button
              onClick={() => setShowAddProj(!showAddProj)}
              className="flex items-center gap-1.5 text-xs font-semibold text-brand-blue hover:text-brand-deep"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Project</span>
            </button>
          </div>

          {showAddProj && (
            <form onSubmit={handleAddProject} className="p-4 bg-brand-soft rounded-btn border border-edge-default space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Project Name"
                  required
                  value={newProj.name}
                  onChange={(e) => setNewProj({ ...newProj, name: e.target.value })}
                  className="px-3 py-2 text-xs bg-brand-surface border border-edge-default rounded-btn text-ink-primary focus:outline-none focus:border-brand-blue"
                />
                <input
                  type="text"
                  placeholder="Technologies (e.g. Python, React, Next.js)"
                  value={newProj.technologies}
                  onChange={(e) => setNewProj({ ...newProj, technologies: e.target.value })}
                  className="px-3 py-2 text-xs bg-brand-surface border border-edge-default rounded-btn text-ink-primary focus:outline-none focus:border-brand-blue"
                />
              </div>
              <textarea
                placeholder="What did you build, what problem did it solve, and what were the outcomes?"
                rows={2}
                value={newProj.description}
                onChange={(e) => setNewProj({ ...newProj, description: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-brand-surface border border-edge-default rounded-btn text-ink-primary focus:outline-none focus:border-brand-blue"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddProj(false)} className="px-3 py-1.5 text-xs text-ink-secondary hover:text-ink-primary">Cancel</button>
                <button type="submit" className="px-3 py-1.5 text-xs font-semibold bg-brand-blue hover:bg-brand-deep text-white rounded-btn transition-colors">Save Project</button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {projects.map((proj) => (
              <div key={proj.id} className="p-3 bg-brand-soft rounded-btn border border-edge-default flex justify-between items-start">
                <div>
                  <span className="font-semibold text-xs text-ink-primary">{proj.name}</span>
                  {proj.technologies && <span className="text-[11px] text-brand-blue bg-blue-50 px-1.5 py-0.5 rounded ml-2 font-mono">{proj.technologies}</span>}
                  {proj.description && <p className="text-xs text-ink-muted mt-1 whitespace-pre-line">{proj.description}</p>}
                </div>
                <button onClick={() => handleDeleteProject(proj.id)} className="text-ink-muted hover:text-status-error p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
