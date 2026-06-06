/**
 * Gemini-powered AI advisor that generates personalized tips for advertisers
 * based on their real performance data.
 *
 * Falls back to rule-based tips if no GEMINI_API_KEY is set.
 */

interface AdvisorContext {
  impressions: number;
  clicks: number;
  ctr: number;
  spendIsk: number;
  balanceIsk: number;
  activeCampaigns: number;
  totalCampaigns: number;
}

function getRuleBasedTips(ctx: AdvisorContext): string[] {
  const tips: string[] = [];
  if (ctx.impressions === 0) {
    tips.push('Stofnaðu fyrstu herferðina og byrjaðu að ná til markhópsins þíns.');
    return tips;
  }
  if (ctx.ctr < 0.5)
    tips.push('CTR er undir 0,5%. Prófaðu áberandi litasamsetningu og skýrari CTA á borðanum.');
  else if (ctx.ctr > 2)
    tips.push('Frábært CTR! Íhugaðu að hækka fjárhagsáætlun til að ná til fleiri notenda.');
  if (ctx.activeCampaigns === 0)
    tips.push('Engin herferð er í gangi. Virkjaðu herferð til að byrja birtingar.');
  if (ctx.balanceIsk < 5000)
    tips.push('Innistæða er lág. Fylltu á til að tryggja órofnar birtingar.');
  if (tips.length === 0) tips.push('Allt lítur vel út! Haltu áfram og fylgstu með árangri.');
  return tips;
}

export async function getAiTips(ctx: AdvisorContext): Promise<string[]> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return getRuleBasedTips(ctx);
  }

  try {
    const prompt = `Þú ert auglýsingaráðgjafi á íslensku auglýsingakerfinu Birtingur.
Gefðu stuttar, hagnýtar ráðleggingar (nákvæmlega 3) byggt á eftirfarandi árangursgögnum auglýsanda.

Gögn:
- Birtingar: ${ctx.impressions.toLocaleString('is-IS')}
- Smellir: ${ctx.clicks.toLocaleString('is-IS')}
- CTR: ${ctx.ctr.toFixed(2).replace('.', ',')}%
- Eyðsla: ${ctx.spendIsk.toLocaleString('is-IS')} kr.
- Innistæða: ${ctx.balanceIsk.toLocaleString('is-IS')} kr.
- Virkar herferðir: ${ctx.activeCampaigns} af ${ctx.totalCampaigns}

Reglur:
- Skrifaðu á ÍSLENSKU
- Hver ráðlegging skal vera 1-2 setningar
- Vertu hagnýtur og beinn
- Ekki endurtaka gögn sem notandinn sér þegar
- Leggðu áherslu á aðgerðir sem notandinn getur gert NÚNA`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                tips: {
                  type: 'ARRAY',
                  items: { type: 'STRING' },
                  description: 'Exactly 3 actionable tips in Icelandic',
                },
              },
              required: ['tips'],
            },
          },
        }),
      },
    );

    if (!response.ok) {
      console.warn('AI Advisor: Gemini API error, using fallback');
      return getRuleBasedTips(ctx);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return getRuleBasedTips(ctx);
    }

    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.tips) && parsed.tips.length > 0) {
      return parsed.tips.slice(0, 3);
    }

    return getRuleBasedTips(ctx);
  } catch (error) {
    console.warn('AI Advisor: Failed, using fallback:', error);
    return getRuleBasedTips(ctx);
  }
}
