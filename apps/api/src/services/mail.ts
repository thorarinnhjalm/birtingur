interface MailPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
}

/**
 * Almennt fall til að senda tölvupóst í gegnum Resend API.
 * Ef RESEND_API_KEY vantar, er tölvupósturinn skrifaður í console logs.
 */
async function sendMail(payload: MailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('\n--- ✉️ [Tölvupóstur skrifaður í Console (Vantar RESEND_API_KEY)] ---');
    console.log(`Frá: ${payload.from}`);
    console.log(`Til: ${payload.to.join(', ')}`);
    console.log(`Efni: ${payload.subject}`);
    console.log('Innihald:');
    console.log(payload.html);
    console.log('-------------------------------------------------------------\n');
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Ekki tókst að senda tölvupóst með Resend:', errorText);
      // Við viljum ekki kasta villu sem stoppar nýskráninguna alveg, heldur logga hana.
    }
  } catch (err) {
    console.error('Villa við tengingu við Resend API:', err);
  }
}

/**
 * Ops-viðvörun á rekstraraðila (notað af cron-alerting í ops-alerts.ts).
 */
export async function sendOpsAlertEmail(
  toEmails: string[],
  subject: string,
  message: string,
): Promise<void> {
  const sender = process.env.SENDER_EMAIL || 'onboarding@resend.dev';
  await sendMail({
    from: `Birtingur Ops <${sender}>`,
    to: toEmails,
    subject: `[Birtingur OPS] ${subject}`,
    html: `<p style="font-family:monospace;white-space:pre-wrap">${message}</p>`,
  });
}

/**
 * Sendir velkominn tölvupóst á nýjan útgefanda (Publisher)
 */
export async function sendWelcomePublisherEmail(
  toEmail: string,
  displayName: string,
  domain: string,
): Promise<void> {
  const sender = process.env.SENDER_EMAIL || 'onboarding@resend.dev';
  const html = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #334155; line-height: 1.6;">
  <h2 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Velkomin(n) í Birting! 🚀</h2>
  <p>Hæ <strong>${displayName}</strong>,</p>
  <p>Sérstaklega gaman að fá þig í hópinn okkar hjá Birtingi! Vefurinn þinn <strong>${domain}</strong> hefur verið skráður og er tilbúinn til notkunar.</p>
  <p>Markmið okkar er einfalt: að hjálpa þér að fá greitt fyrir það frábæra efni sem þú skapar, án þess að þú þurfir að hafa áhyggjur af flókinni tölfræði eða erlendum auglýsingarisum.</p>
  
  <h3 style="color: #0f172a; margin-top: 25px;">Næstu skref til að byrja að græða:</h3>
  <ol style="padding-left: 20px;">
    <li style="margin-bottom: 10px;"><strong>Stofnaðu pláss:</strong> Búðu til nýtt auglýsingapláss í stjórnborðinu þínu (t.d. borða efst á síðu eða í hliðarstiku).</li>
    <li style="margin-bottom: 10px;"><strong>Settu inn kóðabútinn:</strong> Afritaðu einfalda HTML-kóðabútinn (snippet) og settu hann inn á vefsíðuna þína.</li>
    <li style="margin-bottom: 10px;"><strong>Láttu kerfið sjá um afganginn:</strong> Gervigreindin okkar flokkar síðuna þína sjálfkrafa í rétta efnisflokka. Um leið og auglýsendur kaupa birtingar í þínum flokkum byrja tekjur að safnast í veskið þitt.</li>
  </ol>

  <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; margin-top: 25px; border-radius: 4px;">
    <p style="margin: 0; font-size: 14px; font-weight: 600;">Ertu með spurningar eða vantar þig aðstoð?</p>
    <p style="margin: 5px 0 0 0; font-size: 13px; color: #64748b;">Þú getur einfaldlega svarað þessum tölvupósti og við aðstoðum þig við að komast í gang.</p>
  </div>

  <p style="margin-top: 30px;">Kær kveðja,<br><strong>Birtingsteymið</strong><br><a href="https://birtingur.is" style="color: #3b82f6; text-decoration: none;">birtingur.is</a></p>
</div>
  `;

  await sendMail({
    from: sender,
    to: [toEmail],
    subject: 'Velkomin(n) í Birting – Byrjum að breyta umferð í krónur! 💸',
    html,
  });
}

/**
 * Sendir velkominn tölvupóst á nýjan auglýsanda (Advertiser)
 */
export async function sendWelcomeAdvertiserEmail(
  toEmail: string,
  companyName: string,
): Promise<void> {
  const sender = process.env.SENDER_EMAIL || 'onboarding@resend.dev';
  const html = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #334155; line-height: 1.6;">
  <h2 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Velkomin(n) til leiks! 🚀</h2>
  <p>Hæ <strong>${companyName}</strong>,</p>
  <p>Frábært að fá þig í hópinn hjá Birtingi. Vettvangur okkar býður upp á nýja og milliliðalausa leið fyrir fyrirtæki til að ná til íslenskra neytenda á vinsælum bloggum, lífsstílsvefjum og sérhæfðum miðlum.</p>
  
  <h3 style="color: #0f172a; margin-top: 25px;">Svona ræsir þú fyrstu herferðina þína:</h3>
  <ol style="padding-left: 20px;">
    <li style="margin-bottom: 10px;"><strong>Bættu við inneign:</strong> Farðu í veskið í stjórnborðinu og leggðu inn inneign með öruggri kortagreiðslu eða millifærslu.</li>
    <li style="margin-bottom: 10px;"><strong>Veldu markhópa:</strong> Veldu þá efnisflokka sem henta þínu vörumerki (t.d. <em>mat</em>, <em>lífsstíl</em> eða <em>tækni</em>) og ákveddu heildarupphæð herferðarinnar.</li>
    <li style="margin-bottom: 10px;"><strong>Hladdu upp auglýsingu:</strong> Hladdu upp auglýsingaborða og settu inn áfangaslóð. Við sjáum um að dreifa birtingunum jafnt og sjálfvirkt á þær vefsíður sem eru í völdum flokkum.</li>
  </ol>

  <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; margin-top: 25px; border-radius: 4px;">
    <p style="margin: 0; font-size: 14px; font-weight: 600;">Vantar þig aðstoð við hönnun eða uppsetningu?</p>
    <p style="margin: 5px 0 0 0; font-size: 13px; color: #64748b;">Við getum aðstoðað við að fínstilla herferðina eða hanna auglýsingaborðana. Svaraðu þessum pósti og við heyrum í þér sem fyrst!</p>
  </div>

  <p style="margin-top: 30px;">Kær kveðja,<br><strong>Birtingsteymið</strong><br><a href="https://birtingur.is" style="color: #3b82f6; text-decoration: none;">birtingur.is</a></p>
</div>
  `;

  await sendMail({
    from: sender,
    to: [toEmail],
    subject: 'Velkomin(n) í Birting – Komdu þér á framfæri á íslenskum vefjum! 🎯',
    html,
  });
}

/**
 * Sendir tilkynningu á eiganda auglýsanda þegar agent (yfir MCP/API) stofnar
 * herferð sem fer yfir sjálfvirku samþykktarmörkin (autoApproveLimitIsk) og
 * bíður því handvirks samþykkis — sjá purchase-hliðið í services/campaigns.ts.
 */
export async function sendAgentCampaignPendingEmail(
  toEmail: string,
  companyName: string,
  campaignId: string,
  amountIsk: number,
): Promise<void> {
  const sender = process.env.SENDER_EMAIL || 'onboarding@resend.dev';
  const appBaseUrl = process.env.APP_BASE_URL || 'https://app.birtingur.app';
  const amountLabel = `${amountIsk.toLocaleString('is-IS')} kr.`;
  const html = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #334155; line-height: 1.6;">
  <h2 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Agent óskar eftir herferð</h2>
  <p>Hæ <strong>${companyName}</strong>,</p>
  <p>Agent sem tengist auglýsingaaðgangnum þínum bjó til nýja herferð upp á <strong>${amountLabel}</strong>. Upphæðin er yfir sjálfvirku samþykktarmörkunum sem þú settir fyrir þennan API-lykil, svo herferðin bíður núna samþykkis þíns áður en hún fer í loftið.</p>
  <p>Fjármunirnir eru þegar frátéknir úr veskinu þínu á meðan herferðin bíður — engin greiðsla fer fram fyrr en þú samþykkir.</p>
  <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; margin-top: 25px; border-radius: 4px;">
    <p style="margin: 0; font-size: 14px; font-weight: 600;">Næstu skref</p>
    <p style="margin: 5px 0 0 0; font-size: 13px; color: #64748b;">Farðu í stjórnborðið þitt og samþykktu eða hafnaðu herferðinni.</p>
  </div>
  <p style="margin-top: 30px;"><a href="${appBaseUrl}/advertiser/campaigns/${campaignId}" style="color: #3b82f6; text-decoration: none;">Skoða herferð í stjórnborði</a></p>
  <p style="margin-top: 30px;">Kær kveðja,<br><strong>Birtingsteymið</strong><br><a href="https://birtingur.is" style="color: #3b82f6; text-decoration: none;">birtingur.is</a></p>
</div>
  `;

  await sendMail({
    from: sender,
    to: [toEmail],
    subject: `Agent óskar eftir herferð upp á ${amountLabel} — samþykktu eða hafnaðu`,
    html,
  });
}

/**
 * Sendir velkominn tölvupóst á ensku á alla sem skrá sig á biðlistann (/en)
 */
export async function sendWaitlistWelcomeEmail(
  toEmail: string,
  role: string,
  category?: string,
): Promise<void> {
  const sender = process.env.SENDER_EMAIL || 'onboarding@resend.dev';

  // Basic HTML entity escaping to prevent HTML injection in emails
  const safeCategory = category
    ? category.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    : undefined;

  const html = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b; line-height: 1.6;">
  <h2 style="color: #1e3a8a; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Welcome to Birtingur Early Access! 🚀</h2>
  <p>Thank you for joining the global waitlist for Birtingur, the privacy-first category display network.</p>
  <p><strong>Your Registration Details:</strong></p>
  <ul style="padding-left: 20px;">
    <li><strong>Role:</strong> ${role.toUpperCase()}</li>
    ${safeCategory ? `<li><strong>Primary Category:</strong> ${safeCategory}</li>` : ''}
  </ul>
  <p>We are expanding early access by region and content category. We will reach out as soon as early access opens for your profile.</p>
  <div style="background-color: #f8fafc; border-left: 4px solid #1e3a8a; padding: 15px; margin-top: 25px; border-radius: 4px;">
    <p style="margin: 0; font-size: 13px; color: #64748b;">100% Cookie-Free & Privacy First • Birtingur Network</p>
  </div>
  <p style="margin-top: 30px;">Best regards,<br><strong>The Birtingur Team</strong><br><a href="https://www.birtingur.app/en" style="color: #1e3a8a; text-decoration: none;">birtingur.app/en</a></p>
</div>
  `;

  await sendMail({
    from: sender,
    to: [toEmail],
    subject: 'Welcome to Birtingur Early Access!',
    html,
  });
}
