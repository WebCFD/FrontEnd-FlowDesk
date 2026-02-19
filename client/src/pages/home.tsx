import Hero from "@/components/landing/hero";
import CaseStudies from "@/components/landing/case-studies";
import About from "@/components/landing/about";
import Certifications from "@/components/landing/certifications";
import Pricing from "@/components/landing/pricing";
import Contact from "@/components/landing/contact";
import { Link } from "wouter";

export default function Home() {
  return (
    <div className="flex flex-col gap-20">

      
      <Hero />
      <CaseStudies />
      <About />
      <Certifications />
      <Pricing />
      <Contact />
    </div>
  );
}