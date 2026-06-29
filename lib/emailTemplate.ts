// Weekly-digest email builder.
//
// `buildWeeklyDigestHtml` reproduces the UNITED24 Media weekly-digest HTML **byte-for-byte**
// except for the dynamic slots (intro, article cards, campaign tag). The `<head>` styles and the
// footer (support block, social links, {{unsubscribe_url}}, address) are kept verbatim so the
// design never drifts between sends. Only edit the static markup here if the canonical template changes.

export interface DigestCard {
  /** Article URL — used for the cover link and the READ MORE button (kept raw, no UTM, matching the source template). */
  url: string;
  title: string;
  lead: string;
  /** Cover image URL (1200×630). */
  cover: string;
  coverAlt?: string;
  authorName: string;
  authorRole: string;
  /** Square author headshot URL. */
  authorPhoto: string;
  authorUrl: string;
  /** Section label, e.g. "Defense Tech" — used in aria-labels only. */
  section: string;
}

export interface DigestInput {
  /** Intro paragraph ("Russia is now launching…"). Plain text; newlines become <br>. */
  intro: string;
  /** Campaign tag, e.g. "weekly_20" → utm_campaign on header / intro / ALL NEWS links. */
  campaignTag: string;
  cards: DigestCard[];
}

const LOGO_URL =
  'https://s9152801.sendpul.se/image/files/emailservice/userfiles/ecaadd411e3712914f84c397dfdf648e9152801/united24media-logo.png';

/** Escape text for HTML element content. */
function esc(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escape a value used inside a double-quoted HTML attribute (incl. href). */
function escAttr(value: string): string {
  return esc(value).replace(/"/g, '&quot;');
}

/** Plain text → HTML, preserving line breaks as <br>. */
function escMultiline(value: string): string {
  return esc(value).replace(/\r?\n/g, '<br>');
}

/** Build a united24media.com URL with the weekly UTM params (ampersands HTML-escaped for attributes). */
function utmUrl(base: string, campaignTag: string): string {
  const sep = base.includes('?') ? '&amp;' : '?';
  return `${escAttr(base)}${sep}utm_source=sendpulse&amp;utm_medium=email&amp;utm_campaign=${escAttr(campaignTag)}`;
}

function renderCard(card: DigestCard, index: number): string {
  // First card has slightly tighter top padding (matches the canonical template); the rest use `p-20-top`.
  const wrapperTd =
    index === 0
      ? '<td style="padding: 10px 10px 5px 10px;" bgcolor="#ffffff">'
      : '<td style="padding: 5px 10px 5px 10px;" bgcolor="#ffffff" class="p-20-top">';

  const section = esc(card.section || 'News');
  const href = escAttr(card.url);
  const coverAlt = escAttr(card.coverAlt || card.title || '');

  return `<tr>
									${wrapperTd}
										<table style="background: #ffffff;" bgcolor="#ffffff" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
											<tbody>
												<tr>
													<td style="background: #000000;" bgcolor="#000000" class="bg-dark"><a aria-label="Visit ${section} section" rel="noreferrer" href="${href}"><img style="width: 100%; height: auto; display: block; border: 0; outline: 0; border-width: 0px;" alt="${coverAlt}" height="630" width="1200" src="${escAttr(card.cover)}" caption="false"></a></td>
												</tr>
												<tr>
													<td style="background: #000000; padding: 16px 20px 0 20px;" bgcolor="#000000" class="bg-dark">
														<table style="background: #000000;" cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation">
															<tbody>
																<tr>
																	<td style="padding: 0 12px 0 0;" valign="top" width="40"><a href="${escAttr(card.authorUrl)}" rel="noreferrer"><img style="display: block; width: 40px; height: 40px; border: 0; outline: 0; text-decoration: none; -ms-interpolation-mode: bicubic; border-width: 0px;" alt="${escAttr(card.authorName)}" height="40" width="40" src="${escAttr(card.authorPhoto)}" caption="false"></a></td>
																	<td style="font-family: 'Helvetica Neue', Arial, 'Segoe UI', sans-serif; color: #ffffff;" valign="middle">
																		<div style="margin: 0; font-size: 14px; line-height: 1.3; font-weight: bold; color: #ffffff;">${esc(card.authorName.toUpperCase())}</div>
																		<div style="margin: 2px 0 0 0; font-size: 12px; line-height: 1.3; color: #ffffff; opacity: 0.9;">${esc(card.authorRole)}</div>
																	</td>
																</tr>
															</tbody>
														</table>
													</td>
												</tr>
												<tr>
													<td style="padding: 4px 20px 20px 20px; color: #ffffff; background: #000000;" bgcolor="#000000" class="bg-dark text-light">
														<div style="margin: 0 0 18px 0; font-size: 16px; line-height: 1.5;">
															<h3 class="c-hero__title c-title">${esc(card.title)}</h3>
														</div>
														<div style="margin: 0 0 18px 0; font-size: 16px; line-height: 1.5;"><span>${esc(card.lead)}</span></div>
														<table border="0" cellspacing="0" cellpadding="0" role="presentation" class="btn">
															<tbody>
																<tr>
																	<td style="border: 1px solid #000000; mso-padding-alt: 10px 20px; mso-line-height-rule: exactly; background: #ffffff;" bgcolor="#ffffff"><a style="display: inline-block; padding: 8px 16px; font-size: 13px; line-height: 1.5; font-weight: 500; text-decoration: none; color: #000000; font-family: 'Helvetica Neue', Arial, 'Segoe UI', sans-serif !important;" aria-label="Open ${section}" rel="noreferrer" href="${href}">READ MORE</a></td>
																</tr>
															</tbody>
														</table>
													</td>
												</tr>
											</tbody>
										</table>
									</td>
								</tr>`;
}

export function buildWeeklyDigestHtml(input: DigestInput): string {
  const campaign = input.campaignTag?.trim() || 'weekly';
  const homeUtm = utmUrl('https://united24media.com/', campaign);
  const homeUtmNoSlash = utmUrl('https://united24media.com', campaign);
  const allNewsUtm = utmUrl('https://united24media.com/news', campaign);
  const cards = (input.cards || []).map((c, i) => renderCard(c, i)).join('\n								');

  return `<html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head><meta http-equiv="content-type" content="text/html; charset=utf-8"><style>/* Base resets */
	html, body { margin:0 !important; padding:0 !important; height:100% !important; width:100% !important; }
	* { -ms-text-size-adjust:100%; -webkit-text-size-adjust:100%; }
	table, td { border-collapse:collapse !important; mso-table-lspace:0pt !important; mso-table-rspace:0pt !important; }
	img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; height:auto; line-height:100%; display:block; max-width:100%; }
	a { text-decoration:underline; }

	/* Link auto-styling resets (iOS/Gmail) */
	a[x-apple-data-detectors], u + #body a, #MessageViewBody a {
		color:inherit !important; text-decoration:underline !important; font-weight:inherit !important; border-bottom:0 !important;
	}

	/* Utility spacers */
	.sp-12 { line-height:12px; height:12px; font-size:12px; }
	.sp-14 { line-height:14px; height:14px; font-size:14px; }

	/* Mobile sizing */
	@media only screen and (max-width:600px){
		.container { width:100% !important; }
		.p-20 { padding:20px !important; }
		.p-20-top { padding-top:20px !important; }
		.p-20-bottom { padding-bottom:20px !important; }
		.btn a { font-size:14px !important; padding:8px 16px !important; }
		body { font-size:17px !important; line-height:1.6 !important; }
	}

	/* Desktop sizing */
	@media only screen and (min-width:601px){
		.btn a { font-size:15px !important; padding:10px 20px !important; }
	}

	/* Light-mode defaults */
	.text-default { color:#000000 !important; }
	.bg-page { background:#f4f4f4 !important; }
	.bg-white { background:#ffffff !important; }
	.bg-dark { background:#000000 !important; }
	.text-light { color:#ffffff !important; }

	/* Dark mode helpers */
	@media (prefers-color-scheme: dark){
		.bg-page { background:#0e0e0e !important; }
		.bg-white { background:#111111 !important; }
		.bg-dark { background:#000000 !important; }
		/* Only flip text to white inside dark areas */
		.bg-dark .text-default,
		.footer .text-default { color:#ffffff !important; }
		.text-light { color:#ffffff !important; }
		.btn-primary { background:#E7352E !important; border-color:#E7352E !important; color:#ffffff !important; }
		.btn-outline-dark { background:#ffffff !important; color:#000000 !important; border-color:#000000 !important; }
		.footer { background:#0f0f0f !important; color:#cccccc !important; }
		.footer a { color:#cccccc !important; }
		.text-default a { color:#9ecbff !important; }
	}

	/* Outlook.com dark mode targeting */
	[data-ogsc] .bg-dark .text-default,
	[data-ogsc] .footer .text-default { color:#ffffff !important; }
	[data-ogsc] .text-light { color:#ffffff !important; }
	[data-ogsc] .bg-dark { background:#000000 !important; }
	[data-ogsc] .bg-white { background:#111111 !important; }
	[data-ogsc] .footer { background:#0f0f0f !important; color:#cccccc !important; }
	[data-ogsc] .footer a { color:#cccccc !important; }</style></head><body style="margin:0; padding:0 !important; background:#f4f4f4; font-family: Georgia, 'Times New Roman', Times, serif; font-size:16px; line-height:1.5; -webkit-font-smoothing:antialiased;" class="bg-page">
	<center style="width: 100%; background: #f4f4f4;" lang="en" aria-roledescription="email" role="article">
		<table style="background: #f4f4f4;" bgcolor="#f4f4f4" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
			<tbody>
				<tr>
					<td align="center">
						<table style="max-width: 600px; width: 100%; background: #ffffff;" bgcolor="#ffffff" cellpadding="0" cellspacing="0" border="0" width="600" role="presentation" class="container bg-white">
							<tbody>
								<tr>
									<td style="background: #000000;" bgcolor="#000000" class="bg-dark"><a aria-label="Go to UNITED24 Media homepage" rel="noreferrer" style="text-decoration: none;" href="${homeUtm}"><img style="width: 100%; height: auto; display: block; border: 0; outline: 0; text-decoration: none;" width="600" src="${LOGO_URL}"></a></td>
								</tr>
								<tr>
									<td style="padding: 20px 20px; background-color: #ffffff;" class="p-20 text-default">
										<h3><strong>This week at <a rel="noreferrer" href="${homeUtmNoSlash}">UNITED24 Media</a>: </strong></h3>
										<div><br></div>
										<p>${escMultiline(input.intro)}<br></p>
									</td>
								</tr>
								${cards}
								<tr>
									<td style="padding: 20px 10px 10px;" bgcolor="#ffffff" class="p-20-bottom">
										<table style="background: #ffffff;" bgcolor="#ffffff" width="100%" role="presentation">
											<tbody>
												<tr>
													<td style="border: 2px solid #000000; text-align: center; background: #ffffff;" bgcolor="#ffffff"><a style="display: block; padding: 12px 24px; font-size: 16px; font-weight: 500; text-decoration: none; color: #000000; font-family: 'Helvetica Neue', Arial, 'Segoe UI', sans-serif !important; background: #ffffff;" rel="noreferrer" href="${allNewsUtm}">ALL NEWS</a></td>
												</tr>
											</tbody>
										</table>
									</td>
								</tr>
								<tr>
									<td bgcolor="#ffffff" style="padding: 10px 10px 40px;">
										<h3 class="text-10 md:text-15 font-bold leading-[1] mb-5">Support UNITED24 Media Team</h3>
										<p>Every day, our team reports from the front lines, bombed cities, and communities across Ukraine—documenting what the world needs to see and giving voice to those living through this war. Your donation <strong><a rel="noopener noreferrer" href="https://united24media.com/donate">keeps our journalists where they matter most</a></strong>.</p>
										<table style="background: #E7352E;" bgcolor="#E7352E" width="100%" role="presentation">
											<tbody>
												<tr>
													<td style="border: 2px solid #2355b2; text-align: center; background: #2355b2;" bgcolor="#2355b2"><a style="display: block; padding: 12px 24px; font-size: 16px; font-weight: 500; text-decoration: none; color: #ffffff; font-family: 'Helvetica Neue', Arial, 'Segoe UI', sans-serif !important;" rel="noreferrer" href="https://united24media.com/donate">SUPPORT OUR TEAM</a></td>
												</tr>
											</tbody>
										</table>
									</td>
								</tr>
								<tr>
									<td style="padding: 20px 20px 40px; color: #999999; font-family: 'Helvetica Neue', Arial, 'Segoe UI', sans-serif; background: #111111;" bgcolor="#111111" class="footer">
										<p style="margin: 0 0 10px; font-size: 12px; line-height: 1.5; color: #ffffff;"><strong>Follow us: </strong><span style="color: #ffffff !important;"><a style="color: #ffffff !important; text-decoration: underline;" rel="noopener noreferrer" href="https://www.instagram.com/united24.media/">Instagram</a></span>, <span style="color: #ffffff !important;"><a style="color: #ffffff !important; text-decoration: underline;" rel="noreferrer" href="https://x.com/United24media">X</a></span>, <span style="color: #ffffff !important;"><a style="color: #ffffff !important; text-decoration: underline;" rel="noopener noreferrer" href="https://www.facebook.com/united24.media">Facebook</a></span>, <span style="color: #ffffff !important;"><a style="color: #ffffff !important; text-decoration: underline;" rel="noopener noreferrer" href="https://www.reddit.com/user/UNITED24Media/">Reddit</a></span>, <span style="color: #ffffff !important;"><a style="color: #ffffff !important; text-decoration: underline;" rel="noopener noreferrer" href="https://t.me/s/United24media">Telegram</a></span>, <span style="color: #ffffff !important;"><a style="color: #ffffff !important; text-decoration: underline;" rel="noopener noreferrer" href="https://whatsapp.com/channel/0029Va0S5Ei5q08guUvBFp2a">WhatsApp</a></span>, <span style="color: #ffffff !important;"><a style="color: #ffffff !important; text-decoration: underline;" rel="noopener noreferrer" href="https://www.threads.net/@united24.media">Threads</a></span></p>
										<div style="height: 14px; line-height: 14px;"> </div>
										<p style="margin: 0 0 10px; font-size: 12px; line-height: 1.5;">You're receiving this email because you subscribed at <a style="color: #999999; text-decoration: underline;" rel="noopener noreferrer" href="https://united24media.com/">united24media.com</a>.</p>
										<p style="margin: 0 0 10px; font-size: 12px; line-height: 1.5;">If you no longer wish to receive these emails, you can <a style="color: #999999; text-decoration: underline;" rel="noopener noreferrer" href="{{unsubscribe_url}}">unsubscribe here</a>.</p>
										<p style="margin: 0; font-size: 12px; line-height: 1.5;">vul. <a style="color: #999999; text-decoration: underline;" rel="noopener noreferrer" href="https://maps.app.goo.gl/8iJypgfULwpyxphm9">Dilova 24, Kyiv 03150, Ukraine</a></p>
									</td>
								</tr>
							</tbody>
						</table>
					</td>
				</tr>
			</tbody>
		</table>
	</center>
	</body></html>`;
}
