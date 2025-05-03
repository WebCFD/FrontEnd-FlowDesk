import { motion } from "framer-motion";
import { BadgeCheck, Award, CheckSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const certifications = [
  {
    icon: <Badge className="h-10 w-10 text-teal-600" />,
    title: "WELL T01 VERIFICATION",
    description: "Performance-verified environmental conditions for optimal thermal comfort compliance.",
    category: "Engineering Letter of Assurance",
    categoryColor: "text-teal-600",
    items: [
      "Comprehensive HVAC and thermal envelope analysis",
      "Thermal condition modeling and simulation",
      "PMV/PPD compliance certification",
      "WELL-specific documentation"
    ],
    badge: "WELL v2 Compliant",
    color: "border-l-4 border-l-teal-500"
  },
  {
    icon: <BadgeCheck className="h-10 w-10 text-green-600" />,
    title: "LEED ENERGY & ATMOSPHERE",
    description: "Expert verification services for LEED v4.1's energy performance requirements.",
    category: "Energy Modeling Documentation",
    categoryColor: "text-green-600",
    items: [
      "Building energy simulation reports",
      "Energy consumption baseline comparison",
      "Cost savings calculations",
      "ASHRAE 90.1 compliance documentation"
    ],
    badge: "USGBC Certified",
    color: "border-l-4 border-l-green-500"
  },
  {
    icon: <Award className="h-10 w-10 text-blue-600" />,
    title: "PASSIVE HOUSE VERIFICATION",
    description: "Specialized thermal bridge analysis for Passive House certification requirements.",
    category: "Thermal Bridge Calculation",
    categoryColor: "text-blue-600",
    items: [
      "Psi-value calculations for all junctions",
      "Thermal imaging analysis",
      "Heat loss quantification",
      "PHPP integration documentation"
    ],
    badge: "PHI Compliant",
    color: "border-l-4 border-l-blue-500"
  },
];

// Custom badge icon component
function Badge(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

export default function Certifications() {
  return (
    <section id="certifications" className="py-20 bg-slate-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">
            Certification Standards
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Our platform supports compliance with industry-leading certification standards for sustainable building design
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {certifications.map((cert, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
            >
              <Card className={`h-full ${cert.color}`}>
                <CardContent className="p-6">
                  <div className="mb-5">{cert.icon}</div>
                  <h3 className="text-xl font-bold mb-2">{cert.title}</h3>
                  <p className="text-muted-foreground mb-6">{cert.description}</p>
                  
                  <h4 className={`font-medium mb-4 ${cert.categoryColor}`}>{cert.category}</h4>
                  <ul className="space-y-2 mb-8">
                    {cert.items.map((item, i) => (
                      <li key={i} className="flex items-start">
                        <span className="mr-2">•</span>
                        <span className="text-sm">{item}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <div className="flex items-center justify-between mt-auto">
                    <div className="text-sm text-muted-foreground">{cert.badge}</div>
                    <Button variant="outline" size="sm">Learn More</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}