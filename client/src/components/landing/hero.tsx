import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import RegisterModal from "@/components/auth/register-modal";
import LoginModal from "@/components/auth/login-modal";

// Create a curved streamline path that flows from a window into the room
const StreamLine = ({ delay }: { delay: number }) => (
  <motion.path
    d="M10,20 Q30,20 35,40 T60,60"
    stroke="rgba(0, 150, 255, 0.2)"
    strokeWidth="0.5"
    fill="none"
    initial={{ pathLength: 0, opacity: 0 }}
    animate={{ 
      pathLength: 1,
      opacity: [0, 0.3, 0],
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
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center">
      {/* Background with window and streamlines */}
      <div className="absolute right-0 top-0 bottom-0 w-2/3 -z-10">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="airflow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: 'rgb(0, 150, 255)', stopOpacity: 0.1 }} />
              <stop offset="100%" style={{ stopColor: 'rgb(0, 255, 150)', stopOpacity: 0.05 }} />
            </linearGradient>
          </defs>

          {/* Window frame - more detailed */}
          <rect x="10" y="20" width="30" height="50" fill="none" stroke="currentColor" strokeWidth="0.5" />
          <line x1="25" y1="20" x2="25" y2="70" stroke="currentColor" strokeWidth="0.5" />
          <line x1="10" y1="45" x2="40" y2="45" stroke="currentColor" strokeWidth="0.5" />

          {/* Multiple streamlines with different paths */}
          <g className="streamlines">
            {/* Upper streamlines */}
            <StreamLine delay={0} />
            <motion.path
              d="M10,25 Q40,25 50,45 T90,50"
              stroke="url(#airflow)"
              strokeWidth="0.5"
              fill="none"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />

            {/* Middle streamlines */}
            <motion.path
              d="M10,45 Q35,45 60,50 T100,55"
              stroke="url(#airflow)"
              strokeWidth="0.5"
              fill="none"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear", delay: 0.5 }}
            />

            {/* Lower streamlines */}
            <motion.path
              d="M10,65 Q40,65 70,60 T100,50"
              stroke="url(#airflow)"
              strokeWidth="0.5"
              fill="none"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "linear", delay: 1 }}
            />
          </g>

          {/* Room elements with 3D perspective */}
          <path 
            d="M45,80 L85,80 L85,95 L45,95 Z" 
            fill="currentColor" 
            opacity="0.05"
            className="room-floor"
          />
          <path 
            d="M85,40 L95,45 L95,90 L85,85 Z" 
            fill="currentColor" 
            opacity="0.03"
            className="room-wall"
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