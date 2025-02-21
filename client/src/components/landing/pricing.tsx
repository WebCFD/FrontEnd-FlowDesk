import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Pay as you go",
    price: "25",
    description: "Perfect for occasional users and small projects",
    priceDetail: "per simulation",
    features: [
      "Single geometry simulation",
      "Basic flow analysis",
      "Standard mesh refinement",
      "Email support",
      "Pay per use"
    ]
  },
  {
    name: "Discovery",
    price: "199",
    description: "Ideal for teams and regular simulations",
    priceDetail: "per month",
    features: [
      "10 simulations included",
      "Advanced flow analysis",
      "Priority support",
      "Results comparison",
      "Custom mesh settings",
      "Team collaboration"
    ]
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "For organizations with specific requirements",
    features: [
      "Unlimited simulations",
      "Custom workflow integration",
      "Dedicated support team",
      "Training sessions",
      "Custom features",
      "SLA guarantee"
    ]
  }
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Choose the plan that best fits your needs. No hidden fees.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
            >
              <Card className="flex flex-col h-full">
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">
                      ${plan.price}
                    </span>
                    {plan.priceDetail && <span className="text-muted-foreground ml-1">{plan.priceDetail}</span>}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-6">{plan.description}</p>
                  <ul className="space-y-4">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="h-5 w-5 text-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="mt-auto">
                  <Button className="w-full">
                    {plan.price === "Custom" ? "Contact Sales" : "Get Started"}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}