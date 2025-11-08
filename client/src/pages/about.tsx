import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Linkedin, Wind, Zap, Users, Globe } from "lucide-react";

export default function About() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Link href="/">
          <Button variant="ghost" className="mb-6" data-testid="button-back-home">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <div className="prose prose-slate max-w-none">
          <h1 className="text-4xl font-bold mb-4">About FlowDesk</h1>
          <p className="text-xl text-muted-foreground mb-12">
            Making aerodynamics and thermal comfort accessible to everyone through cloud-based CFD simulations
          </p>

          <section className="mb-12">
            <h2 className="text-3xl font-semibold mb-6">Our Mission</h2>
            <p className="text-lg leading-relaxed mb-4">
              At FlowDesk, we believe that advanced computational fluid dynamics (CFD) simulations shouldn't be reserved for large corporations with expensive infrastructure. Our mission is to democratize access to professional-grade HVAC thermal comfort analysis, making it accessible to engineers, architects, consultants, and students worldwide.
            </p>
            <p className="text-lg leading-relaxed">
              By combining cutting-edge cloud computing with an intuitive web interface, we're breaking down the barriers that have traditionally made CFD simulation complex, expensive, and time-consuming.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-semibold mb-6">What We Do</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-slate-50 p-6 rounded-lg">
                <Wind className="h-10 w-10 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-3">CFD Made Simple</h3>
                <p>
                  We've simplified the complex process of setting up and running OpenFOAM CFD simulations. Design your space in 3D, configure air flow parameters, and let our cloud platform handle the heavy computational work.
                </p>
              </div>

              <div className="bg-slate-50 p-6 rounded-lg">
                <Zap className="h-10 w-10 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-3">Cloud-Powered Speed</h3>
                <p>
                  Leveraging Inductiva's cloud infrastructure, we process simulations faster than traditional desktop setups. No expensive hardware required—just upload your design and get results in minutes.
                </p>
              </div>

              <div className="bg-slate-50 p-6 rounded-lg">
                <Users className="h-10 w-10 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-3">Built for Professionals</h3>
                <p>
                  Whether you're an HVAC engineer optimizing building comfort, an architect verifying design decisions, or a student learning CFD fundamentals, FlowDesk provides the tools you need.
                </p>
              </div>

              <div className="bg-slate-50 p-6 rounded-lg">
                <Globe className="h-10 w-10 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-3">Accessible Anywhere</h3>
                <p>
                  Work from anywhere with an internet connection. Our web-based platform eliminates software installation, licensing headaches, and hardware limitations.
                </p>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-semibold mb-6">Our Story</h2>
            <p className="text-lg leading-relaxed mb-4">
              FlowDesk was born from a simple observation: while CFD technology has advanced tremendously, accessing it remains unnecessarily complicated. Traditional CFD workflows require extensive training, expensive software licenses, and powerful hardware infrastructure.
            </p>
            <p className="text-lg leading-relaxed mb-4">
              We saw an opportunity to change this. By combining modern web technologies with cloud-based high-performance computing, we've created a platform that makes professional CFD analysis accessible to a broader audience without compromising on accuracy or capabilities.
            </p>
            <p className="text-lg leading-relaxed">
              Today, FlowDesk serves engineers, architects, consultants, and researchers who need reliable thermal comfort simulations without the traditional barriers to entry.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-semibold mb-6">Our Technology</h2>
            <p className="text-lg leading-relaxed mb-4">
              FlowDesk is built on a foundation of proven, open-source CFD technology:
            </p>
            <ul className="list-disc pl-6 mb-6 space-y-3 text-lg">
              <li>
                <strong>OpenFOAM:</strong> Industry-standard open-source CFD solver trusted by researchers and engineers worldwide
              </li>
              <li>
                <strong>snappyHexMesh:</strong> Advanced meshing technology optimized for complex geometries
              </li>
              <li>
                <strong>buoyantSimpleFoam:</strong> Specialized solver for thermal comfort and HVAC applications
              </li>
              <li>
                <strong>Cloud Computing:</strong> Scalable infrastructure via Inductiva API for fast, reliable simulations
              </li>
              <li>
                <strong>3D Visualization:</strong> Real-time preview and results analysis powered by Three.js
              </li>
            </ul>
            <p className="text-lg leading-relaxed">
              This combination ensures you get professional-grade results backed by validated, peer-reviewed computational methods.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-semibold mb-6">Our Commitment</h2>
            <div className="bg-primary/5 border-l-4 border-primary p-6 rounded-r-lg mb-6">
              <p className="text-lg leading-relaxed mb-4">
                <strong>Quality First:</strong> We're committed to providing accurate, reliable simulations that meet professional engineering standards.
              </p>
              <p className="text-lg leading-relaxed mb-4">
                <strong>Continuous Innovation:</strong> We constantly improve our platform based on user feedback and the latest advances in CFD technology.
              </p>
              <p className="text-lg leading-relaxed mb-4">
                <strong>Transparent Pricing:</strong> No hidden fees, no surprise charges. Pay per simulation or choose a subscription that fits your needs.
              </p>
              <p className="text-lg leading-relaxed">
                <strong>Customer Support:</strong> Our team is here to help you succeed, whether you're running your first simulation or your thousandth.
              </p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-semibold mb-6">Join Our Journey</h2>
            <p className="text-lg leading-relaxed mb-6">
              We're on a mission to make CFD simulation as accessible as word processing. Whether you're optimizing a single room or analyzing an entire building complex, FlowDesk is here to help you make better decisions backed by computational science.
            </p>
            <div className="bg-slate-50 p-8 rounded-lg text-center">
              <p className="text-lg mb-6">
                Want to learn more about our team and company updates?
              </p>
              <a 
                href="https://www.linkedin.com/company/webcfd/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-[#0A66C2] hover:bg-[#004182] text-white font-semibold px-6 py-3 rounded-lg transition-colors"
                data-testid="link-linkedin"
              >
                <Linkedin className="h-5 w-5" />
                Follow us on LinkedIn
              </a>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-semibold mb-6">Get Started Today</h2>
            <p className="text-lg leading-relaxed mb-6">
              Ready to experience the future of CFD simulation? Create your free account and run your first thermal comfort analysis today.
            </p>
            <div className="flex gap-4">
              <Link href="/#contact">
                <Button size="lg" data-testid="button-contact-sales">
                  Contact Sales
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="outline" size="lg" data-testid="button-try-platform">
                  Try the Platform
                </Button>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
