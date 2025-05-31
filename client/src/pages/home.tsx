import Hero from "@/components/landing/hero";
import Features from "@/components/landing/features";
import CaseStudies from "@/components/landing/case-studies";
import Certifications from "@/components/landing/certifications";
import HvacSolutions from "@/components/landing/hvac-solutions";
import Pricing from "@/components/landing/pricing";
import Contact from "@/components/landing/contact";
import { Link } from "wouter";

export default function Home() {
  return (
    <div className="flex flex-col gap-20">
      {/* Test links for phases */}
      <div className="fixed top-20 right-4 z-50 space-y-2">
        <div className="bg-yellow-400 p-3 rounded-md shadow-lg">
          <Link href="/test-canvas3d" className="text-black font-bold hover:underline">
            Test Fase 1: Modo Presentación
          </Link>
        </div>
        <div className="bg-blue-400 p-3 rounded-md shadow-lg">
          <Link href="/test-fase2" className="text-black font-bold hover:underline">
            Test Fase 2: RSP Wrapper
          </Link>
        </div>
        <div className="bg-green-400 p-3 rounded-md shadow-lg">
          <Link href="/test-fase3" className="text-black font-bold hover:underline">
            Test Fase 3: Materiales
          </Link>
        </div>
      </div>
      
      <Hero />
      <CaseStudies />
      <Certifications />
      <HvacSolutions />
      <Features />
      <Pricing />
      <Contact />
    </div>
  );
}