export interface Tier {
  name: string;
  weight: number;
  color: string;
}

export interface LinkItem {
  label: string;
  href: string;
}

export interface PanelData {
  roleLabel: string;
  headline: string;
  bullets: string[];
}
