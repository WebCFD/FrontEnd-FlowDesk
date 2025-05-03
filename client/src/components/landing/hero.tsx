import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import RegisterModal from "@/components/auth/register-modal";

// Animated streamline component
const StreamLine = ({ d, delay }: { d: string; delay: number }) => (
  <motion.path
    d={d}
    stroke="rgba(0, 150, 255, 0.15)" 
    strokeWidth="2"
    fill="none"
    initial={{ pathLength: 0, opacity: 0 }}
    animate={{ 
      pathLength: 1,
      opacity: [0, 0.3, 0], 
    }}
    transition={{
      duration: 4,
      delay,
      repeat: Infinity,
      ease: "easeInOut"
    }}
  />
);

export default function Hero() {
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [, setLocation] = useLocation();

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center">
      {/* Background CFD visualization */}
      <div className="absolute inset-0 -z-10">
        <div 
          className="absolute right-0 w-2/3 h-full bg-cover bg-center"
          style={{ 
            backgroundImage: "url('/attached_assets/image_1740173483230.png')",
            opacity: 0.8
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-transparent">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <StreamLine d="M55,10 Q75,25 85,45 T95,60" delay={0} />
            <StreamLine d="M50,25 Q70,35 80,50 T90,70" delay={0.8} />
            <StreamLine d="M60,15 Q75,40 85,55 T92,75" delay={1.6} />
            <StreamLine d="M53,35 Q68,50 78,65 T88,85" delay={2.4} />
            <StreamLine d="M58,20 Q73,35 83,55 T93,65" delay={1.2} />
            <StreamLine d="M52,30 Q67,45 77,60 T87,80" delay={2.0} />
            <StreamLine d="M57,12 Q72,28 82,48 T91,68" delay={0.4} />
            <StreamLine d="M54,22 Q69,38 79,58 T89,78" delay={1.4} />
          </svg>
        </div>
      </div>

      <div className="container mx-auto px-4 py-20">
        <div className="max-w-2xl">
          <motion.h1 
            className="text-5xl sm:text-6xl font-bold mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            Streamlined Interior Designs
          </motion.h1>

          <motion.p 
            className="text-xl text-muted-foreground mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Enhance Comfort and Well-being Through Validated Design Decisions:
            Transform your spaces with accessible Fluid Dynamic simulations - powerful, intuitive, and cost-free
          </motion.p>

          <motion.div
            className="flex gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Button size="lg" onClick={() => setLocation("/dashboard/wizard-design")}>Get Started</Button>
            <Button size="lg" variant="outline" onClick={() => setIsRegisterOpen(true)}>Sign Up</Button>
          </motion.div>
        </div>
      </div>

      <RegisterModal 
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
      />
    </div>
  );
}