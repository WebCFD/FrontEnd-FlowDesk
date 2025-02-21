import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import RegisterModal from "@/components/auth/register-modal";
import LoginModal from "@/components/auth/login-modal";

// Animated streamline component
const StreamLine = ({ d, delay }: { d: string; delay: number }) => (
  <motion.path
    d={d}
    stroke="rgba(0, 150, 255, 0.4)"
    strokeWidth="2"
    fill="none"
    initial={{ pathLength: 0, opacity: 0 }}
    animate={{ 
      pathLength: 1,
      opacity: [0, 0.8, 0],
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
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center">
      {/* Background CFD visualization */}
      <div className="absolute inset-0 -z-10">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ 
            backgroundImage: "url('/attached_assets/image_1740173483230.png')",
            opacity: 0.8
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/90 to-transparent">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <StreamLine 
              d="M10,20 Q30,35 50,40 T90,50" 
              delay={0} 
            />
            <StreamLine 
              d="M5,30 Q25,45 45,50 T85,60" 
              delay={1} 
            />
            <StreamLine 
              d="M0,40 Q20,55 40,60 T80,70" 
              delay={2} 
            />
            <StreamLine 
              d="M-5,50 Q15,65 35,70 T75,80" 
              delay={3} 
            />
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
            Aerodynamics made easy
          </motion.h1>

          <motion.p 
            className="text-xl text-muted-foreground mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Save time and money with zero license fees, support for non-watertight models, and a fully automated workflow.
          </motion.p>

          <motion.div
            className="flex gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Button size="lg" onClick={() => setIsLoginOpen(true)}>Get Started</Button>
            <Button size="lg" variant="outline" onClick={() => setIsRegisterOpen(true)}>Sign Up</Button>
          </motion.div>
        </div>
      </div>

      <RegisterModal 
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
      />
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
      />
    </div>
  );
}