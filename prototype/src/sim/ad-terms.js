// The Advertising Terms and Conditions, as the owner gave them (13 October 2026), shown in the ADS app and
// accepted before a campaign is submitted. A few sentences of the original were written as instructions to the
// builder ("Do not promise a remedy...", "Retain the accepted terms version..."): they are said here as what the
// platform does, or (one) left out, because they are rules for the game rather than for the advertiser.
//
// The server (api/_lib/ads.js) refuses a submission that does not name this version: change the version there and
// here together whenever a word below changes.

export const AD_TERMS_VERSION = 'ads-terms-2026-10-13';
export const AD_TERMS_TITLE = 'Advertising Terms and Conditions';
export const AD_TERMS_CHECKBOX = 'I have read and agree to the Advertising Terms and Conditions. I confirm that I have the rights to submit this artwork and understand that advertising does not guarantee sales or customers.';
// [{ title, paras: [text | [list items]] }]
export const AD_TERMS = Object.freeze([
 {
  "title": "Eligibility and authority",
  "paras": [
   "Advertisers must have the right to promote the submitted business, product, service, brand or application. They must be authorized to submit all logos, artwork, trademarks and other creative materials.",
   "The advertising platform may request clarification or supporting information where reasonably necessary."
  ]
 },
 {
  "title": "Prohibited advertisements",
  "paras": [
   "The following are prohibited:",
   [
    "Sexual services, explicit sexual content or pornography.",
    "Content promoting sexual exploitation or abuse.",
    "Threats, intimidation, targeted harassment or encouragement of violence.",
    "Content promoting killing, murder or real-world violent wrongdoing.",
    "Fraudulent schemes, Ponzi schemes, pyramid schemes or deceptive financial promises.",
    "Scams, impersonation, phishing, credential theft or misleading links.",
    "Malware, malicious downloads or deceptive applications.",
    "Counterfeit goods, stolen goods or illegal services.",
    "Advertising that infringes intellectual property rights.",
    "Content encouraging illegal activity or attempting to evade the platform’s safety controls.",
    "Misleading claims, fabricated testimonials or deceptive pricing.",
    "Any content that violates applicable law or the platform’s reasonable safety policies."
   ],
   "Crypto projects, gadgets, legitimate businesses, games, apps, technology products and other lawful offerings may be considered, subject to review. Cryptocurrency advertising is not automatically approved merely because it belongs to an allowed category. Fraudulent investment claims, deceptive token promotions and misleading returns remain prohibited."
  ]
 },
 {
  "title": "Content accuracy",
  "paras": [
   "Advertisers are responsible for ensuring that claims, links, product descriptions and promotional materials are accurate and not misleading.",
   "The platform may reject ads that make unverifiable guarantees, falsely claim endorsements, misrepresent products or conceal material conditions."
  ]
 },
 {
  "title": "Artwork and file requirements",
  "paras": [
   "Advertisers must submit artwork that matches the selected billboard’s displayed dimensions and aspect ratio.",
   "Static billboards accept one approved flier per campaign.",
   "Digital television billboards require between 3 and 10 slides. Every slide must meet the platform’s file requirements and pass review.",
   "Poorly sized, corrupted, unreadable or unsuitable artwork may be rejected or returned for correction."
  ]
 },
 {
  "title": "Intellectual property",
  "paras": [
   "Advertisers confirm that they own or have permission to use submitted artwork, photographs, brand names, music references, logos and other materials.",
   "The advertiser grants the platform the limited permission necessary to review, format, display and remove the submitted material for the agreed campaign.",
   "This permission does not transfer ownership of the advertiser’s intellectual property to the platform."
  ]
 },
 {
  "title": "Pricing, tax and TR",
  "paras": [
   "All advertising charges are payable in TR using the pricing displayed at checkout.",
   "The price breakdown identifies the advertising fee, the applicable in-game advertising tax and the total cost.",
   "The platform may change future prices, but a submitted campaign keeps its server-validated pricing terms. Any future change is displayed before a new campaign is submitted.",
   "Only eligible earned TR may be used to pay for advertising. Initial starter grants and other ineligible credits cannot be used."
  ]
 },
 {
  "title": "Review and payment holds",
  "paras": [
   "Submitting an advertisement does not guarantee approval.",
   "The required eligible earned TR will be held while the campaign is under review. If the campaign is rejected, the held amount is released back to the advertiser’s earned TR according to the platform’s refund and accounting process.",
   "An advertisement does not become active before approval."
  ]
 },
 {
  "title": "Advertising duration",
  "paras": [
   "Advertisers must select the intended duration before submitting.",
   "The campaign’s start time, duration, price and scheduled expiration are shown before submission. Approved campaigns are removed or replaced when their paid duration expires."
  ]
 },
 {
  "title": "No guarantee of sales or customers",
  "paras": [
   "Purchasing an advertisement does not guarantee sales, leads, downloads, customers, profits, website visits or any particular business outcome in the game or the real world.",
   "The platform provides an advertising placement, not a guarantee of commercial success."
  ]
 },
 {
  "title": "Review rights and removal",
  "paras": [
   "The advertising operator may reject, pause or remove advertisements that violate these terms, create a safety risk, contain misleading claims or become unlawful.",
   "Where appropriate, the advertiser receives a reason and an opportunity to correct a fixable issue.",
   "The platform may urgently remove content posing an immediate security, legal or safety risk."
  ]
 },
 {
  "title": "Duration disputes and technical failures",
  "paras": [
   "The platform maintains campaign records and attempts to deliver the approved placement for the paid duration.",
   "If a significant technical failure prevents a campaign from being displayed, the operator may provide an appropriate extension, replacement placement or refund according to the documented advertising policy."
  ]
 },
 {
  "title": "Advertiser responsibilities",
  "paras": [
   "Advertisers must maintain valid links and provide accurate contact and campaign information where requested.",
   "They must not use the submission system to spam reviewers, submit repeated prohibited content, manipulate billboard availability or evade rejection by creating duplicate accounts."
  ]
 },
 {
  "title": "Privacy and information handling",
  "paras": [
   "The platform will use submitted business details and artwork to review, administer and display campaigns.",
   "The platform does not publicly expose private account identifiers, internal review notes or security information.",
   "Submissions and stored artwork are kept under access controls: artwork is shown publicly only while its approved campaign is running."
  ]
 },
 {
  "title": "Changes to the policy",
  "paras": [
   "The platform may update these terms as the game and advertising system evolve. Advertisers are asked to accept materially updated terms before submitting new campaigns.",
   "The version of the terms accepted is kept with each submission."
  ]
 },
 {
  "title": "Acceptance",
  "paras": [
   "By submitting an advertising campaign, the player confirms that they have read and accepted these terms, have the necessary rights to the submitted materials, and understand the pricing, moderation, duration and eligibility rules."
  ]
 }
]);
