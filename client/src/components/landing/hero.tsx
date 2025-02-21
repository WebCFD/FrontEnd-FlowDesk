import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import RegisterModal from "@/components/auth/register-modal";
import LoginModal from "@/components/auth/login-modal";

// Create streamlines that follow the CFD visualization pattern
const StreamLine = ({ d, delay }: { d: string; delay: number }) => (
  <motion.path
    d={d}
    stroke="rgba(0, 150, 255, 0.3)"
    strokeWidth="1"
    fill="none"
    initial={{ pathLength: 0, opacity: 0 }}
    animate={{ 
      pathLength: 1,
      opacity: [0, 0.6, 0],
    }}
    transition={{
      duration: 3,
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
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center bg-white">
      {/* Background CFD visualization */}
      <div className="absolute right-0 top-0 bottom-0 w-2/3 -z-10 overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ 
            backgroundImage: "url('/attached_assets/image_1740173483230.png')",
            opacity: 0.6,
            mixBlendMode: "color-burn"
          }}
        />
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Streamlines following the actual CFD flow pattern */}
          <StreamLine 
            d="M30,20 Q45,30 55,45 T80,60" 
            delay={0} 
          />
          <StreamLine 
            d="M25,30 Q40,40 60,50 T85,65" 
            delay={0.5} 
          />
          <StreamLine 
            d="M20,40 Q35,50 65,55 T90,70" 
            delay={1} 
          />
          <StreamLine 
            d="M15,50 Q30,60 70,60 T95,75" 
            delay={1.5} 
          />
        </svg>
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