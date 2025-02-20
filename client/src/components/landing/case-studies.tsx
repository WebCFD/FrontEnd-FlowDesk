import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";

const caseStudies = [
  {
    title: "Formula 1 Car Design",
    description: "Optimizing downforce and reducing drag for competitive racing",
    image: "https://images.unsplash.com/photo-1528774701372-1d4b668aed17"
  },
  {
    title: "Electric Vehicle Efficiency",
    description: "Maximizing range through improved aerodynamics",
    image: "https://images.unsplash.com/photo-1676288176869-b2e1c6bea1a4"
  },
  {
    title: "Wind Turbine Analysis",
    description: "Increasing power output with optimized blade design",
    image: "https://images.unsplash.com/photo-1457301547464-91995555cd25"
  }
];

export default function CaseStudies() {
  return (
    <section id="case-studies" className="py-20 bg-slate-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Case Studies</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            See how leading companies use FlowDesk to optimize their designs
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
      </div>
    </section>
  );
}