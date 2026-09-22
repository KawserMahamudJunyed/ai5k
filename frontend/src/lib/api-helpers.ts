// Typed helpers for the AI5K backend endpoints used by the frontend.
// Shapes mirror backend/app/schemas (auth.py, profile.py, evidence.py).

import {
  ApiError,
  clearAuthTokens,
  fetchApi,
  fetchWithAuth,
  getAccessToken,
  setAuthTokens,
} from "./api";

export { setAuthTokens, clearAuthTokens, getAccessToken, ApiError };

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
  // Present only when the backend runs with ENV=local.
  verification_token: string | null;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface RefreshResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export async function signup(
  email: string,
  password: string,
  fullName: string,
): Promise<SignupResponse> {
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

export async function refresh(refreshToken: string): Promise<RefreshResponse> {
  const res = await fetchApi("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
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

export async function createProfile(body: {
  display_name: string;
  headline?: string | null;
  job_roles?: string[];
  portfolio_links?: PortfolioLink[];
  visibility?: "private" | "public";
}): Promise<ProfileRead> {
  const res = await fetchWithAuth("/profiles", {
    method: "POST",
    body: JSON.stringify(body),
  });
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
  body: {
    display_name?: string;
    headline?: string | null;
    job_roles?: string[];
    portfolio_links?: PortfolioLink[];
    visibility?: "private" | "public";
  },
): Promise<ProfileRead> {
  const res = await fetchWithAuth(`/profiles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
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

export async function updateSkillClaim(
  profileId: string,
  claimId: string,
  proficiency_level: string,
): Promise<SkillClaim> {
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

export async function uploadToS3(
  uploadUrl: string,
  contentType: string,
  file: File,
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status})`);
  }
}

export async function createEvidence(
  profileId: string,
  body: {
    source_type: SourceType;
    title: string;
    description?: string;
    url?: string;
    file_key?: string;
  },
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
  await fetchWithAuth(`/profiles/${profileId}/evidence/${evidenceId}`, {
    method: "DELETE",
  });
}

export async function linkEvidenceToSkill(
  profileId: string,
  evidenceId: string,
  profileSkillId: string,
): Promise<void> {
  await fetchWithAuth(`/profiles/${profileId}/evidence/${evidenceId}/skill-links`, {
    method: "POST",
    body: JSON.stringify({ profile_skill_id: profileSkillId }),
  });
}

export async function unlinkEvidenceFromSkill(
  profileId: string,
  evidenceId: string,
  linkId: string,
): Promise<void> {
  await fetchWithAuth(`/profiles/${profileId}/evidence/${evidenceId}/skill-links/${linkId}`, {
    method: "DELETE",
  });
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

// Client-side suggestion for the slug field; the server is the authority
// (allows only [a-z0-9-], else 422 invalid_slug).
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
  const res = await fetchWithAuth("/organizations", {
    method: "POST",
    body: JSON.stringify(body),
  });
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
  const res = await fetchWithAuth(`/organizations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
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
  await fetchWithAuth(`/organizations/${orgId}/members/${memberId}`, {
    method: "DELETE",
  });
}

export async function giveConsent(orgId: string): Promise<OrgMember> {
  const res = await fetchWithAuth(`/organizations/${orgId}/members/me/consent`, {
    method: "POST",
  });
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

// Shared error rendering: prefer 422 field details, then the envelope message.
export function describeApiError(err: unknown): string {
  if (
    err instanceof ApiError &&
    err.status === 422 &&
    err.details &&
    typeof err.details === "object"
  ) {
    const entries = Object.entries(err.details as Record<string, string>);
    if (entries.length > 0) {
      return entries.map(([f, m]) => `${f}: ${m}`).join(" · ");
    }
  }
  return (err as Error).message || "Something went wrong";
}
