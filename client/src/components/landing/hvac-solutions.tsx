import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";

// Importar las imágenes
import hvacDesign from "@/assets/hvac-images/hvac-design.png";
import hvacSystems from "@/assets/hvac-images/hvac-systems.png";
import hvacInstallation from "@/assets/hvac-images/hvac-installation.png";

const hvacSolutions = [
  {
    title: "Digital Design Planning",
    description: "Optimize HVAC system placement and sizing through precise CFD simulations before installation, ensuring maximum efficiency and cost-effectiveness.",
    image: hvacDesign
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
  }
];

export default function HvacSolutions() {
  return (
    <section id="hvac-solutions" className="py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">HVAC Solutions</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Empowering HVAC installers and equipment vendors with CFD simulations for optimal equipment selection and installation strategies
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {hvacSolutions.map((solution, index) => (
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
                    src={solution.image} 
                    alt={solution.title}
                    className="object-cover w-full h-full"
                  />
                </AspectRatio>
                <CardContent className="p-6">
                  <h3 className="text-xl font-semibold mb-2">{solution.title}</h3>
                  <p className="text-muted-foreground">{solution.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}