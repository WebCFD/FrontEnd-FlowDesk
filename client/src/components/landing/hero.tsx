import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import RegisterModal from "@/components/auth/register-modal";
import LoginModal from "@/components/auth/login-modal";

// Create a curved streamline path that flows from a window into the room
const StreamLine = ({ delay }: { delay: number }) => (
  <motion.path
    d="M10,20 C50,20 50,80 90,80"
    stroke="currentColor"
    strokeWidth="1"
    fill="none"
    initial={{ pathLength: 0, opacity: 0 }}
    animate={{ 
      pathLength: 1,
      opacity: [0, 0.3, 0],
    }}
    transition={{
      duration: 2,
      delay,
      repeat: Infinity,
      ease: "linear"
    }}
  />
);

export default function Hero() {
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center">
      {/* Background with window and streamlines */}
      <div className="absolute right-0 top-0 bottom-0 w-1/2 -z-10">
        <svg className="w-full h-full text-primary/10" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Window frame */}
          <rect x="10" y="20" width="20" height="40" fill="none" stroke="currentColor" strokeWidth="1" />
          <line x1="20" y1="20" x2="20" y2="60" stroke="currentColor" strokeWidth="1" />
          <line x1="10" y1="40" x2="30" y2="40" stroke="currentColor" strokeWidth="1" />

          {/* Room elements */}
          {/* Floor */}
          <line x1="0" y1="90" x2="100" y2="90" stroke="currentColor" strokeWidth="0.5" />

          {/* Sofa */}
          <path d="M50,70 L80,70 L80,85 L50,85 Z" fill="currentColor" opacity="0.1" />
          <path d="M50,70 L50,85 L45,90 L45,75 Z" fill="currentColor" opacity="0.05" />

          {/* Lamp */}
          <line x1="85" y1="30" x2="85" y2="70" stroke="currentColor" strokeWidth="0.5" />
          <path d="M80,25 Q85,20 90,25 L85,35 Z" fill="currentColor" opacity="0.2" />

          {/* Airflow streamlines - more dynamic paths */}
          <StreamLine delay={0} />
          <StreamLine delay={0.3} />
          <StreamLine delay={0.6} />
          <StreamLine delay={0.9} />
          <StreamLine delay={1.2} />
          <StreamLine delay={1.5} />
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