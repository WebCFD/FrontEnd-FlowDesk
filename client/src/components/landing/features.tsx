import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Wind, LineChart, Clock, Cloud } from "lucide-react";

const features = [
  {
    icon: <Wind className="h-8 w-8" />,
    title: "Accurate Simulations",
    description: "State-of-the-art CFD technology providing reliable aerodynamic analysis"
  },
  {
    icon: <LineChart className="h-8 w-8" />,
    title: "Detailed Analytics",
    description: "Comprehensive reports with visualization and performance metrics"
  },
  {
    icon: <Clock className="h-8 w-8" />,
    title: "Fast Results",
    description: "Get simulation results within hours instead of days"
  },
  {
    icon: <Cloud className="h-8 w-8" />,
    title: "Cloud-Based",
    description: "No hardware requirements - run simulations from anywhere"
  }
];

export default function Features() {
  return (
    <section id="features" className="py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">
            Powerful Features
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need to optimize your designs through advanced aerodynamics simulation
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
            >
              <Card>
                <CardContent className="pt-6">
                  <div className="mb-4 text-primary">{feature.icon}</div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
