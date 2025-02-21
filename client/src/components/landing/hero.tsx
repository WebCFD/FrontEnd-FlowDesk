import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import RegisterModal from "@/components/auth/register-modal";
import LoginModal from "@/components/auth/login-modal";

export default function Hero() {
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center">
      <div 
        className="absolute inset-0 -z-10 bg-cover bg-center opacity-10"
        style={{ 
          backgroundImage: "url('https://images.unsplash.com/photo-1634712282287-14ed57b9cc89')" 
        }}
      />

      <div className="container mx-auto px-4 py-20">
        <div className="max-w-3xl">
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
            <Button size="lg" variant="outline">Sample Simulation</Button>
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