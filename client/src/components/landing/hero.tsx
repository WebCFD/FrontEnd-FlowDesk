import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import RegisterModal from "@/components/auth/register-modal";
import LoginModal from "@/components/auth/login-modal";

const StreamLine = ({ delay }: { delay: number }) => (
  <motion.path
    d="M0,50 Q50,0 100,50 T200,50"
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    initial={{ pathLength: 0, opacity: 0 }}
    animate={{ 
      pathLength: 1, 
      opacity: [0, 0.2, 0],
      translateX: ["-100%", "100%"]
    }}
    transition={{
      duration: 3,
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
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center overflow-hidden">
      {/* Content */}
      <div className="container mx-auto px-4 py-20 flex justify-between items-center">
        {/* Left side - Text content */}
        <div className="max-w-xl z-10">
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

        {/* Right side - Window with streamlines */}
        <div className="relative w-[600px] h-[400px] hidden lg:block">
          <motion.div 
            className="absolute inset-0 rounded-lg border bg-background/80 backdrop-blur-sm shadow-lg overflow-hidden"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
          >
            <div className="h-8 bg-muted border-b flex items-center px-4">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
            </div>
            <div className="p-4 relative h-[calc(100%-2rem)]">
              <svg className="w-full h-full text-primary/20" viewBox="0 0 200 100">
                <StreamLine delay={0} />
                <StreamLine delay={0.5} />
                <StreamLine delay={1} />
                <StreamLine delay={1.5} />
                <StreamLine delay={2} />
              </svg>
              {/* Background geometric shapes */}
              <motion.div
                className="absolute inset-0 -z-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1 }}
              >
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <motion.circle 
                    cx="80" 
                    cy="50" 
                    r="20" 
                    className="fill-primary/5"
                    initial={{ scale: 0 }}
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 4, repeat: Infinity }}
                  />
                  <motion.rect
                    x="20"
                    y="20"
                    width="30"
                    height="30"
                    className="fill-primary/5"
                    initial={{ rotate: 0 }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity }}
                  />
                </svg>
              </motion.div>
            </div>
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