import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import LoginModal from "@/components/auth/login-modal";

const caseStudies = [
  {
    title: "Classroom Ventilation Design",
    description: "Optimizing air flow patterns for improved comfort and safety in educational spaces",
    image: "/assets/classroom-cfd.png"
  },
  {
    title: "Indoor Thermal Comfort",
    description: "Visualize flow and heat transfer, evaluate temperature gradients and air distribution to ensure optimal thermal comfort for occupants through proper environmental design",
    image: "/assets/thermal-comfort.png"
  },
  {
    title: "Air Quality and Contamination Control",
    description: "Develop intelligent ventilation strategies for efficient removal of CO2 and contaminants in spaces like offices, laboratories, and predict smoke propagation in underground facilities",
    image: "/assets/air-quality-cfd.png"
  }
];

export default function CaseStudies() {
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  return (
    <section id="case-studies" className="py-20 bg-slate-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Case Studies</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Easily test your building designs for indoor thermal comfort, HVAC & ventilation strategies, and indoor air quality
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
          <Button size="lg" onClick={() => setIsLoginOpen(true)}>
            Get Started
          </Button>
        </div>
      </div>

      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
      />
    </section>
  );
}