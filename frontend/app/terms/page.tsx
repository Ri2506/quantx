'use client'

import Link from 'next/link'

export default function TermsOfServicePage() {
  return (
    <div className="light-page min-h-screen bg-white text-l-text">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="mb-8 inline-block text-sm text-l-text-secondary transition hover:text-l-text">&larr; Back to Home</Link>

        <h1 className="mb-2 text-3xl font-bold text-l-text">Terms of Service</h1>
        <p className="mb-10 text-sm text-l-text-muted">Last updated: March 2026</p>

        <div className="space-y-8 text-[15px] leading-relaxed text-l-text-secondary">
          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">1. Acceptance of Terms</h2>
            <p>By accessing or using Swing AI (&ldquo;the Platform&rdquo;), you agree to be bound by these Terms of Service. If you do not agree, you may not use the Platform.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">2. No Investment Advice</h2>
            <p className="font-medium text-yellow-400/90">Swing AI is a technology platform that provides algorithmic trading signals and tools. It does NOT provide investment advice, portfolio management, or brokerage services. All trading decisions are made solely by you. Past performance does not guarantee future results. Trading in equity and derivatives involves substantial risk of loss.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">3. Eligibility</h2>
            <p>You must be at least 18 years old and a resident of India to use the Platform. You are responsible for ensuring your use complies with all applicable laws including SEBI regulations.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">4. Account Responsibilities</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>You are responsible for maintaining the security of your account credentials</li>
              <li>You must not share your account with others</li>
              <li>You must provide accurate and up-to-date information</li>
              <li>You are solely responsible for all trades executed through your connected broker account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">5. Broker Integration</h2>
            <p>When you connect a broker account, you authorize Swing AI to place orders on your behalf based on trading signals you have approved. You may revoke this access at any time. Swing AI is not liable for broker downtime, order rejection, or execution slippage.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">6. Subscriptions &amp; Payments</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Paid plans are billed via Razorpay in Indian Rupees (INR)</li>
              <li>Subscriptions auto-renew unless cancelled before the renewal date</li>
              <li>Refunds are processed per our refund policy (within 7 days of purchase for unused subscriptions)</li>
              <li>GST is included in the displayed price</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">7. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, Swing AI and its creators shall not be liable for any indirect, incidental, special, or consequential damages, including trading losses, lost profits, or data loss, arising from your use of the Platform.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">8. Intellectual Property</h2>
            <p>All algorithms, models, UI designs, and content on the Platform are the property of Swing AI. You may not copy, reverse-engineer, or redistribute any part of the Platform without written permission.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">9. Termination</h2>
            <p>We reserve the right to suspend or terminate your account if you violate these terms, engage in abusive behaviour, or attempt to exploit the Platform. You may delete your account at any time from Settings.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">10. Governing Law</h2>
            <p>These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Bengaluru, Karnataka.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-l-text mb-3">11. Contact</h2>
            <p>For questions about these terms, email <span className="text-primary">legal@swingai.in</span>.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
