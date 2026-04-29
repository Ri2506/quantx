'use client'

import Link from 'next/link'

export default function PrivacyPolicyPage() {
  return (
    <div className="light-page min-h-screen bg-white text-l-text">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="mb-8 inline-block text-sm text-l-text-secondary transition hover:text-l-text">&larr; Back to Home</Link>

        <h1 className="mb-2 text-3xl font-bold text-l-text">Privacy Policy</h1>
        <p className="mb-10 text-sm text-l-text-muted">Last updated: March 2026</p>

        <div className="space-y-8 text-[15px] leading-relaxed text-l-text-secondary">
          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">1. Information We Collect</h2>
            <p>When you create an account we collect your name, email address, and phone number. If you connect a broker account we store encrypted credentials solely to execute trades on your behalf. We also collect usage data such as pages visited, features used, and device information.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">2. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide, operate, and maintain the Swing AI platform</li>
              <li>Process payments and manage subscriptions via Razorpay</li>
              <li>Send trading signals, alerts, and service notifications</li>
              <li>Improve our algorithms and user experience</li>
              <li>Comply with legal and regulatory obligations (SEBI, IT Act)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">3. Data Security</h2>
            <p>Broker credentials are encrypted with AES-256 (Fernet). All communication occurs over HTTPS. We use Supabase Row Level Security to isolate user data. Access tokens are never stored in plain text.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">4. Third-Party Services</h2>
            <p>We integrate with Supabase (authentication &amp; database), Razorpay (payments), broker APIs (Zerodha, Angel One, Upstox), and Google Gemini (AI assistant). Each provider has its own privacy policy. We share only the minimum data required for each integration.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">5. Data Retention</h2>
            <p>Account data is retained as long as your account is active. Trade history and signals are kept for analytical purposes. You may request deletion of your account and associated data at any time by contacting support.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">6. Your Rights</h2>
            <p>You may access, correct, or delete your personal data through the Settings page. You can disconnect your broker account at any time, which immediately revokes our access. For any privacy concerns email <span className="text-primary">privacy@swingai.in</span>.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">7. Cookies</h2>
            <p>We use essential cookies for authentication (Supabase session tokens). We do not use third-party advertising cookies. Analytics cookies are optional and respect your browser&apos;s Do Not Track setting.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">8. Changes to This Policy</h2>
            <p>We may update this policy from time to time. Material changes will be communicated via email or in-app notification at least 7 days before taking effect.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
