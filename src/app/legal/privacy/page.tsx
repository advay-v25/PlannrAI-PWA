export const metadata = {
  title: 'Privacy Policy | PlannrAI',
  description: 'How we collect, use, and protect your data.',
};

export default function PrivacyPage() {
  return (
    <div className="space-y-6 text-sm sm:text-base">
      <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Privacy Policy</h1>
      <p className="text-sm font-medium text-[var(--color-primary)] mb-8">Effective Date: 9 May 2026</p>

      <h2 className="text-xl sm:text-2xl font-semibold text-white mt-10 mb-4">1. Introduction and Our Commitment to Privacy</h2>
      <p className="mb-4 leading-relaxed">
        PlannrAI ("we," "us," or "our") is committed to protecting your privacy and handling your personal data with transparency, responsibility, and respect. This Privacy Policy explains how we collect, use, store, share, and protect information about you when you access or use the PlannrAI application and related services (collectively, the "Service").
      </p>
      <p className="mb-4 leading-relaxed">
        This Privacy Policy forms part of our Terms & Conditions and should be read alongside them. By using the Service, you acknowledge that you have read and understood this Privacy Policy. If you do not agree with our practices as described herein, please discontinue your use of the Service.
      </p>
      <div className="p-4 bg-[var(--glass-bg)] border border-[var(--color-primary)]/20 rounded-xl my-6">
        <p className="mb-4 leading-relaxed font-medium text-white">
          PlannrAI is built on a foundational principle of data minimisation: we collect only what we need to deliver our service, we retain it only as long as necessary, and we do not monetise your personal data in any form.
        </p>
      </div>

      <h2 className="text-xl sm:text-2xl font-semibold text-white mt-10 mb-4">2. Who We Are and How to Contact Us</h2>
      <p className="mb-4 leading-relaxed">
        PlannrAI is operated by its founders as a product currently in beta. For all privacy-related enquiries, data access requests, or complaints, please contact us at: <a href="mailto:support@plannrai.in" className="text-[var(--color-primary)] hover:underline">support@plannrai.in</a>
      </p>
      <p className="mb-4 leading-relaxed">
        We will endeavour to respond to all legitimate data-related requests within thirty (30) days of receipt.
      </p>

      <h2 className="text-xl sm:text-2xl font-semibold text-white mt-10 mb-4">3. Information We Collect</h2>
      <h3 className="text-lg font-medium text-white mt-6 mb-3">3.1 Information You Provide Directly</h3>
      <p className="mb-4 leading-relaxed">
        When you create an account and use the Service, you may provide us with the following categories of personal information:
      </p>
      <ul className="list-disc pl-6 mb-4 space-y-2">
        <li className="leading-relaxed"><strong className="font-semibold text-white">Account Information:</strong> Your name and email address, collected at the time of registration</li>
        <li className="leading-relaxed"><strong className="font-semibold text-white">Profile Preferences:</strong> Information you provide when configuring the App, such as your wake time, sleep schedule, work commitments, meal preferences, and productivity goals</li>
        <li className="leading-relaxed"><strong className="font-semibold text-white">Goal and Task Data:</strong> The goals, tasks, time blocks, and scheduling preferences you input into the App</li>
        <li className="leading-relaxed"><strong className="font-semibold text-white">Communications:</strong> Any correspondence you send to us via email or other communication channels</li>
      </ul>
      <h3 className="text-lg font-medium text-white mt-6 mb-3">3.2 Information Collected Automatically</h3>
      <p className="mb-4 leading-relaxed">
        When you access or use the Service, we may automatically collect certain technical information, including:
      </p>
      <ul className="list-disc pl-6 mb-4 space-y-2">
        <li className="leading-relaxed">Device and browser type, operating system version, and basic technical identifiers necessary for compatibility and performance</li>
        <li className="leading-relaxed">Usage patterns and feature interactions within the App, collected on an aggregated basis to help us improve the Service</li>
        <li className="leading-relaxed">Session data, including session duration and general navigation patterns within the App</li>
      </ul>
      <p className="mb-4 leading-relaxed">
        This automatically collected information is used solely for the purpose of maintaining and improving the App's technical performance and user experience. It is not used for advertising or sold to third parties.
      </p>
      <h3 className="text-lg font-medium text-white mt-6 mb-3">3.3 AI Interaction Data</h3>
      <div className="p-4 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 rounded-xl mb-4">
        <p className="font-semibold text-white mb-2">PlannrAI stores your conversations with Donna and other AI features so the coach can maintain context across sessions and so you can review, export, or delete that history at any time.</p>
        <p className="text-sm leading-relaxed">
          When you interact with an AI feature, your messages and the AI's responses are saved to your account (as "coach conversations" and "coach messages"). PlannrAI may also derive and store a small number of persistent "memory facts" from what you say — for example, a stated constraint or goal — so future coaching can stay consistent with what you've already told it. This content is used solely to generate and improve your personalised schedule and coaching responses; it is not sold, and it is not used to train third-party AI models.
        </p>
        <p className="text-sm leading-relaxed mt-2">
          To generate a response, your prompt is sent to one or more third-party AI infrastructure providers (which may include NVIDIA, Groq, Google, OpenRouter, and Cerebras, selected automatically based on availability and performance) solely to produce that response — these providers do not receive your other account data.
        </p>
        <p className="text-sm leading-relaxed mt-2">
          You can review this content at any time via the "Export My Data" feature in Settings (see Section 9), and you can delete it — along with everything else in your account — by deleting your account, or by contacting us to request deletion of AI conversation history specifically.
        </p>
      </div>
      <h3 className="text-lg font-medium text-white mt-6 mb-3">3.4 Information We Do Not Collect</h3>
      <p className="mb-4 leading-relaxed">
        PlannrAI does not collect, process, or store any of the following categories of sensitive personal data:
      </p>
      <ul className="list-disc pl-6 mb-4 space-y-2">
        <li className="leading-relaxed">Government-issued identification numbers (Aadhaar, PAN, passport numbers, etc.)</li>
        <li className="leading-relaxed">Financial account information, credit or debit card details, or banking credentials</li>
        <li className="leading-relaxed">Biometric data of any kind</li>
        <li className="leading-relaxed">Precise real-time location data</li>
        <li className="leading-relaxed">Health or medical records</li>
        <li className="leading-relaxed">Racial or ethnic origin, religious beliefs, or political opinions</li>
        <li className="leading-relaxed">Criminal history or legal records</li>
      </ul>

      <h2 className="text-xl sm:text-2xl font-semibold text-white mt-10 mb-4">4. How We Use Your Information</h2>
      <p className="mb-4 leading-relaxed">PlannrAI uses the information we collect for the following purposes:</p>
      <ul className="list-disc pl-6 mb-4 space-y-2">
        <li className="leading-relaxed">To create and maintain your account and provide you with access to the Service</li>
        <li className="leading-relaxed">To personalise your experience within the App based on your goals, preferences, and scheduling inputs</li>
        <li className="leading-relaxed">To generate AI-powered schedules, coaching responses, and planning recommendations tailored to your stated objectives</li>
        <li className="leading-relaxed">To operate, maintain, debug, and improve the technical performance and features of the App</li>
        <li className="leading-relaxed">To communicate with you about your account, including account-related notices, security alerts, and service updates</li>
        <li className="leading-relaxed">To respond to your enquiries, requests, or complaints</li>
        <li className="leading-relaxed">To comply with applicable legal obligations</li>
        <li className="leading-relaxed">To enforce our Terms & Conditions and protect the rights, property, and safety of PlannrAI, our users, and the public</li>
      </ul>
      <p className="mb-4 leading-relaxed">
        We will not use your personal information for any purpose beyond what is described in this Privacy Policy without obtaining your prior explicit consent.
      </p>

      <h2 className="text-xl sm:text-2xl font-semibold text-white mt-10 mb-4">5. Legal Basis for Processing (Applicable in Relevant Jurisdictions)</h2>
      <p className="mb-4 leading-relaxed">
        Where required by applicable data protection laws (including, where applicable, the Digital Personal Data Protection Act, 2023 of India), we process your personal data on the following legal bases:
      </p>
      <ul className="list-disc pl-6 mb-4 space-y-2">
        <li className="leading-relaxed"><strong className="font-semibold text-white">Consent:</strong> Where you have provided explicit consent to specific processing activities</li>
        <li className="leading-relaxed"><strong className="font-semibold text-white">Contractual Necessity:</strong> Where processing is necessary to perform the contract between you and PlannrAI (i.e., providing you with the Service)</li>
        <li className="leading-relaxed"><strong className="font-semibold text-white">Legitimate Interests:</strong> Where processing is necessary for our legitimate interests, provided those interests are not overridden by your fundamental rights and freedoms</li>
        <li className="leading-relaxed"><strong className="font-semibold text-white">Legal Obligation:</strong> Where processing is necessary to comply with applicable law</li>
      </ul>

      <h2 className="text-xl sm:text-2xl font-semibold text-white mt-10 mb-4">6. Data Storage and Security</h2>
      <h3 className="text-lg font-medium text-white mt-6 mb-3">6.1 Where Your Data is Stored</h3>
      <p className="mb-4 leading-relaxed">
        Your personal data is stored securely using Supabase, a third-party infrastructure provider that employs industry-standard encryption and security protocols. Data is stored with encryption both in transit and at rest.
      </p>
      <h3 className="text-lg font-medium text-white mt-6 mb-3">6.2 Security Measures</h3>
      <p className="mb-4 leading-relaxed">
        PlannrAI implements and maintains reasonable and appropriate technical and organisational security measures designed to protect your personal data against unauthorised access, disclosure, alteration, loss, or destruction. These measures include:
      </p>
      <ul className="list-disc pl-6 mb-4 space-y-2">
        <li className="leading-relaxed">Encryption of data in transit using industry-standard protocols (SSL/TLS)</li>
        <li className="leading-relaxed">Encryption of data at rest within our storage infrastructure</li>
        <li className="leading-relaxed">Access controls limiting who within PlannrAI can access personal data</li>
        <li className="leading-relaxed">Regular review of our security practices and infrastructure</li>
      </ul>
      <h3 className="text-lg font-medium text-white mt-6 mb-3">6.3 Security Limitations</h3>
      <p className="mb-4 leading-relaxed">
        While we take data security seriously, no method of transmission over the Internet or electronic storage is completely secure. We cannot guarantee the absolute security of your data. In the event of a data breach that affects your personal data, we will notify you in accordance with applicable law.
      </p>
      <h3 className="text-lg font-medium text-white mt-6 mb-3">6.4 Data Retention</h3>
      <p className="mb-4 leading-relaxed">
        We retain your personal data only for as long as your account remains active, or as long as necessary to provide you with the Service. Upon deletion of your account — whether initiated by you or by PlannrAI — your personal data, including all schedule blocks, goals, task lists, AI conversation history, and account information, will be permanently and irreversibly deleted from our systems within a reasonable timeframe.
      </p>
      <p className="mb-4 leading-relaxed">
        Certain aggregated, anonymised, and non-identifiable usage data may be retained beyond account deletion for analytical and product improvement purposes, provided that such data cannot reasonably be used to identify you.
      </p>

      <h2 className="text-xl sm:text-2xl font-semibold text-white mt-10 mb-4">7. Sharing of Your Information</h2>
      <h3 className="text-lg font-medium text-white mt-6 mb-3">7.1 General Principle — We Do Not Sell Your Data</h3>
      <p className="mb-4 leading-relaxed">
        PlannrAI does not sell, rent, trade, or otherwise transfer your personal data to third parties for their own commercial or marketing purposes. Your data is not a product. We will never monetise your personal information.
      </p>
      <h3 className="text-lg font-medium text-white mt-6 mb-3">7.2 Permitted Disclosures</h3>
      <p className="mb-4 leading-relaxed">We may share your personal data in the following limited circumstances:</p>
      <ul className="list-disc pl-6 mb-4 space-y-2">
        <li className="leading-relaxed"><strong className="font-semibold text-white">Infrastructure Providers:</strong> We share necessary data with trusted third-party service providers (such as Supabase) who assist in operating the App, subject to strict confidentiality agreements and solely for the purpose of delivering the Service to you</li>
        <li className="leading-relaxed"><strong className="font-semibold text-white">Legal Requirements:</strong> We may disclose your data if required to do so by law, court order, or valid legal process, or if we believe in good faith that such disclosure is necessary to comply with applicable law, protect the rights and property of PlannrAI, or protect the safety of our users or the public</li>
        <li className="leading-relaxed"><strong className="font-semibold text-white">Business Transfers:</strong> In the event of a merger, acquisition, reorganisation, or sale of all or substantially all of PlannrAI's assets, your data may be transferred to the acquiring entity, provided that the acquiring entity agrees to honour the commitments set out in this Privacy Policy. We will notify you of any such transfer where required by law</li>
        <li className="leading-relaxed"><strong className="font-semibold text-white">With Your Consent:</strong> We may share your data with other parties with your prior explicit consent</li>
      </ul>
      <h3 className="text-lg font-medium text-white mt-6 mb-3">7.3 Aggregated and Anonymised Data</h3>
      <p className="mb-4 leading-relaxed">
        We may share aggregated, anonymised, or de-identified data — which cannot reasonably be used to identify you — with third parties for research, analysis, industry reporting, or product development purposes.
      </p>

      <h2 className="text-xl sm:text-2xl font-semibold text-white mt-10 mb-4">8. Cookies and Tracking Technologies</h2>
      <h3 className="text-lg font-medium text-white mt-6 mb-3">8.1 Essential Cookies</h3>
      <p className="mb-4 leading-relaxed">
        PlannrAI uses essential cookies that are strictly necessary for the operation of the App. These cookies enable core functionality such as maintaining your login session and preserving your preferences during your use of the App. The App cannot function properly without these cookies.
      </p>
      <h3 className="text-lg font-medium text-white mt-6 mb-3">8.2 No Advertising Cookies</h3>
      <p className="mb-4 leading-relaxed">
        PlannrAI does not use advertising cookies, tracking pixels, or any third-party tracking technologies designed to monitor your behaviour across other websites or to serve you targeted advertisements. We do not share any cookie data with advertising networks.
      </p>
      <h3 className="text-lg font-medium text-white mt-6 mb-3">8.3 Cookie Management</h3>
      <p className="mb-4 leading-relaxed">
        Most web browsers allow you to control and manage cookies through your browser settings. Please note that disabling essential cookies may affect the functionality of the App. Disabling non-essential cookies (if any are ever introduced in the future) will be possible through an in-app cookie preference centre, and we will update this Policy accordingly.
      </p>

      <h2 className="text-xl sm:text-2xl font-semibold text-white mt-10 mb-4">9. Your Rights and Choices</h2>
      <p className="mb-4 leading-relaxed">Subject to applicable law, you have the following rights in relation to your personal data:</p>
      <ul className="list-disc pl-6 mb-4 space-y-2">
        <li className="leading-relaxed"><strong className="font-semibold text-white">Right of Access:</strong> You have the right to request a copy of the personal data we hold about you. We will provide this information in a commonly used electronic format within the timeframe required by applicable law.</li>
        <li className="leading-relaxed"><strong className="font-semibold text-white">Right to Rectification:</strong> You have the right to request that we correct any personal data we hold about you that is inaccurate, incomplete, or out of date.</li>
        <li className="leading-relaxed"><strong className="font-semibold text-white">Right to Erasure (Right to Be Forgotten):</strong> You have the right to request the deletion of your personal data. You may exercise this right at any time by deleting your account through the Settings page in the App, which will permanently delete all personal data associated with your account. You may also submit a formal erasure request to us via email.</li>
        <li className="leading-relaxed"><strong className="font-semibold text-white">Right to Data Portability:</strong> You have the right to export your personal data in a commonly used, machine-readable format. You may exercise this right directly within the App by using the "Export My Data" feature available in Settings, which will provide your data as a downloadable JSON file.</li>
        <li className="leading-relaxed"><strong className="font-semibold text-white">Right to Withdraw Consent:</strong> Where we process your data on the basis of consent, you have the right to withdraw that consent at any time. Withdrawal of consent does not affect the lawfulness of processing carried out prior to withdrawal.</li>
        <li className="leading-relaxed"><strong className="font-semibold text-white">Right to Object:</strong> Where we process your data on the basis of legitimate interests, you have the right to object to such processing. We will cease processing your data unless we can demonstrate compelling legitimate grounds for the processing that override your interests, rights, and freedoms, or for the establishment, exercise, or defence of legal claims.</li>
      </ul>
      <h3 className="text-lg font-medium text-white mt-6 mb-3">9.7 How to Exercise Your Rights</h3>
      <p className="mb-4 leading-relaxed">
        To exercise any of the rights described above, please contact us at: <a href="mailto:support@plannrai.in" className="text-[var(--color-primary)] hover:underline">support@plannrai.in</a>. We will respond to all legitimate requests within thirty (30) days. We may require you to verify your identity before processing your request.
      </p>

      <h2 className="text-xl sm:text-2xl font-semibold text-white mt-10 mb-4">10. Children's Privacy</h2>
      <p className="mb-4 leading-relaxed">
        PlannrAI is not directed at or intended for use by children under the age of thirteen (13). We do not knowingly collect personal data from children under 13. If you are a parent or guardian and believe that your child has provided personal data to us without your consent, please contact us immediately at the email address provided in this Policy. Upon confirmation, we will take prompt steps to delete the relevant data.
      </p>
      <p className="mb-4 leading-relaxed">
        If you are between 13 and 18 years of age, your use of the App must be with the knowledge and consent of a parent or guardian, who accepts these Terms and this Privacy Policy on your behalf.
      </p>

      <h2 className="text-xl sm:text-2xl font-semibold text-white mt-10 mb-4">11. International Data Transfers</h2>
      <p className="mb-4 leading-relaxed">
        PlannrAI is operated from India, and your data is primarily processed and stored within the infrastructure of our third-party service providers. These providers may process data in jurisdictions other than India. Where data is transferred internationally, we take reasonable steps to ensure that adequate protections are in place in accordance with applicable law.
      </p>

      <h2 className="text-xl sm:text-2xl font-semibold text-white mt-10 mb-4">12. Third-Party Links and Services</h2>
      <p className="mb-4 leading-relaxed">
        The App may contain links to third-party websites or services. This Privacy Policy applies solely to PlannrAI's own collection and use of data. We are not responsible for the privacy practices of any third-party websites or services, and we encourage you to review the privacy policies of any third parties before providing them with your personal information.
      </p>

      <h2 className="text-xl sm:text-2xl font-semibold text-white mt-10 mb-4">13. Changes to This Privacy Policy</h2>
      <p className="mb-4 leading-relaxed">
        We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or for other operational reasons. When we make material changes to this Policy, we will update the Effective Date at the top of this document and, where reasonably practicable, notify you via email or an in-app notification.
      </p>
      <p className="mb-4 leading-relaxed">
        Your continued use of the App following the posting of any changes to this Privacy Policy constitutes your acceptance of those changes. If you do not agree with any changes, you must discontinue your use of the App and may delete your account.
      </p>

      <h2 className="text-xl sm:text-2xl font-semibold text-white mt-10 mb-4">14. Contact and Complaints</h2>
      <p className="mb-4 leading-relaxed">
        If you have any questions, concerns, or complaints about this Privacy Policy or our data practices, please contact us at: <a href="mailto:support@plannrai.in" className="text-[var(--color-primary)] hover:underline">support@plannrai.in</a>
      </p>
      <p className="mb-4 leading-relaxed">
        If you believe your data protection rights have been violated and we have not adequately addressed your concern, you may have the right to lodge a complaint with the relevant data protection authority in your jurisdiction.
      </p>

      <div className="pt-12 mt-12 border-t border-[var(--glass-border)] text-center text-sm">
        <p>© 2026 PlannrAI. All rights reserved.</p>
        <p className="mt-2"><a href="https://plannrai.in" className="text-[var(--color-primary)] hover:underline">https://plannrai.in</a></p>
      </div>
    </div>
  );
}
