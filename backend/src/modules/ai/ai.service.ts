import { Injectable, Logger } from '@nestjs/common';
import { ConfigService }      from '@nestjs/config';
import OpenAI                 from 'openai';
import { v4 as uuidv4 }       from 'uuid';
import { DatabaseService }    from '../../database/database.service';
import { RedisService }       from '../../redis/redis.service';

// ─── Score dimensions ─────────────────────────────────────────────────────────
export interface ScoreBreakdown {
  financial:    number;   // Revenue, EBITDA, debt-equity (0–100)
  execution:    number;   // Team size, tenure, investor count (0–100)
  market:       number;   // Sector, stage, return expectations (0–100)
  compliance:   number;   // Compliance tasks done % (0–100)
  overall:      number;   // Weighted average
  risk_level:   'low' | 'medium' | 'high' | 'very_high';
  risk_factors: string[]; // Human-readable red flags
  ai_rationale: string;   // GPT explanation (2–3 sentences)
}

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private openai: OpenAI | null = null;
  private readonly MODEL = 'gpt-4o-mini'; // fast + cheap for scoring
  private readonly CACHE_TTL = 3600 * 24; // 24h

  constructor(
    private readonly db:     DatabaseService,
    private readonly redis:  RedisService,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey && apiKey !== 'sk-placeholder') {
      this.openai = new OpenAI({ apiKey });
      this.logger.log('✅ OpenAI connected');
    } else {
      this.logger.warn('⚠️  OPENAI_API_KEY not set — using rule-based scoring fallback');
    }
  }

  // ── Score a single SME ─────────────────────────────────────────────────────
  async scoreSME(smeId: string, forceRefresh = false): Promise<ScoreBreakdown> {
    const cacheKey = `ai:score:${smeId}`;
    if (!forceRefresh) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as ScoreBreakdown;
    }

    // Fetch SME data
    const sme = await this.db.queryOne<any>(
      `SELECT s.*,
         (SELECT COUNT(*) FROM compliance_tasks WHERE sme_id=s.id AND status='done')::int AS comp_done,
         (SELECT COUNT(*) FROM compliance_tasks WHERE sme_id=s.id)::int AS comp_total,
         (SELECT COUNT(*) FROM documents WHERE sme_id=s.id AND is_verified=TRUE)::int AS verified_docs
       FROM smes s WHERE s.id=$1`, [smeId]
    );
    if (!sme) throw new Error(`SME ${smeId} not found`);

    const score = this.openai
      ? await this.scoreWithAI(sme)
      : this.scoreWithRules(sme);

    // Persist to ai_scores table
    await this.db.query(
      `INSERT INTO ai_scores (id,sme_id,model_version,overall_score,financial_score,execution_score,
         market_score,compliance_score,risk_factors,score_breakdown)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [uuidv4(), smeId, this.openai ? this.MODEL : 'rules-v1',
       score.overall, score.financial, score.execution, score.market, score.compliance,
       JSON.stringify(score.risk_factors), JSON.stringify(score)],
    );

    // Update SME table
    await this.db.query(
      `UPDATE smes SET fairfund_score=$1, ai_score=$1, ai_score_updated_at=NOW(),
         risk_level=$2 WHERE id=$3`,
      [score.overall, score.risk_level, smeId],
    );

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(score));
    this.logger.log(`AI Score: ${sme.legal_name} → ${score.overall}/100 [${score.risk_level}]`);
    return score;
  }

  // ── Batch score all active SMEs ────────────────────────────────────────────
  async scoreAllActive() {
    const smes = await this.db.queryMany<any>("SELECT id FROM smes WHERE status='active'");
    const results: { sme_id: string; score: number; risk: string }[] = [];

    for (const { id } of smes) {
      try {
        const score = await this.scoreSME(id);
        results.push({ sme_id: id, score: score.overall, risk: score.risk_level });
        await new Promise(r => setTimeout(r, 200)); // Rate limit: 5 req/s
      } catch (e) {
        this.logger.warn(`Score failed for ${id}: ${e.message}`);
      }
    }
    return results;
  }

  // ── Get score history for an SME ──────────────────────────────────────────
  async getScoreHistory(smeId: string) {
    return this.db.queryMany(
      `SELECT overall_score, financial_score, execution_score, market_score,
              compliance_score, model_version, created_at, risk_factors
       FROM ai_scores WHERE sme_id=$1 ORDER BY created_at DESC LIMIT 10`,
      [smeId]
    );
  }

  // ── Investor recommendations ──────────────────────────────────────────────
  async getRecommendations(investorId: string): Promise<any[]> {
    const cacheKey = `ai:reco:${investorId}`;
    return this.redis.cached(cacheKey, 1800, async () => {
      // Get investor's risk appetite and existing investments
      const [profile, existing] = await Promise.all([
        this.db.queryOne<any>('SELECT risk_appetite, annual_income_band FROM investor_profiles WHERE user_id=$1', [investorId]),
        this.db.queryMany<any>('SELECT sme_id FROM investments WHERE investor_id=$1 AND status NOT IN (\'REFUNDED\',\'DEFAULTED\')', [investorId]),
      ]);

      const excludeIds = existing.map((e: any) => e.sme_id);

      // Score filter based on risk appetite
      const riskMap: Record<string, { min: number; max_risk: string }> = {
        conservative: { min: 80, max_risk: 'low' },
        moderate:     { min: 70, max_risk: 'medium' },
        aggressive:   { min: 55, max_risk: 'high' },
      };
      const appetite = profile?.risk_appetite ?? 'moderate';
      const filter   = riskMap[appetite] ?? riskMap.moderate;

      let q = `SELECT id,legal_name,sector,expected_return_min,expected_return_max,
                      fairfund_score,progress_pct,min_investment,tag,tag_color,risk_level,
                      days_remaining,short_description
               FROM v_sme_progress
               WHERE status='active' AND fairfund_score >= $1`;
      const params: any[] = [filter.min];
      if (excludeIds.length) {
        q += ` AND id != ALL($${params.length + 1}::uuid[])`;
        params.push(excludeIds);
      }
      q += ' ORDER BY fairfund_score DESC LIMIT 5';

      const recs = await this.db.queryMany(q, params);
      return recs;
    });
  }

  // ── Private: OpenAI-based scoring ─────────────────────────────────────────
  private async scoreWithAI(sme: any): Promise<ScoreBreakdown> {
    const rules = this.scoreWithRules(sme); // Start with rule-based as baseline

    const prompt = `You are a senior SEBI-registered investment analyst evaluating an Indian MSME for private placement.

COMPANY DATA:
- Name: ${sme.legal_name}
- Sector: ${sme.sector} | Stage: ${sme.stage} | Founded: ${sme.founded_year}
- Team: ${sme.team_size} employees
- Revenue FY: ₹${parseFloat(sme.revenue_last_fy || 0).toLocaleString('en-IN')}
- EBITDA FY: ₹${parseFloat(sme.ebitda_last_fy || 0).toLocaleString('en-IN')}
- Revenue Growth: ${sme.revenue_growth_pct || 'N/A'}%
- Debt/Equity: ${sme.debt_equity_ratio || 'N/A'}
- Target Raise: ₹${parseFloat(sme.target_raise).toLocaleString('en-IN')}
- Valuation: ₹${parseFloat(sme.valuation_pre).toLocaleString('en-IN')}
- Expected Return: ${sme.expected_return_min}–${sme.expected_return_max}% p.a.
- Investors so far: ${sme.investor_count}
- Compliance done: ${sme.comp_done}/${sme.comp_total} tasks
- Verified documents: ${sme.verified_docs}

Rule-based baseline scores: financial=${rules.financial}, execution=${rules.execution}, market=${rules.market}, compliance=${rules.compliance}

Respond ONLY with valid JSON in exactly this format (no markdown, no explanation outside JSON):
{
  "financial": <0-100>,
  "execution": <0-100>,
  "market": <0-100>,
  "compliance": <0-100>,
  "risk_factors": ["<flag1>", "<flag2>"],
  "ai_rationale": "<2 sentences max about the investment thesis>"
}`;

    try {
      const resp = await this.openai!.chat.completions.create({
        model: this.MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.1, // Low temperature for consistent scoring
        response_format: { type: 'json_object' },
      });

      const raw   = resp.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw);

      return this.buildScore({
        financial:    this.clamp(parsed.financial ?? rules.financial),
        execution:    this.clamp(parsed.execution ?? rules.execution),
        market:       this.clamp(parsed.market    ?? rules.market),
        compliance:   this.clamp(parsed.compliance ?? rules.compliance),
        risk_factors: parsed.risk_factors ?? rules.risk_factors,
        ai_rationale: parsed.ai_rationale ?? '',
      });
    } catch (err) {
      this.logger.warn(`OpenAI error, using rules: ${err.message}`);
      return rules;
    }
  }

  // ── Private: Rule-based scoring (deterministic fallback) ──────────────────
  private scoreWithRules(sme: any): ScoreBreakdown {
    const revenue   = parseFloat(sme.revenue_last_fy   || 0);
    const ebitda    = parseFloat(sme.ebitda_last_fy    || 0);
    const growth    = parseFloat(sme.revenue_growth_pct || 0);
    const de        = parseFloat(sme.debt_equity_ratio  || 0);
    const teamSize  = parseInt(sme.team_size  || 0);
    const founded   = parseInt(sme.founded_year || 2020);
    const age       = new Date().getFullYear() - founded;
    const retMin    = parseFloat(sme.expected_return_min || 0);
    const retMax    = parseFloat(sme.expected_return_max || 0);
    const invCount  = parseInt(sme.investor_count || 0);
    const compDone  = parseInt(sme.comp_done || 0);
    const compTotal = parseInt(sme.comp_total || 1);
    const compPct   = compTotal > 0 ? (compDone / compTotal) * 100 : 0;

    const risk_factors: string[] = [];

    // ── Financial score ────────────────────────────────────────────────────
    let financial = 50;
    if (revenue > 10_000_000)  financial += 20;
    else if (revenue > 3_000_000) financial += 12;
    else if (revenue > 500_000)   financial += 5;
    else { financial -= 10; risk_factors.push('Revenue below ₹5L — very early stage'); }

    if (ebitda > 0)           financial += 10;
    else if (ebitda < 0)     { financial -= 8;  risk_factors.push('Negative EBITDA — burning cash'); }

    if (growth > 50)          financial += 15;
    else if (growth > 20)     financial += 8;
    else if (growth < 0)     { financial -= 12; risk_factors.push('Negative revenue growth'); }

    if (de > 0 && de < 0.5)   financial += 5;
    else if (de > 2)          { financial -= 8;  risk_factors.push('High debt/equity ratio > 2x'); }
    if (de > 5)               risk_factors.push('Extremely high leverage — debt/equity > 5x');

    // ── Execution score ────────────────────────────────────────────────────
    let execution = 50;
    if (teamSize >= 50)       execution += 20;
    else if (teamSize >= 15)  execution += 10;
    else if (teamSize < 5)  { execution -= 10; risk_factors.push('Very small team (<5 employees)'); }

    if (age >= 5)             execution += 15;
    else if (age >= 2)        execution += 8;
    else                    { execution -= 5;  risk_factors.push('Company less than 2 years old'); }

    if (invCount >= 20)       execution += 10;
    else if (invCount >= 5)   execution += 5;

    // ── Market score ──────────────────────────────────────────────────────
    const hotSectors = ['AgriTech','HealthTech','CleanTech','EdTech'];
    let market = 50;
    if (hotSectors.includes(sme.sector)) market += 15;

    const midStages  = ['Series A','Pre-Series A'];
    const earlyStages = ['Seed','Seed+'];
    if (midStages.includes(sme.stage))   market += 10;
    else if (earlyStages.includes(sme.stage)) market += 5;
    else if (sme.stage === 'Series B')   market += 15;

    if (retMax > 30)         { market -= 8;  risk_factors.push('Return expectations >30% p.a. may be unrealistic'); }
    else if (retMin >= 15)     market += 10;
    if (retMax - retMin > 15)  risk_factors.push('Wide return range indicates high uncertainty');

    // ── Compliance score ──────────────────────────────────────────────────
    let compliance = Math.round(compPct);
    if (compPct < 50)       risk_factors.push(`Only ${compDone}/${compTotal} compliance tasks done`);
    if (parseInt(sme.verified_docs || 0) < 2) {
      compliance -= 15;
      risk_factors.push('Insufficient verified documents');
    }

    return this.buildScore({ financial, execution, market, compliance, risk_factors, ai_rationale: '' });
  }

  // ── Compute weighted overall + risk level ─────────────────────────────────
  private buildScore(dims: {
    financial: number; execution: number; market: number; compliance: number;
    risk_factors: string[]; ai_rationale: string;
  }): ScoreBreakdown {
    const { financial, execution, market, compliance, risk_factors, ai_rationale } = dims;
    // Weights: financial 35%, execution 25%, market 25%, compliance 15%
    const overall = Math.round(
      this.clamp(financial)   * 0.35 +
      this.clamp(execution)   * 0.25 +
      this.clamp(market)      * 0.25 +
      this.clamp(compliance)  * 0.15,
    );
    const risk_level: ScoreBreakdown['risk_level'] =
      overall >= 80 ? 'low' : overall >= 65 ? 'medium' : overall >= 50 ? 'high' : 'very_high';

    return {
      financial:    this.clamp(financial),
      execution:    this.clamp(execution),
      market:       this.clamp(market),
      compliance:   this.clamp(compliance),
      overall,
      risk_level,
      risk_factors: [...new Set(risk_factors)].slice(0, 5),
      ai_rationale,
    };
  }

  private clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
}
