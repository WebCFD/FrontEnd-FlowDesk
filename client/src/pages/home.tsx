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