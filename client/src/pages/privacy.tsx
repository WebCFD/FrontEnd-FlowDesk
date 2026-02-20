import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function Privacy() {
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
          <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">
            Last updated: November 8, 2025
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
            <p className="mb-4">
              FlowDesk ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our cloud-based CFD simulation platform (the "Service").
            </p>
            <p>
              By accessing or using FlowDesk, you agree to the terms of this Privacy Policy. If you do not agree with our policies and practices, please do not use our Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
            
            <h3 className="text-xl font-semibold mb-3 mt-6">2.1 Personal Information</h3>
            <p className="mb-4">We collect information that you provide directly to us, including:</p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Name and email address (for account creation and communication)</li>
              <li>Contact information (when you reach out to our support team)</li>
              <li>Payment information (processed securely through third-party payment processors)</li>
              <li>Company name and industry information (optional, for better service customization)</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">2.2 Simulation Data</h3>
            <p className="mb-4">When using our Service, we collect and process:</p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>3D design files and geometry data uploaded to create simulations</li>
              <li>Simulation parameters and configuration settings</li>
              <li>Simulation results and output data</li>
              <li>Custom furniture models and STL files you upload</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">2.3 Technical Information</h3>
            <p className="mb-4">We automatically collect certain information about your device and usage:</p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>IP address, browser type, and operating system</li>
              <li>Pages visited, time spent on pages, and navigation paths</li>
              <li>Device identifiers and connection information</li>
              <li>Log data including error reports and performance metrics</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
            <p className="mb-4">We use the collected information for the following purposes:</p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>Service Delivery:</strong> To provide, maintain, and improve our CFD simulation platform</li>
              <li><strong>Computation:</strong> To process your simulation requests using cloud computing resources</li>
              <li><strong>Communication:</strong> To send you service updates, technical notices, and support responses</li>
              <li><strong>Billing:</strong> To process payments and manage subscriptions</li>
              <li><strong>Security:</strong> To detect, prevent, and address technical issues and fraudulent activity</li>
              <li><strong>Compliance:</strong> To comply with legal obligations and enforce our Terms of Service</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Third-Party Services</h2>
            <p className="mb-4">We use trusted third-party services to operate our platform:</p>
            
            <h3 className="text-xl font-semibold mb-3 mt-6">4.1 Cloud Computing Provider</h3>
            <p className="mb-4">
              We use Inductiva API for processing CFD simulations. Your simulation data is securely transmitted to their cloud infrastructure for computation and returned to our servers. Inductiva operates under strict security protocols and does not retain your simulation data after processing.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">4.2 Payment Processors</h3>
            <p className="mb-4">
              Payment information is processed through secure third-party payment processors. We do not store complete credit card information on our servers.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6">4.3 Email Service</h3>
            <p className="mb-4">
              We use Resend for transactional emails. Your email address is shared with this service solely for the purpose of delivering important notifications about your account and simulations.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Data Security</h2>
            <p className="mb-4">
              We implement industry-standard security measures to protect your information:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>SSL/TLS encryption for data transmission</li>
              <li>Encrypted storage for sensitive data</li>
              <li>Regular security audits and vulnerability assessments</li>
              <li>Access controls and authentication mechanisms</li>
              <li>Secure backup and disaster recovery procedures</li>
            </ul>
            <p className="mb-4">
              However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to protect your personal information, we cannot guarantee absolute security.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Data Retention</h2>
            <p className="mb-4">
              We retain your information for as long as necessary to provide our Service and fulfill the purposes outlined in this Privacy Policy:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>Account Data:</strong> Retained while your account is active and for up to 90 days after account deletion</li>
              <li><strong>Simulation Data:</strong> Stored according to your subscription plan; you can delete simulations at any time</li>
              <li><strong>Payment Records:</strong> Retained for 7 years for accounting and legal compliance purposes</li>
              <li><strong>Log Data:</strong> Typically retained for 90 days for troubleshooting and security purposes</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Your Rights and Choices</h2>
            <p className="mb-4">
              Depending on your location, you may have the following rights:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information (subject to legal retention requirements)</li>
              <li><strong>Portability:</strong> Request your data in a machine-readable format</li>
              <li><strong>Objection:</strong> Object to processing of your personal information for certain purposes</li>
              <li><strong>Restriction:</strong> Request limitation on how we use your information</li>
            </ul>
            <p className="mb-4">
              To exercise these rights, please contact us at <a href="mailto:info@flowdesk.es" className="text-primary hover:underline">info@flowdesk.es</a>. We will respond to your request within 30 days.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Cookies and Tracking Technologies</h2>
            <p className="mb-4">
              We use cookies and similar tracking technologies to enhance your experience:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>Essential Cookies:</strong> Required for authentication and core functionality</li>
              <li><strong>Preference Cookies:</strong> Remember your settings and preferences</li>
            </ul>
            <p className="mb-4">
              You can control cookies through your browser settings. Note that disabling certain cookies may affect the functionality of our Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. International Data Transfers</h2>
            <p className="mb-4">
              Your information may be transferred to and processed in countries other than your country of residence. We ensure that such transfers comply with applicable data protection laws and implement appropriate safeguards, including standard contractual clauses approved by the European Commission.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. Children's Privacy</h2>
            <p className="mb-4">
              Our Service is not intended for children under the age of 16. We do not knowingly collect personal information from children under 16. If you believe we have inadvertently collected such information, please contact us immediately.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">11. Changes to This Privacy Policy</h2>
            <p className="mb-4">
              We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. We will notify you of significant changes by:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Posting the updated policy on our website with a new "Last updated" date</li>
              <li>Sending an email notification to registered users</li>
              <li>Displaying a prominent notice on our platform</li>
            </ul>
            <p className="mb-4">
              Your continued use of the Service after such modifications constitutes acceptance of the updated Privacy Policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">12. Contact Information</h2>
            <p className="mb-4">
              If you have questions, concerns, or requests regarding this Privacy Policy or our privacy practices, please contact us:
            </p>
            <div className="bg-slate-50 p-6 rounded-lg mb-4">
              <p className="mb-2"><strong>FlowDesk</strong></p>
              <p className="mb-2">Email: <a href="mailto:info@flowdesk.es" className="text-primary hover:underline">info@flowdesk.es</a></p>
              <p className="mb-2">Website: <a href="https://flowdesk.es" className="text-primary hover:underline">https://flowdesk.es</a></p>
            </div>
            <p className="mb-4">
              For data protection inquiries specific to the European Union, you may also contact your local data protection authority.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">13. GDPR Compliance</h2>
            <p className="mb-4">
              For users in the European Economic Area (EEA), we process your personal data in accordance with the General Data Protection Regulation (GDPR). Our legal bases for processing include:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>Contract Performance:</strong> Processing necessary to provide the Service you requested</li>
              <li><strong>Legitimate Interests:</strong> For service improvement, security, and business operations</li>
              <li><strong>Legal Compliance:</strong> To comply with applicable laws and regulations</li>
              <li><strong>Consent:</strong> Where you have explicitly consented to specific processing activities</li>
            </ul>
          </section>

          <div className="mt-12 p-6 bg-slate-50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              This Privacy Policy is effective as of November 8, 2025, and governs the collection, use, and disclosure of your information in connection with your use of FlowDesk.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
