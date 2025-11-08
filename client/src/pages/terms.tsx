import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href="/">
          <Button variant="ghost" className="mb-6" data-testid="button-back-home">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <div className="prose prose-slate max-w-none">
          <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
          <p className="text-muted-foreground mb-8">
            Last updated: November 8, 2025
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Agreement to Terms</h2>
            <p className="mb-4">
              These Terms of Service ("Terms") constitute a legally binding agreement between you and FlowDesk ("we," "our," or "us") regarding your access to and use of our cloud-based CFD simulation platform and related services (collectively, the "Service").
            </p>
            <p className="mb-4">
              By accessing or using the Service, you agree to be bound by these Terms. If you disagree with any part of these Terms, you may not access the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
            <p className="mb-4">
              FlowDesk provides a web-based platform for creating, configuring, and running Computational Fluid Dynamics (CFD) simulations for HVAC thermal comfort analysis. Our Service includes:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>3D design tools for creating multi-floor building layouts</li>
              <li>Object placement and furniture library management</li>
              <li>Air flow system configuration and boundary condition setup</li>
              <li>Cloud-based CFD simulation processing using OpenFOAM</li>
              <li>Results visualization and data export capabilities</li>
              <li>Simulation management and project organization tools</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
            
            <h3 className="text-xl font-semibold mb-3 mt-6">3.1 Account Creation</h3>
            <p className="mb-4">
              To use certain features of the Service, you must register for an account. You agree to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Provide accurate, current, and complete information during registration</li>
              <li>Maintain and promptly update your account information</li>
              <li>Maintain the security of your password and account credentials</li>
              <li>Accept responsibility for all activities that occur under your account</li>
              <li>Notify us immediately of any unauthorized access or security breach</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">3.2 Account Eligibility</h3>
            <p className="mb-4">
              You must be at least 18 years old to create an account and use the Service. By creating an account, you represent and warrant that you meet this age requirement.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">3.3 Account Termination</h3>
            <p className="mb-4">
              You may terminate your account at any time through your account settings. We reserve the right to suspend or terminate your account if you violate these Terms or engage in fraudulent, abusive, or illegal activity.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Acceptable Use</h2>
            <p className="mb-4">You agree NOT to use the Service to:</p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Violate any applicable laws, regulations, or third-party rights</li>
              <li>Upload malicious code, viruses, or harmful software</li>
              <li>Attempt to gain unauthorized access to our systems or other user accounts</li>
              <li>Interfere with or disrupt the Service or servers</li>
              <li>Engage in any activity that could damage, disable, or impair the Service</li>
              <li>Use automated systems (bots, scrapers) without our written permission</li>
              <li>Resell, sublicense, or redistribute the Service without authorization</li>
              <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
              <li>Remove, obscure, or alter any proprietary notices on the Service</li>
              <li>Use the Service for any illegal or unauthorized purpose</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Pricing and Payment</h2>
            
            <h3 className="text-xl font-semibold mb-3 mt-6">5.1 Pricing Plans</h3>
            <p className="mb-4">
              FlowDesk offers multiple pricing options:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>Pay as You Go:</strong> €9.99 per simulation</li>
              <li><strong>Annual Subscription:</strong> €39.99 per month with 10 free simulations included</li>
              <li><strong>Custom Solutions:</strong> Tailored pricing for enterprise and high-volume users</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">5.2 Payment Terms</h3>
            <p className="mb-4">
              You agree to pay all fees associated with your chosen plan. Payments are processed through secure third-party payment processors. By providing payment information, you authorize us to charge the applicable fees to your payment method.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">5.3 Subscriptions and Renewals</h3>
            <p className="mb-4">
              Subscription plans automatically renew at the end of each billing period unless canceled before the renewal date. You will be charged the then-current subscription fee. We will provide reasonable notice of any fee changes.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">5.4 Refunds</h3>
            <p className="mb-4">
              Subscription fees are generally non-refundable. However, we may provide refunds on a case-by-case basis for:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Service outages or technical issues that prevented you from using the Service</li>
              <li>Billing errors or duplicate charges</li>
              <li>Cancellations within 14 days of initial subscription purchase (EU customers)</li>
            </ul>
            <p className="mb-4">
              Individual simulation charges (Pay as You Go) are non-refundable once processing has begun.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">5.5 Price Changes</h3>
            <p className="mb-4">
              We reserve the right to modify our pricing at any time. Price changes will not affect your current subscription period but will apply to subsequent renewal periods. We will provide at least 30 days' notice of price increases.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Intellectual Property Rights</h2>
            
            <h3 className="text-xl font-semibold mb-3 mt-6">6.1 Our Intellectual Property</h3>
            <p className="mb-4">
              The Service, including all software, text, graphics, user interfaces, visual interfaces, photographs, trademarks, logos, and the underlying technology, is owned by FlowDesk and is protected by copyright, trademark, and other intellectual property laws.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">6.2 Your Content</h3>
            <p className="mb-4">
              You retain ownership of all simulation designs, geometry files, configuration data, and results ("Your Content") that you create or upload to the Service. By using the Service, you grant us a limited, non-exclusive license to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Process your simulation data using our cloud infrastructure</li>
              <li>Store and display your content within the Service</li>
              <li>Make temporary copies necessary to provide the Service</li>
            </ul>
            <p className="mb-4">
              We will not use Your Content for any purpose other than providing and improving the Service, unless you give us explicit permission.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">6.3 Feedback and Suggestions</h3>
            <p className="mb-4">
              If you provide us with feedback, suggestions, or ideas about the Service, you grant us the right to use such feedback without any obligation to you.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Simulation Data and Results</h2>
            
            <h3 className="text-xl font-semibold mb-3 mt-6">7.1 Data Processing</h3>
            <p className="mb-4">
              Simulations are processed using third-party cloud computing resources (Inductiva API). Your simulation data is transmitted securely and processed according to industry standards. Results are returned to our platform and made available to you.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">7.2 Accuracy and Reliability</h3>
            <p className="mb-4">
              While we strive to provide accurate CFD simulations, results depend on the quality and accuracy of your input data, boundary conditions, and model configuration. Simulation results should be:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Used for informational and planning purposes only</li>
              <li>Verified by qualified professionals before making critical decisions</li>
              <li>Not considered as a substitute for professional engineering judgment</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">7.3 Data Export</h3>
            <p className="mb-4">
              You can export your simulation data and results in various formats (JSON, VTK, etc.). Exported data remains your property and is subject to the same terms as Your Content.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Service Availability and Support</h2>
            
            <h3 className="text-xl font-semibold mb-3 mt-6">8.1 Service Uptime</h3>
            <p className="mb-4">
              We strive to maintain high availability of the Service but do not guarantee uninterrupted access. The Service may be unavailable due to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Scheduled maintenance (with advance notice when possible)</li>
              <li>Emergency maintenance or security updates</li>
              <li>Third-party service provider outages</li>
              <li>Events beyond our reasonable control (force majeure)</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">8.2 Technical Support</h3>
            <p className="mb-4">
              We provide technical support via email at <a href="mailto:info@flowdesk.es" className="text-primary hover:underline">info@flowdesk.es</a>. Support response times vary based on your subscription level and the complexity of the issue.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">8.3 Updates and Modifications</h3>
            <p className="mb-4">
              We may update, modify, or discontinue features of the Service at any time. We will provide reasonable notice of significant changes that materially affect functionality.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. Limitation of Liability</h2>
            <p className="mb-4 font-semibold uppercase">
              IMPORTANT: PLEASE READ THIS SECTION CAREFULLY AS IT LIMITS OUR LIABILITY TO YOU.
            </p>
            <p className="mb-4">
              To the maximum extent permitted by applicable law:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>
                <strong>No Warranties:</strong> The Service is provided "as is" and "as available" without warranties of any kind, whether express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement.
              </li>
              <li>
                <strong>Limitation of Damages:</strong> FlowDesk shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, use, or goodwill, arising from your use of or inability to use the Service.
              </li>
              <li>
                <strong>Maximum Liability:</strong> Our total liability to you for all claims related to the Service shall not exceed the amount you paid to FlowDesk in the 12 months preceding the claim, or €100, whichever is greater.
              </li>
              <li>
                <strong>Professional Use:</strong> Simulation results should not be used for critical engineering decisions without independent verification by qualified professionals. We are not liable for decisions made based on simulation results.
              </li>
            </ul>
            <p className="mb-4">
              Some jurisdictions do not allow the exclusion of certain warranties or limitation of liability, so some of the above limitations may not apply to you.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. Indemnification</h2>
            <p className="mb-4">
              You agree to indemnify, defend, and hold harmless FlowDesk, its officers, directors, employees, and agents from any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising from:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Your use or misuse of the Service</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any rights of another party</li>
              <li>Your Content or any data you submit to the Service</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">11. Privacy and Data Protection</h2>
            <p className="mb-4">
              Your use of the Service is subject to our Privacy Policy, which describes how we collect, use, and protect your personal information. By using the Service, you consent to our collection and use of information as described in the Privacy Policy.
            </p>
            <p className="mb-4">
              View our complete <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">12. Dispute Resolution</h2>
            
            <h3 className="text-xl font-semibold mb-3 mt-6">12.1 Governing Law</h3>
            <p className="mb-4">
              These Terms shall be governed by and construed in accordance with the laws of Spain, without regard to its conflict of law provisions.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">12.2 Jurisdiction</h3>
            <p className="mb-4">
              Any disputes arising from these Terms or your use of the Service shall be subject to the exclusive jurisdiction of the courts of Spain.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">12.3 Informal Resolution</h3>
            <p className="mb-4">
              Before filing a formal claim, we encourage you to contact us at <a href="mailto:info@flowdesk.es" className="text-primary hover:underline">info@flowdesk.es</a> to seek an informal resolution.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">13. Changes to Terms</h2>
            <p className="mb-4">
              We reserve the right to modify these Terms at any time. We will notify users of material changes by:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Posting updated Terms on our website with a new "Last updated" date</li>
              <li>Sending email notifications to registered users</li>
              <li>Displaying a prominent notice within the Service</li>
            </ul>
            <p className="mb-4">
              Your continued use of the Service after the effective date of changes constitutes acceptance of the modified Terms. If you do not agree to the changes, you must discontinue use of the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">14. Termination</h2>
            <p className="mb-4">
              We may terminate or suspend your access to the Service immediately, without prior notice, for any reason, including:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Violation of these Terms</li>
              <li>Fraudulent, abusive, or illegal activity</li>
              <li>Non-payment of fees</li>
              <li>At our discretion, for any other reason</li>
            </ul>
            <p className="mb-4">
              Upon termination, your right to use the Service will immediately cease. We will make reasonable efforts to provide access to export your data before termination, but we are not obligated to retain your data after account termination.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">15. General Provisions</h2>
            
            <h3 className="text-xl font-semibold mb-3 mt-6">15.1 Entire Agreement</h3>
            <p className="mb-4">
              These Terms, together with our Privacy Policy, constitute the entire agreement between you and FlowDesk regarding the Service.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">15.2 Severability</h3>
            <p className="mb-4">
              If any provision of these Terms is found to be unenforceable or invalid, that provision will be limited or eliminated to the minimum extent necessary, and the remaining provisions will remain in full force and effect.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">15.3 Waiver</h3>
            <p className="mb-4">
              Our failure to enforce any right or provision of these Terms will not be considered a waiver of those rights.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">15.4 Assignment</h3>
            <p className="mb-4">
              You may not assign or transfer these Terms or your account without our prior written consent. We may assign these Terms without restriction.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">15.5 Force Majeure</h3>
            <p className="mb-4">
              We shall not be liable for any failure or delay in performance due to circumstances beyond our reasonable control, including acts of God, war, terrorism, pandemics, or failures of third-party services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">16. Contact Information</h2>
            <p className="mb-4">
              If you have questions about these Terms, please contact us:
            </p>
            <div className="bg-slate-50 p-6 rounded-lg mb-4">
              <p className="mb-2"><strong>FlowDesk</strong></p>
              <p className="mb-2">Email: <a href="mailto:info@flowdesk.es" className="text-primary hover:underline">info@flowdesk.es</a></p>
              <p className="mb-2">Website: <a href="https://flowdesk.es" className="text-primary hover:underline">https://flowdesk.es</a></p>
            </div>
          </section>

          <div className="mt-12 p-6 bg-slate-50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              By using FlowDesk, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
