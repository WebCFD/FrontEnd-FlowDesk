import { Link, useLocation } from "wouter";
import { Separator } from "@/components/ui/separator";

export default function Footer() {
  const [location, setLocation] = useLocation();

  const scrollToSection = (sectionId: string) => {
    if (location !== '/') {
      // Si no estamos en la landing page, navegar primero
      setLocation('/');
      // Esperar a que se cargue la página y luego hacer scroll
      setTimeout(() => {
        const element = document.getElementById(sectionId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } else {
      // Si ya estamos en la landing page, hacer scroll directo
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <footer className="bg-slate-50">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="font-bold text-lg mb-4">FlowDesk</h3>
            <p className="text-sm text-muted-foreground">
              We don't reinvent CFD. We reinvent how you experience it
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Product</h4>
            <ul className="space-y-2">
              <li>
                <button 
                  onClick={() => scrollToSection('pricing')}
                  className="hover:underline cursor-pointer"
                  data-testid="link-pricing"
                >
                  Pricing
                </button>
              </li>
              <li>
                <button 
                  onClick={() => scrollToSection('case-studies')}
                  className="hover:underline cursor-pointer"
                  data-testid="link-case-studies"
                >
                  Case Studies
                </button>
              </li>
              <li>
                <button 
                  onClick={() => scrollToSection('certifications')}
                  className="hover:underline cursor-pointer"
                  data-testid="link-certifications"
                >
                  Certifications
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Company</h4>
            <ul className="space-y-2">
              <li>
                <button 
                  onClick={() => scrollToSection('about')}
                  className="hover:underline cursor-pointer"
                  data-testid="link-about"
                >
                  About
                </button>
              </li>
              <li className="text-muted-foreground cursor-not-allowed">Careers</li>
              <li>
                <button 
                  onClick={() => scrollToSection('contact')}
                  className="hover:underline cursor-pointer"
                  data-testid="link-contact"
                >
                  Contact
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-2">
              <li><Link href="/privacy" className="hover:underline cursor-pointer">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:underline cursor-pointer">Terms of Service</Link></li>
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} FlowDesk. All rights reserved.
          </div>
          <img
            src="/enisa-badge.png"
            alt="Certificada como Empresa Emergente - ENISA, Ministerio de Industria y Turismo"
            className="h-10 opacity-70 hover:opacity-100 transition-opacity"
          />
        </div>
      </div>
    </footer>
  );
}