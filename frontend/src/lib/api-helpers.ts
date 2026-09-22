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
