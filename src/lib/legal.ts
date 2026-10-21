export type LegalDocument = {
  title: string;
  introduction: string;
  sections: { title: string; paragraphs: string[] }[];
};

export const legalUpdatedAt = "21 October 2026";

export const privacyPolicy: LegalDocument = {
  title: "Privacy Policy",
  introduction: "This policy explains how JobTracker handles personal information when you use tracking.naspadstudio.id, including its beta features. JobTracker is operated by Victor, an individual based in Indonesia, under the Naspad Studio name. Contact: hello@naspadstudio.id.",
  sections: [
    { title: "Information we handle", paragraphs: [
      "Account information: your Google account identifier and verified email address, account role and status, and session information. Google sign-in requests your basic profile and email permissions. We do not receive your Google password.",
      "Information you provide: CVs, employment and education history, contact details included in documents, job postings and URLs, applications, notes, interview updates, preferences, and feedback. Generated documents, matches, and other AI results may be saved with your account. Avoid uploading identity documents, financial details, health information, or other sensitive information that is unnecessary for your job search.",
      "Optional Gmail information: if you connect Gmail, we handle authorization tokens, mailbox address, message and thread identifiers, sender information, subjects, snippets, timestamps, and job-related classifications or links to applications. Sync fetches message bodies for processing; the imported email records store metadata and snippets rather than complete message bodies.",
      "Operational information: essential cookies, request and error information, and AI request metadata such as model, operation, token counts, and usage limits. Hosting and network infrastructure may process IP addresses and request information to deliver and protect the service. This application does not include advertising trackers.",
    ] },
    { title: "How and why we use information", paragraphs: [
      "We use information to authenticate you, maintain your private workspace, track applications, create requested documents and analyses, operate optional integrations, respond to support and privacy requests, prevent abuse, troubleshoot failures, and meet applicable legal duties. We process information as needed to provide the service you request, with consent for optional access where required, and for other purposes only where applicable law permits. We do not sell personal information or use Google user data for advertising.",
    ] },
    { title: "Gmail is optional", paragraphs: [
      "You can use manual tracking without connecting Gmail. If you connect it, sync can fetch messages across your mailbox since the sync cursor before identifying application-related messages; access is not limited to emails already labeled as job applications. The connection currently requests permission to read email and to send email. The implemented sync reads messages; requesting send permission does not mean the current sync sends messages.",
      "Disconnecting Gmail removes the saved connection credentials and stops future sync through that connection. JobTracker also attempts to revoke its Google token. You can revoke access directly in your Google Account at any time. Disconnecting or revoking access does not delete records already imported into JobTracker. Request deletion separately using the contact details below.",
    ] },
    { title: "AI processing and service providers", paragraphs: [
      "AI features can send the content needed for a task to the configured API provider, OpenAI or Anthropic. Depending on the feature, this can include CV content, job descriptions, prompts, and relevant email sender, subject, and body text. Gmail classification may use AI during sync without a separate click for each message. The selected provider can change through the service configuration. You can contact us to ask which provider is currently configured before using AI features or connecting Gmail.",
      "Providers process submitted information under their applicable API terms and data-handling arrangements; separate retention or security-monitoring rules may apply. We do not promise that API requests are never retained by a provider. We do not use information obtained through Google Workspace APIs to train, improve, or develop generalized or non-personalized AI or machine-learning models, and we do not authorize providers to use that information for those purposes.",
      "Google handles identity and optional Gmail authorization. If we send you invitations or service messages through Resend, it processes recipient addresses, message content, and delivery information. Replies to our support email are handled through iCloud Mail. These providers receive information only for their relevant service functions. We may also disclose information when legally required or as necessary to address fraud, security threats, or protection of legal rights.",
    ] },
    { title: "Google API Limited Use", paragraphs: [
      "JobTracker’s use and transfer of information received from Google APIs will adhere to the Google API Services User Data Policy and the Google Workspace API user data and developer policy, including the Limited Use requirements. Google user data is used to provide the disclosed user-facing features, not for advertising, data brokerage, or unrelated profiling.",
      "We do not allow people to read Google user data except with your affirmative agreement for specific information, where necessary for security, to comply with applicable law, or in other circumstances expressly permitted by Google’s policies. Any transfer to an AI provider must be limited to the disclosed feature and comply with these restrictions.",
    ] },
    { title: "Hosting, international processing, and security", paragraphs: [
      "JobTracker runs on infrastructure self-hosted by the operator. We do not represent that all processing occurs in Indonesia: Google, AI providers, email providers, and network services may process information in other countries. Where required, we apply the safeguards and conditions applicable to those transfers.",
      "The application separates account workspaces, uses protected session cookies, and encrypts stored Gmail refresh tokens. These controls do not mean all stored application data is encrypted or that the operator cannot access the underlying infrastructure. No system can guarantee absolute security. We restrict access to legitimate operational needs and handle incidents and required notifications in accordance with applicable law.",
    ] },
    { title: "Retention and deletion", paragraphs: [
      "We keep account and application information while needed to provide your account and the functions you use, unless you request deletion or a shorter period is required by law. Deleting or archiving an individual item may not remove copies from backups. Disconnecting Google or Gmail alone is not an account deletion request.",
      "To delete your account, email hello@naspadstudio.id from your account email address. We may ask for proportionate verification before taking action. We will delete your account data from active systems within 30 days of a verified request. Backup copies expire within 90 days of the verified request; if restored before expiry, deletion requests must be reapplied. We will not use pending-deletion backup data for ordinary product operations.",
      "Information that must be retained to comply with law or resolve a specific legal claim may be retained only for that purpose and for as long as necessary. Records held independently by providers, including support correspondence or legally required records, are also subject to their applicable obligations. We will explain any relevant exception when responding to your request.",
    ] },
    { title: "Your choices and rights", paragraphs: [
      "You can choose whether to connect Gmail, revoke Google access, and request access to, correction of, a copy of, or deletion of your personal information. You may also withdraw consent or request restriction or objection to processing where applicable. Withdrawal does not affect lawful processing that happened before it. Contact hello@naspadstudio.id; we respond within the time required by applicable law. You may raise concerns with the competent authority where available. These rights are subject to applicable law, including Indonesia’s personal data protection requirements.",
      "JobTracker is intended for people who can lawfully agree to its Terms of Service. We do not knowingly offer it to children who require parental consent. Contact us if you believe a child has provided personal information without the required authorization.",
    ] },
    { title: "Changes and contact", paragraphs: [
      "We update the date on this page when the policy changes. For material changes, we will provide appropriate notice through the service or your account email and obtain new consent where required before using information for a new purpose. Privacy, access, security, and deletion requests can be sent to Victor at hello@naspadstudio.id.",
    ] },
  ],
};

export const termsOfService: LegalDocument = {
  title: "Terms of Service",
  introduction: "These terms govern your use of JobTracker at tracking.naspadstudio.id. Your agreement is with Victor, an individual based in Indonesia operating under the Naspad Studio name. Contact: hello@naspadstudio.id. By creating an account or using JobTracker, you agree to these terms. If you do not agree, do not use the service.",
  sections: [
    { title: "The service and beta status", paragraphs: [
      "JobTracker helps you organize job applications, documents, and interview updates. Optional integrations and AI features may be available. It is an early beta: features, availability, and usage limits can change, and errors or interruptions may occur. Keep your own copies of important documents. JobTracker does not guarantee interviews, employment, accurate job listings, or successful applications.",
    ] },
    { title: "Your account", paragraphs: [
      "You must be legally able to enter this agreement under the law that applies to you. Use an account you control and provide accurate information. Protect your Google account and notify us promptly of suspected unauthorized access. You may not impersonate another person, bypass a suspension, or create accounts to evade usage limits.",
    ] },
    { title: "Your content and permissions", paragraphs: [
      "You retain ownership of your content. You give us a limited, non-exclusive permission to host, copy, process, and transmit that content only as needed to operate JobTracker, provide requested features, maintain security, and comply with law, as described in the Privacy Policy. This includes sharing relevant content with the AI or integration providers needed for a feature you use. It does not transfer ownership to us or permit unrelated sale of your content.",
      "Only submit content you have the right to use. Avoid including unnecessary personal information about other people. Your permission ends when the relevant content is deleted, except for limited backup retention and legal requirements described in the Privacy Policy.",
    ] },
    { title: "Acceptable use", paragraphs: [
      "Do not use JobTracker for unlawful activity, fraud, harassment, spam, or infringement of another person’s rights. Do not upload malware, attempt unauthorized access, extract other users’ data, interfere with the service, or bypass security or usage controls. You may not use the service to create misleading qualifications or impersonate an employer or applicant.",
    ] },
    { title: "AI and third-party services", paragraphs: [
      "AI results can be inaccurate, incomplete, or biased. Review CVs, cover letters, classifications, job details, and other output before relying on or sending them. You remain responsible for factual accuracy and your decisions. AI output is not professional, legal, immigration, or recruitment advice.",
      "Google sign-in, optional Gmail access, AI APIs, and other third-party services have their own terms and availability. Connecting Gmail is optional. You can disconnect it, but imported records remain until separately deleted. We do not control employers, linked job boards, or their hiring decisions.",
    ] },
    { title: "Pricing and changes", paragraphs: [
      "Creating a beta account does not authorize a charge. If paid plans are introduced, their price and terms will be presented before you choose to purchase. Current access is not a promise of unlimited AI usage or permanently free service. We may apply reasonable usage limits and provide notice of material service changes where practicable.",
    ] },
    { title: "Suspension, closure, and deletion", paragraphs: [
      "You can stop using JobTracker at any time and request account deletion at hello@naspadstudio.id. The Privacy Policy describes verification, deletion from active systems within 30 days, and expiry of backup copies within 90 days of a verified request.",
      "We may restrict or suspend access where reasonably necessary to address misuse, security risks, legal requirements, or breaches of these terms. Where practicable, we will explain the action and give you an opportunity to contact us. If we discontinue the service, we will give reasonable notice and an opportunity to request your data where practicable. Closure does not cancel privacy or deletion obligations.",
    ] },
    { title: "Service limitations and responsibility", paragraphs: [
      "To the extent permitted by applicable law, the beta is provided as available without a promise of uninterrupted or error-free operation or suitability for a particular purpose. We are not responsible for hiring decisions, the accuracy of third-party listings, or losses caused by content you send without reviewing it.",
      "Nothing in these terms excludes responsibility that cannot lawfully be excluded, including mandatory consumer or privacy rights, fraud, or other liability protected by applicable law. These limitations do not remove our duties to protect personal information or respond to verified privacy requests.",
    ] },
    { title: "Terms updates and disputes", paragraphs: [
      "We may update these terms, recording the revision date on this page. Material changes will be communicated through the service or your account email before taking effect where practicable. Where fresh agreement is legally required, we will request it. You can stop using the service if you do not accept revised terms.",
      "These terms are governed by Indonesian law, subject to any mandatory protections that apply where you live. Contact hello@naspadstudio.id first so we can try to resolve a concern. These terms do not require arbitration or remove any right to use a competent court or authority.",
    ] },
  ],
};
