import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";

import hvacSystems from "@/assets/hvac-images/hvac-systems.png";
import hvacInstallation from "@/assets/hvac-images/hvac-installation.png";

const caseStudies = [
  {
    title: "Classroom Ventilation Design",
    description: "Optimizing air flow patterns for improved comfort and safety in educational spaces",
    image: "/assets/classroom-cfd.png"
  },
  {
    title: "Data Center Thermal Management",
    description: "Simulating hot/cold aisle airflow, rack heat dissipation and cooling efficiency to prevent hotspots and optimize energy consumption. Validating HVAC sizing and redundancy against reference thermal guidelines.",
    image: "/assets/data-center-thermal.png"
  },
  {
    title: "Smoke Propagation & Fire Safety",
    description: "Simulate fire scenarios to predict smoke propagation, toxic gas concentration, and visibility conditions.",
    image: "/assets/smoke-propagation.png"
  },
  {
    title: "System Flow Optimization",
    description: "Visualize air renewal patterns, temperature distribution, and airflow establishment to select the best HVAC equipment for each specific space.",
    image: hvacSystems
  },
  {
    title: "Installation Support",
    description: "Provide HVAC installers with data-driven insights for optimal equipment placement, ensuring superior performance and client satisfaction.",
    image: hvacInstallation
  },
  {
    title: "Passenger Terminal Climate Control",
    description: "Validating HVAC distribution, thermal comfort and CO₂-based ventilation rates in a high-occupancy transit hall with variable passenger loads, multiple heat sources, and complex airflow patterns.",
    image: "/assets/train-station-climate.png"
  }
];

export default function CaseStudies() {
  const [, setLocation] = useLocation();

  return (
    <section id="case-studies" className="py-20 bg-slate-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Case Studies</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Easily test your building designs for indoor thermal comfort, HVAC and fire safety
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {caseStudies.map((study, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
            >
              <Card className="overflow-hidden">
                <AspectRatio ratio={16/9}>
                  <img 
                    src={study.image} 
                    alt={study.title}
                    className="object-cover w-full h-full"
                  />
                </AspectRatio>
                <CardContent className="p-6">
                  <h3 className="text-xl font-semibold mb-2">{study.title}</h3>
                  <p className="text-muted-foreground">{study.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button size="lg" onClick={() => {
            setLocation("/dashboard");
            setTimeout(() => window.scrollTo(0, 0), 100);
          }}>
            Get Started
          </Button>
        </div>
      </div>
    </section>
  );
}