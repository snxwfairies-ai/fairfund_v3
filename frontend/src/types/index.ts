export interface User {
  id: string;
  name: string;
  email: string;
  role: 'investor' | 'sme_admin' | 'compliance_officer' | 'admin' | 'super_admin';
  kyc_status: 'not_started' | 'pending' | 'in_review' | 'verified' | 'rejected';
  unread_notifications?: number;
}

export interface SME {
  id: string;
  legal_name: string;
  cin?: string;
  sector: string;
  location_city: string;
  location_state: string;
  short_description: string;
  long_description?: string;
  founded_year: number;
  team_size: number;
  stage: string;
  instrument: string;
  target_raise: number;
  raised_so_far: number;
  valuation_pre: number;
  min_investment: number;
  expected_return_min: number;
  expected_return_max: number;
  tenure_months: number;
  revenue_last_fy: number;
  investor_count: number;
  fairefund_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'very_high';
  tag: string;
  tag_color: string;
  status: string;
  closing_date: string;
  progress_pct: number;
  days_remaining: number;
  compliance_done: number;
  compliance_total: number;
  documents?: Document[];
  compliance?: ComplianceTask[];
}

export interface Investment {
  id: string;
  investor_id: string;
  sme_id: string;
  sme_name: string;
  sector: string;
  amount: number;
  instrument: string;
  shares_allotted: number;
  share_price: number;
  current_value: number;
  return_pct: number;
  status: string;
  kyc_verified: boolean;
  esign_completed: boolean;
  escrow_funded: boolean;
  allotment_date?: string;
  created_at: string;
}

export interface PortfolioSummary {
  total_invested: number;
  total_current: number;
  total_gain: number;
  gain_pct: string;
}

export interface Document {
  id: string;
  name: string;
  doc_type: string;
  file_type: string;
  requires_kyc: boolean;
  is_verified: boolean;
}

export interface ComplianceTask {
  id: string;
  task_name: string;
  status: 'pending' | 'in_progress' | 'done' | 'waived' | 'failed';
  is_mandatory: boolean;
  due_date?: string;
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'action_required';
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface PlatformStats {
  active_listings: number;
  total_investors: number;
  total_raised: number;
  avg_return: string;
  verified_investors: number;
  new_users_30d: number;
  sectors: { sector: string; raised: number }[];
  top_smes: { name: string; score: number; raised_so_far: number; target_raise: number }[];
  monthly: { month: string; amount: number }[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
}
