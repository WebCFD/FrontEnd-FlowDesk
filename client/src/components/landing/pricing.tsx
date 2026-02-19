import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";
import { useLocation } from "wouter";

const plans = [
  {
    name: "Pay as You Go",
    price: "9.99",
    description: "Perfect for occasional users and quick projects",
    priceDetail: "€ per simulation",
    subtitle: "No commitments, pay only when you need",
    features: [
      "Professional analysis tools",
      "Online interactive results viewer",
      "Store up to 5 simulation cases",
      "Professional PDF reporting",
      "Share and download simulations"
    ],
    idealFor: "Consultants, students, and one-time projects"
  },
  {
    name: "Annual Subscription",
    price: "39.99",
    description: "Unlock unlimited potential with our most popular plan",
    priceDetail: "€/month (billed annually at €479.88)",
    subtitle: "Save up to €480/year vs Pay as You Go",
    badge: "Most Popular",
    features: [
      "10 FREE simulations every month included",
      "Additional simulations at only €5.99 each",
      "40% savings vs Pay as You Go",
      "Store your last 20 simulation results",
      "Flexible cancellation with proportional refund",
      "Priority email support"
    ],
    idealFor: "Engineering firms, design teams, and regular users"
  },
  {
    name: "Tailored & Custom Solutions",
    price: "Custom",
    description: "Your infrastructure, your rules. Enterprise-grade CFD adapted to your workflow.",
    subtitle: "Contact us for a personalized quote",
    features: [
      "On-premise deployment on your own servers",
      "Direct IFC/BIM integration with your existing pipeline",
      "Custom object libraries (manufacturer-specific HVAC equipment)",
      "Pilot projects with NDA — test before you commit",
      "Dedicated technical support and training",
      "Custom physics models (smoke propagation, fire safety, data centers)"
    ],
    idealFor: "Engineering firms, public institutions, and infrastructure companies"
  }
];

export default function Pricing() {
  const [, setLocation] = useLocation();
  return (
    <section id="pricing" className="py-20 bg-slate-50">
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
              <Card className={`flex flex-col h-full ${plan.badge ? 'border-primary border-2 shadow-lg' : ''}`}>
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <CardTitle>{plan.name}</CardTitle>
                    {plan.badge && (
                      <span className="bg-primary text-primary-foreground text-xs font-semibold px-2 py-1 rounded">
                        {plan.badge}
                      </span>
                    )}
                  </div>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">
                      {plan.price === "Custom" ? plan.price : `€${plan.price}`}
                    </span>
                    {plan.priceDetail && <span className="text-muted-foreground ml-1 text-sm">{plan.priceDetail}</span>}
                  </div>
                  {plan.subtitle && (
                    <p className="text-sm text-primary font-medium mt-2">{plan.subtitle}</p>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-6">{plan.description}</p>
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {plan.idealFor && (
                    <p className="text-xs text-muted-foreground italic border-t pt-4">
                      Ideal for: {plan.idealFor}
                    </p>
                  )}
                </CardContent>
                <CardFooter className="mt-auto">
                  <Button 
                    className="w-full"
                    onClick={() => {
                      if (plan.price === "Custom") {
                        // For Enterprise plan, scroll to contact section
                        document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
                      } else {
                        // For Pay as you go and Discovery plans, go to dashboard
                        setLocation("/dashboard");
                        setTimeout(() => window.scrollTo(0, 0), 100);
                      }
                    }}
                  >
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