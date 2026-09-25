// Typed helpers for the AI5K backend. Shapes mirror backend/app/schemas.
// Contract reference: DOCS/ApplicationFlow.md §5–§6.

import {
  ApiError,
  fetchApi,
  fetchWithAuth,
  setAuthTokens,
} from "./api";

export { ApiError, setAuthTokens };

// ---- Auth ----

export interface UserRead {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  status: string;
  created_at: string;
}

export interface MeResponse {
  user: UserRead;
  roles: { name: string; organization_id: string | null }[];
}

export interface SignupResponse {
  id: string;
  email: string;
  full_name: string;
  status: string;
  verification_token: string | null; // ENV=local only
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export async function signup(email: string, password: string, fullName: string): Promise<SignupResponse> {
  const res = await fetchApi("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, full_name: fullName }),
  });
  return res.json();
}

export async function verifyEmail(token: string): Promise<UserRead> {
  const res = await fetchApi("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  return res.json();
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetchApi("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function getMe(): Promise<MeResponse> {
  const res = await fetchWithAuth("/auth/me");
  return res.json();
}

// ---- Profiles ----

export interface PortfolioLink {
  label: string;
  url: string;
}

export interface ProfileRead {
  id: string;
  owner_type: "individual" | "organization";
  user_id: string | null;
  organization_id: string | null;
  display_name: string;
  headline: string | null;
  job_roles: string[];
  portfolio_links: PortfolioLink[];
  visibility: "private" | "public";
  created_at: string;
  updated_at: string;
}

function normalizeUrl(u: string): string {
  const t = u.trim();
  return t && !/^https?:\/\//i.test(t) ? `https://${t}` : t;
}
export { normalizeUrl };

// Shared error rendering: prefer 422 field details, then envelope message.
export function describeApiError(err: unknown): string {
  if (err instanceof ApiError && err.status === 422 && err.details && typeof err.details === "object") {
    const entries = Object.entries(err.details as Record<string, string>);
    if (entries.length > 0) return entries.map(([f, m]) => `${f}: ${m}`).join(" · ");
  }
  return (err as Error).message || "Something went wrong";
}

export async function createProfile(body: {
  display_name: string;
  headline?: string | null;
  job_roles?: string[];
  portfolio_links?: PortfolioLink[];
  visibility?: "private" | "public";
}): Promise<ProfileRead> {
  const res = await fetchWithAuth("/profiles", { method: "POST", body: JSON.stringify(body) });
  return res.json();
}

export async function getMyProfile(): Promise<ProfileRead> {
  const res = await fetchWithAuth("/profiles/me");
  return res.json();
}

export async function getProfile(id: string): Promise<ProfileRead> {
  const res = await fetchWithAuth(`/profiles/${id}`);
  return res.json();
}

export async function updateProfile(
  id: string,
  body: Partial<{
    display_name: string;
    headline: string | null;
    job_roles: string[];
    portfolio_links: PortfolioLink[];
    visibility: "private" | "public";
  }>,
): Promise<ProfileRead> {
  const res = await fetchWithAuth(`/profiles/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  return res.json();
}

// ---- Skills ----

export interface Skill {
  id: string;
  name: string;
  category: string | null;
}

export interface SkillCatalogResponse {
  data: Skill[];
  total: number;
  page: number;
  page_size: number;
}

export interface SkillClaim {
  id: string;
  profile_id: string;
  skill_id: string;
  skill_name: string;
  claim_type: "self_declared" | "evidenced";
  proficiency_level: "beginner" | "intermediate" | "advanced" | "expert" | null;
  created_at: string;
}

export async function listSkills(page = 1, pageSize = 100, category?: string): Promise<SkillCatalogResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (category) params.set("category", category);
  const res = await fetchWithAuth(`/skills?${params.toString()}`);
  return res.json();
}

export async function listSkillClaims(profileId: string): Promise<SkillClaim[]> {
  const res = await fetchWithAuth(`/profiles/${profileId}/skills`);
  return res.json();
}

export async function addSkillClaim(
  profileId: string,
  body: { skill_id?: string; skill_name?: string; category?: string; proficiency_level?: string },
): Promise<SkillClaim> {
  const res = await fetchWithAuth(`/profiles/${profileId}/skills`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateSkillClaim(profileId: string, claimId: string, proficiency_level: string): Promise<SkillClaim> {
  const res = await fetchWithAuth(`/profiles/${profileId}/skills/${claimId}`, {
    method: "PATCH",
    body: JSON.stringify({ proficiency_level }),
  });
  return res.json();
}

export async function deleteSkillClaim(profileId: string, claimId: string): Promise<void> {
  await fetchWithAuth(`/profiles/${profileId}/skills/${claimId}`, { method: "DELETE" });
}

// ---- Services ----

export interface Service {
  id: string;
  profile_id: string;
  title: string;
  description: string;
  rate_type: "hourly" | "fixed" | "retainer";
  rate_amount: number;
  availability_status: "available" | "booked" | "unavailable";
  created_at: string;
  updated_at: string;
}

export async function listServices(profileId: string): Promise<Service[]> {
  const res = await fetchWithAuth(`/profiles/${profileId}/services`);
  return res.json();
}

export async function createService(
  profileId: string,
  body: { title: string; description: string; rate_type: string; rate_amount: number; availability_status?: string },
): Promise<Service> {
  const res = await fetchWithAuth(`/profiles/${profileId}/services`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateService(
  profileId: string,
  serviceId: string,
  body: Partial<{ title: string; description: string; rate_type: string; rate_amount: number; availability_status: string }>,
): Promise<Service> {
  const res = await fetchWithAuth(`/profiles/${profileId}/services/${serviceId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteService(profileId: string, serviceId: string): Promise<void> {
  await fetchWithAuth(`/profiles/${profileId}/services/${serviceId}`, { method: "DELETE" });
}

// ---- Evidence ----

export type SourceType = "document" | "screenshot" | "certificate" | "link" | "testimonial";

export interface PresignResponse {
  file_key: string;
  upload_url: string;
  expires_in: number;
}

export interface SkillLink {
  id: string;
  evidence_id: string;
  profile_skill_id: string;
}

export interface EvidenceRead {
  id: string;
  profile_id: string;
  uploader_id: string;
  source_type: SourceType;
  file_url: string | null;
  download_url: string | null;
  title: string;
  description: string | null;
  verification_status: "pending" | "verified" | "rejected";
  uploaded_at: string;
  skill_links: SkillLink[];
}

export async function presignEvidence(
  profileId: string,
  sourceType: "document" | "screenshot" | "certificate",
  contentType: string,
): Promise<PresignResponse> {
  const res = await fetchWithAuth(`/profiles/${profileId}/evidence/presign`, {
    method: "POST",
    body: JSON.stringify({ source_type: sourceType, content_type: contentType }),
  });
  return res.json();
}

export async function uploadToS3(uploadUrl: string, contentType: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
}

export async function createEvidence(
  profileId: string,
  body: { source_type: SourceType; title: string; description?: string; url?: string; file_key?: string },
): Promise<EvidenceRead> {
  const res = await fetchWithAuth(`/profiles/${profileId}/evidence`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function listEvidence(profileId: string): Promise<EvidenceRead[]> {
  const res = await fetchWithAuth(`/profiles/${profileId}/evidence`);
  return res.json();
}

export async function deleteEvidence(profileId: string, evidenceId: string): Promise<void> {
  await fetchWithAuth(`/profiles/${profileId}/evidence/${evidenceId}`, { method: "DELETE" });
}

export async function linkEvidenceToSkill(profileId: string, evidenceId: string, profileSkillId: string): Promise<void> {
  await fetchWithAuth(`/profiles/${profileId}/evidence/${evidenceId}/skill-links`, {
    method: "POST",
    body: JSON.stringify({ profile_skill_id: profileSkillId }),
  });
}

export async function unlinkEvidenceFromSkill(profileId: string, evidenceId: string, linkId: string): Promise<void> {
  await fetchWithAuth(`/profiles/${profileId}/evidence/${evidenceId}/skill-links/${linkId}`, { method: "DELETE" });
}

// ---- Verification requests ----

export interface VerificationRequest {
  id: string;
  requestor_id: string;
  target_type: "profile_skill" | "identity_doc";
  target_id: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export async function createVerificationRequest(
  targetType: "profile_skill" | "identity_doc",
  targetId: string,
): Promise<VerificationRequest> {
  const res = await fetchWithAuth("/verification-requests", {
    method: "POST",
    body: JSON.stringify({ target_type: targetType, target_id: targetId }),
  });
  return res.json();
}

export async function listVerificationRequests(
  status = "pending",
  page = 1,
  pageSize = 50,
): Promise<{ data: VerificationRequest[]; total: number; page: number; page_size: number }> {
  const params = new URLSearchParams({ status, page: String(page), page_size: String(pageSize) });
  const res = await fetchWithAuth(`/verification-requests?${params.toString()}`);
  return res.json();
}

export async function decideVerificationRequest(
  requestId: string,
  approved: boolean,
  note?: string,
): Promise<VerificationRequest> {
  const res = await fetchWithAuth(`/verification-requests/${requestId}/${approved ? "approve" : "reject"}`, {
    method: "POST",
    body: JSON.stringify({ note: note || undefined }),
  });
  return res.json();
}

// ---- Organizations ----

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  website_url: string | null;
  status: string;
  created_at: string;
}

export interface OrgMember {
  id: string;
  organization_id: string;
  user: { id: string; email: string; full_name: string };
  status: string;
  consent_given: boolean;
  joined_at: string | null;
}

export interface Invitation {
  member_id: string;
  organization_id: string;
  organization_name: string;
  invited_at: string | null;
}

export interface AggregateSkillRow {
  skill_id: string;
  name: string;
  category: string | null;
  member_count: number;
  evidenced_count: number;
  self_declared_count: number;
}

export function slugifyOrgName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
}

export async function createOrganization(body: {
  name: string;
  slug?: string;
  description?: string;
  website_url?: string;
}): Promise<Organization> {
  const res = await fetchWithAuth("/organizations", { method: "POST", body: JSON.stringify(body) });
  return res.json();
}

export async function listMyOrganizations(): Promise<Organization[]> {
  const res = await fetchWithAuth("/organizations");
  return res.json();
}

export async function getOrganization(id: string): Promise<Organization> {
  const res = await fetchWithAuth(`/organizations/${id}`);
  return res.json();
}

export async function updateOrganization(
  id: string,
  body: Partial<{ name: string; description: string; website_url: string; logo_url: string }>,
): Promise<Organization> {
  const res = await fetchWithAuth(`/organizations/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  return res.json();
}

export async function listMembers(orgId: string): Promise<OrgMember[]> {
  const res = await fetchWithAuth(`/organizations/${orgId}/members`);
  return res.json();
}

export async function inviteMember(orgId: string, email: string): Promise<OrgMember> {
  const res = await fetchWithAuth(`/organizations/${orgId}/members`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  return res.json();
}

export async function removeMember(orgId: string, memberId: string): Promise<void> {
  await fetchWithAuth(`/organizations/${orgId}/members/${memberId}`, { method: "DELETE" });
}

export async function giveConsent(orgId: string): Promise<OrgMember> {
  const res = await fetchWithAuth(`/organizations/${orgId}/members/me/consent`, { method: "POST" });
  return res.json();
}

export async function listMyInvitations(): Promise<Invitation[]> {
  const res = await fetchWithAuth("/organizations/invitations");
  return res.json();
}

export async function getOrgSkills(orgId: string): Promise<AggregateSkillRow[]> {
  const res = await fetchWithAuth(`/organizations/${orgId}/skills`);
  return res.json();
}

// ---- Roles (admin) ----

export interface Role {
  id: string;
  name: string;
  description: string | null;
}

export async function listRoles(): Promise<Role[]> {
  const res = await fetchWithAuth("/roles");
  return res.json();
}

// ---- Profile checks (readiness analysis, UF-7) ----

export type CheckStatus = "pending" | "fetching" | "evaluating" | "completed" | "failed";

export interface CheckSource {
  source: "cv" | "github" | "upwork" | "fiverr";
  status: "ok" | "failed" | "skipped";
  error_code: string | null;
  error_message: string | null;
  from_cache: boolean;
  duration_ms: number | null;
  fetched_at: string;
  raw: { filename?: string; chars?: number } | null;
}

export interface CheckDimension {
  key: string;
  label: string;
  points: number;
  max: number;
  signals: string[];
}

export interface CheckResultDetail {
  evaluator: string;
  readiness_raw: number;
  cap: { capped: boolean; at: number; reason: string | null };
  dimensions: CheckDimension[];
}

export interface ProfileCheckResultRead {
  readiness: number;
  capped: boolean;
  partial: boolean;
  result: CheckResultDetail;
  claims: { id: string; evidenced: boolean }[];
  skill_audit: { evidenced: number; self_declared: number; note: string } | null;
  sources_used: string[];
  generation_skipped: boolean;
  duration_ms: number | null;
  created_at: string;
}

export interface ProfileCheck {
  id: string;
  status: CheckStatus;
  github_url: string | null;
  upwork_url: string | null;
  fiverr_url: string | null;
  attempts: number;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  sources: CheckSource[];
  result: ProfileCheckResultRead | null;
}

export async function uploadCv(file: File): Promise<{ cv_token: string; filename: string; content_type: string; size_bytes: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetchWithAuth("/profile-checks/cv", { method: "POST", body: form });
  return res.json();
}

export async function attachCvAsEvidence(body: {
  cv_token: string;
  source_type: "certificate" | "document";
  title?: string;
  description?: string;
}): Promise<{ id: string; profile_id: string; title: string; source_type: string; verification_status: string }> {
  const res = await fetchWithAuth("/profile-checks/cv/attach-evidence", { method: "POST", body: JSON.stringify(body) });
  return res.json();
}

export interface CvSkillSuggestions {
  check_id: string;
  filename: string | null;
  suggested: string[];
  already_claimed: string[];
  error?: string;
}

export async function getCvSkillSuggestions(): Promise<CvSkillSuggestions | null> {
  const res = await fetchWithAuth("/profile-checks/cv/suggestions");
  if (res.status === 404) return null;
  return res.json();
}

/** Authenticated download for locally-stored evidence (download_url starting with "/"). */
export async function downloadEvidenceFile(downloadUrl: string): Promise<void> {
  const path = downloadUrl.startsWith("/api/v1/") ? downloadUrl.slice("/api/v1".length) : downloadUrl;
  const res = await fetchWithAuth(path);
  if (!res.ok) throw new ApiError(res.status, "download_failed", "Could not download the file.");
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export async function createProfileCheck(body: {
  github_url?: string;
  upwork_url?: string;
  fiverr_url?: string;
  cv_token?: string;
  reuse_cv?: boolean;
}): Promise<{ id: string; status: string; poll_url: string }> {
  const res = await fetchWithAuth("/profile-checks", { method: "POST", body: JSON.stringify(body) });
  return res.json();
}

export async function getProfileCheck(id: string): Promise<ProfileCheck> {
  const res = await fetchWithAuth(`/profile-checks/${id}`);
  return res.json();
}

export async function getLatestProfileCheck(): Promise<ProfileCheck | null> {
  const res = await fetchWithAuth("/profile-checks/latest");
  if (res.status === 404) return null;
  return res.json();
}

// ---- Account (change password / email) ----

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetchWithAuth("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (res.status !== 204) {
    let code = "unknown_error";
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch { /* non-JSON */ }
    throw new ApiError(res.status, code, message);
  }
}

export async function changeEmail(newEmail: string, currentPassword: string): Promise<{ email: string }> {
  const res = await fetchWithAuth("/auth/change-email", {
    method: "POST",
    body: JSON.stringify({ new_email: newEmail, current_password: currentPassword }),
  });
  return res.json();
}
